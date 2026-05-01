// @nouto/core - Shared type definitions
// This is the single source of truth for all types shared between
// the extension (Node.js) and webview (Svelte/browser) processes.

// --- HTTP ---

export const STANDARD_HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
export type StandardHttpMethod = typeof STANDARD_HTTP_METHODS[number];
export type HttpMethod = StandardHttpMethod | (string & {});
export type ConnectionMode = 'http' | 'websocket' | 'sse' | 'graphql-ws' | 'grpc';

export const REQUEST_KIND = {
  HTTP: 'http',
  GRAPHQL: 'graphql',
  GRAPHQL_SUBSCRIPTION: 'graphql-subscription',
  WEBSOCKET: 'websocket',
  SSE: 'sse',
  GRPC: 'grpc',
} as const;

export type RequestKind = typeof REQUEST_KIND[keyof typeof REQUEST_KIND];

// --- Key-Value ---

export interface KeyValue {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  description?: string;
  isSecret?: boolean;
}

export interface PathParam {
  id: string;
  key: string;
  value: string;
  description: string;
  enabled: boolean;
}

// --- Authentication ---

export type AuthType = 'none' | 'basic' | 'bearer' | 'apikey' | 'oauth2' | 'aws' | 'ntlm' | 'digest';
export type OAuth2GrantType = 'authorization_code' | 'client_credentials' | 'implicit' | 'password';

export interface OAuth2Config {
  grantType: OAuth2GrantType;
  authUrl?: string;
  tokenUrl?: string;
  clientId: string;
  clientSecret?: string;
  clientSecretRef?: string;
  scope?: string;
  state?: string;
  usePkce?: boolean;
  username?: string;
  password?: string;
  passwordRef?: string;
  callbackUrl?: string;
}

export interface OAuthToken {
  accessToken: string;
  accessTokenRef?: string;
  refreshToken?: string;
  refreshTokenRef?: string;
  tokenType: string;
  expiresAt?: number;
  scope?: string;
}

export interface AuthState {
  type: AuthType;
  username?: string;
  password?: string;
  passwordRef?: string;
  token?: string;
  tokenRef?: string;
  apiKeyName?: string;
  apiKeyValue?: string;
  apiKeyValueRef?: string;
  apiKeyIn?: 'header' | 'query';
  oauth2?: OAuth2Config;
  oauthToken?: string;
  oauthTokenRef?: string;
  oauthTokenData?: OAuthToken;
  awsAccessKey?: string;
  awsAccessKeyRef?: string;
  awsSecretKey?: string;
  awsSecretKeyRef?: string;
  awsRegion?: string;
  awsService?: string;
  awsSessionToken?: string;
  awsSessionTokenRef?: string;
  ntlmDomain?: string;
  ntlmWorkstation?: string;
}

export function isSecretRef(field: string | undefined, refField: string | undefined): boolean {
  return !!refField && !field;
}

export type AuthInheritance = 'inherit' | 'none' | 'own';
export type ScriptInheritance = 'inherit' | 'own';

// --- SSL / mTLS ---

export interface SslConfig {
  rejectUnauthorized?: boolean; // default true - set false to skip cert validation
  certPath?: string;
  keyPath?: string;
  passphrase?: string;
  passphraseRef?: string;
}

// --- Proxy ---

export interface ProxyConfig {
  enabled: boolean;
  protocol: 'http' | 'https' | 'socks5';
  host: string;
  port: number;
  username?: string;
  password?: string;
  passwordRef?: string;
  noProxy?: string; // comma-separated hostnames/CIDRs to bypass
}

// --- Request Body ---

export type BodyType = 'none' | 'json' | 'text' | 'xml' | 'form-data' | 'x-www-form-urlencoded' | 'binary' | 'graphql';

export interface BodyState {
  type: BodyType;
  content: string;
  fileName?: string;
  fileSize?: number;
  fileMimeType?: string;
  graphqlVariables?: string;
  graphqlOperationName?: string;
}

// --- Collection Runner ---

export interface CollectionRunConfig {
  collectionId: string;
  folderId?: string;
  stopOnFailure: boolean;
  delayMs: number;
  timeoutMs?: number; // per-request timeout, 0 or undefined = default (30s)
  dataFile?: string;
  dataFileType?: 'csv' | 'json';
  iterations?: number; // 0 = all rows
}

export interface DataRow { [key: string]: string; }

