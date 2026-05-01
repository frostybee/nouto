// TauriMessageBus - implements IMessageBus for Tauri desktop app
// Bridges Svelte UI to Rust backend using Tauri's invoke/listen APIs

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { readTextFile } from '@tauri-apps/plugin-fs';
import type { IMessageBus } from '@nouto/transport';
import type { OutgoingMessage, IncomingMessage } from '@nouto/transport';
import { TauriCookieJarService } from './cookie-store';
import { settings } from '@nouto/ui/stores/settings.svelte';
import {
  setCurrentWorkspacePath,
  setCurrentWorkspaceMeta,
  setRecentWorkspaces,
} from '@nouto/ui/stores/workspace.svelte';

import { handleRunnerMessage } from './handlers/runner-handler';
import { handleWsSessionMessage, createWsSessionState, type WsSessionState } from './handlers/ws-session-handler';
import { handleCodegenMessage } from './handlers/codegen-handler';
import { handleFileOperation } from './handlers/file-handler';
import { handleCollectionMessage } from './handlers/collection-handler';
import { handleCookieMessage } from './handlers/cookie-handler';
import { handleEnvironmentMessage, emitStoredEnvironments, cacheEnvironmentEvent } from './handlers/environment-handler';

const COOKIE_MESSAGE_TYPES = new Set([
  'getCookieJar', 'getCookieJars', 'createCookieJar', 'renameCookieJar',
  'deleteCookieJar', 'setActiveCookieJar', 'deleteCookie', 'deleteCookieDomain',
  'clearCookieJar', 'addCookie', 'updateCookie',
]);

const COLLECTION_MESSAGE_TYPES = new Set(['getCollections']);

const ENVIRONMENT_MESSAGE_TYPES = new Set([
  'createEnvironment', 'renameEnvironment', 'deleteEnvironment', 'duplicateEnvironment',
  'setActiveEnvironment', 'importEnvironments', 'exportEnvironment', 'exportAllEnvironments',
  'exportGlobalVariables', 'importGlobalVariables',
]);

const FILE_OP_MESSAGE_TYPES = new Set([
  'downloadResponse', 'downloadBinaryResponse', 'openBinaryResponse',
]);

const CODEGEN_MESSAGE_TYPES = new Set(['openInNewTab']);

const RUNNER_MESSAGE_TYPES = new Set(['retryFailedRequests', 'exportRunResults']);

const WS_SESSION_MESSAGE_TYPES = new Set([
  'wsStartRecording', 'wsStopRecording', 'wsSaveSession', 'wsExportSession',
  'wsLoadSession', 'wsStartReplay', 'wsCancelReplay',
]);

const RUST_COMMAND_TYPES = new Set([
  'ready', 'loadData', 'sendRequest', 'cancelRequest', 'saveCollections',
  'saveEnvironments', 'saveTrash', 'updateSettings', 'selectFile', 'openExternal',
  'getHistory', 'clearHistory', 'deleteHistoryEntry', 'saveHistoryToCollection',
  'getHistoryEntry', 'getHistoryStats', 'getRequestHistory', 'getDrawerHistory',
  'exportHistory', 'importHistory', 'pickSslFile',
  'grpcReflect', 'grpcLoadProto', 'grpcInvoke', 'grpcSendMessage', 'grpcEndStream',
  'grpcInvalidatePool', 'grpcCommitStream', 'pickProtoFile', 'pickProtoImportDir',
  'scanProtoDir', 'introspectGraphQL',
  'wsConnect', 'wsSend', 'wsDisconnect', 'wsSaveSession', 'wsLoadSessionById',
  'wsListSessions', 'wsDeleteSession',
  'sseConnect', 'sseDisconnect',
  'startOAuthFlow', 'refreshOAuthToken', 'clearOAuthToken', 'oauthDeepLinkCallback',
  'startCollectionRun', 'cancelCollectionRun',
  'getRunnerHistory', 'getRunnerHistoryDetail', 'deleteRunnerHistoryEntry', 'clearRunnerHistory',
  'selectDataFile',
  'startMockServer', 'stopMockServer', 'updateMockRoutes', 'clearMockLogs',
  'startBenchmark', 'cancelBenchmark',
  'storeSecret', 'getSecret', 'deleteSecret',
  'gqlSubSubscribe', 'gqlSubUnsubscribe',
  'linkEnvFile', 'unlinkEnvFile',
  'openProjectDir', 'closeProject', 'getRecentProjects', 'removeRecentProject',
  'clearRecentProjectsCmd', 'openRecentProject', 'createProject',
  'getWorkspaceMeta', 'updateWorkspaceMeta', 'deleteWorkspaceMeta',
  'exportBackup', 'importBackup',
]);

