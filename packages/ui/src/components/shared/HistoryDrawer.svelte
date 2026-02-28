<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import MethodBadge from './MethodBadge.svelte';
  import HistoryStatsView from './HistoryStats.svelte';
  import {
    historyEntries, historyTotal, historyHasMore, historySearchQuery,
    historyMethodFilters, historyIsLoading, groupedHistory,
    historySearchRegex, historySearchFields,
    historyShowStats, historyStatsLoading, historyStats,
    initHistory, appendHistory, setSearchQuery, toggleMethodFilter, clearFilters,
  } from '../../stores/history';
  import { ui, toggleHistoryDrawer, setHistoryDrawerHeight } from '../../stores/ui';
  import type { HistoryIndexEntry } from '@hivefetch/core/services';
  import type { HttpMethod } from '../../types';

  interface Props {
    postMessage: (msg: any) => void;
  }
  let { postMessage }: Props = $props();

  const drawerOpen = $derived($ui.historyDrawerOpen);
  const drawerHeight = $derived($ui.historyDrawerHeight);

  let searchInput = $state('');
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let isDragging = $state(false);
  let drawerEl: HTMLDivElement;
  let dataLoaded = $state(false);

  let showContextMenu = $state(false);
  let contextMenuX = $state(0);
  let contextMenuY = $state(0);
  let contextEntry = $state<HistoryIndexEntry | null>(null);

  const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

  // Load history data when drawer first opens
  $effect(() => {
    if (drawerOpen && !dataLoaded) {
      requestHistory();
      dataLoaded = true;
    }
  });

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
    const isRegex = get(historySearchRegex);
    const searchFields = get(historySearchFields);
    postMessage({
      type: 'getHistory',
      data: {
        query: query || undefined,
        methods: filterMethods.length > 0 ? filterMethods : undefined,
        isRegex: isRegex || undefined,
        searchFields: searchFields.length > 0 && searchFields.some(f => f !== 'url') ? searchFields : undefined,
        limit: 50,
        offset: offset || 0,
      },
    });
  }

  function handleLoadMore() {
    const current = get(historyEntries);
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

  // Drag-to-resize
  function startResize(e: MouseEvent) {
    e.preventDefault();
    isDragging = true;
    document.body.classList.add('splitter-dragging');
    document.body.style.cursor = 'row-resize';

    const parentEl = drawerEl.parentElement!;

    function handleMouseMove(e: MouseEvent) {
      const parentRect = parentEl.getBoundingClientRect();
      const newHeight = parentRect.bottom - e.clientY;
      const maxHeight = parentRect.height * 0.6;
      setHistoryDrawerHeight(Math.min(newHeight, maxHeight));
    }

    function handleMouseUp() {
      isDragging = false;
      document.body.classList.remove('splitter-dragging');
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }

  function handleDoubleClick() {
    if (!drawerOpen) {
      toggleHistoryDrawer();
      return;
    }
    // Toggle between collapsed and 40% of parent height
    const parentEl = drawerEl.parentElement;
    if (parentEl) {
      const targetHeight = parentEl.getBoundingClientRect().height * 0.4;
      setHistoryDrawerHeight(targetHeight);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && drawerOpen) {
      toggleHistoryDrawer();
    }
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

  onDestroy(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
  });
</script>

<svelte:window onclick={closeContextMenu} />

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="history-drawer" class:open={drawerOpen} bind:this={drawerEl} onkeydown={handleKeydown} role="region" aria-label="History drawer">
  <!-- Drag handle / collapsed bar -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="drawer-handle"
    class:dragging={isDragging}
    onmousedown={startResize}
    ondblclick={handleDoubleClick}
    role="separator"
    tabindex="0"
    aria-orientation="horizontal"
  >
    <div class="handle-grip"></div>
    <span class="drawer-title">
      <i class="codicon codicon-history"></i>
      History{#if $historyTotal > 0} ({$historyTotal}){/if}
    </span>
    <button class="drawer-handle-btn" onclick={(e) => { e.stopPropagation(); toggleStats(); }} title="Statistics" aria-label="Toggle statistics">
      <i class="codicon codicon-graph" class:active={$historyShowStats}></i>
    </button>
    <button class="drawer-toggle" onclick={(e) => { e.stopPropagation(); toggleHistoryDrawer(); }} aria-label={drawerOpen ? 'Collapse history' : 'Expand history'}>
      <i class="codicon codicon-chevron-{drawerOpen ? 'down' : 'up'}"></i>
    </button>
  </div>

  <!-- Drawer content -->
  {#if drawerOpen}
    <div class="drawer-content" style="height: {drawerHeight}px">
      <!-- Toolbar: search + filters + clear -->
      <div class="drawer-toolbar">
        <input
          type="text"
          class="search-input"
          placeholder="Search history..."
          bind:value={searchInput}
          oninput={handleSearchInput}
        />
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
              <i class="codicon codicon-close"></i>
            </button>
          {/if}
        </div>
        <button class="toolbar-icon-btn" onclick={() => postMessage({ type: 'exportHistory' })} title="Export history">
          <i class="codicon codicon-export"></i>
        </button>
        <button class="toolbar-icon-btn" onclick={() => postMessage({ type: 'importHistory' })} title="Import history">
          <i class="codicon codicon-import"></i>
        </button>
        {#if $historyTotal > 0}
          <button class="clear-all-btn" onclick={handleClearAll} title="Clear all history">
            <i class="codicon codicon-trash"></i>
          </button>
        {/if}
      </div>

      <!-- Stats view or History table -->
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
            {#each $groupedHistory as group}
              <div class="date-group">
                <div class="date-label">{group.label}</div>
                {#each group.entries as entry}
                  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                  <div
                    class="history-row"
                    onclick={() => handleClick(entry)}
                    oncontextmenu={(e) => handleContextMenu(e, entry)}
                    role="button"
                    tabindex="0"
                    onkeydown={(e) => e.key === 'Enter' && handleClick(entry)}
                  >
                    <span class="row-method">
                      <MethodBadge method={entry.method as HttpMethod} />
                    </span>
                    <span class="row-url" title={entry.url}>{extractPath(entry.url)}</span>
                    <span class="row-status">
                      {#if entry.responseStatus}
                        <span class="status-badge {getStatusClass(entry.responseStatus)}">{entry.responseStatus}</span>
                      {/if}
                    </span>
                    <span class="row-duration">{formatDuration(entry.responseDuration)}</span>
                    <span class="row-time">{formatRelativeTime(entry.timestamp)}</span>
                  </div>
                {/each}
              </div>
            {/each}

            {#if $historyHasMore}
              <button class="load-more-btn" onclick={handleLoadMore} disabled={$historyIsLoading}>
                {$historyIsLoading ? 'Loading...' : 'Load More'}
              </button>
            {/if}
          {/if}
        </div>
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
      Open
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
  .history-drawer {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--hf-panel-border);
  }

  /* Drag handle */
  .drawer-handle {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    height: 28px;
    min-height: 28px;
    background: var(--hf-editor-background);
    cursor: row-resize;
    user-select: none;
    flex-shrink: 0;
  }

  .drawer-handle:hover,
  .drawer-handle.dragging {
    background: var(--hf-list-hoverBackground);
  }

  .handle-grip {
    width: 32px;
    height: 2px;
    border-radius: 1px;
    background: var(--hf-scrollbarSlider-background);
    flex-shrink: 0;
  }

  .drawer-handle:hover .handle-grip,
  .drawer-handle.dragging .handle-grip {
    background: var(--hf-scrollbarSlider-hoverBackground);
  }

  .drawer-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    color: var(--hf-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    flex: 1;
    pointer-events: none;
  }

  .drawer-title .codicon {
    font-size: 13px;
  }

  .drawer-handle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2px;
    background: none;
    border: none;
    color: var(--hf-descriptionForeground);
    cursor: pointer;
    border-radius: 3px;
    font-size: 13px;
  }

  .drawer-handle-btn:hover {
    color: var(--hf-foreground);
    background: var(--hf-list-hoverBackground);
  }

  .drawer-handle-btn .active {
    color: var(--hf-button-background);
  }

  .drawer-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2px;
    background: none;
    border: none;
    color: var(--hf-descriptionForeground);
    cursor: pointer;
    border-radius: 3px;
    font-size: 14px;
  }

  .drawer-toggle:hover {
    color: var(--hf-foreground);
    background: var(--hf-list-hoverBackground);
  }

  /* Drawer content */
  .drawer-content {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
  }

  /* Toolbar */
  .drawer-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    flex-shrink: 0;
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .search-input {
    width: 200px;
    max-width: 30%;
    padding: 4px 8px;
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

  .method-filters {
    display: flex;
    gap: 3px;
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

  .toolbar-icon-btn {
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

  .toolbar-icon-btn:hover {
    color: var(--hf-foreground);
    background: var(--hf-list-hoverBackground);
  }

  .clear-all-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    margin-left: auto;
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

  /* History list */
  .history-list {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .date-group {
    margin-bottom: 2px;
  }

  .date-label {
    padding: 6px 12px 3px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--hf-descriptionForeground);
    opacity: 0.8;
    position: sticky;
    top: 0;
    background: var(--hf-editor-background);
    z-index: 1;
  }

  /* Table-style rows */
  .history-row {
    display: grid;
    grid-template-columns: 56px 1fr 52px 60px 36px;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    cursor: pointer;
    transition: background 0.1s;
    min-height: 28px;
  }

  .history-row:hover {
    background: var(--hf-list-hoverBackground);
  }

  .row-method {
    display: flex;
    align-items: center;
    justify-content: flex-start;
  }

  .row-url {
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--hf-foreground);
  }

  .row-status {
    display: flex;
    justify-content: center;
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

  .row-duration {
    font-size: 10px;
    color: var(--hf-descriptionForeground);
    white-space: nowrap;
    text-align: right;
  }

  .row-time {
    font-size: 10px;
    color: var(--hf-descriptionForeground);
    opacity: 0.7;
    white-space: nowrap;
    text-align: right;
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
    color: var(--hf-descriptionForeground);
    font-size: 12px;
    text-align: center;
  }

  .load-more-btn {
    display: block;
    width: calc(100% - 24px);
    padding: 6px;
    margin: 4px 12px 8px;
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