// --- Assertions ---

export type AssertionTarget =
  | 'status' | 'responseTime' | 'responseSize' | 'body' | 'jsonQuery'
  | 'header' | 'contentType' | 'setVariable' | 'schema'
  | 'grpcStatusMessage' | 'trailer'
  | 'streamMessageCount' | 'streamMessage';

export type AssertionOperator =
  | 'equals' | 'notEquals' | 'contains' | 'notContains'
  | 'greaterThan' | 'lessThan' | 'greaterThanOrEqual' | 'lessThanOrEqual'
  | 'exists' | 'notExists' | 'isType' | 'isJson' | 'count' | 'matches'
  | 'anyItemContains' | 'anyItemStartsWith' | 'anyItemEndsWith' | 'anyItemEquals';

export interface Assertion {
  id: string;
  enabled: boolean;
  target: AssertionTarget;
  property?: string;
  operator: AssertionOperator;
  expected?: string;
  variableName?: string;
}

export interface AssertionResult {
  assertionId: string;
  passed: boolean;
  actual?: string;
  expected?: string;
  message: string;
}

export interface CollectionRunRequestResult {
  requestId: string;
  requestName: string;
  method: HttpMethod;
  url: string;
  status: number;
  statusText: string;
  duration: number;
  size: number;
  passed: boolean;
  error?: string;
  assertionResults?: AssertionResult[];
  scriptTestResults?: ScriptTestResult[];
  responseData?: any;
  responseHeaders?: Record<string, string>;
  scriptLogs?: ScriptLogEntry[];
  iterationIndex?: number;
  iterationData?: DataRow;
}

export interface CollectionRunResult {
  collectionId: string;
  collectionName: string;
  startedAt: string;
  completedAt: string;
  totalRequests: number;
  passedRequests: number;
  failedRequests: number;
  skippedRequests: number;
  totalDuration: number;
  results: CollectionRunRequestResult[];
  stoppedEarly: boolean;
  dataRowCount?: number;
}

// --- Request & Collection Data Model ---

export interface ResponseExample {
  id: string;
  name: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: any;
  contentCategory?: ContentCategory;
  size?: number;
  duration?: number;
  createdAt: string;
}

