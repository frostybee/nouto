// TauriMessageBus - implements IMessageBus for Tauri desktop app
// Bridges Svelte UI to Rust backend using Tauri's invoke/listen APIs

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
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
  'saveCollections',
  'getCollections',
]);

// Message types that have corresponding Rust commands (all others are ignored)
const RUST_COMMAND_TYPES = new Set([
  'ready',
  'loadData',
  'sendRequest',
  'cancelRequest',
  'pickSslFile',
  'grpcReflect',
  'grpcLoadProto',
  'grpcInvoke',
  'pickProtoFile',
  'pickProtoImportDir',
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
      'downloadProgress',
      'grpcProtoLoaded',
      'grpcProtoError',
      'protoFilesPicked',
      'protoImportDirsPicked',
      'grpcConnectionStart',
      'grpcEvent',
      'grpcConnectionEnd',
      'error',
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
  private static readonly SETTINGS_KEY = 'nouto_settings';

  private loadStoredSettings(): Record<string, any> | undefined {
    try {
      const raw = localStorage.getItem(TauriMessageBus.SETTINGS_KEY);
      return raw ? JSON.parse(raw) : undefined;
    } catch {
      return undefined;
    }
  }

  private emitStoredSettings(): void {
    const settings = this.loadStoredSettings();
    if (settings) {
      this.notifyListeners({ type: 'loadSettings', data: settings } as any);
    }
  }

  /**
   * Send a message from UI to Rust backend
   */
  send(message: OutgoingMessage): void {
    // Handle settings locally - no Rust command needed
    if (message.type === 'updateSettings') {
      const data = (message as any).data;
      try {
        localStorage.setItem(TauriMessageBus.SETTINGS_KEY, JSON.stringify(data));
      } catch (error) {
        console.error('[TauriMessageBus] Failed to save settings:', error);
      }
      this.notifyListeners({ type: 'loadSettings', data } as any);
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

    // Emit stored settings after the UI signals ready
    if (message.type === 'ready') {
      setTimeout(() => this.emitStoredSettings(), 0);
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
