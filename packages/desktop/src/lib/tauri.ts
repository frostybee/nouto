// TauriMessageBus - implements IMessageBus for Tauri desktop app
// Bridges Svelte UI to Rust backend using Tauri's invoke/listen APIs

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { readTextFile } from '@tauri-apps/plugin-fs';
import type { IMessageBus } from '@nouto/transport';
import type { OutgoingMessage, IncomingMessage } from '@nouto/transport';
import type { ResponseData, Collection } from '@nouto/core';
import type { Cookie } from '@nouto/core/services';
import type { RustEventName, RustEventPayloads } from './rust-events';
import { TauriCookieJarService } from './cookie-store';
import { settings } from '@nouto/ui/stores/settings.svelte';
import {
  setCurrentWorkspacePath,
  setCurrentWorkspaceMeta,
  setRecentWorkspaces,
} from '@nouto/ui/stores/workspace.svelte';

import { handleRunnerMessage } from './handlers/runner-handler';
import {
  handleWsSessionMessage,
  createWsSessionState,
  isWsSessionCommand,
  type WsSessionState,
} from './handlers/ws-session-handler';
import { handleCodegenMessage } from './handlers/codegen-handler';
import { handleFileOperation } from './handlers/file-handler';
import { handleCollectionMessage } from './handlers/collection-handler';
import { handleCookieMessage } from './handlers/cookie-handler';
import {
  handleEnvironmentMessage,
  emitStoredEnvironments,
  cacheEnvironmentEvent,
  isEnvironmentCommand,
} from './handlers/environment-handler';
import { handleOpenApiMessage } from './handlers/openapi-handler';
import { logger } from './logger';

/** Loose shape of the raw Tauri event payload before it is tagged with its event name. */
interface RustEventEnvelope {
  data?: unknown;
  message?: string;
  success?: boolean;
}

const COOKIE_MESSAGE_TYPES = new Set([
  'getCookieJar',
  'getCookieJars',
  'createCookieJar',
  'renameCookieJar',
  'deleteCookieJar',
  'setActiveCookieJar',
  'deleteCookie',
  'deleteCookieDomain',
  'clearCookieJar',
  'addCookie',
  'updateCookie',
]);

const COLLECTION_MESSAGE_TYPES = new Set(['getCollections']);

const FILE_OP_MESSAGE_TYPES = new Set([
  'downloadResponse',
  'downloadBinaryResponse',
  'openBinaryResponse',
]);

const CODEGEN_MESSAGE_TYPES = new Set(['openInNewTab']);

const OPENAPI_MESSAGE_TYPES = new Set(['openApiSave', 'openApiSaveAs', 'openApiOpenFile']);

const RUNNER_MESSAGE_TYPES = new Set(['retryFailedRequests', 'exportRunResults']);

const RUST_COMMAND_TYPES = new Set([
  'ready',
  'loadData',
  'sendRequest',
  'cancelRequest',
  'saveCollections',
  'saveEnvironments',
  'saveTrash',
  'updateSettings',
  'selectFile',
  'openExternal',
  'getHistory',
  'clearHistory',
  'deleteHistoryEntry',
  'saveHistoryToCollection',
  'getHistoryEntry',
  'getHistoryStats',
  'getRequestHistory',
  'getDrawerHistory',
  'exportHistory',
  'importHistory',
  'pickSslFile',
  'grpcReflect',
  'grpcLoadProto',
  'grpcInvoke',
  'grpcSendMessage',
  'grpcEndStream',
  'grpcInvalidatePool',
  'grpcCommitStream',
  'pickProtoFile',
  'pickProtoImportDir',
  'scanProtoDir',
  'introspectGraphQL',
  'wsConnect',
  'wsSend',
  'wsDisconnect',
  'wsSaveSession',
  'wsLoadSessionById',
  'wsListSessions',
  'wsDeleteSession',
  'sseConnect',
  'sseDisconnect',
  'startOAuthFlow',
  'refreshOAuthToken',
  'clearOAuthToken',
  'oauthDeepLinkCallback',
  'startCollectionRun',
  'cancelCollectionRun',
  'getRunnerHistory',
  'getRunnerHistoryDetail',
  'deleteRunnerHistoryEntry',
  'clearRunnerHistory',
  'selectDataFile',
  'startMockServer',
  'stopMockServer',
  'updateMockRoutes',
  'clearMockLogs',
  'startBenchmark',
  'cancelBenchmark',
  'storeSecret',
  'getSecret',
  'deleteSecret',
  'gqlSubSubscribe',
  'gqlSubUnsubscribe',
  'linkEnvFile',
  'unlinkEnvFile',
  'openProjectDir',
  'closeProject',
  'getRecentProjects',
  'removeRecentProject',
  'clearRecentProjectsCmd',
  'openRecentProject',
  'createProject',
  'getWorkspaceMeta',
  'updateWorkspaceMeta',
  'deleteWorkspaceMeta',
  'exportBackup',
  'importBackup',
  'createSettingsWindow',
  'getSettings',
]);

