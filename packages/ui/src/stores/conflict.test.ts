import { describe, it, expect, beforeEach } from 'vitest';
import { conflictState, setConflict, clearConflict } from './conflict.svelte';
import type { SavedRequest } from '../types';

const makeSavedRequest = (overrides?: Partial<SavedRequest>): SavedRequest => ({
  id: 'req-1',
  type: 'request',
  name: 'Test Request',
  method: 'GET',
  url: 'https://api.example.com',
  params: [],
  headers: [],
  auth: { type: 'none' },
  body: { type: 'none', content: '' },
  ...overrides,
});

describe('conflict store', () => {
  beforeEach(() => {
    clearConflict();
  });

  describe('initial state', () => {
    it('should start with null', () => {
      expect(conflictState()).toBeNull();
    });
  });

  describe('setConflict', () => {
    it('should set the conflict state with the updated request', () => {
      const req = makeSavedRequest();
      setConflict(req);
      const state = conflictState();
      expect(state).not.toBeNull();
      expect(state!.updatedRequest).toEqual(req);
    });

    it('should replace a previous conflict', () => {
      const req1 = makeSavedRequest({ id: 'req-1', url: 'https://old.com' });
      const req2 = makeSavedRequest({ id: 'req-2', url: 'https://new.com' });
      setConflict(req1);
      setConflict(req2);
      const state = conflictState();
      expect(state!.updatedRequest.id).toBe('req-2');
      expect(state!.updatedRequest.url).toBe('https://new.com');
    });
  });

  describe('clearConflict', () => {
    it('should reset the conflict state to null', () => {
      setConflict(makeSavedRequest());
      expect(conflictState()).not.toBeNull();
      clearConflict();
      expect(conflictState()).toBeNull();
    });

    it('should be safe to call when already null', () => {
      clearConflict();
      expect(conflictState()).toBeNull();
    });
  });
});
