import * as yaml from 'js-yaml';
import type {
  Collection,
  CollectionItem,
  SavedRequest,
  Folder,
  KeyValue,
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
import { resolveNode } from './refs';
import { analyzeOpenApi, listOpenApiOperations } from './analyze';

// ============================================
// OpenAPI v3 Types (simplified)
// ============================================

interface OpenApiSpec {
  openapi: string;
  info: { title: string; version: string; description?: string };
  servers?: OpenApiServer[];
  paths: Record<string, Record<string, OpenApiOperation>>;
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
    };
    return this.convertOperationInternal(entry, spec);
  }

  private looksLikeJson(content: string): boolean {
    const trimmed = content.trim();
    return trimmed.startsWith('{') || trimmed.startsWith('[');
  }

  private processSpec(content: string, isYaml: boolean): OpenApiImportResult {
    const spec = this.parseSpec(content, isYaml);
    this.validateSpec(spec);
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
    if (!spec.paths || typeof spec.paths !== 'object') {
      throw new Error('Invalid OpenAPI spec: missing "paths" section');
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

    for (const [path, methods] of Object.entries(spec.paths)) {
      const pathParams: OpenApiParameter[] = (methods as any).parameters || [];

      const addEntry = (method: string, operation: unknown) => {
        if (!operation || typeof operation !== 'object') return;
        const op = operation as OpenApiOperation;
        // Collection generation places an operation only under its FIRST
        // declared tag so multi-tag operations are not duplicated.
        const tag = op.tags && op.tags.length > 0 ? op.tags[0] : '__untagged__';

        if (!groups.has(tag)) {
          groups.set(tag, []);
        }
        groups.get(tag)!.push({ path, method, operation: op, pathParams });
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

  private convertOperationInternal(entry: OperationEntry, spec: OpenApiSpec): OpenApiOperationConversion {
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
    const baseUrl = this.resolveBaseUrl(spec);
    if (!spec.servers || spec.servers.length === 0) {
      warnings.push('The document declares no servers; the request URL contains only the path.');
    }

    const urlPath = path.replace(/\{(\w+)\}/g, '{{$1}}');

    let body: BodyState = { type: 'none', content: '' };
    if (operation.requestBody) {
      const resolvedBody = this.resolveRefTracked(operation.requestBody, spec, warnings) as OpenApiRequestBody;
      body = this.convertRequestBody(resolvedBody);
    }

    const security = operation.security || spec.security;
    if (security && security.length > 1) {
      warnings.push(
        'The operation declares multiple security alternatives; only the first was applied.'
      );
    }
    const auth = this.convertSecurityToAuth(spec, operation.security);

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
    return { request, warnings };
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

  private convertRequestBody(body: OpenApiRequestBody): BodyState {
    if (!body || !body.content) {
      return { type: 'none', content: '' };
    }

    const contentTypes = Object.keys(body.content);

    if (body.content['application/json']) {
      const media = body.content['application/json'];
      const example = this.extractExample(media);
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
      const formItems = this.schemaToFormData(media.schema);
      return {
        type: 'form-data',
        content: JSON.stringify(formItems),
      };
    }

    if (body.content['application/x-www-form-urlencoded']) {
      const media = body.content['application/x-www-form-urlencoded'];
      const formItems = this.schemaToFormData(media.schema);
      return {
        type: 'x-www-form-urlencoded',
        content: JSON.stringify(formItems),
      };
    }

    if (body.content['text/plain']) {
      const media = body.content['text/plain'];
      const example = this.extractExample(media);
      return {
        type: 'text',
        content: example ? String(example) : '',
      };
    }

    const firstType = contentTypes[0];
    if (firstType) {
      const media = body.content[firstType];
      const example = this.extractExample(media);
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

  private schemaToFormData(schema: any): Array<{ key: string; value: string; enabled: boolean; fieldType: string }> {
    if (!schema || !schema.properties) return [];
    const required = new Set(schema.required || []);
    return Object.entries(schema.properties).map(([key, prop]: [string, any]) => ({
      key,
      value: prop.example !== undefined ? String(prop.example) : prop.default !== undefined ? String(prop.default) : '',
      enabled: required.has(key),
      fieldType: prop.format === 'binary' ? 'file' : 'text',
    }));
  }

  private extractExample(media: { schema?: any; example?: any; examples?: Record<string, { value: any }> }): any {
    if (media.example !== undefined) return media.example;
    if (media.examples) {
      const firstExample = Object.values(media.examples)[0];
      if (firstExample?.value !== undefined) return firstExample.value;
    }
    if (media.schema) {
      return this.generateExampleFromSchema(media.schema);
    }
    return undefined;
  }

  private generateExampleFromSchema(schema: any): any {
    if (!schema) return undefined;
    if (schema.example !== undefined) return schema.example;
    if (schema.default !== undefined) return schema.default;

    switch (schema.type) {
      case 'object': {
        if (!schema.properties) return {};
        const obj: Record<string, any> = {};
        for (const [key, prop] of Object.entries(schema.properties) as [string, any][]) {
          obj[key] = this.generateExampleFromSchema(prop);
        }
        return obj;
      }
      case 'array': {
        const itemExample = schema.items ? this.generateExampleFromSchema(schema.items) : null;
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

  private convertSecurityToAuth(spec: OpenApiSpec, opSecurity?: Record<string, string[]>[]): AuthState {
    const security = opSecurity || spec.security;
    if (!security || security.length === 0) return { type: 'none' };

    const schemes = spec.components?.securitySchemes || {};
    const firstScheme = security[0];
    const schemeName = Object.keys(firstScheme)[0];
    if (!schemeName) return { type: 'none' };

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

  private resolveBaseUrl(spec: OpenApiSpec): string {
    if (!spec.servers || spec.servers.length === 0) return '';
    const server = spec.servers[0];
    let url = server.url;

    if (server.variables) {
      for (const [name, variable] of Object.entries(server.variables)) {
        url = url.replace(`{${name}}`, variable.default);
      }
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

    for (const [path] of Object.entries(spec.paths)) {
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
