import * as yaml from 'js-yaml';
import type {
  Collection,
  CollectionItem,
  SavedRequest,
  Folder,
  BodyState,
  HttpMethod,
} from '../../../types';
import { generateId } from '../../../types';
import type {
  OpenApiAnalysis,
  OpenApiFormat,
  OpenApiImportResult,
  OpenApiOperationConversion,
  OpenApiOperationSummary,
  OpenApiVersion,
} from '../types';
import { getAdditionalOperations, OPENAPI_OPERATION_METHODS, OpenApiConversionError } from '../types';
import { analyzeOpenApi, listOpenApiOperations } from '../analyze';
import type {
  OpenApiOperation,
  OpenApiParameter,
  OpenApiRequestBody,
  OpenApiServer,
  OpenApiSpec,
  OperationEntry,
} from './specTypes';
import {
  buildPathParams,
  convertParameters,
  convertRequestBody,
  resolveRefTracked,
} from './requestConversion';
import { convertSecurityToAuth, extractServerVariables, resolveBaseUrl } from './securityAndServers';

/**
 * OpenAPI Import Service (pure TypeScript, no Node.js dependencies): parses a
 * v3.x document and converts it into a Nouto collection, environment
 * variables, and single-operation Try It requests.
 *
 * Implementation lives in sibling modules: `specTypes.ts` (simplified spec
 * shapes), `requestConversion.ts` (parameter/body/example conversion),
 * `securityAndServers.ts` (auth mapping + server resolution).
 */
export class OpenApiImportService {
  /** @deprecated pass an OpenApiFormat ('yaml' | 'json') instead of a boolean */
  importFromString(content: string, isYaml?: boolean): OpenApiImportResult;
  importFromString(content: string, format?: OpenApiFormat): OpenApiImportResult;
  importFromString(
    content: string,
    formatOrIsYaml?: OpenApiFormat | boolean
  ): OpenApiImportResult {
    const isYaml =
      typeof formatOrIsYaml === 'boolean'
        ? formatOrIsYaml
        : formatOrIsYaml !== undefined
          ? formatOrIsYaml === 'yaml'
          : !this.looksLikeJson(content);
    return this.processSpec(content, isYaml);
  }

  /**
   * Analyzes OpenAPI document content, producing semantic and reference
   * diagnostics plus an operation inventory. Never throws.
   */
  analyze(content: string, format: OpenApiFormat, previousVersion?: OpenApiVersion): OpenApiAnalysis {
    return analyzeOpenApi(content, format, previousVersion);
  }

  /** Lists every operation ((path, method) pair) in a parsed document. */
  listOperations(spec: object): OpenApiOperationSummary[] {
    return listOpenApiOperations(spec);
  }

  /**
   * Converts a single operation into a Nouto request without executing it.
   * Throws {@link OpenApiConversionError} when the content cannot be parsed
   * or the (path, method) pair does not exist.
   */
  convertSingleOperation(
    content: string,
    format: OpenApiFormat,
    path: string,
    method: string
  ): OpenApiOperationConversion {
    let spec: OpenApiSpec;
    try {
      spec = this.parseSpec(content, format === 'yaml');
    } catch (err) {
      throw new OpenApiConversionError(
        `Cannot convert operation: document failed to parse (${err instanceof Error ? err.message : String(err)})`
      );
    }
    return this.convertSingleOperationFromSpec(spec, path, method);
  }

  /**
   * {@link convertSingleOperation} for an already-parsed spec object — e.g. a
   * bundled document with external $refs hoisted into components.
   */
  convertSingleOperationFromSpec(
    parsedSpec: object,
    path: string,
    method: string
  ): OpenApiOperationConversion {
    const spec = parsedSpec as OpenApiSpec;
    if (!spec || typeof spec !== 'object' || !spec.paths || typeof spec.paths !== 'object') {
      throw new OpenApiConversionError('Cannot convert operation: document has no "paths" object');
    }

    const pathItem = spec.paths[path];
    if (!pathItem || typeof pathItem !== 'object') {
      throw new OpenApiConversionError(`Cannot convert operation: path "${path}" not found`);
    }

    // Fixed operation keys (lowercase, incl. 3.2's `query`) first, then the
    // 3.2 additionalOperations map (exact key, falling back to uppercase —
    // HTTP method names are conventionally uppercase there).
    const methodKey = method.toLowerCase();
    let resolvedMethod: string | undefined;
    let operation: unknown;
    if ((OPENAPI_OPERATION_METHODS as readonly string[]).includes(methodKey)) {
      operation = (pathItem as Record<string, unknown>)[methodKey];
      resolvedMethod = methodKey;
    }
    if (!operation || typeof operation !== 'object') {
      const additional = getAdditionalOperations(pathItem as Record<string, unknown>);
      const additionalKey =
        additional && (method in additional ? method : method.toUpperCase() in additional ? method.toUpperCase() : undefined);
      if (additional && additionalKey) {
        operation = additional[additionalKey];
        resolvedMethod = additionalKey;
      }
    }
    if (!operation || typeof operation !== 'object' || !resolvedMethod) {
      throw new OpenApiConversionError(
        `Cannot convert operation: no "${method}" operation on path "${path}"`
      );
    }

    const entry: OperationEntry = {
      path,
      method: resolvedMethod,
      operation: operation as OpenApiOperation,
      pathParams: (pathItem as any).parameters || [],
      pathItemServers: (pathItem as any).servers,
    };
    // 'template': keep `{param}` literal and populate pathParams — unlike the
    // collection import flow, Try It never creates an environment, so the
    // `{{param}}` variable style would always surface as unresolved.
    return this.convertOperationInternal(entry, spec, 'template');
  }

