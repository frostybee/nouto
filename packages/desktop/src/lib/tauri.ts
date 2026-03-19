// TauriMessageBus - implements IMessageBus for Tauri desktop app
// Bridges Svelte UI to Rust backend using Tauri's invoke/listen APIs

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile, writeFile } from '@tauri-apps/plugin-fs';
import type { IMessageBus } from '@nouto/transport';
import type { OutgoingMessage, IncomingMessage } from '@nouto/transport';
import { TauriCookieJarService } from './cookie-store';

// Cookie message types handled locally (no Rust command needed)
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

// Collection message types handled locally (no Rust command needed)
const COLLECTION_MESSAGE_TYPES = new Set([
  'getCollections',
]);

// Environment message types handled locally (no Rust command needed)
const ENVIRONMENT_MESSAGE_TYPES = new Set([
  'createEnvironment',
  'renameEnvironment',
  'deleteEnvironment',
  'duplicateEnvironment',
  'setActiveEnvironment',
]);

// File operation message types handled locally using Tauri JS APIs
const FILE_OP_MESSAGE_TYPES = new Set([
  'downloadResponse',
  'downloadBinaryResponse',
]);

// Runner/special message types that need local handling
const RUNNER_MESSAGE_TYPES = new Set([
  'retryFailedRequests',
  'exportRunResults',
]);

// Message types that have corresponding Rust commands (all others are ignored)
const RUST_COMMAND_TYPES = new Set([
  'ready',
  'loadData',
  'sendRequest',
  'cancelRequest',
  'saveCollections',
  'saveEnvironments',
  'updateSettings',
  'selectFile',
  'openExternal',
  'getHistory',
  'clearHistory',
  'deleteHistoryEntry',
  'saveHistoryToCollection',
  'pickSslFile',
  'grpcReflect',
  'grpcLoadProto',
  'grpcInvoke',
  'pickProtoFile',
  'pickProtoImportDir',
  'introspectGraphQL',
  'wsConnect',
  'wsSend',
  'wsDisconnect',
  'sseConnect',
  'sseDisconnect',
  'startOAuthFlow',
  'refreshOAuthToken',
  'clearOAuthToken',
  'startCollectionRun',
  'cancelCollectionRun',
  'startMockServer',
  'stopMockServer',
  'updateMockRoutes',
  'clearMockLogs',
  'cancelBenchmark',
  'storeSecret',
  'getSecret',
  'deleteSecret',
  'openProjectDir',
  'closeProject',
]);

export class TauriMessageBus implements IMessageBus {
  private listeners: Array<(message: IncomingMessage) => void> = [];
  private unlistenFunctions: UnlistenFn[] = [];
  private cookieJarService = new TauriCookieJarService();

  constructor() {
    this.cookieJarService.load();
    this.setupEventListeners();
  }

