// TauriMessageBus - implements IMessageBus for Tauri desktop app
// Bridges Svelte UI to Rust backend using Tauri's invoke/listen APIs

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, writeFile, readTextFile } from '@tauri-apps/plugin-fs';
import { tempDir } from '@tauri-apps/api/path';
import { open as shellOpen } from '@tauri-apps/plugin-shell';
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
  'importEnvironments',
  'exportEnvironment',
  'exportAllEnvironments',
  'exportGlobalVariables',
  'importGlobalVariables',
]);

// File operation message types handled locally using Tauri JS APIs
const FILE_OP_MESSAGE_TYPES = new Set([
  'downloadResponse',
  'downloadBinaryResponse',
  'openBinaryResponse',
]);

// Codegen message types handled locally (no Rust command needed)
const CODEGEN_MESSAGE_TYPES = new Set([
  'openInNewTab',
]);

// Runner/special message types that need local handling
const RUNNER_MESSAGE_TYPES = new Set([
  'retryFailedRequests',
  'exportRunResults',
]);

// WebSocket session recording/replay message types handled locally
const WS_SESSION_MESSAGE_TYPES = new Set([
  'wsStartRecording',
  'wsStopRecording',
  'wsExportSession',
  'wsLoadSession',
  'wsStartReplay',
  'wsCancelReplay',
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
]);

export class TauriMessageBus implements IMessageBus {
  private listeners: Array<(message: IncomingMessage) => void> = [];
  private unlistenFunctions: UnlistenFn[] = [];
  private cookieJarService = new TauriCookieJarService();

  // WebSocket session recording state
  private wsRecording = false;
  private wsRecordedMessages: Array<{ id: string; direction: string; type: string; data: string; size: number; timestamp: number }> = [];
  private wsRecordingStartTime = 0;
  private wsRecordingUrl = '';
  private wsRecordingProtocols: string[] = [];

