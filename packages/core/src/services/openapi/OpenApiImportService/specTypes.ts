/**
 * Simplified OpenAPI v3 shapes shared by the importer's modules. These model
 * only the fields the conversion reads — not the full specification.
 */

export interface OpenApiSpec {
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

export interface OpenApiServer {
  url: string;
  description?: string;
  variables?: Record<string, { default: string; enum?: string[]; description?: string }>;
}

export interface OpenApiOperation {
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

export interface OpenApiParameter {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  description?: string;
  required?: boolean;
  schema?: any;
  example?: any;
}

export interface OpenApiRequestBody {
  description?: string;
  required?: boolean;
  content: Record<string, { schema?: any; example?: any; examples?: Record<string, { value: any }> }>;
}

export interface OpenApiSecurityScheme {
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

export interface OperationEntry {
  path: string;
  method: string;
  operation: OpenApiOperation;
  pathParams: OpenApiParameter[];
  /** Path-item-level `servers` override (between operation- and spec-level). */
  pathItemServers?: OpenApiServer[];
}
