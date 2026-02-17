import { writable, derived, get } from 'svelte/store';
import type { SearchResult, SearchableRequest } from '../lib/palette/search';
import type { PaletteAction } from '../lib/palette/actions';
import { fuzzySearch, getAllRequests, initSearchEngine } from '../lib/palette/search';
import { PALETTE_ACTIONS, searchActions } from '../lib/palette/actions';
import { collections } from './collections';
import { topRequests } from './frecency';

// ─── Types ───

export type PaletteResultType = 'action' | 'request' | 'recent';

export interface PaletteResult {
  type: PaletteResultType;
  id: string;
  action?: PaletteAction;
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

// ─── Store ───

function createPaletteStore() {
  const { subscribe, set, update } = writable<PaletteState>({
    open: false,
    query: '',
    selectedIndex: 0,
    results: [],
    showingRecent: false,
  });

  // Initialize search engine with collections
  const unsubscribe = collections.subscribe($collections => {
    if ($collections.length > 0) {
      initSearchEngine($collections);
    }
  });

  return {
    subscribe,

    /**
     * Initialize with manual collections data (for modal mode)
     */
    initialize(collectionsData: any[], environmentsData?: any): void {
      if (collectionsData.length > 0) {
        initSearchEngine(collectionsData);
      }
    },

    /**
     * Open the command palette
     */
    open(): void {
      update(state => {
        // Build recent results when opening
        const recentRequestIds = get(topRequests).slice(0, 5);
        const allRequests = getAllRequests();
        const recentResults: PaletteResult[] = recentRequestIds
          .map(id => {
            const request = allRequests.find(r => r.id === id);
            return request ? {
              type: 'recent' as const,
              id: request.id,
              request,
            } : null;
          })
          .filter((r): r is PaletteResult => r !== null);

        // Show actions by default
        const actionResults: PaletteResult[] = PALETTE_ACTIONS.slice(0, 10).map(action => ({
          type: 'action' as const,
          id: action.id,
          action,
        }));

        return {
          ...state,
          open: true,
          query: '',
          selectedIndex: 0,
          results: [...actionResults, ...recentResults],
          showingRecent: true,
        };
      });
    },

    /**
     * Close the command palette
     */
    close(): void {
      update(state => ({
        ...state,
        open: false,
        query: '',
        selectedIndex: 0,
        results: [],
        showingRecent: false,
      }));
    },

    /**
     * Update search query and filter results
     */
    setQuery(query: string): void {
      update(state => {
        // Empty query - show recent and actions
        if (!query.trim()) {
          const recentRequestIds = get(topRequests).slice(0, 5);
          const allRequests = getAllRequests();
          const recentResults: PaletteResult[] = recentRequestIds
            .map(id => {
              const request = allRequests.find(r => r.id === id);
              return request ? {
                type: 'recent' as const,
                id: request.id,
                request,
              } : null;
            })
            .filter((r): r is PaletteResult => r !== null);

          const actionResults: PaletteResult[] = PALETTE_ACTIONS.slice(0, 10).map(action => ({
            type: 'action' as const,
            id: action.id,
            action,
          }));

          return {
            ...state,
            query,
            selectedIndex: 0,
            results: [...actionResults, ...recentResults],
            showingRecent: true,
          };
        }

        // Query starts with ">" - show actions only
        if (query.startsWith('>')) {
          const actionQuery = query.slice(1).trim();
          const matchedActions = actionQuery
            ? searchActions(actionQuery)
            : PALETTE_ACTIONS;

          const actionResults: PaletteResult[] = matchedActions.map(action => ({
            type: 'action' as const,
            id: action.id,
            action,
          }));

          return {
            ...state,
            query,
            selectedIndex: 0,
            results: actionResults,
            showingRecent: false,
          };
        }

        // Regular search - show requests
        const searchResults = fuzzySearch(query);
        const requestResults: PaletteResult[] = searchResults.map(result => ({
          type: 'request' as const,
          id: result.item.id,
          request: result.item,
          searchResult: result,
        }));

        return {
          ...state,
          query,
          selectedIndex: 0,
          results: requestResults,
          showingRecent: false,
        };
      });
    },

    /**
     * Move selection up (previous item)
     */
    selectPrevious(): void {
      update(state => ({
        ...state,
        selectedIndex: Math.max(0, state.selectedIndex - 1),
      }));
    },

    /**
     * Move selection down (next item)
     */
    selectNext(): void {
      update(state => ({
        ...state,
        selectedIndex: Math.min(state.results.length - 1, state.selectedIndex + 1),
      }));
    },

    /**
     * Set selected index directly
     */
    setSelectedIndex(index: number): void {
      update(state => ({
        ...state,
        selectedIndex: Math.max(0, Math.min(index, state.results.length - 1)),
      }));
    },

    /**
     * Get currently selected result
     */
    getSelected(): PaletteResult | null {
      const state = get({ subscribe });
      return state.results[state.selectedIndex] || null;
    },

    /**
     * Toggle palette open/closed
     */
    toggle(): void {
      const state = get({ subscribe });
      if (state.open) {
        this.close();
      } else {
        this.open();
      }
    },
  };
}

export const palette = createPaletteStore();

// ─── Derived Stores ───

/**
 * Whether palette is currently open
 */
export const paletteOpen = derived(palette, $palette => $palette.open);

/**
 * Current search query
 */
export const paletteQuery = derived(palette, $palette => $palette.query);

/**
 * Current results grouped by type
 */
export const paletteResultsByType = derived(palette, $palette => {
  const grouped: Record<PaletteResultType, PaletteResult[]> = {
    action: [],
    request: [],
    recent: [],
  };

  for (const result of $palette.results) {
    grouped[result.type].push(result);
  }

  return grouped;
});

/**
 * Whether showing recent results (empty query)
 */
export const showingRecent = derived(palette, $palette => $palette.showingRecent);
