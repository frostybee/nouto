// @hivefetch/core - Shared type definitions
// This is the single source of truth for all types shared between
// the extension (Node.js) and webview (Svelte/browser) processes.

// --- HTTP ---

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
export type ConnectionMode = 'http' | 'websocket' | 'sse';

export const REQUEST_KIND = {
  HTTP: 'http',
  GRAPHQL: 'graphql',
  WEBSOCKET: 'websocket',
  SSE: 'sse',
} as const;

export type RequestKind = typeof REQUEST_KIND[keyof typeof REQUEST_KIND];

// --- Key-Value ---

export interface KeyValue {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

// --- Authentication ---

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

// --- Request Body ---

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

// --- Collection Runner ---

export interface CollectionRunConfig {
  collectionId: string;
  folderId?: string;
  stopOnFailure: boolean;
  delayMs: number;
  dataFile?: string;
  dataFileType?: 'csv' | 'json';
  iterations?: number; // 0 = all rows
}

export interface DataRow { [key: string]: string; }

// --- Assertions ---

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
  assertions?: Assertion[];
  scripts?: ScriptConfig;
  description?: string;
  connectionMode?: ConnectionMode;
  lastResponseStatus?: number;
  lastResponseDuration?: number;
  lastResponseSize?: number;
  lastResponseTime?: string;
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
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export type CollectionItem = SavedRequest | Folder;

export function isFolder(item: CollectionItem): item is Folder {
  return (item as Folder).type === 'folder';
}

export function isRequest(item: CollectionItem): item is SavedRequest {
  return !isFolder(item);
}

export interface Collection {
  id: string;
  name: string;
  items: CollectionItem[];
  expanded: boolean;
  builtin?: 'recent';
  auth?: AuthState;
  headers?: KeyValue[];
  variables?: EnvironmentVariable[];
  scripts?: ScriptConfig;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

// --- Environment ---

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

// --- WebSocket ---

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

// --- SSE ---

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
}

// --- Storage ---

export type StorageMode = 'monolithic' | 'git-friendly';

// --- Utility Functions ---

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
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

export function createCollection(name: string): Collection {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    name,
    items: [],
    expanded: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function createFolder(name: string): Folder {
  const now = new Date().toISOString();
  return {
    type: 'folder',
    id: generateId(),
    name,
    children: [],
    expanded: true,
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
