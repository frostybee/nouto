import type { OutgoingMessage, IncomingMessage } from './messages';

/**
 * Platform-agnostic message bus interface.
 * Each platform (VS Code, Tauri, Electron) implements this interface
 * to handle communication between the UI and the backend.
 */
export interface IMessageBus {
  /** Send a message from the UI to the backend */
  send(message: OutgoingMessage): void;

  /** Subscribe to messages from the backend. Returns an unsubscribe function. */
  onMessage(callback: (message: IncomingMessage) => void): () => void;

  /** Get persisted webview state */
  getState<T>(): T | undefined;

  /** Persist webview state */
  setState<T>(state: T): void;
}
