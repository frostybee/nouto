// VS Code API bridge for webview communication

import type { Collection, ResponseData, SavedRequest, EnvironmentsData, OAuth2Config, OAuthToken, GraphQLSchema, AuthState, KeyValue } from '../types';

declare global {
  interface Window {
    vscode: {
      postMessage: (message: any) => void;
      getState: () => any;
      setState: (state: any) => void;
    };
  }
}

// ============================================
// Outgoing Messages (Webview -> Extension)
// ============================================

export interface ReadyMessage {
  type: 'ready';
}

export interface SendRequestMessage {
  type: 'sendRequest';
  data: {
    method: string;
    url: string;
    headers?: any[];
    params?: any[];
    body?: any;
    auth?: {
      type: 'none' | 'basic' | 'bearer';
      username?: string;
      password?: string;
      token?: string;
    };
  };
}

export interface UpdateDocumentMessage {
  type: 'updateDocument';
  data: SavedRequest;
}

export interface SaveToCollectionMessage {
  type: 'saveToCollection';
  data: {
    collectionId: string;
    request: Omit<SavedRequest, 'id' | 'createdAt' | 'updatedAt'>;
  };
}

export interface GetCollectionsMessage {
  type: 'getCollections';
}

export interface SaveCollectionsMessage {
  type: 'saveCollections';
  data: Collection[];
}


export interface LoadDataMessage {
  type: 'loadData';
}

export interface CancelRequestMessage {
  type: 'cancelRequest';
}

export interface SaveEnvironmentsMessage {
  type: 'saveEnvironments';
  data: EnvironmentsData;
}

export interface OpenExternalMessage {
  type: 'openExternal';
  url: string;
}

export interface DraftUpdatedMessage {
  type: 'draftUpdated';
  data: {
    panelId: string;
    requestId: string | null;
    collectionId: string | null;
    request: SavedRequest;
  };
}

// OAuth 2.0 messages
export interface StartOAuthFlowMessage {
  type: 'startOAuthFlow';
  data: OAuth2Config;
}

export interface RefreshOAuthTokenMessage {
  type: 'refreshOAuthToken';
  data: { tokenUrl: string; clientId: string; clientSecret?: string; refreshToken: string };
}

export interface ClearOAuthTokenMessage {
  type: 'clearOAuthToken';
}

// File upload messages
export interface SelectFileMessage {
  type: 'selectFile';
  data?: { fieldId?: string };
}

// Code generation messages
export interface OpenInNewTabMessage {
  type: 'openInNewTab';
  data: { content: string; language: string };
}

// GraphQL introspection
export interface IntrospectGraphQLMessage {
  type: 'introspectGraphQL';
  data: { url: string; headers: KeyValue[]; auth: AuthState };
}

// Settings update
export interface UpdateSettingsMessage {
  type: 'updateSettings';
  data: {
    autoCorrectUrls: boolean;
    shortcuts: Record<string, string>;
    minimap: string;
  };
}

// Download response
export interface DownloadResponseMessage {
  type: 'downloadResponse';
  data: {
    content: string;
    filename: string;
  };
}

export type OutgoingMessage =
  | ReadyMessage
  | SendRequestMessage
  | CancelRequestMessage
  | UpdateDocumentMessage
  | SaveToCollectionMessage
  | GetCollectionsMessage
  | SaveCollectionsMessage
  | SaveEnvironmentsMessage
  | OpenExternalMessage
  | LoadDataMessage
  | DraftUpdatedMessage
  | StartOAuthFlowMessage
  | RefreshOAuthTokenMessage
  | ClearOAuthTokenMessage
  | SelectFileMessage
  | OpenInNewTabMessage
  | IntrospectGraphQLMessage
  | UpdateSettingsMessage
  | DownloadResponseMessage;

// ============================================
// Incoming Messages (Extension -> Webview)
// ============================================

export interface LoadRequestMessage {
  type: 'loadRequest';
  data: SavedRequest;
}

export interface ResponseMessage {
  type: 'requestResponse';
  data: ResponseData;
}

