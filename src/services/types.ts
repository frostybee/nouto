// Shared types for the extension side
// These mirror the webview types for consistency

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface KeyValue {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export interface AuthState {
  type: 'none' | 'basic' | 'bearer';
  username?: string;
  password?: string;
  token?: string;
}

export interface BodyState {
  type: 'none' | 'json' | 'text' | 'form-data' | 'x-www-form-urlencoded';
  content: string;
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

export interface Collection {
  id: string;
  name: string;
  items: CollectionItem[]; // Nested structure (replaces flat 'requests')
  expanded: boolean;
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
}

export interface EnvironmentsData {
  environments: Environment[];
  activeId: string | null;
  globalVariables?: EnvironmentVariable[];
}
