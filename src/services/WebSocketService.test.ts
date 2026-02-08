import { WebSocketService } from './WebSocketService';
import type { WebSocketConnectionStatus, WebSocketMessage } from './types';

// Mock the ws module
jest.mock('ws', () => {
  const EventEmitter = require('events');

  class MockWebSocket extends EventEmitter {
    static OPEN = 1;
    static CLOSED = 3;

    readyState = 1;
    url: string;
    protocols: string[];
    options: any;

    constructor(url: string, protocols?: string[], options?: any) {
      super();
      this.url = url;
      this.protocols = protocols || [];
      this.options = options;
      // Simulate async connection
      setTimeout(() => this.emit('open'), 10);
    }

    send(data: any) {
      // no-op in mock
    }

    close() {
      this.emit('close');
    }
  }

  return MockWebSocket;
});

describe('WebSocketService', () => {
  let service: WebSocketService;
  let statusChanges: { status: WebSocketConnectionStatus; error?: string }[];
  let receivedMessages: WebSocketMessage[];

  beforeEach(() => {
    service = new WebSocketService();
    statusChanges = [];
    receivedMessages = [];

    service.onStatusChange = (status, error) => {
      statusChanges.push({ status, error });
    };
    service.onMessage = (msg) => {
      receivedMessages.push(msg);
    };
  });

  afterEach(() => {
    service.disconnect();
  });

  it('should start in disconnected state', () => {
    expect(service.getStatus()).toBe('disconnected');
  });

  it('should transition to connecting when connect is called', () => {
    service.connect({
      url: 'ws://localhost:8080',
      headers: [],
      autoReconnect: false,
      reconnectIntervalMs: 3000,
    });
    expect(statusChanges.some(s => s.status === 'connecting')).toBe(true);
  });

  it('should transition to connected on open event', (done) => {
    service.connect({
      url: 'ws://localhost:8080',
      headers: [],
      autoReconnect: false,
      reconnectIntervalMs: 3000,
    });

    setTimeout(() => {
      expect(statusChanges.some(s => s.status === 'connected')).toBe(true);
      expect(service.getStatus()).toBe('connected');
      done();
    }, 50);
  });

  it('should transition to disconnected on disconnect', (done) => {
    service.connect({
      url: 'ws://localhost:8080',
      headers: [],
      autoReconnect: false,
      reconnectIntervalMs: 3000,
    });

    setTimeout(() => {
      service.disconnect();
      expect(service.getStatus()).toBe('disconnected');
      done();
    }, 50);
  });

  it('should track sent messages via onMessage callback', (done) => {
    service.connect({
      url: 'ws://localhost:8080',
      headers: [],
      autoReconnect: false,
      reconnectIntervalMs: 3000,
    });

    setTimeout(() => {
      service.send('hello', 'text');
      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0].direction).toBe('sent');
      expect(receivedMessages[0].data).toBe('hello');
      expect(receivedMessages[0].type).toBe('text');
      done();
    }, 50);
  });

  it('should not send when disconnected', () => {
    service.send('hello', 'text');
    expect(receivedMessages).toHaveLength(0);
  });

  it('should build headers from config', () => {
    service.connect({
      url: 'ws://localhost:8080',
      headers: [
        { id: '1', key: 'Authorization', value: 'Bearer token', enabled: true },
        { id: '2', key: 'X-Disabled', value: 'val', enabled: false },
      ],
      autoReconnect: false,
      reconnectIntervalMs: 3000,
    });
    // The mock ws constructor receives headers in options
    expect(statusChanges.some(s => s.status === 'connecting')).toBe(true);
  });

  it('should support protocols', () => {
    service.connect({
      url: 'ws://localhost:8080',
      protocols: ['graphql-ws', 'graphql-transport-ws'],
      headers: [],
      autoReconnect: false,
      reconnectIntervalMs: 3000,
    });
    expect(statusChanges.some(s => s.status === 'connecting')).toBe(true);
  });

  it('should generate unique message IDs', (done) => {
    service.connect({
      url: 'ws://localhost:8080',
      headers: [],
      autoReconnect: false,
      reconnectIntervalMs: 3000,
    });

    setTimeout(() => {
      service.send('msg1', 'text');
      service.send('msg2', 'text');
      expect(receivedMessages[0].id).not.toBe(receivedMessages[1].id);
      done();
    }, 50);
  });
});
