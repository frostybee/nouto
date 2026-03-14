import { describe, it, expect, beforeEach, vi } from 'vitest';

// Set up localStorage mock BEFORE importing the store
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

import {
  frecencyData,
  recordOpen,
  getScore,
  getSortedEntries,
  removeFrecency,
  clearFrecency,
  recalculate,
  recentRequests,
  frequentRequests,
  topRequests,
} from './frecency.svelte';

describe('frecency store', () => {
  beforeEach(() => {
    clearFrecency();
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('should have empty frecency data', () => {
      expect(frecencyData()).toEqual({});
    });

    it('should return 0 score for unknown request', () => {
      expect(getScore('nonexistent')).toBe(0);
    });

    it('should return empty sorted entries', () => {
      expect(getSortedEntries()).toEqual([]);
    });

    it('should return empty recent requests', () => {
      expect(recentRequests()).toEqual([]);
    });

    it('should return empty frequent requests', () => {
      expect(frequentRequests()).toEqual([]);
    });

    it('should return empty top requests', () => {
      expect(topRequests()).toEqual([]);
    });
  });

  describe('recordOpen', () => {
    it('should create a new entry', () => {
      recordOpen('req-1');
      const data = frecencyData();
      expect(data['req-1']).toBeDefined();
      expect(data['req-1'].requestId).toBe('req-1');
      expect(data['req-1'].openCount).toBe(1);
    });

    it('should increment count on repeated opens', () => {
      recordOpen('req-1');
      recordOpen('req-1');
      recordOpen('req-1');
      expect(frecencyData()['req-1'].openCount).toBe(3);
    });

    it('should update lastOpened timestamp', () => {
      const now = 1700000000000;
      vi.spyOn(Date, 'now').mockReturnValue(now);

      recordOpen('req-1');
      expect(frecencyData()['req-1'].lastOpened).toBe(now);
    });

    it('should calculate a positive score', () => {
      recordOpen('req-1');
      expect(getScore('req-1')).toBeGreaterThan(0);
    });

    it('should persist to localStorage', () => {
      recordOpen('req-1');
      const stored = localStorageMock.getItem('hivefetch.frecency');
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed['req-1']).toBeDefined();
    });

    it('should handle multiple different requests', () => {
      recordOpen('req-1');
      recordOpen('req-2');
      recordOpen('req-3');

      const data = frecencyData();
      expect(Object.keys(data)).toHaveLength(3);
    });
  });

  describe('getScore', () => {
    it('should return 0 for unknown request ID', () => {
      expect(getScore('unknown')).toBe(0);
    });

    it('should return score for known request', () => {
      recordOpen('req-1');
      expect(getScore('req-1')).toBeGreaterThan(0);
    });
  });

  describe('getSortedEntries', () => {
    it('should return entries sorted by score descending', () => {
      const now = Date.now();

      // Record req-1 multiple times to give it a higher frequency
      vi.spyOn(Date, 'now').mockReturnValue(now);
      recordOpen('req-1');
      recordOpen('req-1');
      recordOpen('req-1');

      // Record req-2 once, older
      vi.spyOn(Date, 'now').mockReturnValue(now - 24 * 60 * 60 * 1000);
      recordOpen('req-2');

      vi.spyOn(Date, 'now').mockReturnValue(now);
      recalculate();

      const sorted = getSortedEntries();
      expect(sorted.length).toBe(2);
      expect(sorted[0].score).toBeGreaterThanOrEqual(sorted[1].score);
    });
  });

  describe('removeFrecency', () => {
    it('should remove a request from frecency data', () => {
      recordOpen('req-1');
      recordOpen('req-2');

      removeFrecency('req-1');

      expect(frecencyData()['req-1']).toBeUndefined();
      expect(frecencyData()['req-2']).toBeDefined();
    });

    it('should update localStorage after removal', () => {
      recordOpen('req-1');
      removeFrecency('req-1');

      const stored = JSON.parse(localStorageMock.getItem('hivefetch.frecency')!);
      expect(stored['req-1']).toBeUndefined();
    });

    it('should handle removing nonexistent entry gracefully', () => {
      removeFrecency('nonexistent');
      expect(frecencyData()).toEqual({});
    });
  });

  describe('clearFrecency', () => {
    it('should clear all frecency data', () => {
      recordOpen('req-1');
      recordOpen('req-2');

      clearFrecency();

      expect(frecencyData()).toEqual({});
    });

    it('should remove from localStorage', () => {
      recordOpen('req-1');
      clearFrecency();

      expect(localStorageMock.getItem('hivefetch.frecency')).toBeNull();
    });
  });

  describe('recalculate', () => {
    it('should update scores based on current time', () => {
      const now = 1700000000000;
      vi.spyOn(Date, 'now').mockReturnValue(now);
      recordOpen('req-1');
      const scoreBefore = getScore('req-1');

      // Move time forward by 48 hours
      vi.spyOn(Date, 'now').mockReturnValue(now + 48 * 60 * 60 * 1000);
      recalculate();
      const scoreAfter = getScore('req-1');

      // Score should decay over time
      expect(scoreAfter).toBeLessThan(scoreBefore);
    });

    it('should persist recalculated data', () => {
      recordOpen('req-1');
      recalculate();

      const stored = JSON.parse(localStorageMock.getItem('hivefetch.frecency')!);
      expect(stored['req-1'].score).toBeGreaterThan(0);
    });
  });

  describe('recentRequests', () => {
    it('should return request IDs sorted by lastOpened descending', () => {
      const now = 1700000000000;

      vi.spyOn(Date, 'now').mockReturnValue(now - 2000);
      recordOpen('req-old');

      vi.spyOn(Date, 'now').mockReturnValue(now - 1000);
      recordOpen('req-mid');

      vi.spyOn(Date, 'now').mockReturnValue(now);
      recordOpen('req-new');

      const recent = recentRequests();
      expect(recent[0]).toBe('req-new');
      expect(recent[1]).toBe('req-mid');
      expect(recent[2]).toBe('req-old');
    });
  });

  describe('frequentRequests', () => {
    it('should return request IDs sorted by openCount descending', () => {
      recordOpen('req-low');

      recordOpen('req-high');
      recordOpen('req-high');
      recordOpen('req-high');

      recordOpen('req-mid');
      recordOpen('req-mid');

      const frequent = frequentRequests();
      expect(frequent[0]).toBe('req-high');
      expect(frequent[1]).toBe('req-mid');
      expect(frequent[2]).toBe('req-low');
    });
  });

  describe('topRequests', () => {
    it('should return top requests by score', () => {
      recordOpen('req-1');
      recordOpen('req-2');

      const top = topRequests();
      expect(top.length).toBeLessThanOrEqual(10);
      expect(top).toContain('req-1');
      expect(top).toContain('req-2');
    });

    it('should limit to 10 results', () => {
      for (let i = 0; i < 15; i++) {
        recordOpen(`req-${i}`);
      }

      const top = topRequests();
      expect(top.length).toBe(10);
    });
  });
});
