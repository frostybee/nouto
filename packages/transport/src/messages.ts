// Message type definitions for webview <-> extension communication
// These types define the protocol shared between all platform adapters.

import type {
  Collection,
  Environment,
  TrashItem,
  WebSocketConnectionStatus,
  SSEConnectionStatus,
  GqlSubStatus,
  GqlSubEvent,
  SSEEvent,
  AssertionOperator,
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
  WebSocketMessage,
  GrpcProtoDescriptor,
  GrpcConnection,
  GrpcEvent,
  WsRecordingState,
  WsSession,
  WsSessionSummary,
  BenchmarkConfig,
  BenchmarkIteration,
  BenchmarkResult,
  BodyState,
  CollectionRunRequestResult,
  CollectionRunResult,
  MockRequestLog,
  MockServerStatus,
} from '@nouto/core';
import type {
  HistorySearchParams,
  HistoryIndexEntry,
  HistoryEntry,
  HistoryStats,
  OpenApiFormat,
  OpenApiVersion,
  Cookie,
} from '@nouto/core/services';

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
      caCertPath?: string;
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
    requestId?: string;
    requestName?: string;
    scriptChain?: {
      entries: Array<{
        source: string;
        sourceName: string;
        preRequest: string;
        postResponse: string;
      }>;
    };
    envData?: {
      activeEnvironment?: any;
      globalVariables?: any[];
    };
    /** Injected by the desktop message bus from the local cookie jar. */
    cookies?: Cookie[];
  };
}

