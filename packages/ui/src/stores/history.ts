import { writable, derived, get } from 'svelte/store';
import type { HistoryIndexEntry, HistorySearchParams } from '@hivefetch/core/services';

// History stores
export const historyEntries = writable<HistoryIndexEntry[]>([]);
export const historyTotal = writable(0);
export const historyHasMore = writable(false);
export const historySearchQuery = writable('');
export const historyMethodFilters = writable<string[]>([]);
export const historyIsLoading = writable(false);

// Group entries by date
export const groupedHistory = derived(historyEntries, ($entries) => {
  const groups: { label: string; entries: HistoryIndexEntry[] }[] = [];
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const buckets = {
    'Today': [] as HistoryIndexEntry[],
    'Yesterday': [] as HistoryIndexEntry[],
    'This Week': [] as HistoryIndexEntry[],
    'Earlier': [] as HistoryIndexEntry[],
  };

  for (const entry of $entries) {
    const date = new Date(entry.timestamp);
    if (date >= today) {
      buckets['Today'].push(entry);
    } else if (date >= yesterday) {
      buckets['Yesterday'].push(entry);
    } else if (date >= weekAgo) {
      buckets['This Week'].push(entry);
    } else {
      buckets['Earlier'].push(entry);
    }
  }

  for (const [label, entries] of Object.entries(buckets)) {
    if (entries.length > 0) {
      groups.push({ label, entries });
    }
  }

  return groups;
});

export function initHistory(data: { entries: HistoryIndexEntry[]; total: number; hasMore: boolean }) {
  historyEntries.set(data.entries);
  historyTotal.set(data.total);
  historyHasMore.set(data.hasMore);
  historyIsLoading.set(false);
}

export function appendHistory(data: { entries: HistoryIndexEntry[]; total: number; hasMore: boolean }) {
  historyEntries.update(current => [...current, ...data.entries]);
  historyTotal.set(data.total);
  historyHasMore.set(data.hasMore);
  historyIsLoading.set(false);
}

export function setSearchQuery(q: string) {
  historySearchQuery.set(q);
}

export function toggleMethodFilter(method: string) {
  historyMethodFilters.update(current => {
    if (current.includes(method)) {
      return current.filter(m => m !== method);
    }
    return [...current, method];
  });
}

export function clearFilters() {
  historySearchQuery.set('');
  historyMethodFilters.set([]);
}
