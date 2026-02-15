// TauriMessageBus - implements IMessageBus for Tauri desktop app
// Bridges Svelte UI to Rust backend using Tauri's invoke/listen APIs

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { IMessageBus } from '@hivefetch/transport';
import type { OutgoingMessage, IncomingMessage } from '@hivefetch/transport';

export class TauriMessageBus implements IMessageBus {
  private listeners: Array<(message: IncomingMessage) => void> = [];
  private unlistenFunctions: UnlistenFn[] = [];

  constructor() {
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
      'error',
    ];

    for (const eventType of eventTypes) {
      const unlisten = await listen<any>(eventType, (event) => {
        console.log(`[TauriMessageBus] Received event: "${eventType}"`, event.payload);
        const message: IncomingMessage = {
          type: eventType as any,
          ...event.payload,
        };
        this.notifyListeners(message);
      });
      this.unlistenFunctions.push(unlisten);
    }
  }

  /**
   * Send a message from UI to Rust backend
   */
  send(message: OutgoingMessage): void {
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
      const state = localStorage.getItem('hivefetch_state');
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
      localStorage.setItem('hivefetch_state', JSON.stringify(state));
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
}

// Singleton instance
let messageBus: TauriMessageBus | null = null;

export function getMessageBus(): TauriMessageBus {
  if (!messageBus) {
    messageBus = new TauriMessageBus();
  }
  return messageBus;
}