  private looksLikeJson(content: string): boolean {
    const trimmed = content.trim();
    return trimmed.startsWith('{') || trimmed.startsWith('[');
  }

  private processSpec(content: string, isYaml: boolean): OpenApiImportResult {
    return this.importFromSpec(this.parseSpec(content, isYaml));
  }

  /**
   * {@link importFromString} for an already-parsed spec object — e.g. a
   * bundled document with external $refs hoisted into components.
   */
  importFromSpec(parsedSpec: object): OpenApiImportResult {
    this.validateSpec(parsedSpec);
    const spec = parsedSpec as OpenApiSpec;
    const collection = this.convertToCollection(spec);
    const variables = extractServerVariables(spec);
    const warnings: string[] = [];

    // Webhooks describe inbound callbacks the API sends to the caller, so they
    // have no outbound-request equivalent and are not converted. Reporting the
    // count keeps the omission visible instead of silently losing them.
    const webhookCount = this.countWebhookOperations(spec);
    if (webhookCount > 0) {
      warnings.push(
        `${webhookCount} webhook operation${webhookCount === 1 ? '' : 's'} skipped: ` +
        'webhooks describe inbound callbacks and cannot be converted to requests.'
      );
    }

    return { collection, variables, warnings };
  }

  private countWebhookOperations(spec: OpenApiSpec): number {
    const webhooks = (spec as unknown as Record<string, unknown>).webhooks;
    if (webhooks === null || typeof webhooks !== 'object' || Array.isArray(webhooks)) return 0;

    let count = 0;
    for (const value of Object.values(webhooks as Record<string, unknown>)) {
      if (value === null || typeof value !== 'object') continue;
      const pathItem = value as Record<string, unknown>;
      for (const method of OPENAPI_OPERATION_METHODS) {
        const operation = pathItem[method];
        if (operation !== null && typeof operation === 'object') count++;
      }
      const additional = getAdditionalOperations(pathItem);
      if (additional) {
        for (const operation of Object.values(additional)) {
          if (operation !== null && typeof operation === 'object') count++;
        }
      }
    }
    return count;
  }

  private parseSpec(content: string, isYaml: boolean): OpenApiSpec {
    if (isYaml) {
      return yaml.load(content) as OpenApiSpec;
    }
    return JSON.parse(content);
  }

  private validateSpec(spec: any): void {
    if (!spec || typeof spec !== 'object') {
      throw new Error('Invalid OpenAPI spec: not a valid object');
    }
    if (!spec.openapi || !spec.openapi.startsWith('3.')) {
      throw new Error(
        `Unsupported OpenAPI version: ${spec.openapi || spec.swagger || 'unknown'}. Only OpenAPI v3.x is supported.`
      );
    }
    // `paths` is optional in OpenAPI 3.1/3.2: a document may describe only
    // `webhooks` and/or reusable `components`. Reject only a malformed `paths`
    // value, and require the document to declare at least one top-level content
    // section so an empty shell still fails clearly.
    if (spec.paths !== undefined && (spec.paths === null || typeof spec.paths !== 'object')) {
      throw new Error('Invalid OpenAPI spec: "paths" must be an object');
    }
    const hasContent =
      (spec.paths && typeof spec.paths === 'object') ||
      (spec.webhooks && typeof spec.webhooks === 'object') ||
      (spec.components && typeof spec.components === 'object');
    if (!hasContent) {
      throw new Error(
        'Invalid OpenAPI spec: document declares no "paths", "webhooks", or "components"'
      );
    }
  }

  private convertToCollection(spec: OpenApiSpec): Collection {
    const now = new Date().toISOString();
    const grouped = this.groupOperationsByTag(spec);
    const items: CollectionItem[] = [];

    for (const [tag, operations] of grouped) {
      if (tag === '__untagged__') {
        for (const entry of operations) {
          items.push(this.convertOperation(entry, spec));
        }
      } else {
        const folder: Folder = {
          type: 'folder',
          id: generateId(),
          name: tag,
          children: operations.map(entry => this.convertOperation(entry, spec)),
          expanded: true,
          createdAt: now,
          updatedAt: now,
        };
        items.push(folder);
      }
    }

    return {
      id: generateId(),
      name: `${spec.info.title} v${spec.info.version}`,
      items,
      expanded: true,
      createdAt: now,
      updatedAt: now,
    };
  }