const FORWARD_TO_LISTENERS = new Set([
  'openEnvironmentsPanel', 'createRequestFromUrl', 'closePanelsForRequests',
  'showWarning', 'saveToCollectionWithLink', 'saveToNewCollectionWithLink',
  'revealActiveRequest', 'selectRequest', 'openMockServer', 'openBenchmark',
  'openJsonExplorer',
]);

export class TauriMessageBus implements IMessageBus {
  private listeners: Array<(message: IncomingMessage) => void> = [];
  private unlistenFunctions: UnlistenFn[] = [];
  private cookieJarService = new TauriCookieJarService();

  private _saveTimer: ReturnType<typeof setTimeout> | null = null;
  private _pendingSavePayload: any = null;

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
    const eventTypes = [
      'loadRequest', 'requestResponse', 'requestCancelled',
      'collections', 'collectionsLoaded', 'initialData', 'collectionsSaved',
      'loadEnvironments', 'storeResponseContext', 'loadSettings',
      'securityWarning', 'oauthTokenReceived', 'oauthFlowError',
      'fileSelected', 'graphqlSchema', 'graphqlSchemaError',
      'sslFilePicked', 'oauthTokenRefreshed', 'oauthTokenCleared',
      'downloadProgress',
      'grpcProtoLoaded', 'grpcProtoError', 'protoFilesPicked', 'protoImportDirsPicked',
      'grpcConnectionStart', 'grpcEvent', 'grpcConnectionEnd',
      'error', 'openSettings', 'setVariables',
      'collectionRequestSaved', 'updateRequestIdentity',
      'requestLinkedToCollection', 'requestUnlinked',
      'showNotification', 'scriptOutput',
      'historyLoaded', 'historyUpdated', 'historyEntryLoaded', 'historyStatsLoaded',
      'drawerHistoryLoaded',
      'wsStatus', 'wsMessage', 'sseStatus', 'sseEvent',
      'collectionRunProgress', 'collectionRunRequestResult',
      'collectionRunComplete', 'collectionRunCancelled', 'collectionRunWarning',
      'runnerHistoryList', 'runnerHistoryDetail', 'dataFileLoaded',
      'mockStatusChanged', 'mockLogAdded',
      'benchmarkProgress', 'benchmarkIterationComplete', 'benchmarkComplete', 'benchmarkCancelled',
      'secretValue', 'secretStored', 'secretDeleted',
      'envFileVariablesUpdated',
      'projectOpened', 'projectClosed', 'projectFileChanged',
      'recentProjectsLoaded', 'workspaceMetaLoaded', 'externalFileChanged',
      'wsSessionSaved', 'wsSessionLoaded', 'wsSessionsList', 'wsReplayProgress',
      'gqlSubStatus', 'gqlSubEvent',
      'restoreCookies', 'cookieMutations', 'secretsResolved',
      'backupExportDone', 'backupImportDone',
    ];

