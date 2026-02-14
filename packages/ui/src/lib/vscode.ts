// VS Code API bridge for webview communication
// Thin wrapper over @hivefetch/transport - delegates to VSCodeMessageBus.
// All existing imports from components continue to work unchanged.

import type { SavedRequest } from '../types';
import { VSCodeMessageBus } from '@hivefetch/transport/adapters/vscode';

// Re-export all message types from transport for backward compatibility
export type {
  ReadyMessage,
  SendRequestMessage,
  UpdateDocumentMessage,
  SaveToCollectionMessage,
  GetCollectionsMessage,
  SaveCollectionsMessage,
  LoadDataMessage,
  CancelRequestMessage,
  SaveEnvironmentsMessage,
  OpenExternalMessage,
  DraftUpdatedMessage,
  StartOAuthFlowMessage,
  RefreshOAuthTokenMessage,
  ClearOAuthTokenMessage,
  SelectFileMessage,
  OpenInNewTabMessage,
  IntrospectGraphQLMessage,
  UpdateSettingsMessage,
  DownloadResponseMessage,
  OutgoingMessage,
  LoadRequestMessage,
  ResponseMessage,
  CollectionsMessage,
  CollectionsLoadedMessage,
  InitialDataMessage,
  CollectionsSavedMessage,
  ErrorMessage,
  RequestCancelledMessage,
  LoadEnvironmentsMessage,
  StoreResponseContextMessage,
  LoadSettingsMessage,
  SecurityWarningMessage,
  OAuthTokenReceivedMessage,
  OAuthFlowErrorMessage,
  FileSelectedMessage,
  GraphQLSchemaMessage,
  GraphQLSchemaErrorMessage,
  IncomingMessage,
} from '@hivefetch/transport/messages';

export type { IMessageBus } from '@hivefetch/transport/bus';

import type { OutgoingMessage, IncomingMessage, SendRequestMessage } from '@hivefetch/transport/messages';

// Singleton message bus instance
const bus = new VSCodeMessageBus();

// ============================================
// API Functions (delegate to message bus)
// ============================================

export function postMessage(message: OutgoingMessage) {
  bus.send(message);
}

export function onMessage(callback: (message: IncomingMessage) => void): () => void {
  return bus.onMessage(callback);
}

export function requestInitialData() {
  bus.send({ type: 'loadData' });
}

export function notifyReady() {
  bus.send({ type: 'ready' });
}

export function sendRequest(data: SendRequestMessage['data']) {
  bus.send({ type: 'sendRequest', data });
}

export function updateDocument(data: SavedRequest) {
  bus.send({ type: 'updateDocument', data });
}

export function saveToCollection(collectionId: string, request: Omit<SavedRequest, 'id' | 'createdAt' | 'updatedAt'>) {
  bus.send({
    type: 'saveToCollection',
    data: { collectionId, request },
  });
}

export function getCollections() {
  bus.send({ type: 'getCollections' });
}

// ============================================
// State Persistence (delegate to message bus)
// ============================================

export function getState<T>(): T | undefined {
  return bus.getState<T>();
}

export function setState<T>(state: T) {
  bus.setState(state);
}
