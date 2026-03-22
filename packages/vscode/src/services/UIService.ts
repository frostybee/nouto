import * as vscode from 'vscode';
import type { IncomingMessage } from '@nouto/transport';

export interface QuickPickItem {
  label: string;
  value: string;
  description?: string;
  kind?: 'separator';
  icon?: string;
  accent?: boolean;
}

type ResponseHandler = (message: any) => void;

let requestCounter = 0;
function generateRequestId(): string {
  return `ui-req-${Date.now()}-${++requestCounter}`;
}

/**
 * UIService sends UI interaction messages to the webview and awaits responses.
 * This replaces direct vscode.window.show* calls, enabling the same backend
 * logic to work with both VS Code and Tauri desktop app.
 */
export class UIService {
  private responseHandlers = new Map<string, ResponseHandler>();

  constructor(
    private postMessage: (msg: IncomingMessage) => void,
  ) {}

  /**
   * Call this from the webview message handler to route response messages.
   * Returns true if the message was handled as a UI response.
   */
  handleResponseMessage(message: any): boolean {
    if (message.type === 'inputBoxResult' || message.type === 'quickPickResult' || message.type === 'confirmResult' || message.type === 'createItemDialogResult') {
      const requestId = message.data?.requestId;
      const handler = this.responseHandlers.get(requestId);
      if (handler) {
        handler(message);
        this.responseHandlers.delete(requestId);
      }
      return true;
    }
    return false;
  }

  /** Send a notification to the webview (no response expected). */
  showNotification(level: 'info' | 'warning' | 'error', message: string): void {
    this.postMessage({ type: 'showNotification', data: { level, message } } as IncomingMessage);
  }

  showInfo(message: string): void {
    this.showNotification('info', message);
  }

  showWarning(message: string): void {
    this.showNotification('warning', message);
  }

  showError(message: string): void {
    this.showNotification('error', message);
  }

  /** Show an input box in the webview and await the user's response. */
  async showInputBox(opts: {
    prompt: string;
    placeholder?: string;
    value?: string;
    validateNotEmpty?: boolean;
  }): Promise<string | null> {
    const requestId = generateRequestId();
    this.postMessage({
      type: 'showInputBox',
      data: { requestId, ...opts },
    } as IncomingMessage);
    return this.waitForResponse<string | null>('inputBoxResult', requestId);
  }

  /** Show a quick pick selection in the webview and await the user's choice. */
  async showQuickPick(opts: {
    title: string;
    items: QuickPickItem[];
    canPickMany?: boolean;
  }): Promise<string | string[] | null> {
    const requestId = generateRequestId();
    this.postMessage({
      type: 'showQuickPick',
      data: { requestId, ...opts },
    } as IncomingMessage);
    return this.waitForResponse<string | string[] | null>('quickPickResult', requestId);
  }

  /** Show a confirmation dialog in the webview and await the user's decision. */
  async confirm(
    message: string,
    confirmLabel?: string,
    variant?: 'danger' | 'warning' | 'info',
  ): Promise<boolean> {
    const requestId = generateRequestId();
    this.postMessage({
      type: 'showConfirm',
      data: { requestId, message, confirmLabel, variant },
    } as IncomingMessage);
    return this.waitForResponse<boolean>('confirmResult', requestId);
  }

  /** Show the create item dialog (collection/folder) and await the result. */
  async showCreateItemDialog(mode: 'collection' | 'folder'): Promise<{ name: string; color?: string; icon?: string } | null> {
    const requestId = generateRequestId();
    this.postMessage({
      type: 'showCreateItemDialog',
      data: { requestId, mode },
    } as IncomingMessage);
    return this.waitForResponse<{ name: string; color?: string; icon?: string } | null>('createItemDialogResult', requestId);
  }

  private waitForResponse<T>(_type: string, requestId: string, timeoutMs = 120000): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.responseHandlers.delete(requestId);
        resolve(null as T); // Treat timeout as cancellation
      }, timeoutMs);

      this.responseHandlers.set(requestId, (msg) => {
        clearTimeout(timer);
        if (type === 'confirmResult') {
          resolve(msg.data.confirmed as T);
        } else {
          resolve(msg.data.value as T);
        }
      });
    });
  }

  /** Clean up any pending response handlers. */
  dispose(): void {
    this.responseHandlers.clear();
  }
}
