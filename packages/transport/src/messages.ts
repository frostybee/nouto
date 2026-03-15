// Message type definitions for webview <-> extension communication
// These types define the protocol shared between all platform adapters.

import type {
  Collection,
  ResponseData,
  SavedRequest,
  ResponseExample,
  EnvironmentsData,
  EnvironmentVariable,
  OAuth2Config,
  OAuthToken,
  GraphQLSchema,
  AuthState,
  KeyValue,
  ScriptResult,
  RequestKind,
  GrpcConfig,
  GrpcProtoDescriptor,
  GrpcConnection,
  GrpcEvent,
  WsRecordingState,
  WsSession,
  WsSessionSummary,
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
      type: 'none' | 'basic' | 'bearer' | 'apikey' | 'oauth2' | 'aws' | 'ntlm' | 'digest';
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
    timeout?: number;
    followRedirects?: boolean;
    maxRedirects?: number;
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

export interface StoreSecretMessage {
  type: 'storeSecret';
  data: { envId: string; key: string; value: string };
}

export interface GetSecretMessage {
  type: 'getSecret';
  data: { envId: string; key: string };
}

export interface DeleteSecretMessage {
  type: 'deleteSecret';
  data: { envId: string; key: string };
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
  data?: { requestKind?: RequestKind };
}

export interface DuplicateRequestMessage {
  type: 'duplicateRequest';
}

export interface OpenEnvironmentsPanelMessage {
  type: 'openEnvironmentsPanel';
  data?: { tab?: 'global' | 'environments' | 'cookieJar' };
}

// Cookie Jar Messages (Webview -> Extension)
export interface GetCookieJarMessage {
  type: 'getCookieJar';
}

export interface DeleteCookieMessage {
  type: 'deleteCookie';
  data: { name: string; domain: string; path: string };
}

export interface DeleteCookieDomainMessage {
  type: 'deleteCookieDomain';
  data: { domain: string };
}

export interface ClearCookieJarMessage {
  type: 'clearCookieJar';
}

export interface GetCookieJarsMessage {
  type: 'getCookieJars';
}

export interface CreateCookieJarMessage {
  type: 'createCookieJar';
  data: { name: string };
}

export interface RenameCookieJarMessage {
  type: 'renameCookieJar';
  data: { id: string; name: string };
}

export interface DeleteCookieJarMessage {
  type: 'deleteCookieJar';
  data: { id: string };
}

export interface SetActiveCookieJarMessage {
  type: 'setActiveCookieJar';
  data: { id: string | null };
}

export interface AddCookieMessage {
  type: 'addCookie';
  data: {
    name: string;
    value: string;
    domain: string;
    path: string;
    expires?: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
  };
}

export interface UpdateCookieMessage {
  type: 'updateCookie';
  data: {
    oldName: string;
    oldDomain: string;
    oldPath: string;
    cookie: {
      name: string;
      value: string;
      domain: string;
      path: string;
      expires?: number;
      httpOnly: boolean;
      secure: boolean;
      sameSite?: 'Strict' | 'Lax' | 'None';
    };
  };
}

// UI Interaction Response Messages (Webview -> Extension)
export interface InputBoxResultMessage {
  type: 'inputBoxResult';
  data: { requestId: string; value: string | null };
}

export interface QuickPickResultMessage {
  type: 'quickPickResult';
  data: { requestId: string; value: string | string[] | null };
}

export interface ConfirmResultMessage {
  type: 'confirmResult';
  data: { requestId: string; confirmed: boolean };
}

export interface CreateItemDialogResultMessage {
  type: 'createItemDialogResult';
  data: { requestId: string; value: { name: string; color?: string; icon?: string } | null };
}

export interface AddResponseExampleMessage {
  type: 'addResponseExample';
  data: {
    panelId: string;
    requestId: string;
    collectionId: string;
    example: ResponseExample;
  };
}

export interface DeleteResponseExampleMessage {
  type: 'deleteResponseExample';
  data: {
    panelId: string;
    requestId: string;
    collectionId: string;
    exampleId: string;
  };
}

// gRPC Messages (Webview -> Extension)
export interface GrpcReflectMessage {
  type: 'grpcReflect';
  data: { address: string; metadata?: KeyValue[]; tls?: boolean; tlsCertPath?: string; tlsKeyPath?: string; tlsCaCertPath?: string };
}

export interface GrpcLoadProtoMessage {
  type: 'grpcLoadProto';
  data: { protoPaths: string[]; importDirs: string[] };
}

export interface GrpcInvokeMessage {
  type: 'grpcInvoke';
  data: {
    address: string;
    serviceName: string;
    methodName: string;
    metadata: KeyValue[];
    body: string;
    useReflection: boolean;
    protoPaths: string[];
    importDirs: string[];
    tls?: boolean;
    tlsCertPath?: string;
    tlsKeyPath?: string;
    tlsCaCertPath?: string;
  };
}

export interface PickProtoFileMessage {
  type: 'pickProtoFile';
}

export interface PickProtoImportDirMessage {
  type: 'pickProtoImportDir';
}

// WebSocket Session Recording Messages (Webview -> Extension)
export interface WsStartRecordingMessage {
  type: 'wsStartRecording';
}

export interface WsStopRecordingMessage {
  type: 'wsStopRecording';
  data: { name?: string };
}

export interface WsSaveSessionMessage {
  type: 'wsSaveSession';
  data: { session: WsSession };
}

export interface WsExportSessionMessage {
  type: 'wsExportSession';
  data: { session: WsSession };
}

export interface WsLoadSessionMessage {
  type: 'wsLoadSession';
}

export interface WsLoadSessionByIdMessage {
  type: 'wsLoadSessionById';
  data: { sessionId: string };
}

export interface WsListSessionsMessage {
  type: 'wsListSessions';
}

export interface WsDeleteSessionMessage {
  type: 'wsDeleteSession';
  data: { sessionId: string };
}

export interface WsStartReplayMessage {
  type: 'wsStartReplay';
  data: { session: WsSession; speedMultiplier: number };
}

export interface WsCancelReplayMessage {
  type: 'wsCancelReplay';
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
  | StoreSecretMessage
  | GetSecretMessage
  | DeleteSecretMessage
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
  | OpenEnvironmentsPanelMessage
  | GetCookieJarMessage
  | DeleteCookieMessage
  | DeleteCookieDomainMessage
  | ClearCookieJarMessage
  | GetCookieJarsMessage
  | CreateCookieJarMessage
  | RenameCookieJarMessage
  | DeleteCookieJarMessage
  | SetActiveCookieJarMessage
  | AddCookieMessage
  | UpdateCookieMessage
  | InputBoxResultMessage
  | QuickPickResultMessage
  | ConfirmResultMessage
  | CreateItemDialogResultMessage
  | AddResponseExampleMessage
  | DeleteResponseExampleMessage
  | GrpcReflectMessage
  | GrpcLoadProtoMessage
  | GrpcInvokeMessage
  | PickProtoFileMessage
  | PickProtoImportDirMessage
  | WsStartRecordingMessage
  | WsStopRecordingMessage
  | WsSaveSessionMessage
  | WsExportSessionMessage
  | WsLoadSessionMessage
  | WsLoadSessionByIdMessage
  | WsListSessionsMessage
  | WsDeleteSessionMessage
  | WsStartReplayMessage
  | WsCancelReplayMessage;

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
    hasWorkspace: boolean;
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
  data: EnvironmentsData & {
    envFileVariables?: import('@hivefetch/core').EnvironmentVariable[];
    cookieJarData: Record<string, any[]>;
    cookieJars?: Array<{ id: string; name: string; cookieCount: number }>;
    activeCookieJarId?: string | null;
  };
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

export interface GqlSubStatusMessage {
  type: 'gqlSubStatus';
  data: { status: string; error?: string };
}

export interface GqlSubEventMessage {
  type: 'gqlSubEvent';
  data: { id: string; type: 'data' | 'error' | 'complete'; data: string; timestamp: number };
}

export interface SetVariablesMessage {
  type: 'setVariables';
  data: { key: string; value: string; scope: 'environment' | 'global' }[];
}

export interface CookieJarDataMessage {
  type: 'cookieJarData';
  data: Record<string, any[]>;
}

export interface CookieJarsListMessage {
  type: 'cookieJarsList';
  data: {
    jars: Array<{ id: string; name: string; cookieCount: number }>;
    activeJarId: string | null;
  };
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

// UI Interaction Messages (Extension -> Webview)
export interface ShowNotificationMessage {
  type: 'showNotification';
  data: { level: 'info' | 'warning' | 'error'; message: string };
}

export interface ShowInputBoxMessage {
  type: 'showInputBox';
  data: {
    requestId: string;
    prompt: string;
    placeholder?: string;
    value?: string;
    validateNotEmpty?: boolean;
  };
}

export interface ShowQuickPickMessage {
  type: 'showQuickPick';
  data: {
    requestId: string;
    title: string;
    items: { label: string; value: string; description?: string; kind?: 'separator'; icon?: string; accent?: boolean }[];
    canPickMany?: boolean;
  };
}

export interface ShowConfirmMessage {
  type: 'showConfirm';
  data: {
    requestId: string;
    message: string;
    confirmLabel?: string;
    variant?: 'danger' | 'warning' | 'info';
  };
}

export interface ShowCreateItemDialogMessage {
  type: 'showCreateItemDialog';
  data: {
    requestId: string;
    mode: 'collection' | 'folder';
  };
}

// gRPC Messages (Extension -> Webview)
export interface GrpcProtoLoadedMessage {
  type: 'grpcProtoLoaded';
  data: GrpcProtoDescriptor;
}

export interface GrpcProtoErrorMessage {
  type: 'grpcProtoError';
  data: { message: string };
}

export interface ProtoFilesPickedMessage {
  type: 'protoFilesPicked';
  data: { paths: string[] };
}

export interface ProtoImportDirsPickedMessage {
  type: 'protoImportDirsPicked';
  data: { paths: string[] };
}

export interface GrpcConnectionStartMessage {
  type: 'grpcConnectionStart';
  data: GrpcConnection;
}

export interface GrpcEventMessage {
  type: 'grpcEvent';
  data: GrpcEvent;
}

export interface GrpcConnectionEndMessage {
  type: 'grpcConnectionEnd';
  data: GrpcConnection;
}

// WebSocket Session Recording Messages (Extension -> Webview)
export interface WsRecordingStateMessage {
  type: 'wsRecordingState';
  data: { state: WsRecordingState };
}

export interface WsSessionSavedMessage {
  type: 'wsSessionSaved';
  data: { session: WsSession };
}

export interface WsSessionLoadedMessage {
  type: 'wsSessionLoaded';
  data: { session: WsSession };
}

export interface WsSessionsListMessage {
  type: 'wsSessionsList';
  data: { sessions: WsSessionSummary[] };
}

export interface WsReplayProgressMessage {
  type: 'wsReplayProgress';
  data: { index: number; total: number; state: 'replaying' | 'complete' };
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
  | EnvFileVariablesUpdatedMessage
  | ScriptOutputMessage
  | WsStatusMessage
  | WsMessageMessage
  | SseStatusMessage
  | SseEventMessage
  | GqlSubStatusMessage
  | GqlSubEventMessage
  | SetVariablesMessage
  | CookieJarDataMessage
  | CookieJarsListMessage
  | ShowCommandPaletteMessage
  | SecretValueMessage
  | DownloadProgressMessage
  | ErrorMessage
  | ShowNotificationMessage
  | ShowInputBoxMessage
  | ShowQuickPickMessage
  | ShowConfirmMessage
  | ShowCreateItemDialogMessage
  | GrpcProtoLoadedMessage
  | GrpcProtoErrorMessage
  | ProtoFilesPickedMessage
  | ProtoImportDirsPickedMessage
  | GrpcConnectionStartMessage
  | GrpcEventMessage
  | GrpcConnectionEndMessage
  | WsRecordingStateMessage
  | WsSessionSavedMessage
  | WsSessionLoadedMessage
  | WsSessionsListMessage
  | WsReplayProgressMessage;
