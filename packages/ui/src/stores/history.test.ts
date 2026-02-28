import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  historyEntries,
  historyTotal,
  historyHasMore,
  historyIsLoading,
  historyPendingAppend,
  historySearchQuery,
  historyMethodFilters,
  historyCollectionFilter,
  historySearchRegex,
  historySearchFields,
  groupedHistory,
  initHistory,
  appendHistory,
  setSearchQuery,
  toggleMethodFilter,
  clearFilters,
} from './history';
import type { HistoryIndexEntry } from '@hivefetch/core/services';

function makeEntry(overrides: Partial<HistoryIndexEntry> = {}): HistoryIndexEntry {
  return {
    id: `id-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    method: 'GET',
    url: 'https://api.example.com/users',
    responseStatus: 200,
    responseDuration: 100,
    responseSize: 512,
    ...overrides,
  };
}

function resetStores() {
  historyEntries.set([]);
  historyTotal.set(0);
  historyHasMore.set(false);
  historyIsLoading.set(false);
  historyPendingAppend.set(false);
  historySearchQuery.set('');
  historyMethodFilters.set([]);
  historyCollectionFilter.set(null);
  historySearchRegex.set(false);
  historySearchFields.set(['url']);
}

describe('history store', () => {
  beforeEach(() => {
    resetStores();
  });

  describe('initHistory', () => {
    it('should set entries, total, hasMore, and clear loading', () => {
      historyIsLoading.set(true);
      const entries = [makeEntry({ id: 'a' }), makeEntry({ id: 'b' })];

      initHistory({ entries, total: 10, hasMore: true });

      expect(get(historyEntries)).toEqual(entries);
      expect(get(historyTotal)).toBe(10);
      expect(get(historyHasMore)).toBe(true);
      expect(get(historyIsLoading)).toBe(false);
    });

    it('should replace entries on subsequent calls', () => {
      initHistory({ entries: [makeEntry({ id: 'first' })], total: 1, hasMore: false });
      initHistory({ entries: [makeEntry({ id: 'second' })], total: 1, hasMore: false });

      const entries = get(historyEntries);
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe('second');
    });

    it('should append instead of replace when historyPendingAppend is true', () => {
      const existing = [makeEntry({ id: 'a' }), makeEntry({ id: 'b' })];
      initHistory({ entries: existing, total: 5, hasMore: true });

      // Set pending append flag — simulates Load More
      historyPendingAppend.set(true);

      const page2 = [makeEntry({ id: 'c' }), makeEntry({ id: 'd' })];
      initHistory({ entries: page2, total: 5, hasMore: false });

      const entries = get(historyEntries);
      expect(entries).toHaveLength(4);
      expect(entries.map(e => e.id)).toEqual(['a', 'b', 'c', 'd']);
      expect(get(historyHasMore)).toBe(false);
      expect(get(historyPendingAppend)).toBe(false);
    });

    it('should clear pendingAppend flag after appending', () => {
      historyPendingAppend.set(true);
      initHistory({ entries: [makeEntry()], total: 1, hasMore: false });

      expect(get(historyPendingAppend)).toBe(false);
    });
  });

  describe('appendHistory', () => {
    it('should append entries to existing list', () => {
      historyEntries.set([makeEntry({ id: 'a' })]);

      appendHistory({ entries: [makeEntry({ id: 'b' })], total: 2, hasMore: false });

      const entries = get(historyEntries);
      expect(entries).toHaveLength(2);
      expect(entries[0].id).toBe('a');
      expect(entries[1].id).toBe('b');
    });

    it('should update total and hasMore', () => {
      appendHistory({ entries: [makeEntry()], total: 50, hasMore: true });

      expect(get(historyTotal)).toBe(50);
      expect(get(historyHasMore)).toBe(true);
    });

    it('should clear loading state', () => {
      historyIsLoading.set(true);
      appendHistory({ entries: [], total: 0, hasMore: false });

      expect(get(historyIsLoading)).toBe(false);
    });
  });

  describe('setSearchQuery', () => {
    it('should update the search query', () => {
      setSearchQuery('users');
      expect(get(historySearchQuery)).toBe('users');
    });
  });

  describe('toggleMethodFilter', () => {
    it('should add a method to filters', () => {
      toggleMethodFilter('GET');
      expect(get(historyMethodFilters)).toEqual(['GET']);
    });

    it('should remove a method if already present', () => {
      toggleMethodFilter('GET');
      toggleMethodFilter('POST');
      toggleMethodFilter('GET');

      expect(get(historyMethodFilters)).toEqual(['POST']);
    });

    it('should toggle multiple methods independently', () => {
      toggleMethodFilter('GET');
      toggleMethodFilter('POST');
      toggleMethodFilter('DELETE');

      expect(get(historyMethodFilters)).toEqual(['GET', 'POST', 'DELETE']);

      toggleMethodFilter('POST');
      expect(get(historyMethodFilters)).toEqual(['GET', 'DELETE']);
    });
  });

  describe('clearFilters', () => {
    it('should reset all filter stores to defaults', () => {
      setSearchQuery('test');
      toggleMethodFilter('POST');
      historyCollectionFilter.set({ collectionId: 'col-1', requestName: 'Req' });
      historySearchRegex.set(true);
      historySearchFields.set(['url', 'headers']);

      clearFilters();

      expect(get(historySearchQuery)).toBe('');
      expect(get(historyMethodFilters)).toEqual([]);
      expect(get(historyCollectionFilter)).toBeNull();
      expect(get(historySearchRegex)).toBe(false);
      expect(get(historySearchFields)).toEqual(['url']);
    });
  });

  describe('groupedHistory', () => {
    it('should return empty array when no entries', () => {
      expect(get(groupedHistory)).toEqual([]);
    });

    it('should bucket entries into Today', () => {
      const entry = makeEntry({ id: 'today', timestamp: new Date().toISOString() });
      historyEntries.set([entry]);

      const groups = get(groupedHistory);
      expect(groups).toHaveLength(1);
      expect(groups[0].label).toBe('Today');
      expect(groups[0].entries).toHaveLength(1);
    });

    it('should bucket entries into Yesterday', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(12, 0, 0, 0); // midday yesterday
      const entry = makeEntry({ id: 'yest', timestamp: yesterday.toISOString() });
      historyEntries.set([entry]);

      const groups = get(groupedHistory);
      expect(groups.length).toBeGreaterThanOrEqual(1);
      expect(groups[0].label).toBe('Yesterday');
    });

    it('should bucket entries into This Week', () => {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      threeDaysAgo.setHours(12, 0, 0, 0);
      const entry = makeEntry({ id: 'week', timestamp: threeDaysAgo.toISOString() });
      historyEntries.set([entry]);

      const groups = get(groupedHistory);
      expect(groups.length).toBeGreaterThanOrEqual(1);
      // Could be "This Week" or "Yesterday" depending on timing
      expect(['This Week', 'Yesterday']).toContain(groups[0].label);
    });

    it('should bucket old entries into Earlier', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 30);
      const entry = makeEntry({ id: 'old', timestamp: oldDate.toISOString() });
      historyEntries.set([entry]);

      const groups = get(groupedHistory);
      expect(groups).toHaveLength(1);
      expect(groups[0].label).toBe('Earlier');
    });

    it('should create multiple groups for mixed dates', () => {
      const todayEntry = makeEntry({ id: 'today', timestamp: new Date().toISOString() });
      const oldEntry = makeEntry({
        id: 'old',
        timestamp: new Date(Date.now() - 30 * 86400000).toISOString(),
      });
      historyEntries.set([todayEntry, oldEntry]);

      const groups = get(groupedHistory);
      expect(groups.length).toBe(2);
      expect(groups[0].label).toBe('Today');
      expect(groups[1].label).toBe('Earlier');
    });

    it('should omit empty groups', () => {
      const entry = makeEntry({ id: 'today', timestamp: new Date().toISOString() });
      historyEntries.set([entry]);

      const groups = get(groupedHistory);
      // Only Today should appear, not Yesterday/This Week/Earlier
      expect(groups).toHaveLength(1);
    });
  });

  describe('Load More pagination flow', () => {
    it('should correctly simulate a full Load More flow', () => {
      // Page 1: initial load
      const page1 = [makeEntry({ id: 'p1-a' }), makeEntry({ id: 'p1-b' })];
      initHistory({ entries: page1, total: 4, hasMore: true });

      expect(get(historyEntries)).toHaveLength(2);
      expect(get(historyHasMore)).toBe(true);

      // User clicks "Load More" — sets the flag before requesting
      historyPendingAppend.set(true);

      // Page 2 arrives via initHistory (same handler as page 1)
      const page2 = [makeEntry({ id: 'p2-a' }), makeEntry({ id: 'p2-b' })];
      initHistory({ entries: page2, total: 4, hasMore: false });

      // Should have appended, not replaced
      expect(get(historyEntries)).toHaveLength(4);
      expect(get(historyEntries).map(e => e.id)).toEqual(['p1-a', 'p1-b', 'p2-a', 'p2-b']);
      expect(get(historyHasMore)).toBe(false);
      expect(get(historyPendingAppend)).toBe(false);
    });

    it('should not append if pendingAppend was not set', () => {
      initHistory({ entries: [makeEntry({ id: 'a' })], total: 2, hasMore: true });
      // No historyPendingAppend.set(true) — simulates a fresh search
      initHistory({ entries: [makeEntry({ id: 'b' })], total: 1, hasMore: false });

      // Should have replaced
      expect(get(historyEntries)).toHaveLength(1);
      expect(get(historyEntries)[0].id).toBe('b');
    });
  });
});
