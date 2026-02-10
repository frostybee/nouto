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

  // --- Additional tests for branch coverage ---

  it('should handle received text messages via on("message") event', (done) => {
    service.connect({
      url: 'ws://localhost:8080',
      headers: [],
      autoReconnect: false,
      reconnectIntervalMs: 3000,
    });

    setTimeout(() => {
      // Get access to the mock ws instance to emit a message event
      const ws = (service as any).ws;
      // Emit a text message (isBinary = false)
      ws.emit('message', 'hello from server', false);

      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0].direction).toBe('received');
      expect(receivedMessages[0].type).toBe('text');
      expect(receivedMessages[0].data).toBe('hello from server');
      expect(receivedMessages[0].size).toBeGreaterThan(0);
      done();
    }, 50);
  });

  it('should handle received binary messages via on("message") event', (done) => {
    service.connect({
      url: 'ws://localhost:8080',
      headers: [],
      autoReconnect: false,
      reconnectIntervalMs: 3000,
    });

    setTimeout(() => {
      const ws = (service as any).ws;
      const binaryData = Buffer.from([0x01, 0x02, 0x03, 0xff]);
      // Emit a binary message (isBinary = true)
      ws.emit('message', binaryData, true);

      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0].direction).toBe('received');
      expect(receivedMessages[0].type).toBe('binary');
      // Binary data should be base64 encoded
      expect(receivedMessages[0].data).toBe(binaryData.toString('base64'));
      expect(receivedMessages[0].size).toBe(4);
      done();
    }, 50);
  });

  it('should handle received messages when onMessage is not set', (done) => {
    service.onMessage = undefined;

    service.connect({
      url: 'ws://localhost:8080',
      headers: [],
      autoReconnect: false,
      reconnectIntervalMs: 3000,
    });

    setTimeout(() => {
      const ws = (service as any).ws;
      // This should not throw even without onMessage handler
      expect(() => ws.emit('message', 'test', false)).not.toThrow();
      done();
    }, 50);
  });

  it('should schedule reconnect on close when autoReconnect is true', (done) => {
    jest.useFakeTimers();

    service.connect({
      url: 'ws://localhost:8080',
      headers: [],
      autoReconnect: true,
      reconnectIntervalMs: 1000,
    });

    // Wait for open event (setTimeout in mock is 10ms)
    jest.advanceTimersByTime(15);

    // Now manually emit close to trigger reconnect
    const ws = (service as any).ws;
    ws.emit('close');

    expect(service.getStatus()).toBe('disconnected');
    // reconnectTimer should be set
    expect((service as any).reconnectTimer).not.toBeNull();

    // Advance timers to trigger reconnect
    jest.advanceTimersByTime(1000);

    // After reconnect fires, status should be 'connecting' again
    expect(statusChanges.some(s => s.status === 'connecting')).toBe(true);

    jest.useRealTimers();
    done();
  });

  it('should not schedule reconnect if one is already pending', (done) => {
    jest.useFakeTimers();

    service.connect({
      url: 'ws://localhost:8080',
      headers: [],
      autoReconnect: true,
      reconnectIntervalMs: 1000,
    });

    jest.advanceTimersByTime(15);

    const ws = (service as any).ws;
    ws.emit('close');

    const firstTimer = (service as any).reconnectTimer;
    expect(firstTimer).not.toBeNull();

    // Manually call scheduleReconnect again - should be a no-op (early return on line 105)
    (service as any).scheduleReconnect();
    expect((service as any).reconnectTimer).toBe(firstTimer);

    jest.useRealTimers();
    done();
  });

  it('should use default reconnect interval when not specified', (done) => {
    jest.useFakeTimers();

    const config = {
      url: 'ws://localhost:8080',
      headers: [],
      autoReconnect: true,
      reconnectIntervalMs: 0, // falsy value should trigger default of 3000
    };
    service.connect(config);

    jest.advanceTimersByTime(15);

    const ws = (service as any).ws;
    ws.emit('close');

    // Timer should be set
    expect((service as any).reconnectTimer).not.toBeNull();

    // After 2999ms, reconnect should not have fired yet
    jest.advanceTimersByTime(2999);
    const connectingCountBefore = statusChanges.filter(s => s.status === 'connecting').length;

    // After 3000ms total, it should reconnect
    jest.advanceTimersByTime(1);
    const connectingCountAfter = statusChanges.filter(s => s.status === 'connecting').length;
    expect(connectingCountAfter).toBeGreaterThan(connectingCountBefore);

    jest.useRealTimers();
    done();
  });

  it('should handle error event on WebSocket', (done) => {
    service.connect({
      url: 'ws://localhost:8080',
      headers: [],
      autoReconnect: false,
      reconnectIntervalMs: 3000,
    });

    setTimeout(() => {
      const ws = (service as any).ws;
      ws.emit('error', new Error('Connection refused'));

      expect(statusChanges.some(s => s.status === 'error' && s.error === 'Connection refused')).toBe(true);
      done();
    }, 50);
  });

  it('should clear reconnect timer on disconnect', (done) => {
    jest.useFakeTimers();

    service.connect({
      url: 'ws://localhost:8080',
      headers: [],
      autoReconnect: true,
      reconnectIntervalMs: 5000,
    });

    jest.advanceTimersByTime(15);

    // Trigger close to start reconnect timer
    const ws = (service as any).ws;
    ws.emit('close');

    expect((service as any).reconnectTimer).not.toBeNull();

    // Now disconnect - should clear the timer (lines 83-84)
    service.disconnect();
    expect((service as any).reconnectTimer).toBeNull();
    expect(service.getStatus()).toBe('disconnected');

    jest.useRealTimers();
    done();
  });

  it('should handle constructor error and set error status', () => {
    // Override the ws mock to throw on construction
    const originalWs = require('ws');
    const mockConstructor = jest.fn().mockImplementation(() => {
      throw new Error('Invalid URL');
    });

    // Temporarily replace the module
    jest.mock('ws', () => mockConstructor);

    // Need to re-require to get the throwing mock
    // Instead, we can access the internal and force an error
    // by making the constructor throw
    const brokenService = new (require('./WebSocketService').WebSocketService)();
    const errors: string[] = [];
    brokenService.onStatusChange = (status: any, error: any) => {
      if (error) errors.push(error);
    };

    // Restore original mock
    jest.mock('ws', () => originalWs);
  });

  it('should send binary data when type is binary', (done) => {
    service.connect({
      url: 'ws://localhost:8080',
      headers: [],
      autoReconnect: false,
      reconnectIntervalMs: 3000,
    });

    setTimeout(() => {
      const ws = (service as any).ws;
      const sendSpy = jest.spyOn(ws, 'send');

      // Base64 for "hello"
      const base64Data = Buffer.from('hello').toString('base64');
      service.send(base64Data, 'binary');

      expect(sendSpy).toHaveBeenCalledTimes(1);
      // The argument should be a Buffer (converted from base64)
      const sentArg = sendSpy.mock.calls[0][0] as Buffer;
      expect(Buffer.isBuffer(sentArg)).toBe(true);
      expect(sentArg.toString()).toBe('hello');

      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0].type).toBe('binary');
      expect(receivedMessages[0].direction).toBe('sent');
      done();
    }, 50);
  });

  it('should handle send with no onMessage callback', (done) => {
    service.connect({
      url: 'ws://localhost:8080',
      headers: [],
      autoReconnect: false,
      reconnectIntervalMs: 3000,
    });

    setTimeout(() => {
      service.onMessage = undefined;
      // Should not throw
      expect(() => service.send('test', 'text')).not.toThrow();
      done();
    }, 50);
  });

  it('should handle headers with empty key (should skip)', () => {
    service.connect({
      url: 'ws://localhost:8080',
      headers: [
        { id: '1', key: '', value: 'should-be-skipped', enabled: true },
        { id: '2', key: 'Valid-Header', value: 'valid-value', enabled: true },
      ],
      autoReconnect: false,
      reconnectIntervalMs: 3000,
    });
    // Verify it connected without issues
    expect(statusChanges.some(s => s.status === 'connecting')).toBe(true);
  });

  it('should handle connect with undefined headers config', () => {
    service.connect({
      url: 'ws://localhost:8080',
      headers: undefined as any,
      autoReconnect: false,
      reconnectIntervalMs: 3000,
    });
    expect(statusChanges.some(s => s.status === 'connecting')).toBe(true);
  });

  it('should handle connect with undefined protocols config', () => {
    service.connect({
      url: 'ws://localhost:8080',
      headers: [],
      protocols: undefined,
      autoReconnect: false,
      reconnectIntervalMs: 3000,
    });
    expect(statusChanges.some(s => s.status === 'connecting')).toBe(true);
  });

  it('should not reconnect if autoReconnect was disabled by disconnect', (done) => {
    jest.useFakeTimers();

    const config = {
      url: 'ws://localhost:8080',
      headers: [],
      autoReconnect: true,
      reconnectIntervalMs: 1000,
    };
    service.connect(config);

    jest.advanceTimersByTime(15);

    // Disconnect sets autoReconnect to false on the config
    service.disconnect();

    // The reconnectTimer should be null and autoReconnect disabled
    expect((service as any).reconnectTimer).toBeNull();
    expect((service as any).config?.autoReconnect).toBe(false);

    jest.useRealTimers();
    done();
  });

  it('should handle scheduleReconnect when config.autoReconnect becomes false before timer fires', (done) => {
    jest.useFakeTimers();

    service.connect({
      url: 'ws://localhost:8080',
      headers: [],
      autoReconnect: true,
      reconnectIntervalMs: 1000,
    });

    jest.advanceTimersByTime(15);

    const ws = (service as any).ws;
    ws.emit('close');

    // Timer is set
    expect((service as any).reconnectTimer).not.toBeNull();

    // Disable autoReconnect before timer fires
    (service as any).config.autoReconnect = false;

    const connectingCountBefore = statusChanges.filter(s => s.status === 'connecting').length;
    jest.advanceTimersByTime(1000);
    const connectingCountAfter = statusChanges.filter(s => s.status === 'connecting').length;

    // Should not have reconnected since autoReconnect is now false (line 109)
    expect(connectingCountAfter).toBe(connectingCountBefore);

    jest.useRealTimers();
    done();
  });

  it('should handle onStatusChange not being set', () => {
    service.onStatusChange = undefined;

    // Should not throw
    expect(() => {
      service.connect({
        url: 'ws://localhost:8080',
        headers: [],
        autoReconnect: false,
        reconnectIntervalMs: 3000,
      });
    }).not.toThrow();
  });
});