  private groupOperationsByTag(spec: OpenApiSpec): Map<string, OperationEntry[]> {
    const groups = new Map<string, OperationEntry[]>();

    for (const [path, methods] of Object.entries(spec.paths ?? {})) {
      const pathParams: OpenApiParameter[] = (methods as any).parameters || [];
      const pathItemServers: OpenApiServer[] | undefined = (methods as any).servers;

      const addEntry = (method: string, operation: unknown) => {
        if (!operation || typeof operation !== 'object') return;
        const op = operation as OpenApiOperation;
        // Collection generation places an operation only under its FIRST
        // declared tag so multi-tag operations are not duplicated.
        const tag = op.tags && op.tags.length > 0 ? op.tags[0] : '__untagged__';

        if (!groups.has(tag)) {
          groups.set(tag, []);
        }
        groups.get(tag)!.push({ path, method, operation: op, pathParams, pathItemServers });
      };

      for (const [method, operation] of Object.entries(methods)) {
        if (method === 'parameters' || method.startsWith('x-')) continue;
        if (!(OPENAPI_OPERATION_METHODS as readonly string[]).includes(method.toLowerCase())) continue;
        addEntry(method, operation);
      }

      // OpenAPI 3.2: operations for arbitrary HTTP methods
      const additional = getAdditionalOperations(methods as Record<string, unknown>);
      if (additional) {
        for (const [method, operation] of Object.entries(additional)) {
          addEntry(method, operation);
        }
      }
    }

    return groups;
  }

  private convertOperation(entry: OperationEntry, spec: OpenApiSpec): SavedRequest {
    return this.convertOperationInternal(entry, spec).request;
  }

  /**
   * @param pathParamStyle How `{param}` path templates are represented:
   *   - 'variable': rewritten to `{{param}}` environment variables (collection
   *     import, which generates a matching environment)
   *   - 'template': kept literal, with `request.pathParams` rows for the
   *     Path tab (single-operation Try It, which has no environment)
   */
  private convertOperationInternal(
    entry: OperationEntry,
    spec: OpenApiSpec,
    pathParamStyle: 'variable' | 'template' = 'variable'
  ): OpenApiOperationConversion {
    const { path, method, operation, pathParams } = entry;
    const now = new Date().toISOString();
    const warnings: string[] = [];

    const allParams = [...pathParams, ...(operation.parameters || [])];
    const resolvedParams = allParams.map(p => resolveRefTracked(p, spec, warnings));

    for (const param of resolvedParams) {
      if (param && typeof param === 'object' && (param as OpenApiParameter).in === 'cookie') {
        warnings.push(
          `Cookie parameter "${(param as OpenApiParameter).name}" is not supported and was skipped.`
        );
      }
    }

    const { queryParams, headerParams } = convertParameters(resolvedParams);
    // OpenAPI 3.x server precedence: operation > path item > document.
    const servers =
      operation.servers && operation.servers.length > 0
        ? operation.servers
        : entry.pathItemServers && entry.pathItemServers.length > 0
          ? entry.pathItemServers
          : spec.servers;
    const baseUrl = resolveBaseUrl(servers, warnings);
    if (!servers || servers.length === 0) {
      warnings.push('The document declares no servers; the request URL contains only the path.');
    }

    const urlPath = pathParamStyle === 'variable' ? path.replace(/\{(\w+)\}/g, '{{$1}}') : path;

    let body: BodyState = { type: 'none', content: '' };
    if (operation.requestBody) {
      const resolvedBody = resolveRefTracked(operation.requestBody, spec, warnings) as OpenApiRequestBody;
      body = convertRequestBody(resolvedBody, spec, warnings);
    }

    const security = operation.security || spec.security;
    if (security && security.length > 1) {
      warnings.push(
        'The operation declares multiple security alternatives; only the first was applied.'
      );
    }
    const auth = convertSecurityToAuth(spec, operation.security, warnings);

    const name = operation.summary || operation.operationId || `${method.toUpperCase()} ${path}`;

    const request: SavedRequest = {
      type: 'request',
      id: generateId(),
      name,
      method: this.normalizeMethod(method),
      url: baseUrl + urlPath,
      params: queryParams,
      headers: headerParams,
      auth,
      body,
      createdAt: now,
      updatedAt: now,
    };
    if (pathParamStyle === 'template') {
      const pathParamRows = buildPathParams(path, resolvedParams);
      if (pathParamRows.length > 0) {
        request.pathParams = pathParamRows;
      }
    }
    return { request, warnings };
  }

  private normalizeMethod(method: string): HttpMethod {
    return method.toUpperCase();
  }
}
