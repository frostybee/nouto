import type { WebSocketConfig, WebSocketMessage, WebSocketMessageType, WebSocketConnectionStatus } from '../types';
import { generateId } from '../types';
import WebSocket = require('ws');

export class WebSocketService {
  private ws: WebSocket | null = null;
  private status: WebSocketConnectionStatus = 'disconnected';
  private config: WebSocketConfig | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private messageCounter = 0;
  private intentionalDisconnect = false;

  onMessage?: (msg: WebSocketMessage) => void;
  onStatusChange?: (status: WebSocketConnectionStatus, error?: string) => void;

  connect(config: WebSocketConfig): void {
    this.config = config;
    this.disconnect();
    this.intentionalDisconnect = false;
    this.setStatus('connecting');

    try {
      const headers: Record<string, string> = {
        'User-Agent': 'Nouto',
      };
      for (const h of config.headers || []) {
        if (h.enabled && h.key) {
          headers[h.key] = h.value;
        }
      }

      this.ws = new WebSocket(config.url, config.protocols || [], { headers });

      this.ws.on('open', () => {
        this.setStatus('connected');
      });

      this.ws.on('message', (data: Buffer | string, isBinary: boolean) => {
        const msgStr = isBinary ? (data as Buffer).toString('base64') : data.toString();
        const size = typeof data === 'string' ? Buffer.byteLength(data) : (data as Buffer).length;
        const msg: WebSocketMessage = {
          id: this.generateId(),
          direction: 'received',
          type: isBinary ? 'binary' : 'text',
          data: msgStr,
          size,
          timestamp: Date.now(),
        };
        this.onMessage?.(msg);
      });

      this.ws.on('close', () => {
        this.setStatus('disconnected');
        if (config.autoReconnect && !this.intentionalDisconnect) {
          this.scheduleReconnect();
        }
      });

      this.ws.on('error', (err: Error) => {
        this.setStatus('error', err.message);
        this.intentionalDisconnect = true;
        this.ws?.close();
      });
    } catch (err: any) {
      this.setStatus('error', err?.message || 'Connection failed');
    }
  }

  send(message: string, type: WebSocketMessageType = 'text'): void {
    if (!this.ws || this.status !== 'connected') return;

    const data = type === 'binary' ? Buffer.from(message, 'base64') : message;
    this.ws.send(data);

    const size = typeof data === 'string' ? Buffer.byteLength(data) : data.length;
    const msg: WebSocketMessage = {
      id: this.generateId(),
      direction: 'sent',
      type,
      data: message,
      size,
      timestamp: Date.now(),
    };
    this.onMessage?.(msg);
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.intentionalDisconnect = true;
      this.ws.removeAllListeners();
      try {
        this.ws.terminate();
      } catch {
        // terminate() throws if the socket is still in CONNECTING state
        try { this.ws.close(); } catch { /* ignore */ }
      }
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  getStatus(): WebSocketConnectionStatus {
    return this.status;
  }

  private setStatus(status: WebSocketConnectionStatus, error?: string) {
    this.status = status;
    this.onStatusChange?.(status, error);
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const interval = this.config?.reconnectIntervalMs || 3000;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.config && this.config.autoReconnect) {
        this.connect(this.config);
      }
    }, interval);
  }

  private generateId(): string {
    return `ws-${++this.messageCounter}-${generateId()}`;
  }
}
