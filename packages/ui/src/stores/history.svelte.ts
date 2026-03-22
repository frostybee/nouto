import type { HistoryIndexEntry, HistorySearchParams, HistoryStats, HistorySortBy } from '@nouto/core/services';

// History stores
const _historyEntries = $state<{ value: HistoryIndexEntry[] }>({ value: [] });
const _historyTotal = $state<{ value: number }>({ value: 0 });
const _historyHasMore = $state<{ value: boolean }>({ value: false });
const _historySearchQuery = $state<{ value: string }>({ value: '' });
const _historyMethodFilters = $state<{ value: string[] }>({ value: [] });
const _historyIsLoading = $state<{ value: boolean }>({ value: false });

// When true, next historyLoaded response will append instead of replace
const _historyPendingAppend = $state<{ value: boolean }>({ value: false });

export function historyEntries() { return _historyEntries.value; }
export function historyTotal() { return _historyTotal.value; }
export function historyHasMore() { return _historyHasMore.value; }
export function historySearchQuery() { return _historySearchQuery.value; }
export function historyMethodFilters() { return _historyMethodFilters.value; }
export function historyIsLoading() { return _historyIsLoading.value; }
export function historyPendingAppend() { return _historyPendingAppend.value; }

// Group entries by date
export function groupedHistory() {
  const entries = _historyEntries.value;
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

  for (const entry of entries) {
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
}

/** Flattened list for virtual scrolling: date headers + entries as a single array */
export type FlatHistoryItem =
  | { type: 'header'; id: string; label: string }
  | { type: 'entry'; id: string; entry: HistoryIndexEntry };

export function flatHistory() {
  const items: FlatHistoryItem[] = [];
  const sort = _historySortBy.value;
  const allEntries = _historyEntries.value;

  // Separate pinned entries (always shown at the top)
  const pinned = allEntries.filter(e => e.pinned);
  const unpinned = allEntries.filter(e => !e.pinned);

  if (pinned.length > 0) {
    items.push({ type: 'header', id: 'header-Pinned', label: 'Pinned' });
    for (const entry of pinned) {
      items.push({ type: 'entry', id: entry.id, entry });
    }
  }

  // Only show date group headers for time-based sorts
  if (sort === 'newest' || sort === 'oldest') {
    // Re-run grouping on unpinned entries only
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const weekAgo = new Date(today.getTime() - 7 * 86400000);

    const buckets: Record<string, HistoryIndexEntry[]> = {
      'Today': [], 'Yesterday': [], 'This Week': [], 'Earlier': [],
    };
    for (const entry of unpinned) {
      const date = new Date(entry.timestamp);
      if (date >= today) buckets['Today'].push(entry);
      else if (date >= yesterday) buckets['Yesterday'].push(entry);
      else if (date >= weekAgo) buckets['This Week'].push(entry);
      else buckets['Earlier'].push(entry);
    }
    for (const [label, entries] of Object.entries(buckets)) {
      if (entries.length > 0) {
        items.push({ type: 'header', id: `header-${label}`, label });
        for (const entry of entries) {
          items.push({ type: 'entry', id: entry.id, entry });
        }
      }
    }
  } else {
    // Flat list for non-time sorts
    for (const entry of unpinned) {
      items.push({ type: 'entry', id: entry.id, entry });
    }
  }
  return items;
}

export function initHistory(data: { entries: HistoryIndexEntry[]; total: number; hasMore: boolean }) {
  if (_historyPendingAppend.value) {
    _historyPendingAppend.value = false;
    appendHistory(data);
    return;
  }
  _historyEntries.value = data.entries;
  _historyTotal.value = data.total;
  _historyHasMore.value = data.hasMore;
  _historyIsLoading.value = false;
}

export function appendHistory(data: { entries: HistoryIndexEntry[]; total: number; hasMore: boolean }) {
  _historyEntries.value = [..._historyEntries.value, ...data.entries];
  _historyTotal.value = data.total;
  _historyHasMore.value = data.hasMore;
  _historyIsLoading.value = false;
}

export function setSearchQuery(q: string) {
  _historySearchQuery.value = q;
}

export function toggleMethodFilter(method: string) {
  const current = _historyMethodFilters.value;
  if (current.includes(method)) {
    _historyMethodFilters.value = current.filter(m => m !== method);
  } else {
    _historyMethodFilters.value = [...current, method];
  }
}

// Collection filter - for "View Send History" from collection items
const _historyCollectionFilter = $state<{ value: { collectionId: string; requestName: string } | null }>({ value: null });

export function historyCollectionFilter() { return _historyCollectionFilter.value; }

// Sort
const _historySortBy = $state<{ value: HistorySortBy }>({ value: 'newest' });

export function historySortBy() { return _historySortBy.value; }

export function setHistorySortBy(sortBy: HistorySortBy) {
  _historySortBy.value = sortBy;
}

// Advanced search options
const _historySearchRegex = $state<{ value: boolean }>({ value: false });
const _historySearchFields = $state<{ value: string[] }>({ value: ['url'] });

export function historySearchRegex() { return _historySearchRegex.value; }
export function historySearchFields() { return _historySearchFields.value; }

// Statistics
const _historyStats = $state<{ value: HistoryStats | null }>({ value: null });
const _historyStatsLoading = $state<{ value: boolean }>({ value: false });
const _historyShowStats = $state<{ value: boolean }>({ value: false });

export function historyStats() { return _historyStats.value; }
export function historyStatsLoading() { return _historyStatsLoading.value; }
export function historyShowStats() { return _historyShowStats.value; }

export function setHistoryStats(stats: HistoryStats | null) {
  _historyStats.value = stats;
}

export function setHistoryStatsLoading(loading: boolean) {
  _historyStatsLoading.value = loading;
}

export function setHistoryShowStats(show: boolean) {
  _historyShowStats.value = show;
}

export function setHistoryCollectionFilter(filter: { collectionId: string; requestName: string } | null) {
  _historyCollectionFilter.value = filter;
}

export function setHistorySearchRegex(regex: boolean) {
  _historySearchRegex.value = regex;
}

export function setHistorySearchFields(fields: string[]) {
  _historySearchFields.value = fields;
}

export function setHistoryIsLoading(loading: boolean) {
  _historyIsLoading.value = loading;
}

export function setHistoryPendingAppend(pending: boolean) {
  _historyPendingAppend.value = pending;
}

export function setHistoryEntries(entries: HistoryIndexEntry[]) {
  _historyEntries.value = entries;
}

export function clearFilters() {
  _historySearchQuery.value = '';
  _historyMethodFilters.value = [];
  _historyCollectionFilter.value = null;
  _historySearchRegex.value = false;
  _historySearchFields.value = ['url'];
  _historySortBy.value = 'newest';
}