const FORWARD_TO_LISTENERS = new Set([
  'openEnvironmentsPanel',
  'createRequestFromUrl',
  'closePanelsForRequests',
  'showWarning',
  'saveToCollectionWithLink',
  'saveToNewCollectionWithLink',
  'revealActiveRequest',
  'selectRequest',
  'openMockServer',
  'openBenchmark',
  'openJsonExplorer',
]);

export class TauriMessageBus implements IMessageBus {
  private listeners: Array<(message: IncomingMessage) => void> = [];
  private unlistenFunctions: UnlistenFn[] = [];
  private cookieJarService = new TauriCookieJarService();

  private _saveTimer: ReturnType<typeof setTimeout> | null = null;
  private _pendingSavePayload: Collection[] | null = null;

  private wsState: WsSessionState;
  private eventListenersReady: Promise<void>;

  constructor() {
    this.wsState = createWsSessionState();
    this.cookieJarService.load();
    this.eventListenersReady = this.setupEventListeners();
  }

  async waitForListeners(): Promise<void> {
    return this.eventListenersReady;
  }

  private async setupEventListeners() {
    const eventTypes: RustEventName[] = [
      'loadRequest',
      'requestResponse',
      'requestCancelled',
      'collections',
      'collectionsLoaded',
      'initialData',
      'collectionsSaved',
      'loadEnvironments',
      'storeResponseContext',
      'loadSettings',
      'securityWarning',
      'oauthTokenReceived',
      'oauthFlowError',
      'fileSelected',
      'graphqlSchema',
      'graphqlSchemaError',
      'sslFilePicked',
      'oauthTokenRefreshed',
      'oauthTokenCleared',
      'downloadProgress',
      'grpcProtoLoaded',
      'grpcProtoError',
      'protoFilesPicked',
      'protoImportDirsPicked',
      'grpcConnectionStart',
      'grpcEvent',
      'grpcConnectionEnd',
      'error',
      'openSettings',
      'setVariables',
      'collectionRequestSaved',
      'updateRequestIdentity',
      'requestLinkedToCollection',
      'requestUnlinked',
      'showNotification',
      'scriptOutput',
      'historyLoaded',
      'historyUpdated',
      'historyEntryLoaded',
      'historyStatsLoaded',
      'historySaveToCollection',
      'drawerHistoryLoaded',
      'wsStatus',
      'wsMessage',
      'sseStatus',
      'sseEvent',
      'collectionRunProgress',
      'collectionRunRequestResult',
      'collectionRunComplete',
      'collectionRunCancelled',
      'collectionRunWarning',
      'runnerHistoryList',
      'runnerHistoryDetail',
      'dataFileLoaded',
      'mockStatusChanged',
      'mockLogAdded',
      'benchmarkProgress',
      'benchmarkIterationComplete',
      'benchmarkComplete',
      'benchmarkCancelled',
      'secretValue',
      'secretStored',
      'secretDeleted',
      'envFileVariablesUpdated',
      'projectOpened',
      'projectClosed',
      'projectFileChanged',
      'recentProjectsLoaded',
      'workspaceMetaLoaded',
      'externalFileChanged',
      'wsSessionSaved',
      'wsSessionLoaded',
      'wsSessionsList',
      'wsReplayProgress',
      'gqlSubStatus',
      'gqlSubEvent',
      'restoreCookies',
      'cookieMutations',
      'secretsResolved',
      'backupExportDone',
      'backupImportDone',
    ];

    for (const eventType of eventTypes) {
      const unlisten = await listen<RustEventEnvelope>(eventType, (event) => {
        logger.debug(`[TauriMessageBus] Received event: "${eventType}"`);

        // Tauri delivers { data?, message?, success? }; reattaching the event
        // name reconstructs the full typed IncomingMessage. This is the one
        // deliberate cast in this file — every branch below narrows `message`
        // via `message.type === '...'` so the payload stays type-checked.
        const message = {
          type: eventType,
          ...event.payload,
        } as RustEventPayloads[typeof eventType];

        if (message.type === 'requestResponse') {
          this.handleResponseCookies(message.data);
        }

        if (message.type === 'backupExportDone') {
          window.dispatchEvent(new CustomEvent('backup-export-done'));
        }
        if (message.type === 'backupImportDone') {
          window.dispatchEvent(new CustomEvent('backup-import-done'));
        }

        if (message.type === 'projectOpened') {
          setCurrentWorkspacePath(message.data.path);
        } else if (message.type === 'projectClosed') {
          setCurrentWorkspacePath(null);
        } else if (message.type === 'workspaceMetaLoaded') {
          setCurrentWorkspaceMeta(message.data);
        } else if (message.type === 'recentProjectsLoaded') {
          const list = Array.isArray(message.data) ? message.data : [];
          setRecentWorkspaces(
            list.map((r) => ({ path: r.path ?? '', name: r.name ?? r.path ?? '' })),
          );
        }

        if (message.type === 'loadEnvironments') {
          cacheEnvironmentEvent(message.data);
        }

        if (message.type === 'restoreCookies' && message.data) {
          localStorage.setItem('nouto_cookie_jars', JSON.stringify(message.data));
          this.cookieJarService.load();
        }

        if (message.type === 'cookieMutations') {
          for (const mutation of message.data) {
            if (mutation.type === 'set') {
              this.cookieJarService.addCookie({
                name: mutation.cookie.name,
                value: mutation.cookie.value,
                domain: mutation.cookie.domain,
                path: mutation.cookie.path,
                expires: mutation.cookie.expires ?? undefined,
                httpOnly: mutation.cookie.http_only ?? false,
                secure: mutation.cookie.secure ?? false,
                // Wire value is a plain string; scripts are expected to send
                // one of the three RFC 6265bis values.
                sameSite: mutation.cookie.same_site as Cookie['sameSite'] | undefined,
                createdAt: Date.now(),
              });
            } else if (mutation.type === 'delete') {
              this.cookieJarService.deleteCookie(mutation.name, mutation.domain, '/');
            } else if (mutation.type === 'clear') {
              this.cookieJarService.clearAll();
            }
          }
          return;
        }

        if (message.type === 'wsMessage' && this.wsState.wsRecording) {
          const msgData = message.data;
          const content = msgData.data || '';
          this.wsState.wsRecordedMessages.push({
            direction: msgData.direction || 'received',
            type: msgData.type || 'text',
            data: content,
            size: content.length,
            relativeTimeMs: Date.now() - this.wsState.wsRecordingStartTime,
          });
        }

        this.notifyListeners(message);
      });
      this.unlistenFunctions.push(unlisten);
    }
  }

