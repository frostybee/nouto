// Shared types for the extension side
// These mirror the webview types for consistency

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface KeyValue {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export type AuthType = 'none' | 'basic' | 'bearer' | 'apikey' | 'oauth2';
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
  auth?: AuthState;
  headers?: KeyValue[];
  scripts?: ScriptConfig;
  createdAt: string;
  updatedAt: string;
}

export interface HistoryEntry {
  id: string;
  method: HttpMethod;
  url: string;
  params: KeyValue[];
  headers: KeyValue[];
  auth: AuthState;
  body: BodyState;
  status: number;
  statusText: string;
  duration: number;
  size: number;
  timestamp: string;
}

export interface EnvironmentVariable {
  key: string;
  value: string;
  enabled: boolean;
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
