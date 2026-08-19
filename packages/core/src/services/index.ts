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
export type { NoutoExportFile, NoutoBulkExportFile } from './NativeExportService';

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
export type { InsomniaExport, InsomniaResource } from './InsomniaImportService';
export { HoppscotchImportService } from './HoppscotchImportService';
export { ThunderClientImportService } from './ThunderClientImportService';
export { HarImportService } from './HarImportService';
export { parseHarEntries, decodeHarContent } from './harParsing';
export type { HarLog, HarEntry, HarRequest, HarResponse, HarResponseContent } from './harParsing';
export { HarExportService } from './HarExportService';
export { BrunoImportService } from './BrunoImportService';
export { PostmanImportService } from './PostmanImportService';
export type {
  PostmanCollection,
  PostmanItem,
  PostmanRequest,
  PostmanUrl,
  PostmanHeader,
  PostmanQueryParam,
  PostmanBody,
  PostmanFormParam,
  PostmanAuth,
  PostmanVariable,
  PostmanResponse,
  PostmanEnvironmentFile,
  PostmanEnvironmentValue,
} from './PostmanImportService';
// OpenAPI subsystem (analysis, lint, completion, outline, spec edits, external refs)
export * from './openapi';