export interface SavedRequest {
  type?: 'request';
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  params: KeyValue[];
  headers: KeyValue[];
  auth: AuthState;
  body: BodyState;
  authInheritance?: AuthInheritance;
  scriptInheritance?: ScriptInheritance;
  assertions?: Assertion[];
  scripts?: ScriptConfig;
  pathParams?: PathParam[];
  ssl?: SslConfig;
  proxy?: ProxyConfig;
  timeout?: number; // milliseconds, 0 = no timeout, undefined = default (30s)
  followRedirects?: boolean; // undefined = true (default)
  maxRedirects?: number; // undefined = 10 (default), only used when followRedirects is true
  description?: string;
  connectionMode?: ConnectionMode;
  grpc?: GrpcConfig;
  lastResponseStatus?: number;
  lastResponseDuration?: number;
  lastResponseSize?: number;
  lastResponseTime?: string;
  examples?: ResponseExample[];
  pinned?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Folder {
  type: 'folder';
  id: string;
  name: string;
  children: CollectionItem[];
  expanded: boolean;
  auth?: AuthState;
  headers?: KeyValue[];
  variables?: EnvironmentVariable[];
  authInheritance?: AuthInheritance;
  scripts?: ScriptConfig;
  assertions?: Assertion[];
  description?: string;
  color?: string;
  icon?: string;
  createdAt: string;
  updatedAt: string;
}

export type CollectionItem = SavedRequest | Folder;

export function isFolder(item: CollectionItem): item is Folder {
  return (item as Folder).type === 'folder';
}

export function isRequest(item: CollectionItem): item is SavedRequest {
  return (item as any).type === 'request';
}

export interface Collection {
  id: string;
  name: string;
  items: CollectionItem[];
  expanded: boolean;
  builtin?: 'drafts';
  auth?: AuthState;
  headers?: KeyValue[];
  variables?: EnvironmentVariable[];
  scripts?: ScriptConfig;
  assertions?: Assertion[];
  description?: string;
  source?: CollectionSource;
  color?: string;
  icon?: string;
  createdAt: string;
  updatedAt: string;
}

// --- Environment ---

export interface EnvironmentVariable {
  key: string;
  value: string;
  enabled: boolean;
  description?: string;
  isSecret?: boolean;
  secretRef?: string;
}

export interface Environment {
  id: string;
  name: string;
  variables: EnvironmentVariable[];
  oauthTokens?: Record<string, OAuthToken>;
  color?: string;
  scope?: 'global' | 'workspace';
}

export interface EnvironmentsData {
  environments: Environment[];
  activeId: string | null;
  globalVariables?: EnvironmentVariable[];
  envFilePath?: string | null;
}

// --- Scripts ---

export interface ScriptConfig {
  preRequest: string;
  postResponse: string;
}

export interface ScriptLogEntry {
  level: 'log' | 'warn' | 'error' | 'info';
  args: string[];
  timestamp: number;
}

export interface ScriptTestResult {
  name: string;
  passed: boolean;
  error?: string;
}

export interface ScriptResult {
  success: boolean;
  error?: string;
  logs: ScriptLogEntry[];
  testResults: ScriptTestResult[];
  variablesToSet: { key: string; value: string; scope: 'environment' | 'global' }[];
  modifiedRequest?: Partial<{ url: string; method: HttpMethod; headers: Record<string, string>; body: any }>;
  nextRequest?: string;
  duration: number;
}

/** Context object exposed as `hf.info` inside scripts */
export interface ScriptRunInfo {
  requestName: string;
  collectionName?: string;
  folderName?: string;
  currentIteration: number;
  totalIterations: number;
}

/** Config passed to `nt.sendRequest()` inside scripts */
export interface ScriptRequestConfig {
  url: string;
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: any;
}

/** Response shape returned by `nt.sendRequest()` */
export interface ScriptResponseData {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: any;
  duration: number;
  json(): any;
  text(): string;
}

/** Callback injected into ScriptEngine to execute HTTP requests from scripts */
export type RequestRunnerFn = (config: ScriptRequestConfig) => Promise<ScriptResponseData>;

// --- WebSocket ---

export type WebSocketMessageType = 'text' | 'binary';
export type WebSocketDirection = 'sent' | 'received';
export type WebSocketConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'reconnecting';

export interface WebSocketMessage {
  id: string;
  direction: WebSocketDirection;
  type: WebSocketMessageType;
  data: string;
  size: number;
  timestamp: number;
}

export interface WebSocketConfig {
  url: string;
  protocols?: string[];
  headers: KeyValue[];
  autoReconnect: boolean;
  reconnectIntervalMs: number;
}

// --- WebSocket Session Recording ---

export type WsRecordingState = 'idle' | 'recording' | 'replaying';

export interface WsSessionMessage {
  direction: WebSocketDirection;
  type: WebSocketMessageType;
  data: string;
  size: number;
  relativeTimeMs: number;  // offset from session start
}

export interface WsSession {
  id: string;
  name: string;
  createdAt: number;
  config: { url: string; protocols?: string[] };
  messages: WsSessionMessage[];
  durationMs: number;
  messageCount: number;
  version: 1;
}

export interface WsSessionSummary {
  id: string;
  name: string;
  createdAt: number;
  url: string;
  messageCount: number;
  durationMs: number;
}

// --- SSE ---

export type SSEConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'reconnecting';

export interface SSEEvent {
  id: string;
  eventId?: string;
  eventType: string;
  data: string;
  timestamp: number;
}

export interface SSEConfig {
  url: string;
  headers: KeyValue[];
  autoReconnect: boolean;
  withCredentials: boolean;
}

// --- GraphQL Subscription ---

export type GqlSubStatus = 'disconnected' | 'connecting' | 'connected' | 'subscribed' | 'error';

export interface GqlSubEvent {
  id: string;
  type: 'data' | 'error' | 'complete';
  data: string;
  timestamp: number;
}

export interface GqlSubConfig {
  url: string;
  headers: KeyValue[];
  connectionParams?: Record<string, unknown>;
  query: string;
  variables?: string;
  operationName?: string;
}

// --- gRPC ---

export interface GrpcMethodDescriptor {
  name: string;
  fullName: string;
  inputType: string;
  outputType: string;
  inputSchema?: string;
  clientStreaming: boolean;
  serverStreaming: boolean;
}

export interface GrpcServiceDescriptor {
  name: string;
  methods: GrpcMethodDescriptor[];
}

export interface GrpcProtoDescriptor {
  services: GrpcServiceDescriptor[];
  source: 'reflection' | 'proto-files';
}

export interface GrpcConfig {
  useReflection: boolean;
  protoPaths: string[];
  protoImportDirs: string[];
  serviceName?: string;
  methodName?: string;
  tls?: boolean;
  tlsCertPath?: string;
  tlsKeyPath?: string;
  tlsCaCertPath?: string;
  tlsPassphrase?: string;
  timeout?: number;
}

export interface GrpcConnection {
  id: string;
  requestId: string;
  url: string;
  service: string;
  method: string;
  status: number;
  statusMessage?: string;
  state: 'connecting' | 'connected' | 'closed';
  trailers: Record<string, string>;
  initialMetadata?: Record<string, string>;
  elapsed: number;
  error?: string;
  createdAt: string;
}

export interface GrpcEvent {
  id: string;
  connectionId: string;
  eventType: 'info' | 'error' | 'client_message' | 'server_message' | 'connection_start' | 'connection_end';
  content: string;
  metadata?: Record<string, string>;
  status?: number;
  error?: string;
  size?: number;
  createdAt: string;
}

export const GRPC_STATUS_CODES: Record<number, string> = {
  0: 'OK', 1: 'CANCELLED', 2: 'UNKNOWN', 3: 'INVALID_ARGUMENT',
  4: 'DEADLINE_EXCEEDED', 5: 'NOT_FOUND', 6: 'ALREADY_EXISTS',
  7: 'PERMISSION_DENIED', 8: 'RESOURCE_EXHAUSTED', 9: 'FAILED_PRECONDITION',
  10: 'ABORTED', 11: 'OUT_OF_RANGE', 12: 'UNIMPLEMENTED',
  13: 'INTERNAL', 14: 'UNAVAILABLE', 15: 'DATA_LOSS', 16: 'UNAUTHENTICATED',
};

// --- Mock Server ---

export interface MockRoute {
  id: string;
  enabled: boolean;
  method: HttpMethod;
  path: string;
  statusCode: number;
  responseBody: string;
  responseHeaders: KeyValue[];
  latencyMin: number;
  latencyMax: number;
  description?: string;
}

export interface MockServerConfig {
  port: number;
  routes: MockRoute[];
}

export type MockServerStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';

export interface MockRequestLog {
  id: string;
  timestamp: number;
  method: string;
  path: string;
  matchedRouteId: string | null;
  statusCode: number;
  duration: number;
}

// --- Benchmarking ---

export interface BenchmarkConfig {
  iterations: number;
  concurrency: number;
  delayBetweenMs: number;
}

export interface BenchmarkIteration {
  iteration: number;
  status: number;
  statusText: string;
  duration: number;
  size: number;
  success: boolean;
  error?: string;
  timestamp: number;
}

export interface BenchmarkStatistics {
  totalIterations: number;
  successCount: number;
  failCount: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  totalDuration: number;
  requestsPerSecond: number;
}

export interface BenchmarkResult {
  requestName: string;
  url: string;
  method: HttpMethod;
  config: BenchmarkConfig;
  startedAt: string;
  completedAt: string;
  statistics: BenchmarkStatistics;
  iterations: BenchmarkIteration[];
  distribution: { bucket: string; count: number }[];
}

// --- GraphQL Schema Introspection ---

export type GraphQLTypeKind = 'SCALAR' | 'OBJECT' | 'INTERFACE' | 'UNION' | 'ENUM' | 'INPUT_OBJECT' | 'LIST' | 'NON_NULL';

export interface GraphQLTypeRef {
  kind: GraphQLTypeKind;
  name?: string;
  ofType?: GraphQLTypeRef;
}

export interface GraphQLInputValue {
  name: string;
  description?: string;
  type: GraphQLTypeRef;
  defaultValue?: string;
}

export interface GraphQLEnumValue {
  name: string;
  description?: string;
  isDeprecated: boolean;
  deprecationReason?: string;
}

export interface GraphQLField {
  name: string;
  description?: string;
  type: GraphQLTypeRef;
  args: GraphQLInputValue[];
  isDeprecated: boolean;
  deprecationReason?: string;
}

export interface GraphQLType {
  kind: GraphQLTypeKind;
  name: string;
  description?: string;
  fields?: GraphQLField[];
  interfaces?: GraphQLTypeRef[];
  possibleTypes?: GraphQLTypeRef[];
  enumValues?: GraphQLEnumValue[];
  inputFields?: GraphQLInputValue[];
}

export interface GraphQLSchema {
  queryType?: { name: string };
  mutationType?: { name: string };
  subscriptionType?: { name: string };
  types: GraphQLType[];
}

// --- Response Data (shared protocol types) ---

export interface TimingData {
  dnsLookup: number;
  tcpConnection: number;
  tlsHandshake: number;
  ttfb: number;
  contentTransfer: number;
  total: number;
}

export type TimelineEventCategory =
  | 'config' | 'request' | 'info' | 'warning' | 'dns'
  | 'connection' | 'tls' | 'response' | 'data';

export interface TimelineEvent {
  category: TimelineEventCategory;
  text: string;
  timestamp: number;
}

export type ContentCategory = 'json' | 'text' | 'image' | 'html' | 'pdf' | 'xml' | 'binary';

export interface RedirectHop {
  fromUrl: string;
  toUrl: string;
  status: number;
  method: string;
  methodChanged: boolean;
  headers: Record<string, string>;
  setCookies: string[];
  duration: number;
  timestamp: number;
}

export interface ResponseData {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: any;
  duration: number;
  size: number;
  error?: boolean;
  timing?: TimingData;
  contentCategory?: ContentCategory;
  httpVersion?: string;
  remoteAddress?: string;
  requestHeaders?: Record<string, string>;
  requestUrl?: string;
  redirectChain?: RedirectHop[];
}

// --- Storage ---

export type StorageMode = 'global' | 'workspace';
export type CollectionSource = 'global' | 'workspace';

// --- Utility Functions ---

export function generateId(): string {
  return (globalThis as any).crypto.randomUUID();
}

export function createEmptyRequest(): Omit<SavedRequest, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    name: 'New Request',
    method: 'GET',
    url: '',
    params: [],
    headers: [],
    auth: { type: 'none' },
    body: { type: 'none', content: '' },
  };
}