  // WebSocket replay state
  private wsReplayTimers: ReturnType<typeof setTimeout>[] = [];
  private wsReplayCancelled = false;

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
      'historyEntryLoaded',
      'historyStatsLoaded',
      'drawerHistoryLoaded',
      'wsStatus',
      'wsMessage',
      'sseStatus',
      'sseEvent',
      'collectionRunProgress',
      'collectionRunRequestResult',
      'collectionRunComplete',
      'collectionRunCancelled',
      'runnerHistoryLoaded',
      'runnerHistoryDetailLoaded',
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
      'externalFileChanged',
      'wsSessionSaved',
      'wsSessionLoaded',
      'wsSessionsList',
      'wsReplayProgress',
      'gqlSubStatus',
      'gqlSubEvent',
    ];

    for (const eventType of eventTypes) {
      const unlisten = await listen<any>(eventType, (event) => {
        console.log(`[TauriMessageBus] Received event: "${eventType}"`, event.payload);

        // Intercept requestResponse to capture Set-Cookie headers
        if (eventType === 'requestResponse' && event.payload?.data) {
          this.handleResponseCookies(event.payload.data);
        }

        // Capture incoming WebSocket messages during recording
        if (eventType === 'wsMessage' && this.wsRecording && event.payload?.data) {
          const msgData = event.payload.data;
          this.wsRecordedMessages.push({
            id: crypto.randomUUID().replace(/-/g, '').slice(0, 20),
            direction: msgData.direction || 'received',
            type: 'text',
            data: msgData.content || '',
            size: (msgData.content || '').length,
            timestamp: msgData.timestamp || Date.now(),
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

    // Handle codegen messages locally (e.g. "Open in New Tab" from CodegenPanel)
    if (CODEGEN_MESSAGE_TYPES.has(message.type)) {
      this.handleCodegenMessage(message);
      return;
    }

    // Handle runner messages locally
    if (RUNNER_MESSAGE_TYPES.has(message.type)) {
      this.handleRunnerMessage(message);
      return;
    }

    // Handle WebSocket session recording/replay locally
    if (WS_SESSION_MESSAGE_TYPES.has(message.type)) {
      this.handleWsSessionMessage(message);
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
    // Cancel any active replay
    for (const timer of this.wsReplayTimers) {
      clearTimeout(timer);
    }
    this.wsReplayTimers = [];
    this.wsRecording = false;
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

  // --- WebSocket session recording/replay ---

  private async handleWsSessionMessage(message: OutgoingMessage): Promise<void> {
    const data = 'data' in message ? (message as any).data : undefined;

    switch (message.type) {
      case 'wsStartRecording': {
        this.wsRecording = true;
        this.wsRecordedMessages = [];
        this.wsRecordingStartTime = Date.now();
        this.wsRecordingUrl = data?.url || '';
        this.wsRecordingProtocols = data?.protocols || [];
        console.log('[TauriMessageBus] WebSocket recording started');
        break;
      }
      case 'wsStopRecording': {
        this.wsRecording = false;
        const duration = Date.now() - this.wsRecordingStartTime;
        const session = {
          id: crypto.randomUUID().replace(/-/g, '').slice(0, 20),
          name: data?.name || `Session ${new Date().toLocaleString()}`,
          url: this.wsRecordingUrl,
          protocols: this.wsRecordingProtocols,
          messages: [...this.wsRecordedMessages],
          createdAt: new Date(this.wsRecordingStartTime).toISOString(),
          duration,
        };
        // Save to Rust backend
        invoke('ws_save_session', { data: session }).catch((error) => {
          console.error('[TauriMessageBus] Failed to save session:', error);
        });
        // Also emit locally so the UI gets the session immediately
        this.notifyListeners({
          type: 'wsSessionLoaded',
          data: session,
        } as any);
        this.wsRecordedMessages = [];
        console.log('[TauriMessageBus] WebSocket recording stopped, session saved');
        break;
      }
      case 'wsExportSession': {
        const sessionData = data?.session;
        if (!sessionData) break;
        try {
          const json = JSON.stringify(sessionData, null, 2);
          const defaultName = `${(sessionData.name || 'ws-session').replace(/[^a-zA-Z0-9]/g, '_')}.json`;
          const filePath = await save({
            defaultPath: defaultName,
            filters: [{ name: 'JSON Files', extensions: ['json'] }],
          });
          if (filePath) {
            await writeTextFile(filePath, json);
            this.notifyListeners({
              type: 'showNotification',
              data: { level: 'info', message: 'Session exported successfully.' },
            } as any);
          }
        } catch (error) {
          console.error('[TauriMessageBus] Session export failed:', error);
          this.notifyListeners({
            type: 'showNotification',
            data: { level: 'error', message: `Failed to export session: ${error}` },
          } as any);
        }
        break;
      }
      case 'wsLoadSession': {
        try {
          const filePath = await open({
            multiple: false,
            filters: [{ name: 'JSON Files', extensions: ['json'] }],
          });
          if (filePath) {
            const content = await readTextFile(filePath as string);
            const session = JSON.parse(content);
            this.notifyListeners({
              type: 'wsSessionLoaded',
              data: session,
            } as any);
          }
        } catch (error) {
          console.error('[TauriMessageBus] Session load failed:', error);
          this.notifyListeners({
            type: 'showNotification',
            data: { level: 'error', message: `Failed to load session: ${error}` },
          } as any);
        }
        break;
      }
      case 'wsStartReplay': {
        const session = data?.session;
        const speed = data?.speed || 1;
        if (!session?.messages?.length) break;

        this.wsReplayCancelled = false;
        this.wsReplayTimers = [];

        const messages = session.messages;
        const baseTime = messages[0].timestamp;

        for (let i = 0; i < messages.length; i++) {
          const msg = messages[i];
          // Only replay messages that were originally sent (direction === 'sent')
          if (msg.direction !== 'sent') continue;

          const delay = (msg.timestamp - baseTime) / speed;
          const timer = setTimeout(() => {
            if (this.wsReplayCancelled) return;

            // Send the message via the existing ws_send command
            invoke('ws_send', {
              data: {
                connectionId: data?.connectionId || 'default',
                message: msg.data,
                type: msg.type || 'text',
              },
            }).catch((error) => {
              console.error('[TauriMessageBus] Replay send failed:', error);
            });

            // Emit replay progress
            this.notifyListeners({
              type: 'wsReplayProgress',
              data: {
                current: i + 1,
                total: messages.length,
                messageId: msg.id,
              },
            } as any);
          }, delay);
          this.wsReplayTimers.push(timer);
        }
        break;
      }
      case 'wsCancelReplay': {
        this.wsReplayCancelled = true;
        for (const timer of this.wsReplayTimers) {
          clearTimeout(timer);
        }
        this.wsReplayTimers = [];
        console.log('[TauriMessageBus] WebSocket replay cancelled');
        break;
      }
    }
  }

  // --- Codegen operations ---

  private async handleCodegenMessage(message: OutgoingMessage): Promise<void> {
    const data = 'data' in message ? (message as any).data : undefined;

    if (message.type === 'openInNewTab' && data?.content) {
      try {
        await navigator.clipboard.writeText(data.content);
        this.notifyListeners({
          type: 'showNotification',
          data: { level: 'info', message: 'Code copied to clipboard.' },
        } as any);
      } catch (error) {
        console.error('[TauriMessageBus] Failed to copy code to clipboard:', error);
        this.notifyListeners({
          type: 'showNotification',
          data: { level: 'error', message: `Failed to copy code: ${error}` },
        } as any);
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
      } else if (message.type === 'openBinaryResponse') {
        // Write binary response to temp file and open with default app
        const base64Content = data?.content ?? '';
        const filename = data?.filename || 'response.bin';
        const tmpDir = await tempDir();
        const tmpPath = `${tmpDir}${filename}`;
        const binaryStr = atob(base64Content);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        await writeFile(tmpPath, bytes);
        await shellOpen(tmpPath);
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

  private async handleEnvironmentMessage(message: OutgoingMessage): Promise<void> {
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
      case 'exportEnvironment': {
        const env = envData.environments.find((e: any) => e.id === data.id);
        if (!env) break;
        const exportPayload = {
          name: env.name,
          variables: env.variables,
          ...(env.color ? { color: env.color } : {}),
          exportedAt: new Date().toISOString(),
          _type: 'nouto-environment',
        };
        const safeName = env.name.replace(/[^a-zA-Z0-9]/g, '_');
        const filePath = await save({
          defaultPath: safeName + '.env.json',
          filters: [{ name: 'JSON Files', extensions: ['json'] }],
        });
        if (filePath) {
          await writeTextFile(filePath, JSON.stringify(exportPayload, null, 2));
          this.notifyListeners({ type: 'showNotification', data: { level: 'info', message: `Environment "${env.name}" exported successfully.` } } as any);
        }
        break;
      }
      case 'exportAllEnvironments': {
        const exportPayload = {
          environments: envData.environments.map((env: any) => ({
            id: env.id,
            name: env.name,
            variables: env.variables,
            ...(env.color ? { color: env.color } : {}),
          })),
          exportedAt: new Date().toISOString(),
          _type: 'nouto-environments',
        };
        const filePath = await save({
          defaultPath: 'environments.json',
          filters: [{ name: 'JSON Files', extensions: ['json'] }],
        });
        if (filePath) {
          await writeTextFile(filePath, JSON.stringify(exportPayload, null, 2));
          this.notifyListeners({ type: 'showNotification', data: { level: 'info', message: 'All environments exported successfully.' } } as any);
        }
        break;
      }
      case 'exportGlobalVariables': {
        const exportPayload = {
          globalVariables: envData.globalVariables || [],
          exportedAt: new Date().toISOString(),
          _type: 'nouto-globals',
        };
        const filePath = await save({
          defaultPath: 'global-variables.json',
          filters: [{ name: 'JSON Files', extensions: ['json'] }],
        });
        if (filePath) {
          await writeTextFile(filePath, JSON.stringify(exportPayload, null, 2));
          this.notifyListeners({ type: 'showNotification', data: { level: 'info', message: 'Global variables exported successfully.' } } as any);
        }
        break;
      }
      case 'importGlobalVariables': {
        const selected = await open({
          multiple: false,
          filters: [{ name: 'JSON Files', extensions: ['json'] }],
        });
        if (!selected) break;
        try {
          const raw = await readTextFile(selected as string);
          let importData = JSON.parse(raw);
          // Support Postman environment/globals format
          if (!importData._type && Array.isArray(importData.values)) {
            importData = {
              _type: 'nouto-globals',
              globalVariables: importData.values.map((v: any) => ({
                key: v.key ?? '',
                value: v.value ?? '',
                enabled: v.enabled !== false,
              })),
            };
          }
          if (importData._type !== 'nouto-globals') {
            this.notifyListeners({ type: 'showNotification', data: { level: 'error', message: 'Unrecognized format. Supported: Nouto globals export, Postman environment/globals file.' } } as any);
            break;
          }
          const incoming: any[] = importData.globalVariables || [];
          // Merge: add new keys, skip existing
          const existingKeys = new Set((envData.globalVariables || []).map((v: any) => v.key));
          envData.globalVariables = envData.globalVariables || [];
          for (const v of incoming) {
            if (!existingKeys.has(v.key)) {
              envData.globalVariables.push({ key: v.key ?? '', value: v.value ?? '', enabled: v.enabled ?? true });
            }
          }
          this.saveEnvironmentData(envData);
          this.notifyListeners({ type: 'loadEnvironments', data: envData } as any);
          this.notifyListeners({ type: 'showNotification', data: { level: 'info', message: 'Global variables imported successfully.' } } as any);
        } catch (e) {
          this.notifyListeners({ type: 'showNotification', data: { level: 'error', message: `Failed to import global variables: ${e}` } } as any);
        }
        break;
      }
      case 'importEnvironments': {
        const selected = await open({
          multiple: false,
          filters: [{ name: 'JSON Files', extensions: ['json'] }],
        });
        if (!selected) break;
        try {
          const raw = await readTextFile(selected as string);
          const importData = JSON.parse(raw);
          const genId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 20);
          const existingNames = new Set(envData.environments.map((e: any) => e.name));

          if (importData._type === 'nouto-environment') {
            const name = existingNames.has(importData.name) ? `${importData.name} (imported)` : importData.name;
            envData.environments.push({
              id: genId(),
              name,
              variables: importData.variables || [],
              ...(importData.color ? { color: importData.color } : {}),
            });
          } else if (importData._type === 'nouto-environments') {
            for (const env of (importData.environments || [])) {
              const name = existingNames.has(env.name) ? `${env.name} (imported)` : env.name;
              existingNames.add(name);
              envData.environments.push({
                id: genId(),
                name,
                variables: env.variables || [],
                ...(env.color ? { color: env.color } : {}),
              });
            }
          } else if (Array.isArray(importData.values)) {
            // Postman environment/globals format
            const fileName = (selected as string).split(/[\\/]/).pop()?.replace('.json', '') || 'Imported';
            const envName = importData.name || fileName.replace('.postman_environment', '').replace('.postman_globals', '');
            const name = existingNames.has(envName) ? `${envName} (imported)` : envName;
            envData.environments.push({
              id: genId(),
              name,
              variables: (importData.values || []).map((v: any) => ({
                key: v.key ?? '',
                value: v.value ?? '',
                enabled: v.enabled !== false,
              })),
            });
          } else {
            this.notifyListeners({ type: 'showNotification', data: { level: 'error', message: 'Unrecognized format. Supported: Nouto environment export, Postman environment/globals file.' } } as any);
            break;
          }

          this.saveEnvironmentData(envData);
          this.notifyListeners({ type: 'loadEnvironments', data: envData } as any);
          this.notifyListeners({ type: 'showNotification', data: { level: 'info', message: 'Environments imported successfully.' } } as any);
        } catch (e) {
          this.notifyListeners({ type: 'showNotification', data: { level: 'error', message: `Failed to import environments: ${e}` } } as any);
        }
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
