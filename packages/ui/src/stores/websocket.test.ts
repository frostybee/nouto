import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  wsStatus,
  wsMessages,
  wsError,
  wsMessageCount,
  setWsStatus,
  addWsMessage,
  clearWsMessages
} from './websocket.svelte';
import type { WebSocketMessage } from '../types';

function makeMessage(overrides: Partial<WebSocketMessage> = {}): WebSocketMessage {
  return {
    id: crypto.randomUUID?.() ?? Math.random().toString(36),
    direction: 'received',
    data: '{"test":true}',
    timestamp: Date.now(),
    type: 'text',
    ...overrides
  } as WebSocketMessage;
}

/** Messages are batched (100ms flush timer) — advance past it before asserting. */
function flushMessages() {
  vi.advanceTimersByTime(100);
}

describe('websocket store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setWsStatus('disconnected');
    clearWsMessages();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('should have disconnected status', () => {
      expect(wsStatus()).toBe('disconnected');
    });

    it('should have empty messages', () => {
      expect(wsMessages()).toEqual([]);
    });

    it('should have null error', () => {
      expect(wsError()).toBeNull();
    });

    it('should have zero message count', () => {
      expect(wsMessageCount()).toBe(0);
    });
  });

  describe('setWsStatus', () => {
    it('should update status to connecting', () => {
      setWsStatus('connecting');
      expect(wsStatus()).toBe('connecting');
    });

    it('should update status to connected', () => {
      setWsStatus('connected');
      expect(wsStatus()).toBe('connected');
    });

    it('should set error message when provided', () => {
      setWsStatus('disconnected', 'Connection lost');
      expect(wsStatus()).toBe('disconnected');
      expect(wsError()).toBe('Connection lost');
    });

    it('should clear error when status is connected', () => {
      setWsStatus('disconnected', 'Some error');
      expect(wsError()).toBe('Some error');

      setWsStatus('connected');
      expect(wsError()).toBeNull();
    });

    it('should not clear error when status is connecting', () => {
      setWsStatus('disconnected', 'Previous error');
      setWsStatus('connecting');
      expect(wsError()).toBe('Previous error');
    });

    it('should not clear error when status is disconnected without error param', () => {
      setWsStatus('disconnected', 'Previous error');
      setWsStatus('disconnected');
      expect(wsError()).toBe('Previous error');
    });

    it('should overwrite existing error with new error', () => {
      setWsStatus('disconnected', 'First error');
      setWsStatus('disconnected', 'Second error');
      expect(wsError()).toBe('Second error');
    });
  });

  describe('addWsMessage', () => {
    it('should add a single message', () => {
      const msg = makeMessage();
      addWsMessage(msg);
      flushMessages();
      expect(wsMessages()).toEqual([msg]);
      expect(wsMessageCount()).toBe(1);
    });

    it('should add multiple messages in order', () => {
      const m1 = makeMessage({ data: 'first' });
      const m2 = makeMessage({ data: 'second' });
      const m3 = makeMessage({ data: 'third' });
      addWsMessage(m1);
      addWsMessage(m2);
      addWsMessage(m3);
      flushMessages();
      expect(wsMessages()).toEqual([m1, m2, m3]);
      expect(wsMessageCount()).toBe(3);
    });

    it('should preserve message properties', () => {
      const msg = makeMessage({
        id: 'test-id',
        direction: 'sent',
        data: 'hello server',
        type: 'text'
      });
      addWsMessage(msg);
      flushMessages();
      const stored = wsMessages()[0];
      expect(stored.id).toBe('test-id');
      expect(stored.direction).toBe('sent');
      expect(stored.data).toBe('hello server');
      expect(stored.type).toBe('text');
    });

    it('should enforce max limit of 1000 messages', () => {
      for (let i = 0; i < 1001; i++) {
        addWsMessage(makeMessage({ data: `msg-${i}` }));
      }
      flushMessages();
      expect(wsMessageCount()).toBe(1000);
      // The first message should have been dropped
      expect(wsMessages()[0].data).toBe('msg-1');
      expect(wsMessages()[999].data).toBe('msg-1000');
    });
  });

  describe('clearWsMessages', () => {
    it('should clear all messages', () => {
      addWsMessage(makeMessage());
      addWsMessage(makeMessage());
      flushMessages();
      expect(wsMessageCount()).toBe(2);

      clearWsMessages();
      expect(wsMessages()).toEqual([]);
      expect(wsMessageCount()).toBe(0);
    });

    it('should not affect status or error', () => {
      setWsStatus('connected');
      addWsMessage(makeMessage());
      clearWsMessages();
      expect(wsStatus()).toBe('connected');
    });
  });
});
