// Message type definitions for webview <-> extension communication
// These types define the protocol shared between all platform adapters.

import type {
  Collection,
  ResponseData,
  SavedRequest,
  EnvironmentsData,
  EnvironmentVariable,
  OAuth2Config,
  OAuthToken,
  GraphQLSchema,
  AuthState,
  KeyValue,
  ScriptResult,
} from '@hivefetch/core';
import type { HistorySearchParams, HistoryIndexEntry, HistoryEntry, HistoryStats } from '@hivefetch/core/services';

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
    templateUrl?: string;
    headers?: any[];
    params?: any[];
    pathParams?: any[];
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
      apiKeyIn?: 'header' | 'query';
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
    proxy?: {
      enabled: boolean;
      protocol: 'http' | 'https' | 'socks5';
      host: string;
      port: number;
      username?: string;
      password?: string;
      noProxy?: string;
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
    saveResponseBody: boolean;
    sslRejectUnauthorized: boolean;
    storageMode: string;
    collectionMode: string;
    collectionFormat: string;
    globalProxy?: {
      enabled: boolean;
      protocol: 'http' | 'https' | 'socks5';
      host: string;
      port: number;
      username?: string;
      password?: string;
      noProxy?: string;
    } | null;
  };
}

export interface DownloadResponseMessage {
  type: 'downloadResponse';
  data: {
    content: string;
    filename: string;
  };
}

export interface DownloadBinaryResponseMessage {
  type: 'downloadBinaryResponse';
  data: {
    base64: string;
    filename: string;
  };
}

