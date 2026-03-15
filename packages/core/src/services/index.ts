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
export { resolveAssertionsForRequest } from './AssertionInheritanceService';
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

// GraphQL
export { GraphQLSchemaService } from './GraphQLSchemaService';
export { GraphQLSubscriptionService } from './GraphQLSubscriptionService';

// Protocol services
export { WebSocketService } from './WebSocketService';
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
export type { HiveFetchExportFile } from './NativeExportService';

// Import parsers
export { CurlParserService } from './CurlParserService';
export { InsomniaImportService } from './InsomniaImportService';
export { HoppscotchImportService } from './HoppscotchImportService';
export { ThunderClientImportService } from './ThunderClientImportService';
export { HarImportService } from './HarImportService';
export { HarExportService } from './HarExportService';
export { BrunoImportService } from './BrunoImportService';
