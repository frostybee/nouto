import * as yaml from 'js-yaml';
import type {
  Collection,
  CollectionItem,
  SavedRequest,
  Folder,
  KeyValue,
  PathParam,
  AuthState,
  BodyState,
  HttpMethod,
  Environment,
  EnvironmentVariable,
} from '../../types';
import { generateId } from '../../types';
import type {
  OpenApiAnalysis,
  OpenApiFormat,
  OpenApiImportResult,
  OpenApiOperationConversion,
  OpenApiOperationSummary,
  OpenApiVersion,
} from './types';
import { getAdditionalOperations, OPENAPI_OPERATION_METHODS, OpenApiConversionError } from './types';
import { isRefNode, resolveNode } from './refs';
import { analyzeOpenApi, listOpenApiOperations } from './analyze';

// ============================================
// OpenAPI v3 Types (simplified)
// ============================================

interface OpenApiSpec {
  openapi: string;
  info: { title: string; version: string; description?: string };
  servers?: OpenApiServer[];
  paths?: Record<string, Record<string, OpenApiOperation>>;
  webhooks?: Record<string, unknown>;
  components?: {
    securitySchemes?: Record<string, OpenApiSecurityScheme>;
    schemas?: Record<string, any>;
    requestBodies?: Record<string, any>;
  };
  security?: Record<string, string[]>[];
  tags?: { name: string; description?: string }[];
}

interface OpenApiServer {
  url: string;
  description?: string;
  variables?: Record<string, { default: string; enum?: string[]; description?: string }>;
}

interface OpenApiOperation {
  summary?: string;
  description?: string;
  operationId?: string;
  tags?: string[];
  parameters?: OpenApiParameter[];
  requestBody?: OpenApiRequestBody | { $ref: string };
  responses?: Record<string, any>;
  security?: Record<string, string[]>[];
  servers?: OpenApiServer[];
  deprecated?: boolean;
}

interface OpenApiParameter {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  description?: string;
  required?: boolean;
  schema?: any;
  example?: any;
}

interface OpenApiRequestBody {
  description?: string;
  required?: boolean;
  content: Record<string, { schema?: any; example?: any; examples?: Record<string, { value: any }> }>;
}

interface OpenApiSecurityScheme {
  type: 'http' | 'apiKey' | 'oauth2' | 'openIdConnect';
  scheme?: string;
  bearerFormat?: string;
  name?: string;
  in?: 'header' | 'query' | 'cookie';
  flows?: {
    implicit?: { authorizationUrl: string; scopes: Record<string, string> };
    authorizationCode?: { authorizationUrl: string; tokenUrl: string; scopes: Record<string, string> };
    clientCredentials?: { tokenUrl: string; scopes: Record<string, string> };
    password?: { tokenUrl: string; scopes: Record<string, string> };
  };
}

interface OperationEntry {
  path: string;
  method: string;
  operation: OpenApiOperation;
  pathParams: OpenApiParameter[];
  /** Path-item-level `servers` override (between operation- and spec-level). */
  pathItemServers?: OpenApiServer[];
}

