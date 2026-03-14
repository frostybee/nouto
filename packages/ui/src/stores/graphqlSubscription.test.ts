import { describe, it, expect, beforeEach } from 'vitest';
import {
  gqlSubStatus,
  gqlSubEvents,
  gqlSubError,
  gqlSubEventCount,
  setGqlSubStatus,
  addGqlSubEvent,
  clearGqlSubEvents
} from './graphqlSubscription.svelte';
import type { GqlSubEvent } from '../types';

function makeEvent(overrides: Partial<GqlSubEvent> = {}): GqlSubEvent {
  return {
    type: 'data',
    data: '{"hello":"world"}',
    timestamp: Date.now(),
    ...overrides
  } as GqlSubEvent;
}

describe('graphqlSubscription store', () => {
  beforeEach(() => {
    setGqlSubStatus('disconnected');
    clearGqlSubEvents();
  });

  describe('initial state', () => {
    it('should have disconnected status', () => {
      expect(gqlSubStatus()).toBe('disconnected');
    });

    it('should have empty events', () => {
      expect(gqlSubEvents()).toEqual([]);
    });

    it('should have null error', () => {
      expect(gqlSubError()).toBeNull();
    });

    it('should have zero event count', () => {
      expect(gqlSubEventCount()).toBe(0);
    });
  });

  describe('setGqlSubStatus', () => {
    it('should update status to connecting', () => {
      setGqlSubStatus('connecting');
      expect(gqlSubStatus()).toBe('connecting');
    });

    it('should update status to connected', () => {
      setGqlSubStatus('connected');
      expect(gqlSubStatus()).toBe('connected');
    });

    it('should update status to subscribed', () => {
      setGqlSubStatus('subscribed');
      expect(gqlSubStatus()).toBe('subscribed');
    });

    it('should update status to error', () => {
      setGqlSubStatus('error');
      expect(gqlSubStatus()).toBe('error');
    });

    it('should set error message when provided', () => {
      setGqlSubStatus('error', 'Connection refused');
      expect(gqlSubStatus()).toBe('error');
      expect(gqlSubError()).toBe('Connection refused');
    });

    it('should clear error when status is connected', () => {
      setGqlSubStatus('error', 'Some error');
      expect(gqlSubError()).toBe('Some error');

      setGqlSubStatus('connected');
      expect(gqlSubError()).toBeNull();
    });

    it('should clear error when status is subscribed', () => {
      setGqlSubStatus('error', 'Some error');
      expect(gqlSubError()).toBe('Some error');

      setGqlSubStatus('subscribed');
      expect(gqlSubError()).toBeNull();
    });

    it('should not clear error when status is connecting', () => {
      setGqlSubStatus('error', 'Previous error');
      setGqlSubStatus('connecting');
      expect(gqlSubError()).toBe('Previous error');
    });

    it('should not clear error when status is disconnected without error param', () => {
      setGqlSubStatus('error', 'Previous error');
      setGqlSubStatus('disconnected');
      expect(gqlSubError()).toBe('Previous error');
    });
  });

  describe('addGqlSubEvent', () => {
    it('should add a single event', () => {
      const event = makeEvent();
      addGqlSubEvent(event);
      expect(gqlSubEvents()).toEqual([event]);
      expect(gqlSubEventCount()).toBe(1);
    });

    it('should add multiple events in order', () => {
      const e1 = makeEvent({ type: 'data', data: 'first' });
      const e2 = makeEvent({ type: 'data', data: 'second' });
      const e3 = makeEvent({ type: 'data', data: 'third' });
      addGqlSubEvent(e1);
      addGqlSubEvent(e2);
      addGqlSubEvent(e3);
      expect(gqlSubEvents()).toEqual([e1, e2, e3]);
      expect(gqlSubEventCount()).toBe(3);
    });

    it('should enforce max limit of 1000 events', () => {
      for (let i = 0; i < 1001; i++) {
        addGqlSubEvent(makeEvent({ data: `event-${i}` }));
      }
      expect(gqlSubEventCount()).toBe(1000);
      // The first event should have been dropped
      expect(gqlSubEvents()[0].data).toBe('event-1');
      expect(gqlSubEvents()[999].data).toBe('event-1000');
    });
  });

  describe('clearGqlSubEvents', () => {
    it('should clear all events', () => {
      addGqlSubEvent(makeEvent());
      addGqlSubEvent(makeEvent());
      expect(gqlSubEventCount()).toBe(2);

      clearGqlSubEvents();
      expect(gqlSubEvents()).toEqual([]);
      expect(gqlSubEventCount()).toBe(0);
    });
  });
});