export interface OpenBinaryResponseMessage {
  type: 'openBinaryResponse';
  data: {
    base64: string;
    filename: string;
    contentType: string;
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

export interface SaveCollectionRequestMessage {
  type: 'saveCollectionRequest';
  data: {
    panelId: string;
    requestId: string;
    collectionId: string;
    request: SavedRequest;
  };
}

export interface RevertRequestMessage {
  type: 'revertRequest';
  data: {
    panelId: string;
    requestId: string;
    collectionId: string;
  };
}

export interface DirtyStateChangedMessage {
  type: 'dirtyStateChanged';
  data: {
    panelId: string;
    isDirty: boolean;
  };
}

export interface SaveHistoryToCollectionMessage {
  type: 'saveHistoryToCollection';
  data: { historyId: string };
}

export interface GetRequestHistoryMessage {
  type: 'getRequestHistory';
  data: { collectionId: string; requestId?: string; requestName?: string; limit?: number };
}

export interface ExportHistoryMessage {
  type: 'exportHistory';
  data: { format: 'json' | 'csv'; filter?: HistorySearchParams };
}

export interface ImportHistoryMessage {
  type: 'importHistory';
}

export interface GetDrawerHistoryMessage {
  type: 'getDrawerHistory';
  data: { requestId?: string; limit?: number; offset?: number };
}

export interface GetHistoryStatsMessage {
  type: 'getHistoryStats';
  data?: { days?: number };
}

export interface ResolveConflictMessage {
  type: 'resolveConflict';
  data: { action: 'reload' | 'keep' };
}

export interface NewRequestMessage {
  type: 'newRequest';
}

export interface DuplicateRequestMessage {
  type: 'duplicateRequest';
}

export interface OpenEnvironmentsPanelMessage {
  type: 'openEnvironmentsPanel';
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
  | DownloadBinaryResponseMessage
  | OpenBinaryResponseMessage
  | ClosePanelsForRequestsMessage
  | PickSslFileMessage
  | GetHistoryMessage
  | GetHistoryEntryMessage
  | DeleteHistoryEntryMessage
  | ClearHistoryMessage
  | OpenHistoryEntryMessage
  | SaveCollectionRequestMessage
  | RevertRequestMessage
  | DirtyStateChangedMessage
  | SaveHistoryToCollectionMessage
  | GetRequestHistoryMessage
  | ExportHistoryMessage
  | ImportHistoryMessage
  | GetDrawerHistoryMessage
  | GetHistoryStatsMessage
  | ResolveConflictMessage
  | NewRequestMessage
  | DuplicateRequestMessage
  | OpenEnvironmentsPanelMessage;

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
    requestName?: string;
    response: ResponseData;
  };
}

export interface LoadSettingsMessage {
  type: 'loadSettings';
  data: {
    autoCorrectUrls: boolean;
    shortcuts: Record<string, string>;
    minimap: string;
    saveResponseBody: boolean;
    sslRejectUnauthorized: boolean;
    storageMode: string;
    collectionMode: string;
    collectionFormat: string;
    globalProxy?: {
      enabled: boolean;
      protocol: 'http' | 'https' | 'socks5';
      host: string;
      port: number;
      username?: string;
      password?: string;
      noProxy?: string;
    } | null;
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

export interface CollectionRequestSavedMessage {
  type: 'collectionRequestSaved';
  data: { requestId: string; collectionId: string };
}

export interface OriginalRequestLoadedMessage {
  type: 'originalRequestLoaded';
  data: SavedRequest;
}

export interface HistoryStatsLoadedMessage {
  type: 'historyStatsLoaded';
  data: HistoryStats;
}

export interface DrawerHistoryLoadedMessage {
  type: 'drawerHistoryLoaded';
  data: { entries: HistoryIndexEntry[]; total: number; hasMore: boolean };
}

export interface ExternalFileChangedMessage {
  type: 'externalFileChanged';
  data: { requestId: string; updatedRequest: SavedRequest };
}

export interface InitEnvironmentsMessage {
  type: 'initEnvironments';
  data: EnvironmentsData & { envFileVariables?: import('@hivefetch/core').EnvironmentVariable[]; cookieJarData: Record<string, any[]> };
}

export interface UpdateRequestIdentityMessage {
  type: 'updateRequestIdentity';
  data: { requestId: string; collectionId: string; collectionName?: string };
}

export interface RequestLinkedToCollectionMessage {
  type: 'requestLinkedToCollection';
  data: { requestId: string; collectionId: string; collectionName: string };
}

export interface RequestUnlinkedMessage {
  type: 'requestUnlinked';
  data: { message: string };
}

export interface OpenSettingsMessage {
  type: 'openSettings';
}

export interface EnvFileVariablesUpdatedMessage {
  type: 'envFileVariablesUpdated';
  data: { variables: EnvironmentVariable[]; filePath?: string | null };
}

export interface ScriptOutputMessage {
  type: 'scriptOutput';
  data: { phase: 'preRequest' | 'postResponse'; result: ScriptResult };
}

export interface WsStatusMessage {
  type: 'wsStatus';
  data: { status: string; error?: string };
}

export interface WsMessageMessage {
  type: 'wsMessage';
  data: { direction: 'sent' | 'received'; content: string; timestamp: number };
}

export interface SseStatusMessage {
  type: 'sseStatus';
  data: { status: string; error?: string };
}

export interface SseEventMessage {
  type: 'sseEvent';
  data: { type?: string; data: string; id?: string; timestamp: number };
}

export interface SetVariablesMessage {
  type: 'setVariables';
  data: { key: string; value: string; scope: 'environment' | 'global' }[];
}

export interface CookieJarDataMessage {
  type: 'cookieJarData';
  data: Record<string, any[]>;
}

export interface ShowCommandPaletteMessage {
  type: 'showCommandPalette';
  data: { collections: Collection[]; environments: EnvironmentsData | null };
}

export interface SecretValueMessage {
  type: 'secretValue';
  data: { envId: string; key: string; value: string };
}

export interface DownloadProgressMessage {
  type: 'downloadProgress';
  data: { loaded: number; total: number | null };
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
  | CollectionRequestSavedMessage
  | OriginalRequestLoadedMessage
  | HistoryStatsLoadedMessage
  | DrawerHistoryLoadedMessage
  | ExternalFileChangedMessage
  | InitEnvironmentsMessage
  | UpdateRequestIdentityMessage
  | RequestLinkedToCollectionMessage
  | RequestUnlinkedMessage
  | OpenSettingsMessage
  | EnvFileVariablesUpdatedMessage
  | ScriptOutputMessage
  | WsStatusMessage
  | WsMessageMessage
  | SseStatusMessage
  | SseEventMessage
  | SetVariablesMessage
  | CookieJarDataMessage
  | ShowCommandPaletteMessage
  | SecretValueMessage
  | DownloadProgressMessage
  | ErrorMessage;
