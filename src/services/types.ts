// Shared types for the extension side
// These mirror the webview types for consistency

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
export type ConnectionMode = 'http' | 'websocket' | 'sse';

export const REQUEST_KIND = {
  HTTP: 'http',
  GRAPHQL: 'graphql',
  WEBSOCKET: 'websocket',
  SSE: 'sse',
} as const;

export type RequestKind = typeof REQUEST_KIND[keyof typeof REQUEST_KIND];

export function getDefaultsForRequestKind(kind: RequestKind): {
  name: string;
  method: HttpMethod;
  url: string;
  body: BodyState;
  connectionMode: 'http' | 'websocket' | 'sse';
} {
  switch (kind) {
    case REQUEST_KIND.GRAPHQL:
      return { name: 'New GraphQL Request', method: 'POST', url: '', body: { type: 'graphql', content: '' }, connectionMode: 'http' };
    case REQUEST_KIND.WEBSOCKET:
      return { name: 'New WebSocket', method: 'GET', url: 'ws://', body: { type: 'none', content: '' }, connectionMode: 'websocket' };
    case REQUEST_KIND.SSE:
      return { name: 'New SSE Connection', method: 'GET', url: '', body: { type: 'none', content: '' }, connectionMode: 'sse' };
    case REQUEST_KIND.HTTP:
    default:
      return { name: 'New Request', method: 'GET', url: '', body: { type: 'none', content: '' }, connectionMode: 'http' };
  }
}

export interface KeyValue {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export type AuthType = 'none' | 'basic' | 'bearer' | 'apikey' | 'oauth2' | 'aws';
export type OAuth2GrantType = 'authorization_code' | 'client_credentials' | 'implicit' | 'password';

export interface OAuth2Config {
  grantType: OAuth2GrantType;
  authUrl?: string;
  tokenUrl?: string;
  clientId: string;
  clientSecret?: string;
  scope?: string;
  state?: string;
  usePkce?: boolean;
  username?: string;
  password?: string;
  callbackUrl?: string;
}

export interface OAuthToken {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresAt?: number;
  scope?: string;
}

export interface AuthState {
  type: AuthType;
  username?: string;
  password?: string;
  token?: string;
  apiKeyName?: string;
  apiKeyValue?: string;
  apiKeyIn?: 'header' | 'query';
  oauth2?: OAuth2Config;
  awsAccessKey?: string;
  awsSecretKey?: string;
  awsRegion?: string;
  awsService?: string;
  awsSessionToken?: string;
}

export type AuthInheritance = 'inherit' | 'none' | 'own';

export type BodyType = 'none' | 'json' | 'text' | 'form-data' | 'x-www-form-urlencoded' | 'binary' | 'graphql';

export interface BodyState {
  type: BodyType;
  content: string;
  fileName?: string;
  fileSize?: number;
  fileMimeType?: string;
  graphqlVariables?: string;
  graphqlOperationName?: string;
}

export interface CollectionRunConfig {
  collectionId: string;
  folderId?: string;
  stopOnFailure: boolean;
  delayMs: number;
}

export type AssertionTarget =
  | 'status' | 'responseTime' | 'body' | 'jsonQuery'
  | 'header' | 'contentType' | 'setVariable';

export type AssertionOperator =
  | 'equals' | 'notEquals' | 'contains' | 'notContains'
  | 'greaterThan' | 'lessThan' | 'greaterThanOrEqual' | 'lessThanOrEqual'
  | 'exists' | 'notExists' | 'isType' | 'isJson' | 'count' | 'matches';

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
}

export interface SavedRequest {
  type?: 'request'; // Discriminator (optional for backward compat)
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  params: KeyValue[];
  headers: KeyValue[];
  auth: AuthState;
  body: BodyState;
  authInheritance?: AuthInheritance;
  assertions?: Assertion[];
  scripts?: ScriptConfig;
  description?: string;
  connectionMode?: 'http' | 'websocket' | 'sse';
  lastResponseStatus?: number;
  lastResponseDuration?: number;
  lastResponseSize?: number;
  lastResponseTime?: string; // ISO timestamp — when the request was last executed
  createdAt: string;
  updatedAt: string;
}

// Folder within a collection (supports nesting)
export interface Folder {
  type: 'folder'; // Discriminator
  id: string;
  name: string;
  children: CollectionItem[];
  expanded: boolean;
  auth?: AuthState;
  headers?: KeyValue[];
  authInheritance?: AuthInheritance;
  scripts?: ScriptConfig;
  createdAt: string;
  updatedAt: string;
}

// Union type for collection contents (requests or folders)
export type CollectionItem = SavedRequest | Folder;

// Type guards for CollectionItem
export function isFolder(item: CollectionItem): item is Folder {
  return (item as Folder).type === 'folder';
}

export function isRequest(item: CollectionItem): item is SavedRequest {
  return !isFolder(item);
}

export interface Collection {
  id: string;
  name: string;
  items: CollectionItem[]; // Nested structure (replaces flat 'requests')
  expanded: boolean;
  builtin?: 'recent'; // marks auto-managed Recent collection
  auth?: AuthState;
  headers?: KeyValue[];
  scripts?: ScriptConfig;
  createdAt: string;
  updatedAt: string;
}

export interface EnvironmentVariable {
  key: string;
  value: string;
  enabled: boolean;
  isSecret?: boolean;
  secretRef?: string;
}

export interface Environment {
  id: string;
  name: string;
  variables: EnvironmentVariable[];
  oauthTokens?: Record<string, OAuthToken>;
}

export interface EnvironmentsData {
  environments: Environment[];
  activeId: string | null;
  globalVariables?: EnvironmentVariable[];
  envFilePath?: string | null;
}

export interface DraftEntry {
  id: string;              // panelId
  requestId: string | null;
  collectionId: string | null;
  request: SavedRequest;
  updatedAt: string;
}

// --- Sprint 5: Scripts ---

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

// --- Sprint 5: WebSocket ---

export type WebSocketMessageType = 'text' | 'binary';
export type WebSocketDirection = 'sent' | 'received';
export type WebSocketConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

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

// --- Sprint 5: SSE ---

export type SSEConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

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

// --- Sprint 6: Mock Server ---

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

// --- Sprint 6: Benchmarking ---

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

// --- Sprint 6: Git-Friendly Storage ---

export type StorageMode = 'monolithic' | 'git-friendly';