export function createCollection(name: string, color?: string, icon?: string): Collection {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    name,
    items: [],
    expanded: true,
    ...(color ? { color } : {}),
    ...(icon ? { icon } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

export function createFolder(name: string, color?: string, icon?: string): Folder {
  const now = new Date().toISOString();
  return {
    type: 'folder',
    id: generateId(),
    name,
    children: [],
    expanded: true,
    ...(color ? { color } : {}),
    ...(icon ? { icon } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

export function getDefaultsForRequestKind(kind: RequestKind): {
  name: string;
  method: HttpMethod;
  url: string;
  body: BodyState;
  connectionMode: ConnectionMode;
  grpc?: GrpcConfig;
} {
  switch (kind) {
    case REQUEST_KIND.GRAPHQL:
      return { name: 'New GraphQL Request', method: 'POST', url: '', body: { type: 'graphql', content: '' }, connectionMode: 'http' };
    case REQUEST_KIND.GRAPHQL_SUBSCRIPTION:
      return { name: 'New GraphQL Subscription', method: 'POST', url: 'ws://', body: { type: 'graphql', content: '' }, connectionMode: 'graphql-ws' };
    case REQUEST_KIND.WEBSOCKET:
      return { name: 'New WebSocket', method: 'GET', url: '', body: { type: 'none', content: '' }, connectionMode: 'websocket' };
    case REQUEST_KIND.SSE:
      return { name: 'New SSE Connection', method: 'GET', url: '', body: { type: 'none', content: '' }, connectionMode: 'sse' };
    case REQUEST_KIND.GRPC:
      return {
        name: 'New gRPC Call',
        method: 'POST',
        url: 'localhost:50051',
        body: { type: 'json', content: '{}' },
        connectionMode: 'grpc',
        grpc: { useReflection: true, protoPaths: [], protoImportDirs: [] },
      };
    case REQUEST_KIND.HTTP:
    default:
      return { name: 'New Request', method: 'GET', url: '', body: { type: 'none', content: '' }, connectionMode: 'http' };
  }
}

// --- Trash / Soft Delete ---

export type TrashItemKind = 'collection' | 'folder' | 'request';

export interface TrashItem {
  id: string;
  kind: TrashItemKind;
  deletedAt: string;
  originalLocation: {
    collectionId: string;
    collectionName: string;
    parentFolderId?: string;
    parentFolderName?: string;
    index: number;
  };
  item: Collection | Folder | SavedRequest;
}