export interface CollectionsMessage {
  type: 'collections';
  data: Collection[];
}

export interface CollectionsLoadedMessage {
  type: 'collectionsLoaded';
  data: Collection[];
}

export interface InitialDataMessage {
  type: 'initialData';
  data: {
    collections: Collection[];
  };
}

export interface CollectionsSavedMessage {
  type: 'collectionsSaved';
  success: boolean;
}


export interface ErrorMessage {
  type: 'error';
  message: string;
}

export interface RequestCancelledMessage {
  type: 'requestCancelled';
}

export interface LoadEnvironmentsMessage {
  type: 'loadEnvironments';
  data: EnvironmentsData;
}

export interface StoreResponseContextMessage {
  type: 'storeResponseContext';
  data: {
    requestId: string;
    response: ResponseData;
  };
}

export interface LoadSettingsMessage {
  type: 'loadSettings';
  data: {
    autoCorrectUrls: boolean;
    shortcuts: Record<string, string>;
    minimap: string;
  };
}

export interface SecurityWarningMessage {
  type: 'securityWarning';
  data: {
    message: string;
  };
}

// OAuth incoming messages
export interface OAuthTokenReceivedMessage {
  type: 'oauthTokenReceived';
  data: OAuthToken;
}

export interface OAuthFlowErrorMessage {
  type: 'oauthFlowError';
  data: { message: string };
}

// File selection incoming message
export interface FileSelectedMessage {
  type: 'fileSelected';
  data: { fieldId?: string; filePath: string; fileName: string; fileSize: number; fileMimeType: string };
}

// GraphQL schema incoming messages
export interface GraphQLSchemaMessage {
  type: 'graphqlSchema';
  data: GraphQLSchema;
}

export interface GraphQLSchemaErrorMessage {
  type: 'graphqlSchemaError';
  data: { message: string };
}

export type IncomingMessage =
  | LoadRequestMessage
  | ResponseMessage
  | RequestCancelledMessage
  | CollectionsMessage
  | CollectionsLoadedMessage
  | InitialDataMessage
  | CollectionsSavedMessage
  | LoadEnvironmentsMessage
  | StoreResponseContextMessage
  | LoadSettingsMessage
  | SecurityWarningMessage
  | OAuthTokenReceivedMessage
  | OAuthFlowErrorMessage
  | FileSelectedMessage
  | GraphQLSchemaMessage
  | GraphQLSchemaErrorMessage
  | ErrorMessage;

// ============================================
// API Functions
// ============================================

// Send message to extension
export function postMessage(message: OutgoingMessage) {
  window.vscode?.postMessage(message);
}

// Listen for messages from extension
export function onMessage(callback: (message: IncomingMessage) => void): () => void {
  const handler = (event: MessageEvent) => {
    callback(event.data);
  };
  window.addEventListener('message', handler);

  // Return cleanup function
  return () => {
    window.removeEventListener('message', handler);
  };
}

// Request initial data load from extension
export function requestInitialData() {
  postMessage({ type: 'loadData' });
}

// Notify extension that webview is ready
export function notifyReady() {
  postMessage({ type: 'ready' });
}

// Send HTTP request
export function sendRequest(data: SendRequestMessage['data']) {
  postMessage({ type: 'sendRequest', data });
}

// Update document (for custom editor auto-save)
export function updateDocument(data: SavedRequest) {
  postMessage({ type: 'updateDocument', data });
}

// Save request to collection
export function saveToCollection(collectionId: string, request: Omit<SavedRequest, 'id' | 'createdAt' | 'updatedAt'>) {
  postMessage({
    type: 'saveToCollection',
    data: { collectionId, request },
  });
}

// Get collections list
export function getCollections() {
  postMessage({ type: 'getCollections' });
}

// ============================================
// State Persistence (webview state)
// ============================================

export function getState<T>(): T | undefined {
  return window.vscode?.getState();
}

export function setState<T>(state: T) {
  window.vscode?.setState(state);
}