  send(message: OutgoingMessage): void {
    if (FORWARD_TO_LISTENERS.has(message.type)) {
      // Pure loopback: the payload the UI sent is exactly what listeners
      // expect back. Some of these types (selectRequest, openMockServer, ...)
      // are constructed ad hoc by callers and are not real OutgoingMessage
      // members, so this is the one deliberate cast in this forwarding path.
      this.notifyListeners(message as unknown as IncomingMessage);
      return;
    }

    if (FILE_OP_MESSAGE_TYPES.has(message.type)) {
      handleFileOperation(message, this.notifyListeners.bind(this));
      return;
    }

    if (CODEGEN_MESSAGE_TYPES.has(message.type)) {
      handleCodegenMessage(message, this.notifyListeners.bind(this));
      return;
    }

    if (OPENAPI_MESSAGE_TYPES.has(message.type)) {
      handleOpenApiMessage(message, this.notifyListeners.bind(this));
      return;
    }

    if (RUNNER_MESSAGE_TYPES.has(message.type)) {
      handleRunnerMessage(message, this.notifyListeners.bind(this));
      return;
    }

    if (isWsSessionCommand(message)) {
      handleWsSessionMessage(message, this.notifyListeners.bind(this), this.wsState);
      return;
    }

    if (isEnvironmentCommand(message)) {
      handleEnvironmentMessage(message, this.notifyListeners.bind(this));
      return;
    }

    if (COOKIE_MESSAGE_TYPES.has(message.type)) {
      handleCookieMessage(message, this.notifyListeners.bind(this), this.cookieJarService);
      return;
    }

    if (COLLECTION_MESSAGE_TYPES.has(message.type)) {
      handleCollectionMessage(message, this.notifyListeners.bind(this));
      return;
    }

    if (message.type === 'ready') {
      setTimeout(() => {
        emitStoredEnvironments(this.notifyListeners.bind(this));
      }, 0);
    }

    if (message.type === 'listFonts') {
      invoke<{ uiFonts: string[]; editorFonts: string[] }>('list_fonts')
        .then((result) => {
          this.notifyListeners({ type: 'fontsListed', data: result });
        })
        .catch((error) => {
          logger.error('[TauriMessageBus] list_fonts failed:', error);
        });
      return;
    }

    if (message.type === 'readFileContent') {
      const filePath = message.data.path;
      readTextFile(filePath)
        .then((content) => {
          this.notifyListeners({
            type: 'fileContentRead',
            data: { path: filePath, content },
          });
        })
        .catch((error) => {
          this.notifyListeners({
            type: 'fileContentError',
            data: { path: filePath, error: String(error) },
          });
        });
      return;
    }

    if (message.type === 'sendRequest') {
      this.injectCookieHeader(message);
      if (message.data && typeof message.data === 'object') {
        message.data.cookies = Object.values(this.cookieJarService.getAllByDomain()).flat();
      }
    }

    if (message.type === 'sendRequest' && message.data && typeof message.data === 'object') {
      const d = message.data;
      if (!d.proxy && settings.globalProxy?.enabled) {
        const gp = settings.globalProxy;
        d.proxy = {
          enabled: true,
          protocol: gp.protocol || 'http',
          host: gp.host,
          port: gp.port,
          username: gp.username || '',
          password: gp.password || '',
          noProxy: gp.noProxy || '',
        };
      }
      if (!d.ssl?.certPath) {
        const gc = settings.globalClientCert;
        const hasGlobalCert = gc?.certPath;
        const globalReject = settings.sslRejectUnauthorized ?? true;

        if (hasGlobalCert || globalReject === false) {
          d.ssl = {
            ...(d.ssl || {}),
            rejectUnauthorized: globalReject,
            ...(hasGlobalCert
              ? {
                  certPath: gc!.certPath,
                  keyPath: gc!.keyPath || '',
                  passphrase: gc!.passphrase || '',
                  caCertPath: gc!.caCertPath || '',
                }
              : {}),
          };
        }
      }
    }

    if (message.type === 'wsConnect') {
      this.injectCookieHeader(message);
    }
    if (message.type === 'sseConnect') {
      this.injectCookieHeader(message);
    }
    if (message.type === 'gqlSubSubscribe') {
      this.injectCookieHeader(message);
    }

    if (
      message.type === 'closeProject' ||
      message.type === 'openProjectDir' ||
      message.type === 'openRecentProject' ||
      message.type === 'createProject'
    ) {
      if (this._saveTimer) {
        clearTimeout(this._saveTimer);
        this._saveTimer = null;
        this._pendingSavePayload = null;
      }
    }

    if (!RUST_COMMAND_TYPES.has(message.type)) {
      logger.warn(`[TauriMessageBus] No Rust handler for "${message.type}", ignoring`);
      return;
    }

    const command = this.messageTypeToCommand(message.type);

    if (command === 'save_collections' && message.type === 'saveCollections') {
      logger.debug(`[TauriMessageBus] Sending command: "${command}"`);
      this._pendingSavePayload = message.data;
      if (this._saveTimer) clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(() => {
        this._saveTimer = null;
        void this.invokePendingSave();
      }, 300);
      return;
    }

    const payload =
      command === 'open_external'
        ? this.normalizeOpenExternalPayload(message)
        : 'data' in message
          ? message.data
          : {};

    logger.debug(`[TauriMessageBus] Sending command: "${command}"`);

    invoke(command, { data: payload }).catch((error) => {
      logger.error(`[TauriMessageBus] Command "${command}" failed:`, error);
      this.notifyListeners({
        type: 'error',
        message: `Command failed: ${error}`,
      });
      if (command === 'export_backup') window.dispatchEvent(new CustomEvent('backup-export-done'));
      if (command === 'import_backup') window.dispatchEvent(new CustomEvent('backup-import-done'));
    });
  }