  /**
   * Setup listeners for all incoming message types from Rust backend
   */
  private async setupEventListeners() {
    // Map all IncomingMessage types to Tauri event listeners
    const eventTypes = [
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
      'wsStatus',
      'wsMessage',
      'sseStatus',
      'sseEvent',
      'collectionRunProgress',
      'collectionRunRequestResult',
      'collectionRunComplete',
      'collectionRunCancelled',
      'mockStatusChanged',
      'mockLogAdded',
      'benchmarkProgress',
      'benchmarkIterationComplete',
      'benchmarkComplete',
      'benchmarkCancelled',
      'secretValue',
      'secretStored',
      'secretDeleted',
      'projectOpened',
      'projectClosed',
      'projectFileChanged',
    ];

    for (const eventType of eventTypes) {
      const unlisten = await listen<any>(eventType, (event) => {
        console.log(`[TauriMessageBus] Received event: "${eventType}"`, event.payload);

        // Intercept requestResponse to capture Set-Cookie headers
        if (eventType === 'requestResponse' && event.payload?.data) {
          this.handleResponseCookies(event.payload.data);
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

  private static readonly COLLECTIONS_KEY = 'nouto_collections';
  private static readonly ENVIRONMENTS_KEY = 'nouto_environments';

  /**
   * Send a message from UI to Rust backend
   */
  send(message: OutgoingMessage): void {
    // Handle file download operations locally using Tauri JS APIs
    if (FILE_OP_MESSAGE_TYPES.has(message.type)) {
      this.handleFileOperation(message);
      return;
    }

    // Handle runner messages locally
    if (RUNNER_MESSAGE_TYPES.has(message.type)) {
      this.handleRunnerMessage(message);
      return;
    }

    // Handle environment messages locally
    if (ENVIRONMENT_MESSAGE_TYPES.has(message.type)) {
      this.handleEnvironmentMessage(message);
      return;
    }

    // Handle cookie messages locally
    if (COOKIE_MESSAGE_TYPES.has(message.type)) {
      this.handleCookieMessage(message);
      return;
    }

    // Handle collection persistence locally
    if (COLLECTION_MESSAGE_TYPES.has(message.type)) {
      this.handleCollectionMessage(message);
      return;
    }

    // Emit stored environments after the UI signals ready
    // (Settings and collections are loaded from Rust via loadData)
    if (message.type === 'ready') {
      setTimeout(() => {
        this.emitStoredEnvironments();
      }, 0);
    }

    // Inject cookie header before sending HTTP requests
    if (message.type === 'sendRequest') {
      this.injectCookieHeader(message);
    }

    // Skip message types that have no Rust command (VS Code-only messages)
    if (!RUST_COMMAND_TYPES.has(message.type)) {
      console.warn(`[TauriMessageBus] No Rust handler for "${message.type}", ignoring`);
      return;
    }

    const command = this.messageTypeToCommand(message.type);

    // Extract data payload if present
    const payload = 'data' in message ? message.data : undefined;

    console.log(`[TauriMessageBus] Sending command: "${command}"`, payload);

    // Invoke Tauri command
    invoke(command, { data: payload }).catch((error) => {
      console.error(`[TauriMessageBus] Command "${command}" failed:`, error);
      this.notifyListeners({
        type: 'error',
        message: `Command failed: ${error}`,
      });
    });
  }

  /**
   * Subscribe to messages from Rust backend
   */
  onMessage(callback: (message: IncomingMessage) => void): () => void {
    this.listeners.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Get persisted state from localStorage (Tauri uses browser storage)
   */
  getState<T>(): T | undefined {
    try {
      const state = localStorage.getItem('nouto_state');
      return state ? JSON.parse(state) : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Persist state to localStorage
   */
  setState<T>(state: T): void {
    try {
      localStorage.setItem('nouto_state', JSON.stringify(state));
    } catch (error) {
      console.error('Failed to persist state:', error);
    }
  }

  /**
   * Notify all listeners of a new message
   */
  private notifyListeners(message: IncomingMessage) {
    this.listeners.forEach((listener) => {
      try {
        listener(message);
      } catch (error) {
        console.error('Listener error:', error);
      }
    });
  }

  /**
   * Convert OutgoingMessage type to Tauri command name
   */
  private messageTypeToCommand(type: string): string {
    // Convert camelCase to snake_case for Rust convention
    return type.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }

  /**
   * Cleanup listeners on destroy
   */
  destroy() {
    this.unlistenFunctions.forEach((unlisten) => unlisten());
    this.unlistenFunctions = [];
    this.listeners = [];
  }

  // --- Runner operations ---

  private async handleRunnerMessage(message: OutgoingMessage): Promise<void> {
    const data = 'data' in message ? (message as any).data : undefined;

    switch (message.type) {
      case 'retryFailedRequests': {
        // Convert retryFailedRequests to startCollectionRun with the failed IDs
        // The runner state collectionId/folderId are embedded in the config
        const config = data?.config || {};
        invoke('start_collection_run', {
          data: {
            collectionId: config.collectionId || '',
            folderId: config.folderId,
            config,
            requestIds: data?.requestIds || [],
          },
        }).catch((error) => {
          console.error('[TauriMessageBus] retryFailedRequests failed:', error);
          this.notifyListeners({ type: 'showNotification', data: { level: 'error', message: `Retry failed: ${error}` } } as any);
        });
        break;
      }
      case 'exportRunResults': {
        const { format, results, summary, collectionName } = data || {};
        let content: string;
        let defaultName: string;

        if (format === 'csv') {
          const header = '#,Name,Method,URL,Status,StatusText,Duration(ms),Pass/Fail,Error';
          const rows = (results || []).map((r: any, i: number) =>
            `${i + 1},"${(r.requestName || '').replace(/"/g, '""')}",${r.method},"${(r.url || '').replace(/"/g, '""')}",${r.status},${r.statusText || ''},${r.duration},${r.passed ? 'Pass' : 'Fail'},"${(r.error || '').replace(/"/g, '""')}"`
          );
          content = [header, ...rows].join('\n');
          defaultName = `${(collectionName || 'results').replace(/[^a-zA-Z0-9]/g, '_')}_results.csv`;
        } else {
          content = JSON.stringify({ collectionName, summary, results }, null, 2);
          defaultName = `${(collectionName || 'results').replace(/[^a-zA-Z0-9]/g, '_')}_results.json`;
        }

        try {
          const filePath = await save({
            defaultPath: defaultName,
            filters: [{ name: 'All Files', extensions: ['*'] }],
          });
          if (filePath) {
            await writeTextFile(filePath, content);
            this.notifyListeners({ type: 'showNotification', data: { level: 'info', message: 'Results exported successfully.' } } as any);
          }
        } catch (error) {
          console.error('[TauriMessageBus] Export failed:', error);
          this.notifyListeners({ type: 'showNotification', data: { level: 'error', message: `Failed to export results: ${error}` } } as any);
        }
        break;
      }
    }
  }

  // --- File operations ---

  private async handleFileOperation(message: OutgoingMessage): Promise<void> {
    const data = 'data' in message ? (message as any).data : undefined;

    try {
      if (message.type === 'downloadResponse') {
        // Text response download
        const content = data?.content ?? '';
        const defaultName = data?.filename || 'response.txt';
        const filePath = await save({
          defaultPath: defaultName,
          filters: [{ name: 'All Files', extensions: ['*'] }],
        });
        if (filePath) {
          await writeTextFile(filePath, content);
          this.notifyListeners({ type: 'showNotification', data: { level: 'info', message: 'Response saved to file.' } } as any);
        }
      } else if (message.type === 'downloadBinaryResponse') {
        // Binary response download
        const base64Content = data?.content ?? '';
        const defaultName = data?.filename || 'response.bin';
        const filePath = await save({
          defaultPath: defaultName,
          filters: [{ name: 'All Files', extensions: ['*'] }],
        });
        if (filePath) {
          // Decode base64 to Uint8Array
          const binaryStr = atob(base64Content);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          await writeFile(filePath, bytes);
          this.notifyListeners({ type: 'showNotification', data: { level: 'info', message: 'Response saved to file.' } } as any);
        }
      }
    } catch (error) {
      console.error('[TauriMessageBus] File operation failed:', error);
      this.notifyListeners({ type: 'showNotification', data: { level: 'error', message: `Failed to save file: ${error}` } } as any);
    }
  }

  // --- Collection persistence ---

  /**
   * Handle collection-related messages locally using localStorage.
   */
  private handleCollectionMessage(message: OutgoingMessage): void {
    switch (message.type) {
      case 'saveCollections': {
        const data = (message as any).data;
        try {
          localStorage.setItem(TauriMessageBus.COLLECTIONS_KEY, JSON.stringify(data));
        } catch (error) {
          console.error('[TauriMessageBus] Failed to save collections:', error);
        }
        this.notifyListeners({ type: 'collectionsSaved', success: true } as any);
        break;
      }
      case 'getCollections': {
        try {
          const raw = localStorage.getItem(TauriMessageBus.COLLECTIONS_KEY);
          const collections = raw ? JSON.parse(raw) : [];
          this.notifyListeners({ type: 'collections', data: collections } as any);
        } catch (error) {
          console.error('[TauriMessageBus] Failed to load collections:', error);
          this.notifyListeners({ type: 'collections', data: [] } as any);
        }
        break;
      }
    }
  }

  // --- Environment persistence ---

  private loadStoredEnvironments(): { environments: any[]; activeId: string | null; globalVariables?: any[] } {
    try {
      const raw = localStorage.getItem(TauriMessageBus.ENVIRONMENTS_KEY);
      return raw ? JSON.parse(raw) : { environments: [], activeId: null };
    } catch {
      return { environments: [], activeId: null };
    }
  }

  private saveEnvironmentData(data: { environments: any[]; activeId: string | null; globalVariables?: any[] }): void {
    // Persist to localStorage as cache
    try {
      localStorage.setItem(TauriMessageBus.ENVIRONMENTS_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('[TauriMessageBus] Failed to cache environments:', error);
    }
    // Also persist to Rust storage on disk
    invoke('save_environments', { data }).catch((error) => {
      console.error('[TauriMessageBus] Failed to save environments to disk:', error);
    });
  }

  private emitStoredEnvironments(): void {
    const envData = this.loadStoredEnvironments();
    this.notifyListeners({ type: 'loadEnvironments', data: envData } as any);
  }

  private handleEnvironmentMessage(message: OutgoingMessage): void {
    const data = 'data' in message ? (message as any).data : undefined;
    const envData = this.loadStoredEnvironments();

    switch (message.type) {
      case 'createEnvironment': {
        const name = data?.name || 'New Environment';
        envData.environments.push({
          id: crypto.randomUUID().replace(/-/g, '').slice(0, 20),
          name,
          variables: [],
        });
        this.saveEnvironmentData(envData);
        this.notifyListeners({ type: 'loadEnvironments', data: envData } as any);
        break;
      }
      case 'renameEnvironment': {
        const env = envData.environments.find((e: any) => e.id === data.id);
        if (env) {
          env.name = data.name;
          this.saveEnvironmentData(envData);
          this.notifyListeners({ type: 'loadEnvironments', data: envData } as any);
        }
        break;
      }
      case 'deleteEnvironment': {
        envData.environments = envData.environments.filter((e: any) => e.id !== data.id);
        if (envData.activeId === data.id) {
          envData.activeId = null;
        }
        this.saveEnvironmentData(envData);
        this.notifyListeners({ type: 'loadEnvironments', data: envData } as any);
        break;
      }
      case 'duplicateEnvironment': {
        const source = envData.environments.find((e: any) => e.id === data.id);
        if (source) {
          envData.environments.push({
            id: crypto.randomUUID().replace(/-/g, '').slice(0, 20),
            name: `${source.name} (copy)`,
            variables: source.variables.map((v: any) => ({ ...v })),
          });
          this.saveEnvironmentData(envData);
          this.notifyListeners({ type: 'loadEnvironments', data: envData } as any);
        }
        break;
      }
      case 'setActiveEnvironment': {
        envData.activeId = data.id;
        this.saveEnvironmentData(envData);
        this.notifyListeners({ type: 'loadEnvironments', data: envData } as any);
        break;
      }
    }
  }

  // --- Cookie handling ---

  /**
   * Handle cookie-related messages locally using TauriCookieJarService.
   */
  private handleCookieMessage(message: OutgoingMessage): void {
    const data = 'data' in message ? (message as any).data : undefined;

    switch (message.type) {
      case 'getCookieJar': {
        const cookies = this.cookieJarService.getAllByDomain();
        this.notifyListeners({ type: 'cookieJarData', data: cookies } as any);
        break;
      }
      case 'getCookieJars': {
        this.emitCookieJarsList();
        break;
      }
      case 'createCookieJar': {
        this.cookieJarService.createJar(data.name);
        this.emitCookieJarsList();
        break;
      }
      case 'renameCookieJar': {
        this.cookieJarService.renameJar(data.id, data.name);
        this.emitCookieJarsList();
        break;
      }
      case 'deleteCookieJar': {
        this.cookieJarService.deleteJar(data.id);
        this.emitCookieJarsList();
        this.emitCookieJarData();
        break;
      }
      case 'setActiveCookieJar': {
        this.cookieJarService.setActiveJar(data.id);
        this.emitCookieJarsList();
        this.emitCookieJarData();
        break;
      }
      case 'deleteCookie': {
        this.cookieJarService.deleteCookie(data.name, data.domain, data.path);
        this.emitCookieJarData();
        break;
      }
      case 'deleteCookieDomain': {
        this.cookieJarService.deleteDomain(data.domain);
        this.emitCookieJarData();
        break;
      }
      case 'clearCookieJar': {
        this.cookieJarService.clearAll();
        this.emitCookieJarData();
        break;
      }
      case 'addCookie': {
        this.cookieJarService.addCookie({ ...data, createdAt: Date.now() });
        this.emitCookieJarData();
        this.emitCookieJarsList();
        break;
      }
      case 'updateCookie': {
        this.cookieJarService.updateCookie(data.oldName, data.oldDomain, data.oldPath, {
          ...data.cookie,
          createdAt: Date.now(),
        });
        this.emitCookieJarData();
        this.emitCookieJarsList();
        break;
      }
    }
  }

  private emitCookieJarsList(): void {
    const jars = this.cookieJarService.listJars();
    const activeJarId = this.cookieJarService.getActiveJarId();
    this.notifyListeners({ type: 'cookieJarsList', data: { jars, activeJarId } } as any);
  }

  private emitCookieJarData(): void {
    const cookies = this.cookieJarService.getAllByDomain();
    this.notifyListeners({ type: 'cookieJarData', data: cookies } as any);
  }

  /**
   * Inject Cookie header from the active jar into an outgoing sendRequest message.
   */
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

  /**
   * Parse Set-Cookie headers from a response and store them in the active jar.
   */
  private handleResponseCookies(responseData: any): void {
    if (!responseData?.headers) return;

    // Use requestUrl from the response if available, otherwise skip
    const requestUrl = responseData.requestUrl;
    if (!requestUrl) return;

    this.cookieJarService.storeFromResponse(responseData.headers, requestUrl);
  }
}

// Singleton instance
let messageBus: TauriMessageBus | null = null;

export function getMessageBus(): TauriMessageBus {
  if (!messageBus) {
    messageBus = new TauriMessageBus();
  }
  return messageBus;
}
