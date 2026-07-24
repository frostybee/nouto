// @nouto/core - Shared types, utilities, and pure logic
// Single source of truth for all type definitions shared between
// the VS Code extension and webview (and future standalone desktop app).

// Types
export * from './types';

// Utilities
export * from './utils/content-type';
export * from './utils/dynamic-variables';
export * from './utils/formatters';
export * from './utils/url-params';
export * from './utils/validation';
export * from './utils/json';

// Codegen
export * from './codegen';

// Parsers
export * from './parsers/curl-parser';

// OpenAPI operation inventory. Exposed from the browser-safe root entry (not
// only from ./services, which pulls in Node-only dependencies) so webviews can
// enumerate operations exactly as the host does, with identical ordering and
// JSON Pointers.
export { listOpenApiOperations, detectOpenApiVersion, resolveOpenApiVersion } from './services/openapi/analyze';
export type { ResolvedOpenApiVersion } from './services/openapi/analyze';
export type { OpenApiOperationSummary, OpenApiVersion } from './services/openapi/types';