export interface PickSslFileMessage {
  type: 'pickSslFile';
  data: { field: 'cert' | 'key' | 'ca' | `global-${'cert' | 'key' | 'ca'}` };
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

/** Save the current panel request into a collection and link the panel to it. */
export interface SaveToCollectionWithLinkMessage {
  type: 'saveToCollectionWithLink';
  data: {
    collectionId: string;
    folderId?: string;
    request?: Partial<SavedRequest>;
  };
}

/** Create a collection, save the current panel request into it, and link the panel. */
export interface SaveToNewCollectionWithLinkMessage {
  type: 'saveToNewCollectionWithLink';
  data: {
    name: string;
    color?: string;
    icon?: string;
    request?: Partial<SavedRequest>;
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
  data?: { panelId?: string };
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
  /** @deprecated use data.url */
  url?: string;
  data?: { url: string };
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

export interface OAuthDeepLinkCallbackMessage {
  type: 'oauthDeepLinkCallback';
  data: { code: string; state: string | null };
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
    openApiLintEnabled?: boolean;
    openApiLintRules?: Record<string, 'error' | 'warning' | 'off'>;
    openApiOutlineSortAlphabetically?: boolean;
  };
}

export interface DownloadResponseMessage {
  type: 'downloadResponse';
  data: {
    content: string;
    filename: string;
  };
}

/**
 * Infer a JSON Schema from a response body and insert it under
 * `/components/schemas` of an open OpenAPI document. VS Code-only for now —
 * the desktop UI never renders the action (gated by a host capability flag),
 * so the Tauri bus intentionally has no routing for it.
 */
export interface AddResponseSchemaToSpecMessage {
  type: 'addResponseSchemaToSpec';
  data: {
    /**
     * Parsed response body (raw sample, not a schema): only the host knows
     * the target document's OpenAPI version, which decides how nullability
     * is encoded (`nullable: true` on 3.0 vs `type` arrays on 3.1+).
     */
    body: unknown;
    /** Request URL, used to derive the default component name. */
    requestUrl?: string;
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
  data: { entries: HistoryEntry[] };
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

export interface ShowWarningMessage {
  type: 'showWarning';
  data: { message: string };
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

export interface GrpcInvalidatePoolMessage {
  type: 'grpcInvalidatePool';
}

export interface GrpcCommitStreamMessage {
  type: 'grpcCommitStream';
  data: { connectionId: string };
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
  data?: { url?: string; protocols?: string[] };
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

export interface LoadSampleCollectionMessage {
  type: 'loadSampleCollection';
}

export interface ListFontsMessage {
  type: 'listFonts';
}

export interface ReadFileContentMessage {
  type: 'readFileContent';
  data: { path: string };
}

export interface WorkspaceMeta {
  name?: string;
  description?: string;
}

export interface GetWorkspaceMetaMessage {
  type: 'getWorkspaceMeta';
}

export interface UpdateWorkspaceMetaMessage {
  type: 'updateWorkspaceMeta';
  data: WorkspaceMeta;
}

export interface DeleteWorkspaceMetaMessage {
  type: 'deleteWorkspaceMeta';
}

// --- Desktop-only commands with typed payloads ---

export interface SaveTrashMessage {
  type: 'saveTrash';
  data: TrashItem[];
}

export interface CreateSettingsWindowMessage {
  type: 'createSettingsWindow';
  data?: { section?: string | null };
}

export interface CreateEnvironmentMessage {
  type: 'createEnvironment';
  data?: { name?: string };
}

export interface RenameEnvironmentMessage {
  type: 'renameEnvironment';
  data: { id: string; name: string };
}

export interface DeleteEnvironmentMessage {
  type: 'deleteEnvironment';
  data: { id: string };
}

export interface DuplicateEnvironmentMessage {
  type: 'duplicateEnvironment';
  data: { id: string };
}

export interface SetActiveEnvironmentMessage {
  type: 'setActiveEnvironment';
  data: { id: string | null };
}

export interface ImportEnvironmentsMessage {
  type: 'importEnvironments';
}

export interface ExportEnvironmentMessage {
  type: 'exportEnvironment';
  data: { id: string };
}

export interface ExportAllEnvironmentsMessage {
  type: 'exportAllEnvironments';
}

export interface ExportGlobalVariablesMessage {
  type: 'exportGlobalVariables';
}

export interface ImportGlobalVariablesMessage {
  type: 'importGlobalVariables';
}

/** Union of the environment commands handled by the desktop environment handler. */
export type EnvironmentCommandMessage =
  | CreateEnvironmentMessage
  | RenameEnvironmentMessage
  | DeleteEnvironmentMessage
  | DuplicateEnvironmentMessage
  | SetActiveEnvironmentMessage
  | ImportEnvironmentsMessage
  | ExportEnvironmentMessage
  | ExportAllEnvironmentsMessage
  | ExportGlobalVariablesMessage
  | ImportGlobalVariablesMessage;

export interface ScanProtoDirMessage {
  type: 'scanProtoDir';
  data: { dirPath: string };
}

export interface StartBenchmarkMessage {
  type: 'startBenchmark';
  data: {
    config: BenchmarkConfig;
    method: string;
    url: string;
    headers: KeyValue[];
    params: KeyValue[];
    body?: BodyState;
    auth?: AuthState;
    requestName: string;
  };
}

export interface OpenProjectDirMessage {
  type: 'openProjectDir';
}

export interface CloseProjectMessage {
  type: 'closeProject';
}

export interface GetRecentProjectsMessage {
  type: 'getRecentProjects';
}

export interface RemoveRecentProjectMessage {
  type: 'removeRecentProject';
  data: { path: string };
}

export interface ClearRecentProjectsCmdMessage {
  type: 'clearRecentProjectsCmd';
}

export interface OpenRecentProjectMessage {
  type: 'openRecentProject';
  data: { path: string };
}

export interface CreateProjectMessage {
  type: 'createProject';
}

export interface ExportBackupMessage {
  type: 'exportBackup';
  /** `cookies` is the raw persisted cookie-jar blob (or null when absent). */
  data: { cookies: unknown };
}

export interface ImportBackupMessage {
  type: 'importBackup';
}

/**
 * Desktop-only commands whose payloads are not yet modeled. Shrink this list
 * by adding a dedicated interface above and moving the literal out.
 */
export interface DesktopCommandMessage {
  type:
    | 'getSettings'
    | 'retryFailedRequests'
    | 'exportRunResults'
    | 'grpcSendMessage'
    | 'grpcEndStream'
    | 'wsConnect'
    | 'wsSend'
    | 'wsDisconnect'
    | 'sseConnect'
    | 'sseDisconnect'
    | 'startCollectionRun'
    | 'cancelCollectionRun'
    | 'getRunnerHistory'
    | 'getRunnerHistoryDetail'
    | 'deleteRunnerHistoryEntry'
    | 'clearRunnerHistory'
    | 'selectDataFile'
    | 'startMockServer'
    | 'stopMockServer'
    | 'updateMockRoutes'
    | 'clearMockLogs'
    | 'cancelBenchmark'
    | 'gqlSubSubscribe'
    | 'gqlSubUnsubscribe'
    | 'linkEnvFile'
    | 'unlinkEnvFile';
  data?: any;
}

// ============================================
// OpenAPI Editor Messages (Webview -> Extension)
// ============================================

/**
 * One incremental text edit in UTF-16 code-unit offsets of the pre-edit
 * document. Maps 1:1 onto CodeMirror's ChangeSpec and VS Code's
 * WorkspaceEdit.replace(positionAt(from), positionAt(to), insert).
 * `to === from` is a pure insert; `insert === ''` is a pure delete.
 */
export interface OpenApiEditChange {
  from: number;
  to: number;
  insert: string;
}

/** Actions the OpenAPI editor can run host-side, echoed in progress messages. */
export type OpenApiAction = 'save' | 'saveAs' | 'openFile' | 'tryOperation' | 'generateCollection';

export interface OpenApiReadyMessage {
  type: 'openApiReady';
}

export interface OpenApiApplyEditsMessage {
  type: 'openApiApplyEdits';
  data: {
    /** The TextDocument version these changes are based on. */
    documentVersion: number;
    /** Stable per-webview-session id; lets the origin view treat the resulting broadcast as an ack. */
    originId: string;
    changes: OpenApiEditChange[];
  };
}

export interface OpenApiSaveMessage {
  type: 'openApiSave';
}

export interface OpenApiSaveAsMessage {
  type: 'openApiSaveAs';
}

export interface OpenApiOpenFileMessage {
  type: 'openApiOpenFile';
}

export interface OpenApiTryOperationMessage {
  type: 'openApiTryOperation';
  data: { path: string; method: string };
}

export interface OpenApiGenerateCollectionMessage {
  type: 'openApiGenerateCollection';
}

export interface OpenApiOpenDocsInBrowserMessage {
  type: 'openApiOpenDocsInBrowser';
  data: { renderer: string };
}

/** Handshake from the documentation preview webview once its shell has mounted. */
export interface OpenApiPreviewReadyMessage {
  type: 'openApiPreviewReady';
}

/**
 * A single fetch-shaped HTTP request the preview renderer (Swagger UI / RapiDoc
 * "Try it out") wants executed. The renderer runs in a sealed, opaque-origin
 * iframe with `connect-src 'none'`, so it cannot reach the network itself: its
 * `window.fetch` is shimmed to hand the request off here, the extension host
 * runs it through the shared Node HTTP client (no browser CORS), and the
 * response is handed back over `openApiProxyResponse`.
 */
export interface ProxyHttpRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  /** Absent for GET/HEAD or an empty body. */
  body?: string;
  /** `utf8` (default) for text bodies; `base64` reserved for future binary uploads. */
  bodyEncoding?: 'utf8' | 'base64';
}

export interface ProxyHttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  /** `base64` when the response body is binary; `utf8` for text/JSON. */
  bodyEncoding: 'utf8' | 'base64';
  /** Final URL after redirects, so the renderer can report where it landed. */
  url?: string;
}

/** Renderer "Try it out" request, relayed webview -> extension for execution. */
export interface OpenApiProxyRequestMessage {
  type: 'openApiProxyRequest';
  data: { requestId: string; request: ProxyHttpRequest };
}

/** Abandon an in-flight proxy request (frame torn down / preview closed). */
export interface OpenApiProxyCancelMessage {
  type: 'openApiProxyCancel';
  data: { requestId: string };
}

export interface OpenJsonExplorerMessage {
  type: 'openJsonExplorer';
  data: {
    json: unknown;
    contentType: string;
    requestName: string;
    requestMethod: string;
    requestUrl: string;
  };
}

export type OutgoingMessage =
  | ReadyMessage
  | OpenJsonExplorerMessage
  | SendRequestMessage
  | CancelRequestMessage
  | UpdateDocumentMessage
  | SaveToCollectionMessage
  | SaveToCollectionWithLinkMessage
  | SaveToNewCollectionWithLinkMessage
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
  | OAuthDeepLinkCallbackMessage
  | SelectFileMessage
  | OpenInNewTabMessage
  | IntrospectGraphQLMessage
  | UpdateSettingsMessage
  | DownloadResponseMessage
  | AddResponseSchemaToSpecMessage
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
  | ShowWarningMessage
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
  | GrpcInvalidatePoolMessage
  | GrpcCommitStreamMessage
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
  | WsCancelReplayMessage
  | OpenSettingsMessage
  | LoadSampleCollectionMessage
  | ListFontsMessage
  | ReadFileContentMessage
  | GetWorkspaceMetaMessage
  | UpdateWorkspaceMetaMessage
  | DeleteWorkspaceMetaMessage
  | OpenApiReadyMessage
  | OpenApiApplyEditsMessage
  | OpenApiSaveMessage
  | OpenApiSaveAsMessage
  | OpenApiOpenFileMessage
  | OpenApiTryOperationMessage
  | OpenApiGenerateCollectionMessage
  | OpenApiOpenDocsInBrowserMessage
  | OpenApiPreviewReadyMessage
  | OpenApiProxyRequestMessage
  | OpenApiProxyCancelMessage
  | SaveTrashMessage
  | CreateSettingsWindowMessage
  | EnvironmentCommandMessage
  | ScanProtoDirMessage
  | StartBenchmarkMessage
  | OpenProjectDirMessage
  | CloseProjectMessage
  | GetRecentProjectsMessage
  | RemoveRecentProjectMessage
  | ClearRecentProjectsCmdMessage
  | OpenRecentProjectMessage
  | CreateProjectMessage
  | ExportBackupMessage
  | ImportBackupMessage
  | DesktopCommandMessage;

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
  // Desktop and VS Code each send a different superset of these fields.
  data: {
    collections: Collection[];
    environments?: Environment[];
    trash?: TrashItem[];
    // Desktop only
    projectPath?: string | null;
    workspaceMeta?: WorkspaceMeta | null;
    generation?: number;
    // VS Code only
    envFileVariables?: EnvironmentVariable[];
    envFilePath?: string | null;
    history?: { entries: HistoryIndexEntry[]; total: number; hasMore: boolean };
    appVersion?: string;
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
    minimap: 'auto' | 'always' | 'never';
    saveResponseBody: boolean;
    sslRejectUnauthorized: boolean;
    storageMode: 'global' | 'workspace';
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
    openApiLintEnabled?: boolean;
    openApiLintRules?: Record<string, 'error' | 'warning' | 'off'>;
    openApiOutlineSortAlphabetically?: boolean;
  };
}

/** Sent by the JSON Explorer panel to add an assertion to the originating request panel. */
export interface AddAssertionFromExplorerMessage {
  type: 'addAssertionFromExplorer';
  data: { path: string; operator?: AssertionOperator; expected?: unknown };
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
  data: { field: 'cert' | 'key' | 'ca' | string; path: string };
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
    envFileVariables?: import('@nouto/core').EnvironmentVariable[];
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
  data?: { section?: string };
}

export interface OAuthTokenClearedMessage {
  type: 'oauthTokenCleared';
}

export interface FontsListedMessage {
  type: 'fontsListed';
  data: { uiFonts: string[]; editorFonts: string[] };
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
  data: { status: WebSocketConnectionStatus; error?: string };
}

export interface WsMessageMessage {
  type: 'wsMessage';
  data: WebSocketMessage;
}

export interface SseStatusMessage {
  type: 'sseStatus';
  data: { status: SSEConnectionStatus; error?: string };
}

export interface SseEventMessage {
  type: 'sseEvent';
  data: SSEEvent;
}

export interface GqlSubStatusMessage {
  type: 'gqlSubStatus';
  data: { status: GqlSubStatus; error?: string };
}

export interface GqlSubEventMessage {
  type: 'gqlSubEvent';
  data: GqlSubEvent;
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
export interface GrpcProtoDirScannedMessage {
  type: 'protoDirScanned';
  data: { dir: string; files: string[] };
}

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

export interface FileContentReadMessage {
  type: 'fileContentRead';
  data: { path: string; content: string };
}

export interface FileContentErrorMessage {
  type: 'fileContentError';
  data: { path: string; error: string };
}

export interface WorkspaceMetaLoadedMessage {
  type: 'workspaceMetaLoaded';
  data: WorkspaceMeta | null;
}

export interface ActionPanelClosedMessage {
  type: 'actionPanelClosed';
  data: { panel: string };
}

// --- Desktop-only events with typed payloads ---

export interface SecretStoredMessage {
  type: 'secretStored';
  data: { key: string; success: boolean };
}

export interface SecretDeletedMessage {
  type: 'secretDeleted';
  data: { key: string; success: boolean };
}

export interface ProjectOpenedMessage {
  type: 'projectOpened';
  data: { path: string };
}

export interface ProjectClosedMessage {
  type: 'projectClosed';
  data?: Record<string, never>;
}

/** Wire shape of the Rust `RecentProject` struct (snake_case, no serde rename). */
export interface RecentProjectEntry {
  path: string;
  name: string;
  last_opened: string;
}

export interface RecentProjectsLoadedMessage {
  type: 'recentProjectsLoaded';
  data: RecentProjectEntry[];
}

export interface CollectionRunProgressMessage {
  type: 'collectionRunProgress';
  data: { current: number; total: number; requestName: string };
}

export interface CollectionRunRequestResultMessage {
  type: 'collectionRunRequestResult';
  data: CollectionRunRequestResult;
}

export interface CollectionRunCompleteMessage {
  type: 'collectionRunComplete';
  data: CollectionRunResult;
}

/** Runner history list rows: a stored run without its per-request results. */
export type RunnerHistorySummary = Omit<CollectionRunResult, 'results'> & {
  id: string;
  folderId?: string;
};

export interface RunnerHistoryListMessage {
  type: 'runnerHistoryList';
  data: RunnerHistorySummary[];
}

export interface RunnerHistoryDetailMessage {
  type: 'runnerHistoryDetail';
  data: (CollectionRunResult & { id: string }) | null;
}

export interface DataFileLoadedMessage {
  type: 'dataFileLoaded';
  data: { rows: Record<string, string>[]; columns: string[]; fileName: string };
}

export interface MockStatusChangedMessage {
  type: 'mockStatusChanged';
  data: { status: MockServerStatus; error?: string };
}

export interface MockLogAddedMessage {
  type: 'mockLogAdded';
  data: MockRequestLog;
}

export interface BenchmarkProgressMessage {
  type: 'benchmarkProgress';
  data: { current: number; total: number };
}

export interface BenchmarkIterationCompleteMessage {
  type: 'benchmarkIterationComplete';
  data: BenchmarkIteration;
}

export interface BenchmarkCompleteMessage {
  type: 'benchmarkComplete';
  data: BenchmarkResult;
}

/** Opaque persisted cookie-jar blob restored from a backup. */
export interface RestoreCookiesMessage {
  type: 'restoreCookies';
  data: unknown;
}

/** Wire shape of a script cookie emitted by the Rust script engine (snake_case). */
export interface ScriptCookieWire {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number | null;
  http_only?: boolean | null;
  secure?: boolean | null;
  same_site?: string | null;
}

export type CookieMutationWire =
  | { type: 'set'; cookie: ScriptCookieWire }
  | { type: 'delete'; domain: string; name: string }
  | { type: 'clear' };

export interface CookieMutationsMessage {
  type: 'cookieMutations';
  data: CookieMutationWire[];
}

export interface SecretsResolvedMessage {
  type: 'secretsResolved';
  data: { collections: Collection[]; environments: EnvironmentsData; generation: number };
}

export interface BackupExportDoneMessage {
  type: 'backupExportDone';
  data?: Record<string, never>;
}

export interface BackupImportDoneMessage {
  type: 'backupImportDone';
  data?: Record<string, never>;
}

/**
 * Desktop-only events whose payloads are not yet modeled. Shrink this list
 * by adding a dedicated interface above and moving the literal out.
 */
export interface DesktopIncomingMessage {
  type:
    | 'projectFileChanged'
    | 'collectionRunCancelled'
    | 'collectionRunWarning'
    | 'benchmarkCancelled'
    | 'historySaveToCollection'
    | 'saveToCollectionWithLink'
    | 'saveToNewCollectionWithLink'
    | 'showWarning'
    | 'openEnvironmentsPanel'
    | 'createRequestFromUrl'
    | 'closePanelsForRequests'
    | 'revealActiveRequest'
    | 'selectRequest'
    | 'openMockServer'
    | 'openBenchmark'
    | 'openJsonExplorer';
  data?: any;
  message?: string;
  success?: boolean;
}

// ============================================
// OpenAPI Editor Messages (Extension -> Webview)
// ============================================

export interface OpenApiInitMessage {
  type: 'openApiInit';
  data: {
    /** vscode.Uri.toString() form (supports remote and non-file URIs). */
    documentUri: string;
    documentVersion: number;
    content: string;
    format: OpenApiFormat;
    dirty: boolean;
  };
}

/**
 * Broadcast for every authoritative document change. Carries EITHER a full
 * content snapshot OR the incremental changes that produced the new version
 * (full-document rebroadcast on every keystroke is too expensive for large
 * documents; snapshots are used for external changes and resyncs).
 */
export interface OpenApiDocumentChangedMessage {
  type: 'openApiDocumentChanged';
  data: (
    | { content: string; changes?: undefined }
    | { changes: OpenApiEditChange[]; content?: undefined }
  ) & {
    documentVersion: number;
    dirty: boolean;
    /**
     * Present iff the change originated from a webview edit; the view whose
     * originId matches treats this as its acknowledgement. Absent for
     * external changes (undo from another editor, revert, disk change).
     */
    originId?: string;
  };
}

/** Sent when applyEdits was based on a stale version; always a full snapshot to resync. */
export interface OpenApiEditRejectedMessage {
  type: 'openApiEditRejected';
  data: { documentVersion: number; content: string };
}

export interface OpenApiActionStartedMessage {
  type: 'openApiActionStarted';
  data: { action: OpenApiAction };
}

export interface OpenApiActionSucceededMessage {
  type: 'openApiActionSucceeded';
  data: { action: OpenApiAction; message?: string };
}

export interface OpenApiActionFailedMessage {
  type: 'openApiActionFailed';
  data: { action: OpenApiAction; message: string };
}

/**
 * Parsed-specification push for the documentation preview panel.
 *
 * `spec` is omitted when `stale` is true: the webview keeps rendering the last
 * specification it received, so re-sending an unchanged (possibly large)
 * document would be wasted serialization.
 */
export interface OpenApiPreviewDataMessage {
  type: 'openApiPreviewData';
  data: {
    /** vscode.Uri.toString() form (supports remote and non-file URIs). */
    documentUri: string;
    documentVersion: number;
    spec?: object;
    version?: OpenApiVersion;
    stale: boolean;
    /**
     * Whether the renderer's built-in "Try it out" is enabled
     * (`nouto.openApiPreview.enableTryIt`). Delivered so the shell can toggle
     * try-it in the renderer boot without rebuilding the frame.
     */
    tryItEnabled?: boolean;
    /**
     * True when external $refs could not all be resolved/inlined, so the
     * delivered spec is a partial bundle with some dangling references.
     */
    externalRefsIncomplete?: boolean;
  };
}

/** Result of a proxied renderer "Try it out" request, extension -> webview. */
export interface OpenApiProxyResponseMessage {
  type: 'openApiProxyResponse';
  data: { requestId: string; response?: ProxyHttpResponse; error?: string };
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
  | AddAssertionFromExplorerMessage
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
  | GrpcProtoDirScannedMessage
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
  | WsReplayProgressMessage
  | OpenSettingsMessage
  | OAuthTokenClearedMessage
  | FontsListedMessage
  | FileContentReadMessage
  | FileContentErrorMessage
  | WorkspaceMetaLoadedMessage
  | ActionPanelClosedMessage
  | OpenApiInitMessage
  | OpenApiDocumentChangedMessage
  | OpenApiEditRejectedMessage
  | OpenApiActionStartedMessage
  | OpenApiActionSucceededMessage
  | OpenApiActionFailedMessage
  | OpenApiPreviewDataMessage
  | OpenApiProxyResponseMessage
  | SecretStoredMessage
  | SecretDeletedMessage
  | ProjectOpenedMessage
  | ProjectClosedMessage
  | RecentProjectsLoadedMessage
  | CollectionRunProgressMessage
  | CollectionRunRequestResultMessage
  | CollectionRunCompleteMessage
  | RunnerHistoryListMessage
  | RunnerHistoryDetailMessage
  | DataFileLoadedMessage
  | MockStatusChangedMessage
  | MockLogAddedMessage
  | BenchmarkProgressMessage
  | BenchmarkIterationCompleteMessage
  | BenchmarkCompleteMessage
  | RestoreCookiesMessage
  | CookieMutationsMessage
  | SecretsResolvedMessage
  | BackupExportDoneMessage
  | BackupImportDoneMessage
  | DesktopIncomingMessage;
