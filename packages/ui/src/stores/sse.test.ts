import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  sseStatus,
  sseEvents,
  sseError,
  sseEventCount,
  setSSEStatus,
  addSSEEvent,
  clearSSEEvents
} from './sse.svelte';
import type { SSEEvent } from '../types';

function makeSSEEvent(overrides: Partial<SSEEvent> = {}): SSEEvent {
  return {
    id: Math.random().toString(36).slice(2),
    event: 'message',
    data: '{"payload":"test"}',
    timestamp: Date.now(),
    ...overrides
  } as SSEEvent;
}

/** Events are batched (100ms flush timer) — advance past it before asserting. */
function flushEvents() {
  vi.advanceTimersByTime(100);
}

describe('sse store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setSSEStatus('disconnected');
    clearSSEEvents();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('should have disconnected status', () => {
      expect(sseStatus()).toBe('disconnected');
    });

    it('should have empty events', () => {
      expect(sseEvents()).toEqual([]);
    });

    it('should have null error', () => {
      expect(sseError()).toBeNull();
    });

    it('should have zero event count', () => {
      expect(sseEventCount()).toBe(0);
    });
  });

  describe('setSSEStatus', () => {
    it('should update status to connecting', () => {
      setSSEStatus('connecting');
      expect(sseStatus()).toBe('connecting');
    });

    it('should update status to connected', () => {
      setSSEStatus('connected');
      expect(sseStatus()).toBe('connected');
    });

    it('should set error message when provided', () => {
      setSSEStatus('disconnected', 'Stream ended unexpectedly');
      expect(sseStatus()).toBe('disconnected');
      expect(sseError()).toBe('Stream ended unexpectedly');
    });

    it('should clear error when status is connected', () => {
      setSSEStatus('disconnected', 'Some error');
      expect(sseError()).toBe('Some error');

      setSSEStatus('connected');
      expect(sseError()).toBeNull();
    });

    it('should not clear error when status is connecting', () => {
      setSSEStatus('disconnected', 'Previous error');
      setSSEStatus('connecting');
      expect(sseError()).toBe('Previous error');
    });

    it('should not clear error when status is disconnected without error param', () => {
      setSSEStatus('disconnected', 'Previous error');
      setSSEStatus('disconnected');
      expect(sseError()).toBe('Previous error');
    });

    it('should overwrite existing error with new error', () => {
      setSSEStatus('disconnected', 'First error');
      setSSEStatus('disconnected', 'Second error');
      expect(sseError()).toBe('Second error');
    });
  });

  describe('addSSEEvent', () => {
    it('should add a single event', () => {
      const event = makeSSEEvent();
      addSSEEvent(event);
      flushEvents();
      expect(sseEvents()).toEqual([event]);
      expect(sseEventCount()).toBe(1);
    });

    it('should add multiple events in order', () => {
      const e1 = makeSSEEvent({ data: 'first' });
      const e2 = makeSSEEvent({ data: 'second' });
      const e3 = makeSSEEvent({ data: 'third' });
      addSSEEvent(e1);
      addSSEEvent(e2);
      addSSEEvent(e3);
      flushEvents();
      expect(sseEvents()).toEqual([e1, e2, e3]);
      expect(sseEventCount()).toBe(3);
    });

    it('should preserve event properties', () => {
      const event = makeSSEEvent({
        id: 'evt-42',
        eventType: 'update',
        data: '{"count":42}'
      });
      addSSEEvent(event);
      flushEvents();
      const stored = sseEvents()[0];
      expect(stored.id).toBe('evt-42');
      expect(stored.eventType).toBe('update');
      expect(stored.data).toBe('{"count":42}');
    });

    it('should enforce max limit of 1000 events', () => {
      for (let i = 0; i < 1001; i++) {
        addSSEEvent(makeSSEEvent({ data: `event-${i}` }));
      }
      flushEvents();
      expect(sseEventCount()).toBe(1000);
      // The first event should have been dropped
      expect(sseEvents()[0].data).toBe('event-1');
      expect(sseEvents()[999].data).toBe('event-1000');
    });
  });

  describe('clearSSEEvents', () => {
    it('should clear all events', () => {
      addSSEEvent(makeSSEEvent());
      addSSEEvent(makeSSEEvent());
      flushEvents();
      expect(sseEventCount()).toBe(2);

      clearSSEEvents();
      expect(sseEvents()).toEqual([]);
      expect(sseEventCount()).toBe(0);
    });

    it('should not affect status or error', () => {
      setSSEStatus('connected');
      addSSEEvent(makeSSEEvent());
      clearSSEEvents();
      expect(sseStatus()).toBe('connected');
    });
  });
});
