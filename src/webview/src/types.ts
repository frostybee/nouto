// Shared TypeScript interfaces for HiveFetch

// HTTP Methods
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

// Key-Value pair for headers, params, form data
export interface KeyValue {
  id: string;
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

// Collection folder
export interface Collection {
  id: string;
  name: string;
  requests: SavedRequest[];
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
    requests: [],
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
