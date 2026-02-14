import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  runnerState,
  filteredResults,
  initRunner,
  toggleRequestEnabled,
  toggleAllRequests,
  reorderRequest,
  setResultFilter,
  setExpandedResult,
  getEnabledRequests,
  getEnabledRequestIds,
  addResult,
  resetRunner,
} from './collectionRunner';
import type { CollectionRunRequestResult } from '../types';

const sampleRequests = [
  { id: 'r1', name: 'Login', method: 'POST', url: 'https://api.test/login' },
  { id: 'r2', name: 'Get Users', method: 'GET', url: 'https://api.test/users' },
  { id: 'r3', name: 'Delete User', method: 'DELETE', url: 'https://api.test/users/1' },
];

const makeResult = (overrides: Partial<CollectionRunRequestResult> = {}): CollectionRunRequestResult => ({
  requestId: 'r1',
  requestName: 'Login',
  method: 'POST',
  url: 'https://api.test/login',
  status: 200,
  statusText: 'OK',
  duration: 100,
  size: 256,
  passed: true,
  ...overrides,
});

describe('collectionRunner store', () => {
  beforeEach(() => {
    resetRunner();
    initRunner({
      collectionId: 'col-1',
      collectionName: 'Test Collection',
      requests: sampleRequests,
    });
  });

  describe('initRunner', () => {
    it('should set all requests as enabled by default', () => {
      const state = get(runnerState);
      expect(state.requests).toHaveLength(3);
      expect(state.requests.every(r => r.enabled)).toBe(true);
    });

    it('should set status to idle', () => {
      const state = get(runnerState);
      expect(state.status).toBe('idle');
    });

    it('should set collection metadata', () => {
      const state = get(runnerState);
      expect(state.collectionId).toBe('col-1');
      expect(state.collectionName).toBe('Test Collection');
    });
  });

  describe('toggleRequestEnabled', () => {
    it('should disable an enabled request', () => {
      toggleRequestEnabled('r1');

      const state = get(runnerState);
      expect(state.requests.find(r => r.id === 'r1')!.enabled).toBe(false);
    });

    it('should re-enable a disabled request', () => {
      toggleRequestEnabled('r1');
      toggleRequestEnabled('r1');

      const state = get(runnerState);
      expect(state.requests.find(r => r.id === 'r1')!.enabled).toBe(true);
    });

    it('should not affect other requests', () => {
      toggleRequestEnabled('r1');

      const state = get(runnerState);
      expect(state.requests.find(r => r.id === 'r2')!.enabled).toBe(true);
      expect(state.requests.find(r => r.id === 'r3')!.enabled).toBe(true);
    });
  });

  describe('toggleAllRequests', () => {
    it('should disable all requests', () => {
      toggleAllRequests(false);

      const state = get(runnerState);
      expect(state.requests.every(r => !r.enabled)).toBe(true);
    });

    it('should enable all requests', () => {
      toggleAllRequests(false);
      toggleAllRequests(true);

      const state = get(runnerState);
      expect(state.requests.every(r => r.enabled)).toBe(true);
    });
  });

  describe('reorderRequest', () => {
    it('should move a request from one position to another', () => {
      // Move 'Delete User' (idx 2) to position 0
      reorderRequest(2, 0);

      const state = get(runnerState);
      expect(state.requests[0].name).toBe('Delete User');
      expect(state.requests[1].name).toBe('Login');
      expect(state.requests[2].name).toBe('Get Users');
    });

    it('should move first to last', () => {
      reorderRequest(0, 2);

      const state = get(runnerState);
      expect(state.requests[0].name).toBe('Get Users');
      expect(state.requests[1].name).toBe('Delete User');
      expect(state.requests[2].name).toBe('Login');
    });

    it('should handle same index (no-op)', () => {
      reorderRequest(1, 1);

      const state = get(runnerState);
      expect(state.requests[0].name).toBe('Login');
      expect(state.requests[1].name).toBe('Get Users');
      expect(state.requests[2].name).toBe('Delete User');
    });
  });

  describe('getEnabledRequests', () => {
    it('should return all requests when all enabled', () => {
      expect(getEnabledRequests()).toHaveLength(3);
    });

    it('should return only enabled requests', () => {
      toggleRequestEnabled('r2');

      const enabled = getEnabledRequests();
      expect(enabled).toHaveLength(2);
      expect(enabled.find(r => r.id === 'r2')).toBeUndefined();
    });

    it('should return empty array when all disabled', () => {
      toggleAllRequests(false);
      expect(getEnabledRequests()).toHaveLength(0);
    });
  });

  describe('getEnabledRequestIds', () => {
    it('should return IDs of enabled requests only', () => {
      toggleRequestEnabled('r3');

      const ids = getEnabledRequestIds();
      expect(ids).toEqual(['r1', 'r2']);
    });
  });

  describe('setResultFilter', () => {
    it('should update the result filter', () => {
      setResultFilter('passed');
      expect(get(runnerState).resultFilter).toBe('passed');

      setResultFilter('failed');
      expect(get(runnerState).resultFilter).toBe('failed');

      setResultFilter('all');
      expect(get(runnerState).resultFilter).toBe('all');
    });
  });

  describe('filteredResults derived store', () => {
    beforeEach(() => {
      addResult(makeResult({ requestId: 'r1', requestName: 'Login', passed: true }));
      addResult(makeResult({ requestId: 'r2', requestName: 'Get Users', passed: false, status: 500 }));
      addResult(makeResult({ requestId: 'r3', requestName: 'Delete User', passed: true }));
    });

    it('should return all results when filter is all', () => {
      setResultFilter('all');
      expect(get(filteredResults)).toHaveLength(3);
    });

    it('should return only passed results when filter is passed', () => {
      setResultFilter('passed');
      const results = get(filteredResults);
      expect(results).toHaveLength(2);
      expect(results.every(r => r.passed)).toBe(true);
    });

    it('should return only failed results when filter is failed', () => {
      setResultFilter('failed');
      const results = get(filteredResults);
      expect(results).toHaveLength(1);
      expect(results[0].requestName).toBe('Get Users');
    });
  });

  describe('setExpandedResult', () => {
    it('should set the expanded result ID', () => {
      setExpandedResult('r1');
      expect(get(runnerState).expandedResultId).toBe('r1');
    });

    it('should toggle off when same ID is set again', () => {
      setExpandedResult('r1');
      setExpandedResult('r1');
      expect(get(runnerState).expandedResultId).toBeNull();
    });

    it('should switch to new ID when different ID is set', () => {
      setExpandedResult('r1');
      setExpandedResult('r2');
      expect(get(runnerState).expandedResultId).toBe('r2');
    });

    it('should set to null explicitly', () => {
      setExpandedResult('r1');
      setExpandedResult(null);
      expect(get(runnerState).expandedResultId).toBeNull();
    });
  });
});
