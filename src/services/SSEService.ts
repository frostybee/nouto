import * as http from 'http';
import * as https from 'https';
import type { SSEConfig, SSEEvent, SSEConnectionStatus, KeyValue } from './types';

export class SSEService {
  private request: http.ClientRequest | null = null;
  private status: SSEConnectionStatus = 'disconnected';
  private config: SSEConfig | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastEventId: string | undefined;
  private eventCounter = 0;
  private buffer = '';

  onEvent?: (event: SSEEvent) => void;
  onStatusChange?: (status: SSEConnectionStatus, error?: string) => void;

  connect(config: SSEConfig): void {
    this.config = config;
    this.disconnect();
    this.setStatus('connecting');

    try {
      const url = new URL(config.url);
      const isHttps = url.protocol === 'https:';
      const lib = isHttps ? https : http;

      const headers: Record<string, string> = {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
      };

      if (this.lastEventId) {
        headers['Last-Event-ID'] = this.lastEventId;
      }

      for (const h of config.headers || []) {
        if (h.enabled && h.key) {
          headers[h.key] = h.value;
        }
      }

      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'GET',
        headers,
      };

      this.request = lib.request(options, (res) => {
        if (res.statusCode !== 200) {
          this.setStatus('error', `HTTP ${res.statusCode} ${res.statusMessage}`);
          return;
        }

        this.setStatus('connected');
        this.buffer = '';

        res.setEncoding('utf8');

        res.on('data', (chunk: string) => {
          this.buffer += chunk;
          this.processBuffer();
        });

        res.on('end', () => {
          this.setStatus('disconnected');
          if (config.autoReconnect) {
            this.scheduleReconnect();
          }
        });
      });

      this.request.on('error', (err: Error) => {
        this.setStatus('error', err.message);
        if (config.autoReconnect) {
          this.scheduleReconnect();
        }
      });

      this.request.end();
    } catch (err: any) {
      this.setStatus('error', err?.message || 'Connection failed');
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.request) {
      this.request.destroy();
      this.request = null;
    }
    this.buffer = '';
    this.setStatus('disconnected');
  }

  getStatus(): SSEConnectionStatus {
    return this.status;
  }

  private processBuffer(): void {
    // SSE events are separated by double newlines
    const parts = this.buffer.split('\n\n');
    // Keep the last incomplete part in the buffer
    this.buffer = parts.pop() || '';

    for (const block of parts) {
      if (!block.trim()) continue;
      this.parseEvent(block);
    }
  }

  private parseEvent(block: string): void {
    let eventType = 'message';
    let eventId: string | undefined;
    const dataLines: string[] = [];

    const lines = block.split('\n');
    for (const line of lines) {
      if (line.startsWith(':')) continue; // comment

      const colonIndex = line.indexOf(':');
      let field: string;
      let value: string;

      if (colonIndex === -1) {
        field = line;
        value = '';
      } else {
        field = line.substring(0, colonIndex);
        value = line.substring(colonIndex + 1);
        if (value.startsWith(' ')) {
          value = value.substring(1);
        }
      }

      switch (field) {
        case 'event':
          eventType = value;
          break;
        case 'data':
          dataLines.push(value);
          break;
        case 'id':
          eventId = value;
          this.lastEventId = value;
          break;
        case 'retry':
          // Could update reconnect interval, but we keep it simple
          break;
      }
    }

    if (dataLines.length === 0) return;

    const event: SSEEvent = {
      id: `sse-${Date.now()}-${++this.eventCounter}`,
      eventId,
      eventType,
      data: dataLines.join('\n'),
      timestamp: Date.now(),
    };

    this.onEvent?.(event);
  }

  private setStatus(status: SSEConnectionStatus, error?: string) {
    this.status = status;
    this.onStatusChange?.(status, error);
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.config && this.config.autoReconnect) {
        this.connect(this.config);
      }
    }, 3000);
  }
}
