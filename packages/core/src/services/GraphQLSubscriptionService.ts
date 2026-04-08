import type { GqlSubConfig, GqlSubStatus, GqlSubEvent, KeyValue } from '../types';
import { generateId } from '../types';
import WebSocket = require('ws');

// graphql-ws protocol message types (https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md)
const MSG_CONNECTION_INIT = 'connection_init';
const MSG_CONNECTION_ACK = 'connection_ack';
const MSG_SUBSCRIBE = 'subscribe';
const MSG_NEXT = 'next';
const MSG_ERROR = 'error';
const MSG_COMPLETE = 'complete';
const MSG_PING = 'ping';
const MSG_PONG = 'pong';

const GRAPHQL_WS_PROTOCOL = 'graphql-transport-ws';
const ACK_TIMEOUT_MS = 10_000;

export class GraphQLSubscriptionService {
  private ws: WebSocket | null = null;
  private status: GqlSubStatus = 'disconnected';
  private subscriptionId = '1';
  private eventCounter = 0;
  private ackTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;

  onStatusChange?: (status: GqlSubStatus, error?: string) => void;
  onEvent?: (event: GqlSubEvent) => void;

  subscribe(config: GqlSubConfig): void {
    this.disconnect();
    this.intentionalClose = false;
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

      this.ws = new WebSocket(config.url, [GRAPHQL_WS_PROTOCOL], { headers });

      this.ws.on('open', () => {
        this.setStatus('connected');
        this.sendMessage(MSG_CONNECTION_INIT, config.connectionParams || {});

        // Timeout if server doesn't ack
        this.ackTimer = setTimeout(() => {
          this.setStatus('error', 'Server did not acknowledge connection within timeout');
          this.ws?.close();
        }, ACK_TIMEOUT_MS);
      });

      this.ws.on('message', (raw: Buffer | string) => {
        let msg: any;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return;
        }

        switch (msg.type) {
          case MSG_CONNECTION_ACK:
            this.clearAckTimer();
            this.sendSubscribe(config);
            break;

          case MSG_NEXT:
            if (msg.id === this.subscriptionId && msg.payload) {
              this.emitEvent('data', JSON.stringify(msg.payload));
            }
            break;

          case MSG_ERROR:
            if (msg.id === this.subscriptionId && msg.payload) {
              const errors = Array.isArray(msg.payload) ? msg.payload : [msg.payload];
              this.emitEvent('error', JSON.stringify(errors));
            }
            break;

          case MSG_COMPLETE:
            if (msg.id === this.subscriptionId) {
              this.emitEvent('complete', '');
              this.setStatus('connected');
            }
            break;

          case MSG_PING:
            this.sendMessage(MSG_PONG);
            break;
        }
      });

      this.ws.on('close', () => {
        this.clearAckTimer();
        if (!this.intentionalClose) {
          this.setStatus('disconnected');
        }
      });

      this.ws.on('error', (err: Error) => {
        this.clearAckTimer();
        this.setStatus('error', err.message);
        this.ws?.close();
      });
    } catch (err: any) {
      this.setStatus('error', err?.message || 'Connection failed');
    }
  }

  unsubscribe(): void {
    if (this.ws && (this.status === 'subscribed' || this.status === 'connected')) {
      this.sendMessage(MSG_COMPLETE, undefined, this.subscriptionId);
    }
    this.disconnect();
  }

  disconnect(): void {
    this.clearAckTimer();
    if (this.ws) {
      this.intentionalClose = true;
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  getStatus(): GqlSubStatus {
    return this.status;
  }

  private sendSubscribe(config: GqlSubConfig): void {
    const payload: Record<string, any> = { query: config.query };
    if (config.variables) {
      try {
        payload.variables = JSON.parse(config.variables);
      } catch {
        // Invalid variables JSON, send as-is
      }
    }
    if (config.operationName) {
      payload.operationName = config.operationName;
    }
    this.sendMessage(MSG_SUBSCRIBE, payload, this.subscriptionId);
    this.setStatus('subscribed');
  }

  private sendMessage(type: string, payload?: any, id?: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg: Record<string, any> = { type };
    if (id) msg.id = id;
    if (payload !== undefined) msg.payload = payload;
    this.ws.send(JSON.stringify(msg));
  }

  private emitEvent(type: GqlSubEvent['type'], data: string): void {
    this.onEvent?.({
      id: `gql-${++this.eventCounter}-${generateId()}`,
      type,
      data,
      timestamp: Date.now(),
    });
  }

  private setStatus(status: GqlSubStatus, error?: string): void {
    this.status = status;
    this.onStatusChange?.(status, error);
  }

  private clearAckTimer(): void {
    if (this.ackTimer) {
      clearTimeout(this.ackTimer);
      this.ackTimer = null;
    }
  }
}
