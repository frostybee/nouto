// VS Code API bridge for webview communication
// Thin wrapper over @hivefetch/transport - delegates to VSCodeMessageBus.
// All existing imports from components continue to work unchanged.
//
// This file is .svelte.ts so that $state.snapshot() is available.
// Every outgoing message is snapshot'd to strip Svelte 5 Proxy wrappers
// before hitting postMessage's structured clone boundary.

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
  PickSslFileMessage,
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
  SslFilePickedMessage,
  OAuthTokenRefreshedMessage,
  IncomingMessage,
} from '@hivefetch/transport/messages';

export type { IMessageBus } from '@hivefetch/transport/bus';

import type { IMessageBus } from '@hivefetch/transport/bus';
import type { OutgoingMessage, IncomingMessage, SendRequestMessage } from '@hivefetch/transport/messages';

// Singleton message bus instance - replaceable via initMessageBus()
let bus: IMessageBus = new VSCodeMessageBus();

/**
 * Replace the singleton bus. Call this at desktop startup to wire
 * all packages/ui components through TauriMessageBus instead of VSCodeMessageBus.
 */
export function initMessageBus(messageBus: IMessageBus): void {
  bus = messageBus;
}

// ============================================
// API Functions (delegate to message bus)
// ============================================

export function postMessage(message: OutgoingMessage) {
  bus.send($state.snapshot(message) as OutgoingMessage);
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
  bus.send($state.snapshot({ type: 'sendRequest', data }) as OutgoingMessage);
}

export function updateDocument(data: SavedRequest) {
  bus.send($state.snapshot({ type: 'updateDocument', data }) as OutgoingMessage);
}

export function saveToCollection(collectionId: string, request: Omit<SavedRequest, 'id' | 'createdAt' | 'updatedAt'>) {
  bus.send($state.snapshot({
    type: 'saveToCollection',
    data: { collectionId, request },
  }) as OutgoingMessage);
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
  bus.setState($state.snapshot(state) as T);
}
