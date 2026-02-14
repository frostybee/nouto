import type { IMessageBus } from '../bus';
import type { OutgoingMessage, IncomingMessage } from '../messages';

declare global {
  interface Window {
    vscode: {
      postMessage: (message: any) => void;
      getState: () => any;
      setState: (state: any) => void;
    };
  }
}

/**
 * VS Code webview message bus adapter.
 * Uses window.vscode.postMessage for outgoing and window 'message' events for incoming.
 */
export class VSCodeMessageBus implements IMessageBus {
  send(message: OutgoingMessage): void {
    window.vscode?.postMessage(message);
  }

  onMessage(callback: (message: IncomingMessage) => void): () => void {
    const handler = (event: MessageEvent) => {
      callback(event.data);
    };
    window.addEventListener('message', handler);
    return () => {
      window.removeEventListener('message', handler);
    };
  }

  getState<T>(): T | undefined {
    return window.vscode?.getState();
  }

  setState<T>(state: T): void {
    window.vscode?.setState(state);
  }
}
