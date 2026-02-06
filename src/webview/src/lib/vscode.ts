// VS Code API bridge for webview communication

import type { Collection, HistoryEntry, ResponseData, SavedRequest, EnvironmentsData } from '../types';

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

export interface SaveHistoryMessage {
  type: 'saveHistory';
  data: HistoryEntry[];
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

export type OutgoingMessage =
  | ReadyMessage
  | SendRequestMessage
  | CancelRequestMessage
  | UpdateDocumentMessage
  | SaveToCollectionMessage
  | GetCollectionsMessage
  | SaveCollectionsMessage
  | SaveHistoryMessage
  | SaveEnvironmentsMessage
  | LoadDataMessage;

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

export interface HistoryLoadedMessage {
  type: 'historyLoaded';
  data: HistoryEntry[];
}

export interface InitialDataMessage {
  type: 'initialData';
  data: {
    collections: Collection[];
    history: HistoryEntry[];
  };
}

export interface CollectionsSavedMessage {
  type: 'collectionsSaved';
  success: boolean;
}

export interface HistorySavedMessage {
  type: 'historySaved';
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
  };
}

export interface SecurityWarningMessage {
  type: 'securityWarning';
  data: {
    message: string;
  };
}

export type IncomingMessage =
  | LoadRequestMessage
  | ResponseMessage
  | RequestCancelledMessage
  | CollectionsMessage
  | CollectionsLoadedMessage
  | HistoryLoadedMessage
  | InitialDataMessage
  | CollectionsSavedMessage
  | HistorySavedMessage
  | LoadEnvironmentsMessage
  | StoreResponseContextMessage
  | LoadSettingsMessage
  | SecurityWarningMessage
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