// ============================================
// OpenAPI Import Service (pure TypeScript, no Node.js dependencies)
// ============================================

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
    const variables = this.extractServerVariables(spec);
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
    const resolvedParams = allParams.map(p => this.resolveRefTracked(p, spec, warnings));

    for (const param of resolvedParams) {
      if (param && typeof param === 'object' && (param as OpenApiParameter).in === 'cookie') {
        warnings.push(
          `Cookie parameter "${(param as OpenApiParameter).name}" is not supported and was skipped.`
        );
      }
    }

    const { queryParams, headerParams } = this.convertParameters(resolvedParams);
    // OpenAPI 3.x server precedence: operation > path item > document.
    const servers =
      operation.servers && operation.servers.length > 0
        ? operation.servers
        : entry.pathItemServers && entry.pathItemServers.length > 0
          ? entry.pathItemServers
          : spec.servers;
    const baseUrl = this.resolveBaseUrl(servers, warnings);
    if (!servers || servers.length === 0) {
      warnings.push('The document declares no servers; the request URL contains only the path.');
    }

    const urlPath = pathParamStyle === 'variable' ? path.replace(/\{(\w+)\}/g, '{{$1}}') : path;

    let body: BodyState = { type: 'none', content: '' };
    if (operation.requestBody) {
      const resolvedBody = this.resolveRefTracked(operation.requestBody, spec, warnings) as OpenApiRequestBody;
      body = this.convertRequestBody(resolvedBody, spec, warnings);
    }

    const security = operation.security || spec.security;
    if (security && security.length > 1) {
      warnings.push(
        'The operation declares multiple security alternatives; only the first was applied.'
      );
    }
    const auth = this.convertSecurityToAuth(spec, operation.security, warnings);

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
      const pathParamRows = this.buildPathParams(path, resolvedParams);
      if (pathParamRows.length > 0) {
        request.pathParams = pathParamRows;
      }
    }
    return { request, warnings };
  }

  /**
   * Builds Path-tab rows for a literal `{param}` path template: one row per
   * declared `in: 'path'` parameter (with example/default value and
   * description), plus empty rows for placeholders present in the template but
   * never declared, so the tab always mirrors the URL.
   */
  private buildPathParams(path: string, params: unknown[]): PathParam[] {
    const rows: PathParam[] = [];
    for (const raw of params) {
      if (!raw || typeof raw !== 'object') continue;
      const param = raw as OpenApiParameter;
      if (param.in !== 'path' || !param.name) continue;
      const value = param.example !== undefined
        ? String(param.example)
        : param.schema?.default !== undefined
          ? String(param.schema.default)
          : '';
      rows.push({
        id: generateId(),
        key: param.name,
        value,
        description: param.description || '',
        enabled: true,
      });
    }
    for (const match of path.matchAll(/\{(\w+)\}/g)) {
      if (!rows.some(row => row.key === match[1])) {
        rows.push({ id: generateId(), key: match[1], value: '', description: '', enabled: true });
      }
    }
    return rows;
  }

  private convertParameters(params: OpenApiParameter[]): {
    queryParams: KeyValue[];
    headerParams: KeyValue[];
  } {
    const queryParams: KeyValue[] = [];
    const headerParams: KeyValue[] = [];

    for (const param of params) {
      const value = param.example !== undefined
        ? String(param.example)
        : param.schema?.default !== undefined
          ? String(param.schema.default)
          : '';

      const kv: KeyValue = {
        id: generateId(),
        key: param.name,
        value,
        enabled: param.required !== false,
      };

      if (param.in === 'query') {
        queryParams.push(kv);
      } else if (param.in === 'header') {
        headerParams.push(kv);
      }
    }

    return { queryParams, headerParams };
  }

  private convertRequestBody(body: OpenApiRequestBody, spec: OpenApiSpec, warnings: string[]): BodyState {
    if (!body || !body.content) {
      return { type: 'none', content: '' };
    }

    const contentTypes = Object.keys(body.content);

    if (body.content['application/json']) {
      const media = body.content['application/json'];
      const example = this.extractExample(media, spec, warnings);
      return {
        type: 'json',
        content: example ? JSON.stringify(example, null, 2) : '{}',
      };
    }

    if (body.content['application/graphql'] || body.content['application/graphql+json']) {
      return { type: 'graphql', content: '' };
    }

    if (body.content['multipart/form-data']) {
      const media = body.content['multipart/form-data'];
      const formItems = this.schemaToFormData(media.schema, spec, warnings);
      return {
        type: 'form-data',
        content: JSON.stringify(formItems),
      };
    }

    if (body.content['application/x-www-form-urlencoded']) {
      const media = body.content['application/x-www-form-urlencoded'];
      const formItems = this.schemaToFormData(media.schema, spec, warnings);
      return {
        type: 'x-www-form-urlencoded',
        content: JSON.stringify(formItems),
      };
    }

    if (body.content['text/plain']) {
      const media = body.content['text/plain'];
      const example = this.extractExample(media, spec, warnings);
      return {
        type: 'text',
        content: example ? String(example) : '',
      };
    }

    const firstType = contentTypes[0];
    if (firstType) {
      const media = body.content[firstType];
      const example = this.extractExample(media, spec, warnings);
      if (firstType.includes('json')) {
        return {
          type: 'json',
          content: example ? JSON.stringify(example, null, 2) : '{}',
        };
      }
      return {
        type: 'text',
        content: example ? String(example) : '',
      };
    }

    return { type: 'none', content: '' };
  }

  private schemaToFormData(
    schema: any,
    spec: OpenApiSpec,
    warnings: string[]
  ): Array<{ key: string; value: string; enabled: boolean; fieldType: string }> {
    const resolved = this.resolveRefTracked(schema, spec, warnings);
    if (!resolved || !resolved.properties) return [];
    const required = new Set(resolved.required || []);
    return Object.entries(resolved.properties).map(([key, rawProp]: [string, any]) => {
      const prop = this.resolveRefTracked(rawProp, spec, warnings);
      return {
        key,
        value: prop.example !== undefined ? String(prop.example) : prop.default !== undefined ? String(prop.default) : '',
        enabled: required.has(key),
        fieldType: prop.format === 'binary' ? 'file' : 'text',
      };
    });
  }

  private extractExample(
    media: { schema?: any; example?: any; examples?: Record<string, { value: any }> },
    spec: OpenApiSpec,
    warnings: string[]
  ): any {
    if (media.example !== undefined) return media.example;
    if (media.examples) {
      const firstExample = Object.values(media.examples)[0];
      if (firstExample?.value !== undefined) return firstExample.value;
    }
    if (media.schema) {
      return this.generateExampleFromSchema(media.schema, spec, warnings, new Set());
    }
    return undefined;
  }

  /**
   * `visitedRefs` guards THIS recursion against recursive schemas (e.g.
   * TreeNode.children → TreeNode): each individual $ref resolves cleanly, so
   * resolveNode's single-chain cycle detection never fires — the loop only
   * exists across the property/items recursion. A revisited $ref yields
   * `undefined` (the property is omitted), which is expected for recursive
   * schemas, not an authoring error — so no warning.
   */
  private generateExampleFromSchema(
    schema: any,
    spec: OpenApiSpec,
    warnings: string[],
    visitedRefs: Set<string>
  ): any {
    if (!schema) return undefined;
    if (isRefNode(schema)) {
      if (visitedRefs.has(schema.$ref)) return undefined;
      const resolved = this.resolveRefTracked(schema, spec, warnings);
      if (resolved === schema) return undefined; // resolution failed; warning already pushed
      return this.generateExampleFromSchema(resolved, spec, warnings, new Set(visitedRefs).add(schema.$ref));
    }
    if (schema.example !== undefined) return schema.example;
    if (schema.default !== undefined) return schema.default;

    switch (schema.type) {
      case 'object': {
        if (!schema.properties) return {};
        const obj: Record<string, any> = {};
        for (const [key, prop] of Object.entries(schema.properties) as [string, any][]) {
          obj[key] = this.generateExampleFromSchema(prop, spec, warnings, visitedRefs);
        }
        return obj;
      }
      case 'array': {
        const itemExample = schema.items
          ? this.generateExampleFromSchema(schema.items, spec, warnings, visitedRefs)
          : null;
        return itemExample !== undefined ? [itemExample] : [];
      }
      case 'string':
        if (schema.enum && schema.enum.length > 0) return schema.enum[0];
        return '';
      case 'integer':
      case 'number':
        return 0;
      case 'boolean':
        return false;
      default:
        return undefined;
    }
  }

  private convertSecurityToAuth(
    spec: OpenApiSpec,
    opSecurity: Record<string, string[]>[] | undefined,
    warnings: string[]
  ): AuthState {
    const security = opSecurity || spec.security;
    if (!security || security.length === 0) return { type: 'none' };

    const schemes = spec.components?.securitySchemes || {};
    const firstScheme = security[0];
    const schemeNames = Object.keys(firstScheme);
    const schemeName = schemeNames[0];
    if (!schemeName) return { type: 'none' };
    // A single requirement object with several keys means ALL schemes are
    // required together — distinct from multiple alternative objects.
    if (schemeNames.length > 1) {
      warnings.push(
        `The operation requires multiple security schemes together (${schemeNames.join(', ')}); only "${schemeName}" was applied.`
      );
    }

    const scheme = schemes[schemeName];
    if (!scheme) return { type: 'none' };

    switch (scheme.type) {
      case 'http':
        if (scheme.scheme === 'basic') {
          return { type: 'basic', username: '', password: '' };
        }
        if (scheme.scheme === 'bearer') {
          return { type: 'bearer', token: '' };
        }
        return { type: 'none' };

      case 'apiKey':
        // The auth model only supports header/query placement.
        if (scheme.in === 'cookie') {
          warnings.push(
            `API key security scheme "${schemeName}" uses cookie placement, which is not supported; it was applied as a header instead.`
          );
        }
        return {
          type: 'apikey',
          apiKeyName: scheme.name || '',
          apiKeyValue: '',
          apiKeyIn: (scheme.in === 'query' ? 'query' : 'header') as 'header' | 'query',
        };

      case 'oauth2': {
        const flows = scheme.flows || {};
        if (flows.authorizationCode) {
          return {
            type: 'oauth2',
            oauth2: {
              grantType: 'authorization_code',
              authUrl: flows.authorizationCode.authorizationUrl,
              tokenUrl: flows.authorizationCode.tokenUrl,
              clientId: '',
              scope: Object.keys(flows.authorizationCode.scopes || {}).join(' '),
            },
          };
        }
        if (flows.clientCredentials) {
          return {
            type: 'oauth2',
            oauth2: {
              grantType: 'client_credentials',
              tokenUrl: flows.clientCredentials.tokenUrl,
              clientId: '',
              scope: Object.keys(flows.clientCredentials.scopes || {}).join(' '),
            },
          };
        }
        if (flows.implicit) {
          return {
            type: 'oauth2',
            oauth2: {
              grantType: 'implicit',
              authUrl: flows.implicit.authorizationUrl,
              clientId: '',
              scope: Object.keys(flows.implicit.scopes || {}).join(' '),
            },
          };
        }
        if (flows.password) {
          return {
            type: 'oauth2',
            oauth2: {
              grantType: 'password',
              tokenUrl: flows.password.tokenUrl,
              clientId: '',
            },
          };
        }
        return { type: 'none' };
      }

      default:
        return { type: 'none' };
    }
  }

  private resolveBaseUrl(servers: OpenApiServer[] | undefined, warnings: string[]): string {
    if (!servers || servers.length === 0) return '';
    const server = servers[0];
    let url = server.url;

    if (server.variables) {
      for (const [name, variable] of Object.entries(server.variables)) {
        url = url.replace(`{${name}}`, variable.default);
      }
    }

    // The spec allows relative server URLs (resolved against where the
    // document is served from) — meaningless for a standalone client.
    if (!/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(url) && !url.startsWith('//')) {
      warnings.push(
        `Server URL "${url}" has no scheme; the request URL may need a base URL to be runnable.`
      );
    }

    return url.replace(/\/$/, '');
  }

  private extractServerVariables(spec: OpenApiSpec): Environment | undefined {
    if (!spec.servers || spec.servers.length === 0) return undefined;

    const variables: EnvironmentVariable[] = [];
    for (const server of spec.servers) {
      if (!server.variables) continue;
      for (const [name, variable] of Object.entries(server.variables)) {
        if (!variables.some(v => v.key === name)) {
          variables.push({
            key: name,
            value: variable.default,
            enabled: true,
          });
        }
      }
    }

    for (const [path] of Object.entries(spec.paths ?? {})) {
      const pathParamRegex = /\{(\w+)\}/g;
      let match;
      while ((match = pathParamRegex.exec(path)) !== null) {
        const paramName = match[1];
        if (!variables.some(v => v.key === paramName)) {
          variables.push({
            key: paramName,
            value: '',
            enabled: true,
          });
        }
      }
    }

    if (variables.length === 0) return undefined;

    return {
      id: generateId(),
      name: `${spec.info.title} Variables`,
      variables,
    };
  }

  /**
   * Resolves a possible Reference Object, collecting any resolution problems
   * (missing target, cycle, unsupported external reference) as human-readable
   * warnings. On failure the original node is returned, matching the
   * degrade-not-throw behavior of the previous naive resolver.
   */
  private resolveRefTracked(obj: any, spec: OpenApiSpec, warnings: string[]): any {
    const { value, diagnostics } = resolveNode(obj, spec);
    for (const diagnostic of diagnostics) {
      warnings.push(diagnostic.message);
    }
    return value;
  }

  private normalizeMethod(method: string): HttpMethod {
    return method.toUpperCase();
  }
}
