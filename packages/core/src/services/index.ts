// Pure services — platform-independent, no VS Code dependency

// HTTP
export { executeRequest } from './HttpClient';
export type { HttpRequestConfig, HttpResponse } from './HttpClient';


// Auth & Security
export { AwsSignatureService } from './AwsSignatureService';
export type { AwsSignatureConfig, SignableRequest } from './AwsSignatureService';
export { OAuthService } from './OAuthService';

// Assertions & Scripts
export { evaluateAssertions } from './AssertionEngine';
export { ScriptEngine } from './ScriptEngine';
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

// Protocol services
export { WebSocketService } from './WebSocketService';
export { SSEService } from './SSEService';
export { MockServerService } from './MockServerService';

// History
export type { HistoryEntry, HistoryIndexEntry, HistorySearchParams, HistoryStats } from './HistoryTypes';

// Storage helpers
export { CookieJarService } from './CookieJarService';
export type { Cookie } from './CookieJarService';
export { MockStorageService } from './MockStorageService';
export { RecentCollectionService } from './RecentCollectionService';

// Native export
export { NativeExportService } from './NativeExportService';
export type { HiveFetchExportFile } from './NativeExportService';

// Import parsers
export { CurlParserService } from './CurlParserService';
export { InsomniaImportService } from './InsomniaImportService';
export { HoppscotchImportService } from './HoppscotchImportService';
export { ThunderClientImportService } from './ThunderClientImportService';
