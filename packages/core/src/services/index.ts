// Pure services - platform-independent, no VS Code dependency

// HTTP
export { executeRequest } from './HttpClient';
export type { HttpRequestConfig, HttpResponse } from './HttpClient';


// Auth & Security
export { AwsSignatureService } from './AwsSignatureService';
export type { AwsSignatureConfig, SignableRequest } from './AwsSignatureService';
export { OAuthService } from './OAuthService';
export { parseDigestChallenge, computeDigestAuth } from './DigestAuthService';
export type { DigestChallenge, DigestParams } from './DigestAuthService';

// Assertions & Scripts
export { evaluateAssertions } from './AssertionEngine';
export { resolveAssertionsForRequest, resolveInheritedAssertions, deduplicateAssertions } from './AssertionInheritanceService';
export { ScriptEngine } from './ScriptEngine';
export type { CookieContext, ScriptCookie } from './ScriptEngine';
export type { ResolvedScripts } from './ScriptInheritanceService';
export { resolveScriptsForRequest } from './ScriptInheritanceService';

// Inheritance
export {
  resolveAuthForRequest,
  resolveHeadersForRequest,
  resolveVariablesForRequest,
  resolveRequestWithInheritance,
  getItemPath,
} from './InheritanceService';

// Runner & Benchmark
export { CollectionRunnerService } from './CollectionRunnerService';
export { BenchmarkService } from './BenchmarkService';
export { RunnerExportService } from './RunnerExportService';
export type { RunnerExportInput, RunnerExportFormat } from './RunnerExportService';

// GraphQL
export { GraphQLSchemaService } from './GraphQLSchemaService';
export { GraphQLSubscriptionService } from './GraphQLSubscriptionService';

// Protocol services
export { WebSocketService } from './WebSocketService';

// WebSocket Session Recording
export { WsSessionRecorder, normalizeWsSession } from './WsSessionRecorder';

export { SSEService } from './SSEService';
export { MockServerService } from './MockServerService';

// gRPC
export { GrpcService } from './GrpcService';
export type { GrpcInvokeOptions, GrpcCallbacks } from './GrpcService';

// History
export type { HistoryEntry, HistoryIndexEntry, HistorySearchParams, HistoryStats, HistorySortBy } from './HistoryTypes';

// Storage helpers
export { CookieJarService } from './CookieJarService';
export type { Cookie, CookieJar, CookieJarInfo } from './CookieJarService';
export { MockStorageService } from './MockStorageService';
export { DraftsCollectionService } from './RecentCollectionService';

// Native export
export { NativeExportService } from './NativeExportService';
export type { NoutoExportFile } from './NativeExportService';

// Data file parsing
export { parseDataFile } from './DataFileService';

// Collection tree utilities
export {
  findRequestRecursive,
  findRequestInCollection,
  findRequestAcrossCollections,
  findFolderRecursive,
  findFolderByName,
  getAllRequestsFromItems,
  countAllItems,
  collectScopedVariables,
} from '../utils/collection-tree';

// Import parsers
export { CurlParserService } from './CurlParserService';
export { InsomniaImportService } from './InsomniaImportService';
export { HoppscotchImportService } from './HoppscotchImportService';
export { ThunderClientImportService } from './ThunderClientImportService';
export { HarImportService } from './HarImportService';
export { HarExportService } from './HarExportService';
export { BrunoImportService } from './BrunoImportService';
export { PostmanImportService } from './PostmanImportService';
export { OpenApiImportService } from './openapi/OpenApiImportService';
export {
  OpenApiConversionError,
  getAdditionalOperations,
  OPENAPI_OPERATION_METHODS,
  OPENAPI_FIXED_METHOD_NAMES,
} from './openapi/types';
export type {
  OpenApiFormat,
  OpenApiVersion,
  OpenApiDiagnostic,
  OpenApiOperationSummary,
  OpenApiAnalysis,
  OpenApiImportResult,
  OpenApiOperationConversion,
} from './openapi/types';
export { analyzeOpenApi, listOpenApiOperations, detectOpenApiVersion } from './openapi/analyze';
export { runLintRules, ALL_LINT_RULES, DEFAULT_DISABLED_RULES } from './openapi/lint/registry';
export type { LintRule, LintOptions, LintSeverity, LintFinding } from './openapi/lint/types';
export {
  getOpenApiMetaSchema,
  validateOpenApiMetaSchema,
  openapi30MetaSchema,
  openapi31MetaSchema,
  openapi31MetaSchemaEditor,
  openapi32MetaSchema,
  openapi32MetaSchemaEditor,
} from './openapi/schemas';
export type { OpenApiMetaSchemaVariant } from './openapi/schemas';
export {
  buildPointer as buildJsonPointer,
  parsePointer as parseJsonPointer,
  escapePointerSegment as escapeJsonPointerSegment,
  unescapePointerSegment as unescapeJsonPointerSegment,
  getByPointer as getByJsonPointer,
} from './openapi/pointer';
