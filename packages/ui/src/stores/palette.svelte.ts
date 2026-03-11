import type { SearchResult, SearchableRequest } from '../lib/palette/search';
import { fuzzySearch, getAllRequests as getAllSearchableRequests, initSearchEngine } from '../lib/palette/search';
import { collections } from './collections.svelte';
import { topRequests } from './frecency.svelte';

// ─── Types ───

export type PaletteResultType = 'request' | 'recent';

export interface PaletteResult {
  type: PaletteResultType;
  id: string;
  request?: SearchableRequest;
  searchResult?: SearchResult;
}

export interface PaletteState {
  open: boolean;
  query: string;
  selectedIndex: number;
  results: PaletteResult[];
  showingRecent: boolean;
}

// ─── State ───

const _palette = $state<{ value: PaletteState }>({
  value: {
    open: false,
    query: '',
    selectedIndex: 0,
    results: [],
    showingRecent: false,
  },
});

export function palette() { return _palette.value; }
export function paletteOpen() { return _palette.value.open; }
export function paletteQuery() { return _palette.value.query; }
export function showingRecent() { return _palette.value.showingRecent; }

export function paletteResultsByType() {
  const grouped: Record<PaletteResultType, PaletteResult[]> = {
    request: [],
    recent: [],
  };

  for (const result of _palette.value.results) {
    grouped[result.type].push(result);
  }

  return grouped;
}

// ─── Initialization ───

/**
 * Initialize search engine with collections data.
 * Called when collections are loaded or updated.
 */
export function initPaletteSearch(collectionsData?: any[]): void {
  const cols = collectionsData || collections();
  if (cols.length > 0) {
    initSearchEngine(cols);
  }
}

// ─── Helpers ───

/**
 * Build recent results from frecency data
 */
function buildRecentResults(): PaletteResult[] {
  const recentRequestIds = topRequests().slice(0, 5);
  const allRequests = getAllSearchableRequests();
  return recentRequestIds
    .map(id => {
      const request = allRequests.find(r => r.id === id);
      return request ? {
        type: 'recent' as const,
        id: request.id,
        request,
      } : null;
    })
    .filter((r): r is PaletteResult => r !== null);
}

// ─── Actions ───

/**
 * Open the palette
 */
export function openPalette(): void {
  _palette.value = {
    open: true,
    query: '',
    selectedIndex: 0,
    results: buildRecentResults(),
    showingRecent: true,
  };
}

/**
 * Close the palette
 */
export function closePalette(): void {
  _palette.value = {
    open: false,
    query: '',
    selectedIndex: 0,
    results: [],
    showingRecent: false,
  };
}

/**
 * Update search query and filter results
 */
export function setPaletteQuery(query: string): void {
  // Empty query - show recent requests
  if (!query.trim()) {
    _palette.value = {
      ..._palette.value,
      query,
      selectedIndex: 0,
      results: buildRecentResults(),
      showingRecent: true,
    };
    return;
  }

  // Search requests
  const searchResults = fuzzySearch(query);
  const requestResults: PaletteResult[] = searchResults.map(result => ({
    type: 'request' as const,
    id: result.item.id,
    request: result.item,
    searchResult: result,
  }));

  _palette.value = {
    ..._palette.value,
    query,
    selectedIndex: 0,
    results: requestResults,
    showingRecent: false,
  };
}

/**
 * Move selection up (previous item)
 */
export function selectPrevious(): void {
  _palette.value = {
    ..._palette.value,
    selectedIndex: Math.max(0, _palette.value.selectedIndex - 1),
  };
}

/**
 * Move selection down (next item)
 */
export function selectNext(): void {
  _palette.value = {
    ..._palette.value,
    selectedIndex: Math.min(_palette.value.results.length - 1, _palette.value.selectedIndex + 1),
  };
}

/**
 * Set selected index directly
 */
export function setSelectedIndex(index: number): void {
  _palette.value = {
    ..._palette.value,
    selectedIndex: Math.max(0, Math.min(index, _palette.value.results.length - 1)),
  };
}

/**
 * Get currently selected result
 */
export function getSelected(): PaletteResult | null {
  return _palette.value.results[_palette.value.selectedIndex] || null;
}

/**
 * Toggle palette open/closed
 */
export function togglePalette(): void {
  if (_palette.value.open) {
    closePalette();
  } else {
    openPalette();
  }
}
