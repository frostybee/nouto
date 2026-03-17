import { describe, it, expect, beforeEach } from 'vitest';
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
  setHistoryEntries,
  setHistoryIsLoading,
  setHistoryPendingAppend,
  setHistoryCollectionFilter,
  setHistorySearchRegex,
  setHistorySearchFields,
} from './history.svelte';
import type { HistoryIndexEntry } from '@nouto/core/services';

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
  setHistoryEntries([]);
  setHistoryIsLoading(false);
  setHistoryPendingAppend(false);
  clearFilters();
  // Reset remaining via initHistory
  initHistory({ entries: [], total: 0, hasMore: false });
}

describe('history store', () => {
  beforeEach(() => {
    resetStores();
  });

  describe('initHistory', () => {
    it('should set entries, total, hasMore, and clear loading', () => {
      setHistoryIsLoading(true);
      const entries = [makeEntry({ id: 'a' }), makeEntry({ id: 'b' })];

      initHistory({ entries, total: 10, hasMore: true });

      expect(historyEntries()).toEqual(entries);
      expect(historyTotal()).toBe(10);
      expect(historyHasMore()).toBe(true);
      expect(historyIsLoading()).toBe(false);
    });

    it('should replace entries on subsequent calls', () => {
      initHistory({ entries: [makeEntry({ id: 'first' })], total: 1, hasMore: false });
      initHistory({ entries: [makeEntry({ id: 'second' })], total: 1, hasMore: false });

      const entries = historyEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe('second');
    });

    it('should append instead of replace when historyPendingAppend is true', () => {
      const existing = [makeEntry({ id: 'a' }), makeEntry({ id: 'b' })];
      initHistory({ entries: existing, total: 5, hasMore: true });

      // Set pending append flag - simulates Load More
      setHistoryPendingAppend(true);

      const page2 = [makeEntry({ id: 'c' }), makeEntry({ id: 'd' })];
      initHistory({ entries: page2, total: 5, hasMore: false });

      const entries = historyEntries();
      expect(entries).toHaveLength(4);
      expect(entries.map(e => e.id)).toEqual(['a', 'b', 'c', 'd']);
      expect(historyHasMore()).toBe(false);
      expect(historyPendingAppend()).toBe(false);
    });

    it('should clear pendingAppend flag after appending', () => {
      setHistoryPendingAppend(true);
      initHistory({ entries: [makeEntry()], total: 1, hasMore: false });

      expect(historyPendingAppend()).toBe(false);
    });
  });

  describe('appendHistory', () => {
    it('should append entries to existing list', () => {
      setHistoryEntries([makeEntry({ id: 'a' })]);

      appendHistory({ entries: [makeEntry({ id: 'b' })], total: 2, hasMore: false });

      const entries = historyEntries();
      expect(entries).toHaveLength(2);
      expect(entries[0].id).toBe('a');
      expect(entries[1].id).toBe('b');
    });

    it('should update total and hasMore', () => {
      appendHistory({ entries: [makeEntry()], total: 50, hasMore: true });

      expect(historyTotal()).toBe(50);
      expect(historyHasMore()).toBe(true);
    });

    it('should clear loading state', () => {
      setHistoryIsLoading(true);
      appendHistory({ entries: [], total: 0, hasMore: false });

      expect(historyIsLoading()).toBe(false);
    });
  });

  describe('setSearchQuery', () => {
    it('should update the search query', () => {
      setSearchQuery('users');
      expect(historySearchQuery()).toBe('users');
    });
  });

  describe('toggleMethodFilter', () => {
    it('should add a method to filters', () => {
      toggleMethodFilter('GET');
      expect(historyMethodFilters()).toEqual(['GET']);
    });

    it('should remove a method if already present', () => {
      toggleMethodFilter('GET');
      toggleMethodFilter('POST');
      toggleMethodFilter('GET');

      expect(historyMethodFilters()).toEqual(['POST']);
    });

    it('should toggle multiple methods independently', () => {
      toggleMethodFilter('GET');
      toggleMethodFilter('POST');
      toggleMethodFilter('DELETE');

      expect(historyMethodFilters()).toEqual(['GET', 'POST', 'DELETE']);

      toggleMethodFilter('POST');
      expect(historyMethodFilters()).toEqual(['GET', 'DELETE']);
    });
  });

  describe('clearFilters', () => {
    it('should reset all filter stores to defaults', () => {
      setSearchQuery('test');
      toggleMethodFilter('POST');
      setHistoryCollectionFilter({ collectionId: 'col-1', requestName: 'Req' });
      setHistorySearchRegex(true);
      setHistorySearchFields(['url', 'headers']);

      clearFilters();

      expect(historySearchQuery()).toBe('');
      expect(historyMethodFilters()).toEqual([]);
      expect(historyCollectionFilter()).toBeNull();
      expect(historySearchRegex()).toBe(false);
      expect(historySearchFields()).toEqual(['url']);
    });
  });

  describe('groupedHistory', () => {
    it('should return empty array when no entries', () => {
      expect(groupedHistory()).toEqual([]);
    });

    it('should bucket entries into Today', () => {
      const entry = makeEntry({ id: 'today', timestamp: new Date().toISOString() });
      setHistoryEntries([entry]);

      const groups = groupedHistory();
      expect(groups).toHaveLength(1);
      expect(groups[0].label).toBe('Today');
      expect(groups[0].entries).toHaveLength(1);
    });

    it('should bucket entries into Yesterday', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(12, 0, 0, 0); // midday yesterday
      const entry = makeEntry({ id: 'yest', timestamp: yesterday.toISOString() });
      setHistoryEntries([entry]);

      const groups = groupedHistory();
      expect(groups.length).toBeGreaterThanOrEqual(1);
      expect(groups[0].label).toBe('Yesterday');
    });

    it('should bucket entries into This Week', () => {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      threeDaysAgo.setHours(12, 0, 0, 0);
      const entry = makeEntry({ id: 'week', timestamp: threeDaysAgo.toISOString() });
      setHistoryEntries([entry]);

      const groups = groupedHistory();
      expect(groups.length).toBeGreaterThanOrEqual(1);
      // Could be "This Week" or "Yesterday" depending on timing
      expect(['This Week', 'Yesterday']).toContain(groups[0].label);
    });

    it('should bucket old entries into Earlier', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 30);
      const entry = makeEntry({ id: 'old', timestamp: oldDate.toISOString() });
      setHistoryEntries([entry]);

      const groups = groupedHistory();
      expect(groups).toHaveLength(1);
      expect(groups[0].label).toBe('Earlier');
    });

    it('should create multiple groups for mixed dates', () => {
      const todayEntry = makeEntry({ id: 'today', timestamp: new Date().toISOString() });
      const oldEntry = makeEntry({
        id: 'old',
        timestamp: new Date(Date.now() - 30 * 86400000).toISOString(),
      });
      setHistoryEntries([todayEntry, oldEntry]);

      const groups = groupedHistory();
      expect(groups.length).toBe(2);
      expect(groups[0].label).toBe('Today');
      expect(groups[1].label).toBe('Earlier');
    });

    it('should omit empty groups', () => {
      const entry = makeEntry({ id: 'today', timestamp: new Date().toISOString() });
      setHistoryEntries([entry]);

      const groups = groupedHistory();
      // Only Today should appear, not Yesterday/This Week/Earlier
      expect(groups).toHaveLength(1);
    });
  });

  describe('Load More pagination flow', () => {
    it('should correctly simulate a full Load More flow', () => {
      // Page 1: initial load
      const page1 = [makeEntry({ id: 'p1-a' }), makeEntry({ id: 'p1-b' })];
      initHistory({ entries: page1, total: 4, hasMore: true });

      expect(historyEntries()).toHaveLength(2);
      expect(historyHasMore()).toBe(true);

      // User clicks "Load More" - sets the flag before requesting
      setHistoryPendingAppend(true);

      // Page 2 arrives via initHistory (same handler as page 1)
      const page2 = [makeEntry({ id: 'p2-a' }), makeEntry({ id: 'p2-b' })];
      initHistory({ entries: page2, total: 4, hasMore: false });

      // Should have appended, not replaced
      expect(historyEntries()).toHaveLength(4);
      expect(historyEntries().map(e => e.id)).toEqual(['p1-a', 'p1-b', 'p2-a', 'p2-b']);
      expect(historyHasMore()).toBe(false);
      expect(historyPendingAppend()).toBe(false);
    });

    it('should not append if pendingAppend was not set', () => {
      initHistory({ entries: [makeEntry({ id: 'a' })], total: 2, hasMore: true });
      // No setHistoryPendingAppend(true) - simulates a fresh search
      initHistory({ entries: [makeEntry({ id: 'b' })], total: 1, hasMore: false });

      // Should have replaced
      expect(historyEntries()).toHaveLength(1);
      expect(historyEntries()[0].id).toBe('b');
    });
  });
});
