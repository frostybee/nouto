// Shared TypeScript interfaces for HiveFetch

// HTTP Methods
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

// Key-Value pair for headers, params, form data
export interface KeyValue {
  id?: string;
  key: string;
  value: string;
  enabled: boolean;
}

// Authentication types
export type AuthType = 'none' | 'basic' | 'bearer';

export interface AuthState {
  type: AuthType;
  username?: string;
  password?: string;
  token?: string;
}

// Request body types
export type BodyType = 'none' | 'json' | 'text' | 'form-data' | 'x-www-form-urlencoded';

export interface BodyState {
  type: BodyType;
  content: string;
}

// Saved request in a collection
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

// Collection containing requests and folders
export interface Collection {
  id: string;
  name: string;
  items: CollectionItem[]; // Nested structure (replaces flat 'requests')
  expanded: boolean;
  createdAt: string;
  updatedAt: string;
}

// History entry
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

// Response data
export interface ResponseData {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: any;
  duration: number;
  size: number;
  error?: boolean;
}

// Environment types
export interface EnvironmentVariable {
  key: string;
  value: string;
  enabled: boolean;
}

export interface Environment {
  id: string;
  name: string;
  variables: EnvironmentVariable[];
}

export interface EnvironmentsData {
  environments: Environment[];
  activeId: string | null;
  globalVariables?: EnvironmentVariable[];
}

// UI State types
export type SidebarTab = 'collections' | 'history';
export type RequestTab = 'query' | 'headers' | 'auth' | 'body';
export type ResponseTab = 'body' | 'headers' | 'cookies';

// Utility function to generate unique IDs
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Create a new empty request
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

// Create a new collection
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

// Create a new folder
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

// Create a history entry from request and response
export function createHistoryEntry(
  request: {
    method: HttpMethod;
    url: string;
    params: KeyValue[];
    headers: KeyValue[];
    auth: AuthState;
    body: BodyState;
  },
  response: ResponseData
): HistoryEntry {
  return {
    id: generateId(),
    method: request.method,
    url: request.url,
    params: request.params,
    headers: request.headers,
    auth: request.auth,
    body: request.body,
    status: response.status,
    statusText: response.statusText,
    duration: response.duration,
    size: response.size,
    timestamp: new Date().toISOString(),
  };
}
