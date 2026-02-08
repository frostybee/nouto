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