  onMessage(callback: (message: IncomingMessage) => void): () => void {
    this.listeners.push(callback);
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  getState<T>(): T | undefined {
    try {
      const state = localStorage.getItem('nouto_state');
      return state ? JSON.parse(state) : undefined;
    } catch {
      return undefined;
    }
  }

  setState<T>(state: T): void {
    try {
      localStorage.setItem('nouto_state', JSON.stringify(state));
    } catch (error) {
      logger.error('Failed to persist state:', error);
    }
  }

  /** Send the debounced `save_collections` payload now, if there is one. */
  private async invokePendingSave(): Promise<void> {
    const data = this._pendingSavePayload;
    this._pendingSavePayload = null;
    if (data === null) return;
    try {
      await invoke('save_collections', { data });
    } catch (error) {
      logger.error(`[TauriMessageBus] Command "save_collections" failed:`, error);
      this.notifyListeners({ type: 'error', message: `Command failed: ${error}` });
    }
  }

  /**
   * Drain the debounced collection save to disk. Called from the close
   * handshake so an edit made right before closing is not lost.
   */
  async flushPendingSaves(): Promise<void> {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    await this.invokePendingSave();
  }

  private notifyListeners(message: IncomingMessage) {
    this.listeners.forEach((listener) => {
      try {
        listener(message);
      } catch (error) {
        logger.error('Listener error:', error);
      }
    });
  }

  private messageTypeToCommand(type: string): string {
    return type
      .replace(/GraphQL/g, 'Graphql')
      .replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }

  private normalizeOpenExternalPayload(message: OutgoingMessage): { url?: string } {
    if (message.type !== 'openExternal') return {};
    return { url: message.data?.url ?? message.url };
  }

  destroy() {
    this.unlistenFunctions.forEach((unlisten) => unlisten());
    this.unlistenFunctions = [];
    this.listeners = [];
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    for (const timer of this.wsState.wsReplayTimers) {
      clearTimeout(timer);
    }
    this.wsState.wsReplayTimers = [];
    this.wsState.wsRecording = false;
  }

  private injectCookieHeader(message: OutgoingMessage): void {
    const data = 'data' in message ? message.data : undefined;
    if (!data?.url) return;

    const headers: Array<{ key: string; value: string; enabled: boolean }> = data.headers || [];
    const hasExplicitCookie = headers.some((h) => h.enabled && h.key?.toLowerCase() === 'cookie');
    if (hasExplicitCookie) return;

    const cookieHeader = this.cookieJarService.buildCookieHeader(data.url);
    if (cookieHeader) {
      if (!data.headers) data.headers = [];
      data.headers.push({ key: 'Cookie', value: cookieHeader, enabled: true });
    }
  }

  private handleResponseCookies(responseData: ResponseData): void {
    if (!responseData?.headers) return;
    const requestUrl = responseData.requestUrl;
    if (!requestUrl) return;
    this.cookieJarService.storeFromResponse(responseData.headers, requestUrl);
  }
}

let messageBus: TauriMessageBus | null = null;

export function getMessageBus(): TauriMessageBus {
  if (!messageBus) {
    messageBus = new TauriMessageBus();
  }
  return messageBus;
}
