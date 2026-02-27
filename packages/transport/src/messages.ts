// Message type definitions for webview <-> extension communication
// These types define the protocol shared between all platform adapters.

import type {
  Collection,
  ResponseData,
  SavedRequest,
  EnvironmentsData,
  OAuth2Config,
  OAuthToken,
  GraphQLSchema,
  AuthState,
  KeyValue,
} from '@hivefetch/core';
import type { HistorySearchParams, HistoryIndexEntry, HistoryEntry } from '@hivefetch/core/services';

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
      type: 'none' | 'basic' | 'bearer' | 'apikey' | 'oauth2' | 'aws' | 'ntlm';
      username?: string;
      password?: string;
      token?: string;
      oauthToken?: string;
      oauthTokenData?: OAuthToken;
      oauth2?: OAuth2Config;
      apiKeyName?: string;
      apiKeyValue?: string;
      apiKeyIn?: string;
      awsAccessKey?: string;
      awsSecretKey?: string;
      awsRegion?: string;
      awsService?: string;
      awsSessionToken?: string;
      ntlmDomain?: string;
      ntlmWorkstation?: string;
    };
    ssl?: {
      rejectUnauthorized?: boolean;
      certPath?: string;
      keyPath?: string;
      passphrase?: string;
    };
  };
}

export interface PickSslFileMessage {
  type: 'pickSslFile';
  data: { field: 'cert' | 'key' };
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

export interface SelectFileMessage {
  type: 'selectFile';
  data?: { fieldId?: string };
}

export interface OpenInNewTabMessage {
  type: 'openInNewTab';
  data: { content: string; language: string };
}

export interface IntrospectGraphQLMessage {
  type: 'introspectGraphQL';
  data: { url: string; headers: KeyValue[]; auth: AuthState };
}

export interface UpdateSettingsMessage {
  type: 'updateSettings';
  data: {
    autoCorrectUrls: boolean;
    shortcuts: Record<string, string>;
    minimap: string;
  };
}

export interface DownloadResponseMessage {
  type: 'downloadResponse';
  data: {
    content: string;
    filename: string;
  };
}

export interface ClosePanelsForRequestsMessage {
  type: 'closePanelsForRequests';
  data: { requestIds: string[] };
}

// History Messages (Webview -> Extension)
export interface GetHistoryMessage {
  type: 'getHistory';
  data?: HistorySearchParams;
}

export interface GetHistoryEntryMessage {
  type: 'getHistoryEntry';
  data: { id: string };
}

export interface DeleteHistoryEntryMessage {
  type: 'deleteHistoryEntry';
  data: { id: string };
}

export interface ClearHistoryMessage {
  type: 'clearHistory';
}

export interface OpenHistoryEntryMessage {
  type: 'openHistoryEntry';
  data: { id: string };
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
  | DownloadResponseMessage
  | ClosePanelsForRequestsMessage
  | PickSslFileMessage
  | GetHistoryMessage
  | GetHistoryEntryMessage
  | DeleteHistoryEntryMessage
  | ClearHistoryMessage
  | OpenHistoryEntryMessage;

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

export interface OAuthTokenReceivedMessage {
  type: 'oauthTokenReceived';
  data: OAuthToken;
}

export interface OAuthFlowErrorMessage {
  type: 'oauthFlowError';
  data: { message: string };
}

export interface FileSelectedMessage {
  type: 'fileSelected';
  data: { fieldId?: string; filePath: string; fileName: string; fileSize: number; fileMimeType: string };
}

export interface GraphQLSchemaMessage {
  type: 'graphqlSchema';
  data: GraphQLSchema;
}

export interface GraphQLSchemaErrorMessage {
  type: 'graphqlSchemaError';
  data: { message: string };
}

export interface SslFilePickedMessage {
  type: 'sslFilePicked';
  data: { field: 'cert' | 'key'; path: string };
}

export interface OAuthTokenRefreshedMessage {
  type: 'oauthTokenRefreshed';
  data: OAuthToken;
}

// History Messages (Extension -> Webview)
export interface HistoryLoadedMessage {
  type: 'historyLoaded';
  data: { entries: HistoryIndexEntry[]; total: number; hasMore: boolean };
}

export interface HistoryUpdatedMessage {
  type: 'historyUpdated';
  data: { entries: HistoryIndexEntry[]; total: number; hasMore: boolean };
}

export interface HistoryEntryLoadedMessage {
  type: 'historyEntryLoaded';
  data: HistoryEntry;
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
  | SslFilePickedMessage
  | OAuthTokenRefreshedMessage
  | HistoryLoadedMessage
  | HistoryUpdatedMessage
  | HistoryEntryLoadedMessage
  | ErrorMessage;
