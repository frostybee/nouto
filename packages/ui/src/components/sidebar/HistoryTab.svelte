<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import MethodBadge from '../shared/MethodBadge.svelte';
  import {
    historyEntries, historyTotal, historyHasMore, historySearchQuery,
    historyMethodFilters, historyIsLoading, groupedHistory, flatHistory,
    historyCollectionFilter, historySearchRegex, historySearchFields,
    historyShowStats, historyStatsLoading,
    initHistory, appendHistory, historyPendingAppend, setSearchQuery, toggleMethodFilter, clearFilters,
  } from '../../stores/history';
  import type { FlatHistoryItem } from '../../stores/history';
  import VirtualList from '../shared/VirtualList.svelte';
  import HistoryStatsView from '../shared/HistoryStats.svelte';
  import type { HistoryIndexEntry } from '@hivefetch/core/services';
  import type { HttpMethod } from '../../types';

  interface Props {
    postMessage: (msg: any) => void;
  }
  let { postMessage }: Props = $props();

  let searchInput = $state('');
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  let showContextMenu = $state(false);
  let contextMenuX = $state(0);
  let contextMenuY = $state(0);
  let contextEntry = $state<HistoryIndexEntry | null>(null);

  const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

  // Fetch on mount and re-fetch when collection filter changes
  $effect(() => {
    const _filter = $historyCollectionFilter;
    requestHistory();
  });

  onDestroy(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
  });

  function handleClearCollectionFilter() {
    historyCollectionFilter.set(null);
    requestHistory();
  }

  function handleSearchInput() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      setSearchQuery(searchInput);
      requestHistory();
    }, 300);
  }

  function handleToggleMethod(method: string) {
    toggleMethodFilter(method);
    requestHistory();
  }

  function requestHistory(offset?: number) {
    historyIsLoading.set(true);
    const query = get(historySearchQuery);
    const filterMethods = get(historyMethodFilters);
    const collFilter = get(historyCollectionFilter);
    const isRegex = get(historySearchRegex);
    const searchFields = get(historySearchFields);
    postMessage({
      type: 'getHistory',
      data: {
        query: query || undefined,
        methods: filterMethods.length > 0 ? filterMethods : undefined,
        collectionId: collFilter?.collectionId || undefined,
        isRegex: isRegex || undefined,
        searchFields: searchFields.length > 0 && searchFields.some(f => f !== 'url') ? searchFields : undefined,
        limit: 50,
        offset: offset || 0,
      },
    });
  }

  function handleLoadMore() {
    const current = get(historyEntries);
    historyPendingAppend.set(true);
    requestHistory(current.length);
  }

  function handleClick(entry: HistoryIndexEntry) {
    postMessage({ type: 'openHistoryEntry', data: { id: entry.id } });
  }

  function handleContextMenu(e: MouseEvent, entry: HistoryIndexEntry) {
    e.preventDefault();
    e.stopPropagation();
    showContextMenu = true;
    const menuWidth = 200;
    contextMenuX = Math.min(e.clientX, window.innerWidth - menuWidth);
    contextMenuY = e.clientY;
    contextEntry = entry;
  }

  function closeContextMenu() {
    showContextMenu = false;
    contextEntry = null;
  }

  function handleOpenEntry() {
    if (contextEntry) {
      postMessage({ type: 'openHistoryEntry', data: { id: contextEntry.id } });
    }
    closeContextMenu();
  }

  function handleCopyUrl() {
    if (contextEntry) {
      navigator.clipboard.writeText(contextEntry.url);
    }
    closeContextMenu();
  }

  function handleSaveToCollection() {
    if (contextEntry) {
      postMessage({ type: 'saveHistoryToCollection', data: { historyId: contextEntry.id } });
    }
    closeContextMenu();
  }

  function handleFindSimilar() {
    if (contextEntry) {
      historyIsLoading.set(true);
      postMessage({
        type: 'getHistory',
        data: { similarTo: contextEntry.id, limit: 50 },
      });
    }
    closeContextMenu();
  }

  function toggleRegex() {
    historySearchRegex.update(v => !v);
    if (get(historySearchQuery)) {
      requestHistory();
    }
  }

  function toggleSearchField(field: string) {
    historySearchFields.update(fields => {
      if (fields.includes(field)) {
        const next = fields.filter(f => f !== field);
        return next.length === 0 ? ['url'] : next;
      }
      return [...fields, field];
    });
    if (get(historySearchQuery)) {
      requestHistory();
    }
  }

  function handleDeleteEntry() {
    if (contextEntry) {
      postMessage({ type: 'deleteHistoryEntry', data: { id: contextEntry.id } });
    }
    closeContextMenu();
  }

  function handleClearAll() {
    postMessage({ type: 'clearHistory' });
  }

  function handleClearFilters() {
    searchInput = '';
    clearFilters();
    requestHistory();
  }

  function toggleStats() {
    historyShowStats.update(v => {
      const next = !v;
      if (next) {
        historyStatsLoading.set(true);
        postMessage({ type: 'getHistoryStats', data: { days: 30 } });
      }
      return next;
    });
  }

  function formatDuration(ms?: number): string {
    if (ms === undefined) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  function formatRelativeTime(timestamp: string): string {
    const diff = Date.now() - new Date(timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  }

  function getStatusClass(status?: number): string {
    if (!status || status === 0) return 'status-err';
    if (status < 300) return 'status-2xx';
    if (status < 400) return 'status-3xx';
    if (status < 500) return 'status-4xx';
    return 'status-5xx';
  }

  function extractPath(url: string): string {
    try {
      const u = new URL(url);
      return u.pathname + u.search;
    } catch {
      return url;
    }
  }
</script>

<svelte:window onclick={closeContextMenu} onkeydown={(e) => e.key === 'Escape' && closeContextMenu()} />

<div class="history-tab">
  <!-- Search -->
  <div class="search-bar">
    <input
      type="text"
      class="search-input"
      placeholder={$historySearchRegex ? 'Regex search...' : 'Search history...'}
      bind:value={searchInput}
      oninput={handleSearchInput}
    />
    <button
      class="search-option-btn"
      class:active={$historySearchRegex}
      onclick={toggleRegex}
      title="Toggle regex search"
    >.*</button>
    <button class="search-option-btn" onclick={() => postMessage({ type: 'exportHistory' })} title="Export history">
      <span class="codicon codicon-export"></span>
    </button>
    <button class="search-option-btn" onclick={() => postMessage({ type: 'importHistory' })} title="Import history">
      <span class="codicon codicon-import"></span>
    </button>
    <button class="search-option-btn" class:active={$historyShowStats} onclick={toggleStats} title="Statistics">
      <span class="codicon codicon-graph"></span>
    </button>
    {#if $historyTotal > 0}
      <button class="clear-all-btn" onclick={handleClearAll} title="Clear all history">
        <span class="codicon codicon-trash"></span>
      </button>
    {/if}
  </div>

  <!-- Search Scope -->
  <div class="search-scope">
    {#each [['url', 'URL'], ['headers', 'Headers'], ['responseBody', 'Body']] as [field, label]}
      <button
        class="scope-pill"
        class:active={$historySearchFields.includes(field)}
        onclick={() => toggleSearchField(field)}
      >
        {label}
      </button>
    {/each}
  </div>

  <!-- Method Filters -->
  <div class="method-filters">
    {#each methods as method}
      <button
        class="method-pill"
        class:active={$historyMethodFilters.includes(method)}
        onclick={() => handleToggleMethod(method)}
      >
        {method}
      </button>
    {/each}
    {#if $historySearchQuery || $historyMethodFilters.length > 0}
      <button class="clear-filters" onclick={handleClearFilters} title="Clear filters">
        <span class="codicon codicon-close"></span>
      </button>
    {/if}
  </div>

  <!-- Collection Filter Badge -->
  {#if $historyCollectionFilter}
    <div class="collection-filter-badge">
      <span class="codicon codicon-filter"></span>
      <span class="filter-label">Filtered: {$historyCollectionFilter.requestName}</span>
      <button class="filter-clear" onclick={handleClearCollectionFilter} title="Clear filter">
        <span class="codicon codicon-close"></span>
      </button>
    </div>
  {/if}

  <!-- Stats view or List -->
  {#if $historyShowStats}
    <div class="history-list">
      <HistoryStatsView />
    </div>
  {:else}
    <div class="history-list">
      {#if $historyIsLoading && $historyEntries.length === 0}
        <div class="empty-state">Loading...</div>
      {:else if $historyEntries.length === 0}
        <div class="empty-state">
          {#if $historySearchQuery || $historyMethodFilters.length > 0}
            No matching history entries.
          {:else}
            No history yet. Send a request to get started.
          {/if}
        </div>
      {:else}
        <VirtualList
          items={$flatHistory}
          itemHeight={36}
          hasMore={$historyHasMore}
          onLoadMore={handleLoadMore}
        >
          {#snippet children(item: FlatHistoryItem, _index: number)}
            {#if item.type === 'header'}
              <div class="date-label" style="height: 36px; line-height: 36px;">{item.label}</div>
            {:else}
              <div
                class="history-item"
                style="height: 36px;"
                oncontextmenu={(e) => handleContextMenu(e, item.entry)}
              >
                <MethodBadge method={item.entry.method as HttpMethod} />
                <div class="entry-info">
                  <span class="entry-url" title={item.entry.url}>{extractPath(item.entry.url)}</span>
                </div>
                <div class="entry-meta">
                  {#if item.entry.responseStatus}
                    <span class="status-badge {getStatusClass(item.entry.responseStatus)}">{item.entry.responseStatus}</span>
                  {/if}
                  {#if item.entry.responseDuration !== undefined}
                    <span class="entry-duration">{formatDuration(item.entry.responseDuration)}</span>
                  {/if}
                  <span class="entry-time">{formatRelativeTime(item.entry.timestamp)}</span>
                </div>
              </div>
            {/if}
          {/snippet}
        </VirtualList>
      {/if}
    </div>
  {/if}
</div>

{#if showContextMenu}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="context-menu"
    style="left: {contextMenuX}px; top: {contextMenuY}px"
    role="menu"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.key === 'Escape' && closeContextMenu()}
  >
    <button class="context-item" role="menuitem" onclick={handleOpenEntry}>
      <span class="context-icon codicon codicon-link-external"></span>
      Open in New Tab
    </button>
    <button class="context-item" role="menuitem" onclick={handleCopyUrl}>
      <span class="context-icon codicon codicon-copy"></span>
      Copy URL
    </button>
    <button class="context-item" role="menuitem" onclick={handleSaveToCollection}>
      <span class="context-icon codicon codicon-save"></span>
      Save to Collection
    </button>
    <button class="context-item" role="menuitem" onclick={handleFindSimilar}>
      <span class="context-icon codicon codicon-search"></span>
      Find Similar
    </button>
    <div class="context-divider"></div>
    <button class="context-item danger" role="menuitem" onclick={handleDeleteEntry}>
      <span class="context-icon codicon codicon-trash"></span>
      Delete
    </button>
  </div>
{/if}

<style>
  .history-tab {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .search-option-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 3px 5px;
    background: none;
    border: 1px solid transparent;
    color: var(--hf-descriptionForeground);
    cursor: pointer;
    border-radius: 3px;
    font-size: 11px;
    font-weight: 700;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    opacity: 0.6;
  }

  .search-option-btn:hover {
    opacity: 1;
    background: var(--hf-list-hoverBackground);
  }

  .search-option-btn.active {
    opacity: 1;
    color: var(--hf-button-foreground);
    background: var(--hf-button-background);
    border-color: var(--hf-focusBorder);
  }

  .search-scope {
    display: flex;
    gap: 3px;
    padding: 0 10px 4px;
    flex-shrink: 0;
  }

  .scope-pill {
    padding: 1px 5px;
    font-size: 9px;
    font-weight: 600;
    background: var(--hf-badge-background);
    color: var(--hf-descriptionForeground);
    border: 1px solid transparent;
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.1s;
  }

  .scope-pill:hover {
    background: var(--hf-list-hoverBackground);
    color: var(--hf-foreground);
  }

  .scope-pill.active {
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
    border-color: var(--hf-focusBorder);
  }

  .collection-filter-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    margin: 0 10px 4px;
    background: var(--hf-badge-background);
    border-radius: 4px;
    font-size: 11px;
    color: var(--hf-badge-foreground);
    flex-shrink: 0;
  }

  .filter-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .filter-clear {
    display: flex;
    align-items: center;
    padding: 1px;
    background: none;
    border: none;
    color: var(--hf-badge-foreground);
    cursor: pointer;
    font-size: 10px;
    border-radius: 2px;
    opacity: 0.7;
  }

  .filter-clear:hover {
    opacity: 1;
    background: var(--hf-list-hoverBackground);
  }

  .search-bar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 10px 4px;
    flex-shrink: 0;
  }

  .search-input {
    flex: 1;
    padding: 5px 8px;
    font-size: 12px;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 4px;
    outline: none;
  }

  .search-input:focus {
    border-color: var(--hf-focusBorder);
  }

  .search-input::placeholder {
    color: var(--hf-input-placeholderForeground, var(--hf-descriptionForeground));
  }

  .clear-all-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    background: none;
    border: none;
    color: var(--hf-descriptionForeground);
    cursor: pointer;
    border-radius: 3px;
    font-size: 12px;
  }

  .clear-all-btn:hover {
    color: var(--hf-errorForeground);
    background: var(--hf-list-hoverBackground);
  }

  .method-filters {
    display: flex;
    gap: 3px;
    padding: 4px 10px 6px;
    flex-wrap: wrap;
    flex-shrink: 0;
    align-items: center;
  }

  .method-pill {
    padding: 2px 6px;
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    background: var(--hf-badge-background);
    color: var(--hf-descriptionForeground);
    border: 1px solid transparent;
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.1s;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  }

  .method-pill:hover {
    background: var(--hf-list-hoverBackground);
    color: var(--hf-foreground);
  }

  .method-pill.active {
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
    border-color: var(--hf-focusBorder);
  }

  .clear-filters {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2px;
    background: none;
    border: none;
    color: var(--hf-descriptionForeground);
    cursor: pointer;
    font-size: 10px;
    border-radius: 3px;
  }

  .clear-filters:hover {
    color: var(--hf-foreground);
    background: var(--hf-list-hoverBackground);
  }

  .history-list {
    flex: 1;
    overflow-y: auto;
    padding: 0 4px;
  }

  .date-group {
    margin-bottom: 4px;
  }

  .date-label {
    padding: 6px 8px 3px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--hf-descriptionForeground);
    opacity: 0.8;
  }

  .history-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.1s;
  }

  .history-item:hover {
    background: var(--hf-list-hoverBackground);
  }

  .entry-info {
    flex: 1;
    min-width: 0;
  }

  .entry-url {
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
    color: var(--hf-foreground);
  }

  .entry-meta {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .status-badge {
    font-size: 10px;
    font-weight: 600;
    padding: 1px 4px;
    border-radius: 3px;
  }

  .status-badge.status-2xx {
    background: #2ea04360;
    color: #3fb950;
  }

  .status-badge.status-3xx {
    background: #d29922a0;
    color: #d29922;
  }

  .status-badge.status-4xx {
    background: #f8514960;
    color: #f85149;
  }

  .status-badge.status-5xx {
    background: #f8514960;
    color: #f85149;
  }

  .status-badge.status-err {
    background: #f8514940;
    color: #f85149;
  }

  .entry-duration {
    font-size: 10px;
    color: var(--hf-descriptionForeground);
    white-space: nowrap;
  }

  .entry-time {
    font-size: 10px;
    color: var(--hf-descriptionForeground);
    opacity: 0.7;
    white-space: nowrap;
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px 16px;
    color: var(--hf-descriptionForeground);
    font-size: 12px;
    text-align: center;
  }

  .load-more-btn {
    display: block;
    width: 100%;
    padding: 8px;
    margin: 4px 0 8px;
    background: var(--hf-button-secondaryBackground, var(--hf-badge-background));
    color: var(--hf-button-secondaryForeground, var(--hf-foreground));
    border: none;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.1s;
  }

  .load-more-btn:hover:not(:disabled) {
    background: var(--hf-button-secondaryHoverBackground, var(--hf-list-hoverBackground));
  }

  .load-more-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Context Menu */
  .context-menu {
    position: fixed;
    z-index: 1000;
    min-width: 140px;
    background: var(--hf-menu-background);
    border: 1px solid var(--hf-menu-border, var(--hf-panel-border));
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    padding: 4px 0;
  }

  .context-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 12px;
    background: none;
    border: none;
    color: var(--hf-menu-foreground);
    font-size: 13px;
    text-align: left;
    cursor: pointer;
  }

  .context-item:hover {
    background: var(--hf-menu-selectionBackground);
    color: var(--hf-menu-selectionForeground);
  }

  .context-item.danger {
    color: var(--hf-errorForeground);
  }

  .context-icon {
    font-size: 12px;
    width: 16px;
    text-align: center;
  }

  .context-divider {
    height: 1px;
    margin: 4px 0;
    background: var(--hf-menu-separatorBackground, var(--hf-panel-border));
  }
</style>