    for (const eventType of eventTypes) {
      const unlisten = await listen<any>(eventType, (event) => {
        console.log(`[TauriMessageBus] Received event: "${eventType}"`, event.payload);

        if (eventType === 'requestResponse' && event.payload?.data) {
          this.handleResponseCookies(event.payload.data);
        }

        if (eventType === 'backupExportDone') {
          window.dispatchEvent(new CustomEvent('backup-export-done'));
        }
        if (eventType === 'backupImportDone') {
          window.dispatchEvent(new CustomEvent('backup-import-done'));
        }

        if (eventType === 'projectOpened') {
          setCurrentWorkspacePath(event.payload?.data?.path ?? null);
        } else if (eventType === 'projectClosed') {
          setCurrentWorkspacePath(null);
        } else if (eventType === 'workspaceMetaLoaded') {
          setCurrentWorkspaceMeta(event.payload?.data ?? null);
        } else if (eventType === 'recentProjectsLoaded') {
          const list = Array.isArray(event.payload?.data) ? event.payload.data : [];
          setRecentWorkspaces(
            list.map((r: any) => ({ path: r.path ?? '', name: r.name ?? r.path ?? '' }))
          );
        }

        if (eventType === 'loadEnvironments' && event.payload?.data) {
          cacheEnvironmentEvent(event.payload.data);
        }

        if (eventType === 'restoreCookies' && event.payload?.data) {
          localStorage.setItem('nouto_cookie_jars', JSON.stringify(event.payload.data));
          this.cookieJarService.load();
        }

        if (eventType === 'cookieMutations' && event.payload?.data) {
          for (const mutation of event.payload.data) {
            if (mutation.type === 'set' && mutation.cookie) {
              this.cookieJarService.addCookie({
                name: mutation.cookie.name,
                value: mutation.cookie.value,
                domain: mutation.cookie.domain,
                path: mutation.cookie.path,
                expires: mutation.cookie.expires ?? undefined,
                httpOnly: mutation.cookie.http_only ?? false,
                secure: mutation.cookie.secure ?? false,
                sameSite: mutation.cookie.same_site ?? undefined,
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

        if (eventType === 'wsMessage' && this.wsState.wsRecording && event.payload?.data) {
          const msgData = event.payload.data;
          const content = msgData.data || '';
          this.wsState.wsRecordedMessages.push({
            direction: msgData.direction || 'received',
            type: msgData.type || 'text',
            data: content,
            size: content.length,
            relativeTimeMs: Date.now() - this.wsState.wsRecordingStartTime,
          });
        }

        const message: IncomingMessage = {
          type: eventType as any,
          ...event.payload,
        };
        this.notifyListeners(message);
      });
      this.unlistenFunctions.push(unlisten);
    }
  }

  send(message: OutgoingMessage): void {
    if (FORWARD_TO_LISTENERS.has(message.type)) {
      this.notifyListeners(message as any);
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

    if (RUNNER_MESSAGE_TYPES.has(message.type)) {
      handleRunnerMessage(message, this.notifyListeners.bind(this));
      return;
    }

    if (WS_SESSION_MESSAGE_TYPES.has(message.type)) {
      handleWsSessionMessage(message, this.notifyListeners.bind(this), this.wsState);
      return;
    }

    if (ENVIRONMENT_MESSAGE_TYPES.has(message.type)) {
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
          console.error('[TauriMessageBus] list_fonts failed:', error);
        });
      return;
    }

    if (message.type === 'readFileContent') {
      const filePath = (message as any).data.path;
      readTextFile(filePath)
        .then((content) => {
          this.notifyListeners({ type: 'fileContentRead', data: { path: filePath, content } } as any);
        })
        .catch((error) => {
          this.notifyListeners({
            type: 'fileContentError',
            data: { path: filePath, error: String(error) },
          } as any);
        });
      return;
    }

    if (message.type === 'sendRequest') {
      this.injectCookieHeader(message);
      if (message.data && typeof message.data === 'object') {
        (message.data as any).cookies = Object.values(this.cookieJarService.getAllByDomain()).flat();
      }
    }

    if (message.type === 'sendRequest' && message.data && typeof message.data === 'object') {
      const d = message.data as any;
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
      if (!d.ssl?.certPath && settings.globalClientCert?.certPath) {
        const gc = settings.globalClientCert;
        d.ssl = {
          ...(d.ssl || {}),
          rejectUnauthorized: settings.sslRejectUnauthorized,
          certPath: gc.certPath,
          keyPath: gc.keyPath || '',
          passphrase: gc.passphrase || '',
        };
      }
    }

    if (message.type === 'wsConnect') {
      this.injectCookieHeader(message);
    }
    if (message.type === 'sseConnect') {
      this.injectCookieHeader(message);
    }

    if (!RUST_COMMAND_TYPES.has(message.type)) {
      console.warn(`[TauriMessageBus] No Rust handler for "${message.type}", ignoring`);
      return;
    }

    const command = this.messageTypeToCommand(message.type);
    const payload = 'data' in message ? message.data : {};

    console.log(`[TauriMessageBus] Sending command: "${command}"`, payload);

    if (command === 'save_collections') {
      this._pendingSavePayload = payload;
      if (this._saveTimer) clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(() => {
        this._saveTimer = null;
        const data = this._pendingSavePayload;
        this._pendingSavePayload = null;
        invoke('save_collections', { data }).catch((error) => {
          console.error(`[TauriMessageBus] Command "save_collections" failed:`, error);
          this.notifyListeners({ type: 'error', message: `Command failed: ${error}` });
        });
      }, 300);
      return;
    }

    invoke(command, { data: payload }).catch((error) => {
      console.error(`[TauriMessageBus] Command "${command}" failed:`, error);
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
      console.error('Failed to persist state:', error);
    }
  }

  private notifyListeners(message: IncomingMessage) {
    this.listeners.forEach((listener) => {
      try {
        listener(message);
      } catch (error) {
        console.error('Listener error:', error);
      }
    });
  }

  private messageTypeToCommand(type: string): string {
    return type.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
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
    const data = (message as any).data;
    if (!data?.url) return;

    const headers: Array<{ key: string; value: string; enabled: boolean }> = data.headers || [];
    const hasExplicitCookie = headers.some(
      (h: any) => h.enabled && h.key?.toLowerCase() === 'cookie'
    );
    if (hasExplicitCookie) return;

    const cookieHeader = this.cookieJarService.buildCookieHeader(data.url);
    if (cookieHeader) {
      if (!data.headers) data.headers = [];
      data.headers.push({ key: 'Cookie', value: cookieHeader, enabled: true });
    }
  }

  private handleResponseCookies(responseData: any): void {
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
