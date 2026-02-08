import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as yaml from 'js-yaml';
import axios from 'axios';
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
} from './types';

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
  scheme?: string; // 'basic' | 'bearer'
  bearerFormat?: string;
  name?: string; // for apiKey
  in?: 'header' | 'query' | 'cookie'; // for apiKey
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
// OpenAPI Import Service
// ============================================

export class OpenApiImportService {
  async importFromFile(uri: vscode.Uri): Promise<{ collection: Collection; variables?: Environment }> {
    const content = await fs.readFile(uri.fsPath, 'utf8');
    const isYaml = uri.fsPath.endsWith('.yaml') || uri.fsPath.endsWith('.yml');
    return this.processSpec(content, isYaml);
  }

  async importFromUrl(url: string): Promise<{ collection: Collection; variables?: Environment }> {
    const response = await axios.get(url, { timeout: 30000, responseType: 'text' });
    const content = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    const isYaml = url.endsWith('.yaml') || url.endsWith('.yml') || !this.looksLikeJson(content);
    return this.processSpec(content, isYaml);
  }

  private looksLikeJson(content: string): boolean {
    const trimmed = content.trim();
    return trimmed.startsWith('{') || trimmed.startsWith('[');
  }

  private processSpec(content: string, isYaml: boolean): { collection: Collection; variables?: Environment } {
    const spec = this.parseSpec(content, isYaml);
    this.validateSpec(spec);
    const collection = this.convertToCollection(spec);
    const variables = this.extractServerVariables(spec);
    return { collection, variables };
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

    // Get path-level parameters to merge with operation parameters
    for (const [tag, operations] of grouped) {
      if (tag === '__untagged__' && grouped.size === 1) {
        // Only one group (untagged) — put requests at root level
        for (const entry of operations) {
          items.push(this.convertOperation(entry, spec));
        }
      } else if (tag === '__untagged__') {
        // Multiple groups but some are untagged — put them at root level
        for (const entry of operations) {
          items.push(this.convertOperation(entry, spec));
        }
      } else {
        // Create a folder for this tag
        const folder: Folder = {
          type: 'folder',
          id: this.generateId(),
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
      id: this.generateId(),
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
      // Extract path-level parameters
      const pathParams: OpenApiParameter[] = (methods as any).parameters || [];

      for (const [method, operation] of Object.entries(methods)) {
        if (method === 'parameters' || method.startsWith('x-')) continue;
        const httpMethods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
        if (!httpMethods.includes(method.toLowerCase())) continue;

        const op = operation as OpenApiOperation;
        const tags = op.tags && op.tags.length > 0 ? op.tags : ['__untagged__'];

        for (const tag of tags) {
          if (!groups.has(tag)) {
            groups.set(tag, []);
          }
          groups.get(tag)!.push({ path, method, operation: op, pathParams });
        }
      }
    }

    return groups;
  }

  private convertOperation(entry: OperationEntry, spec: OpenApiSpec): SavedRequest {
    const { path, method, operation, pathParams } = entry;
    const now = new Date().toISOString();

    // Merge path-level and operation-level parameters
    const allParams = [...pathParams, ...(operation.parameters || [])];

    // Resolve $ref parameters
    const resolvedParams = allParams.map(p => this.resolveRef(p, spec));

    const { queryParams, headerParams } = this.convertParameters(resolvedParams);
    const baseUrl = this.resolveBaseUrl(spec);

    // Convert path parameters to {{param}} format
    const urlPath = path.replace(/\{(\w+)\}/g, '{{$1}}');

    // Resolve request body
    let body: BodyState = { type: 'none', content: '' };
    if (operation.requestBody) {
      const resolvedBody = this.resolveRef(operation.requestBody, spec) as OpenApiRequestBody;
      body = this.convertRequestBody(resolvedBody);
    }

    // Resolve auth
    const auth = this.convertSecurityToAuth(spec, operation.security);

    const name = operation.summary || operation.operationId || `${method.toUpperCase()} ${path}`;

    return {
      type: 'request',
      id: this.generateId(),
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
        id: this.generateId(),
        key: param.name,
        value,
        enabled: param.required !== false,
      };

      if (param.in === 'query') {
        queryParams.push(kv);
      } else if (param.in === 'header') {
        headerParams.push(kv);
      }
      // path params are handled via URL substitution
      // cookie params are not supported in HiveFetch
    }

    return { queryParams, headerParams };
  }

  private convertRequestBody(body: OpenApiRequestBody): BodyState {
    if (!body || !body.content) {
      return { type: 'none', content: '' };
    }

    const contentTypes = Object.keys(body.content);

    // Priority: JSON > form-data > url-encoded > text > first available
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

    // Fallback: use first content type
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
      enabled: true,
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

    // Replace server variables with defaults
    if (server.variables) {
      for (const [name, variable] of Object.entries(server.variables)) {
        url = url.replace(`{${name}}`, variable.default);
      }
    }

    // Remove trailing slash
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

    // Also add path parameters as variables
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
      id: this.generateId(),
      name: `${spec.info.title} Variables`,
      variables,
    };
  }

  private resolveRef(obj: any, spec: OpenApiSpec): any {
    if (!obj || typeof obj !== 'object') return obj;
    if (!obj.$ref) return obj;

    const refPath = obj.$ref.replace('#/', '').split('/');
    let resolved: any = spec;
    for (const part of refPath) {
      resolved = resolved?.[part];
    }
    return resolved || obj;
  }

  private normalizeMethod(method: string): HttpMethod {
    const upper = method.toUpperCase();
    const validMethods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
    return validMethods.includes(upper as HttpMethod) ? (upper as HttpMethod) : 'GET';
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
