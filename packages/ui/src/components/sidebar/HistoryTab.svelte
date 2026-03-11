<script lang="ts">
  import { onDestroy } from 'svelte';
  import MethodBadge from '../shared/MethodBadge.svelte';
  import Tooltip from '../shared/Tooltip.svelte';
  import {
    historyEntries, historyTotal, historyHasMore, historySearchQuery,
    historyMethodFilters, historyIsLoading, groupedHistory, flatHistory,
    historyCollectionFilter, historySearchRegex, historySearchFields,
    historyShowStats, historyStatsLoading,
    initHistory, appendHistory, historyPendingAppend, setSearchQuery, toggleMethodFilter, clearFilters,
    setHistoryIsLoading, setHistoryPendingAppend, setHistoryCollectionFilter,
    setHistorySearchRegex, setHistorySearchFields, setHistoryShowStats, setHistoryStatsLoading,
  } from '../../stores/history.svelte';
  import type { FlatHistoryItem } from '../../stores/history.svelte';
  import VirtualList from '../shared/VirtualList.svelte';
  import HistoryStatsView from '../shared/HistoryStats.svelte';
  import ConfirmDialog from '../shared/ConfirmDialog.svelte';
  import type { HistoryIndexEntry } from '@hivefetch/core/services';
  import { extractPathname, getBaseUrl } from '@hivefetch/core';
  import type { HttpMethod } from '../../types';
  import { substituteVariables } from '../../stores/environment.svelte';

  interface Props {
    postMessage: (msg: any) => void;
  }
  let { postMessage }: Props = $props();

  let searchInput = $state('');
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  let showConfirmClear = $state(false);
  let showImportMenu = $state(false);
  let showMoreMenu = $state(false);

  let showContextMenu = $state(false);
  let contextMenuX = $state(0);
  let contextMenuY = $state(0);
  let contextEntry = $state<HistoryIndexEntry | null>(null);

  $effect(() => {
    const close = () => { showContextMenu = false; };
    window.addEventListener('close-context-menus', close);
    return () => window.removeEventListener('close-context-menus', close);
  });

  const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

  const methodPillColors: Record<string, { color: string; bg: string }> = {
    GET:    { color: '#61affe', bg: 'rgba(97, 175, 254, 0.12)' },
    POST:   { color: '#49cc90', bg: 'rgba(73, 204, 144, 0.12)' },
    PUT:    { color: '#fca130', bg: 'rgba(252, 161, 48, 0.12)' },
    PATCH:  { color: '#50e3c2', bg: 'rgba(80, 227, 194, 0.12)' },
    DELETE: { color: '#f93e3e', bg: 'rgba(249, 62, 62, 0.12)' },
  };

  const searchFieldOptions: [string, string, string][] = [
    ['url', 'URL', 'codicon-link'],
    ['headers', 'Headers', 'codicon-list-flat'],
    ['responseBody', 'Body', 'codicon-json'],
  ];

  // Fetch on mount and re-fetch when collection filter changes
  $effect(() => {
    const _filter = historyCollectionFilter();
    requestHistory();
  });

  onDestroy(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
  });

  function handleClearCollectionFilter() {
    setHistoryCollectionFilter(null);
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
    setHistoryIsLoading(true);
    postMessage({
      type: 'getHistory',
      data: {
        query: historySearchQuery() || undefined,
        methods: historyMethodFilters().length > 0 ? [...historyMethodFilters()] : undefined,
        collectionId: historyCollectionFilter()?.collectionId || undefined,
        isRegex: historySearchRegex() || undefined,
        searchFields: historySearchFields().length > 0 && historySearchFields().some(f => f !== 'url') ? [...historySearchFields()] : undefined,
        limit: 50,
        offset: offset || 0,
      },
    });
  }

  function handleLoadMore() {
    setHistoryPendingAppend(true);
    requestHistory(historyEntries().length);
  }

  function handleClick(entry: HistoryIndexEntry) {
    postMessage({ type: 'openHistoryEntry', data: { id: entry.id } });
  }

  function handleContextMenu(e: MouseEvent, entry: HistoryIndexEntry) {
    e.preventDefault();
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('close-context-menus'));
    showContextMenu = true;
    const menuWidth = 200;
    const menuHeight = 200;
    contextMenuX = Math.min(e.clientX, window.innerWidth - menuWidth);
    contextMenuY = Math.min(e.clientY, window.innerHeight - menuHeight);
    contextEntry = entry;
  }

  function closeContextMenu() {
    showContextMenu = false;
    contextEntry = null;
  }

  function closeAllMenus() {
    closeContextMenu();
    showImportMenu = false;
    showMoreMenu = false;
  }

  function handleOpenEntry() {
    if (contextEntry) {
      postMessage({ type: 'openHistoryEntry', data: { id: contextEntry.id } });
    }
    closeContextMenu();
  }

  function handleCopyUrl() {
    if (contextEntry) {
      navigator.clipboard.writeText(substituteVariables(contextEntry.url));
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
      setHistoryIsLoading(true);
      postMessage({
        type: 'getHistory',
        data: { similarTo: contextEntry.id, limit: 50 },
      });
    }
    closeContextMenu();
  }

  function toggleRegex() {
    setHistorySearchRegex(!historySearchRegex());
    if (historySearchQuery()) {
      requestHistory();
    }
  }

  function toggleSearchField(field: string) {
    const fields = historySearchFields();
    if (fields.includes(field)) {
      const next = fields.filter(f => f !== field);
      setHistorySearchFields(next.length === 0 ? ['url'] : next);
    } else {
      setHistorySearchFields([...fields, field]);
    }
    if (historySearchQuery()) {
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
    showMoreMenu = false;
    showConfirmClear = true;
  }

  function confirmClearAll() {
    showConfirmClear = false;
    postMessage({ type: 'clearHistory' });
  }

  function handleClearFilters() {
    searchInput = '';
    clearFilters();
    requestHistory();
  }

  function handleToggleStats() {
    showMoreMenu = false;
    const next = !historyShowStats();
    setHistoryShowStats(next);
    if (next) {
      setHistoryStatsLoading(true);
      postMessage({ type: 'getHistoryStats', data: { days: 30 } });
    }
  }

  function toggleImportMenu(e: MouseEvent) {
    e.stopPropagation();
    showImportMenu = !showImportMenu;
    showMoreMenu = false;
  }

  function toggleMoreMenu(e: MouseEvent) {
    e.stopPropagation();
    showMoreMenu = !showMoreMenu;
    showImportMenu = false;
  }

  function handleExportHistory() {
    showImportMenu = false;
    postMessage({ type: 'exportHistory' });
  }

  function handleImportHistory() {
    showImportMenu = false;
    postMessage({ type: 'importHistory' });
  }

  function formatDuration(ms?: number): string {
    if (ms === undefined) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

function getStatusClass(status?: number): string {
    if (!status || status === 0) return 'status-err';
    if (status < 300) return 'status-2xx';
    if (status < 400) return 'status-3xx';
    if (status < 500) return 'status-4xx';
    return 'status-5xx';
  }

  function extractPath(url: string): string {
    // Use extractPathname to avoid URL parser encoding {param} to %7Bparam%7D
    const pathname = extractPathname(url);
    // Append query string if present
    const qIndex = url.indexOf('?');
    if (qIndex !== -1) {
      const hashIndex = url.indexOf('#', qIndex);
      const search = hashIndex !== -1 ? url.substring(qIndex, hashIndex) : url.substring(qIndex);
      return pathname + search;
    }
    return pathname;
  }
</script>

<svelte:window onclick={closeAllMenus} onkeydown={(e) => e.key === 'Escape' && closeAllMenus()} />

<div class="history-tab">
  <!-- Toolbar -->
  <div class="toolbar">
    <div class="search-wrapper">
      <span class="search-icon codicon codicon-search"></span>
      <input
        type="text"
        class="search-input"
        placeholder={historySearchRegex() ? 'Regex search...' : 'Search history...'}
        bind:value={searchInput}
        oninput={handleSearchInput}
      />
      <Tooltip text="Toggle regex search" position="top" offset={10}>
        <button
          class="regex-toggle"
          class:active={historySearchRegex()}
          onclick={toggleRegex}
          aria-label="Toggle regex search"
        >.*</button>
      </Tooltip>
    </div>
    <div class="import-wrapper">
      <Tooltip text="Import / Export">
        <button class="toolbar-button" onclick={toggleImportMenu} aria-label="Import / Export">
          <span class="codicon codicon-cloud-download"></span>
        </button>
      </Tooltip>
      {#if showImportMenu}
        <div class="import-menu" role="menu" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
          <button class="import-item" onclick={handleExportHistory}>
            <span class="import-icon codicon codicon-export"></span>
            Export History
          </button>
          <button class="import-item" onclick={handleImportHistory}>
            <span class="import-icon codicon codicon-cloud-download"></span>
            Import History
          </button>
        </div>
      {/if}
    </div>
    <div class="more-wrapper">
      <Tooltip text="More Actions">
        <button class="toolbar-button" class:active={historyShowStats()} onclick={toggleMoreMenu} aria-label="More actions">
          <span class="codicon codicon-ellipsis"></span>
        </button>
      </Tooltip>
      {#if showMoreMenu}
        <div class="more-menu" role="menu" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
          <button class="more-item" onclick={handleToggleStats}>
            <span class="more-icon codicon codicon-graph"></span>
            Statistics
          </button>
          {#if historyTotal() > 0}
            <div class="menu-divider"></div>
            <button class="more-item danger" onclick={handleClearAll}>
              <span class="more-icon codicon codicon-trash"></span>
              Clear All History
            </button>
          {/if}
        </div>
      {/if}
    </div>
  </div>

  <!-- Filter Bar: Method pills + Scope pills -->
  <div class="filter-bar">
    {#each methods as method}
      <button
        class="method-pill"
        class:active={historyMethodFilters().includes(method)}
        style="--mc: {methodPillColors[method].color}; --mb: {methodPillColors[method].bg}"
        onclick={() => handleToggleMethod(method)}
      >
        {method}
      </button>
    {/each}
    <span class="filter-separator"></span>
    {#each searchFieldOptions as [field, label, icon]}
      <button
        class="scope-pill"
        class:active={historySearchFields().includes(field)}
        onclick={() => toggleSearchField(field)}
      >
        <span class="codicon {icon}"></span>
        {label}
      </button>
    {/each}
    {#if historySearchQuery() || historyMethodFilters().length > 0}
      <Tooltip text="Clear filters" offset={10}>
        <button class="clear-filters" onclick={handleClearFilters} aria-label="Clear filters">
          <span class="codicon codicon-close"></span>
        </button>
      </Tooltip>
    {/if}
  </div>

  <!-- Collection Filter Badge -->
  {#if historyCollectionFilter()}
    <div class="collection-filter-badge">
      <span class="codicon codicon-filter"></span>
      <span class="filter-label">Filtered: {historyCollectionFilter().requestName}</span>
      <Tooltip text="Clear filter" position="top">
        <button class="filter-clear" onclick={handleClearCollectionFilter} aria-label="Clear filter">
          <span class="codicon codicon-close"></span>
        </button>
      </Tooltip>
    </div>
  {/if}

  <!-- Stats view or List -->
  {#if historyShowStats()}
    <div class="history-list">
      <HistoryStatsView />
    </div>
  {:else}
    <div class="history-list">
      {#if historyIsLoading() && historyEntries().length === 0}
        <div class="empty-state">Loading...</div>
      {:else if historyEntries().length === 0}
        <div class="empty-state">
          {#if historySearchQuery() || historyMethodFilters().length > 0}
            No matching history entries.
          {:else}
            No history yet. Send a request to get started.
          {/if}
        </div>
      {:else}
        <VirtualList
          items={flatHistory()}
          itemHeight={44}
          hasMore={historyHasMore()}
          onLoadMore={handleLoadMore}
        >
          {#snippet children(item: FlatHistoryItem, _index: number)}
            {#if item.type === 'header'}
              <div class="date-label" style="height: 44px; line-height: 44px;">{item.label}</div>
            {:else}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="history-item"
                oncontextmenu={(e) => handleContextMenu(e, item.entry)}
              >
                <MethodBadge method={item.entry.method as HttpMethod} />
                <div class="entry-info">
                  <span class="entry-path">{extractPath(substituteVariables(item.entry.url))}</span>
                  <span class="entry-host">{getBaseUrl(substituteVariables(item.entry.url))}</span>
                </div>
                {#if item.entry.responseStatus || item.entry.responseDuration !== undefined}
                  <div class="entry-meta">
                    {#if item.entry.responseStatus}
                      <span class="status-badge {getStatusClass(item.entry.responseStatus)}">{item.entry.responseStatus}</span>
                    {/if}
                    {#if item.entry.responseDuration !== undefined}
                      <span class="entry-duration">{formatDuration(item.entry.responseDuration)}</span>
                    {/if}
                  </div>
                {/if}
              </div>
            {/if}
          {/snippet}
        </VirtualList>
      {/if}
    </div>
  {/if}
</div>

<ConfirmDialog
  open={showConfirmClear}
  title="Clear all history"
  message="This will permanently delete all history entries and cannot be undone."
  confirmLabel="Clear All"
  variant="danger"
  onconfirm={confirmClearAll}
  oncancel={() => (showConfirmClear = false)}
/>

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

  /* Toolbar (matches Collections tab) */
  .toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .search-wrapper {
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-icon {
    position: absolute;
    left: 8px;
    font-size: 12px;
    opacity: 0.6;
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    padding: 6px 32px 6px 28px;
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

  .search-wrapper :global(.tooltip-wrapper) {
    position: absolute;
    right: 4px;
    top: 0;
    bottom: 0;
    display: inline-flex;
    align-items: center;
  }

  .regex-toggle {
    padding: 2px 4px;
    background: none;
    border: 1px solid transparent;
    color: var(--hf-descriptionForeground);
    cursor: pointer;
    border-radius: 3px;
    font-size: 11px;
    font-weight: 700;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    opacity: 0.5;
  }

  .regex-toggle:hover {
    opacity: 1;
    background: var(--hf-list-hoverBackground);
  }

  .regex-toggle.active {
    opacity: 1;
    color: var(--hf-button-foreground);
    background: var(--hf-button-background);
    border-color: var(--hf-focusBorder);
  }

  .toolbar-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: var(--hf-button-secondaryBackground);
    border: none;
    border-radius: 4px;
    color: var(--hf-button-secondaryForeground);
    cursor: pointer;
    font-size: 16px;
    font-weight: bold;
    transition: background 0.15s;
    flex-shrink: 0;
  }

  .toolbar-button:hover {
    background: var(--hf-button-secondaryHoverBackground);
  }

  .toolbar-button.active {
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
  }

  /* Import/Export dropdown */
  .import-wrapper {
    position: relative;
    flex-shrink: 0;
  }

  .import-menu {
    position: absolute;
    top: 100%;
    right: 0;
    z-index: 100;
    min-width: 140px;
    margin-top: 4px;
    background: var(--hf-menu-background);
    border: 1px solid var(--hf-menu-border, var(--hf-panel-border));
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    padding: 4px 0;
  }

  .import-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 12px;
    background: none;
    border: none;
    color: var(--hf-menu-foreground);
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }

  .import-item:hover {
    background: var(--hf-menu-selectionBackground);
    color: var(--hf-menu-selectionForeground);
  }

  .import-icon {
    font-size: 14px;
    width: 16px;
    text-align: center;
  }

  /* More menu dropdown */
  .more-wrapper {
    position: relative;
    flex-shrink: 0;
  }

  .more-menu {
    position: absolute;
    top: 100%;
    right: 0;
    z-index: 100;
    min-width: 180px;
    margin-top: 4px;
    background: var(--hf-menu-background);
    border: 1px solid var(--hf-menu-border, var(--hf-panel-border));
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    padding: 4px 0;
  }

  .more-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 12px;
    background: none;
    border: none;
    color: var(--hf-menu-foreground);
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }

  .more-item:hover {
    background: var(--hf-menu-selectionBackground);
    color: var(--hf-menu-selectionForeground);
  }

  .more-item.danger {
    color: var(--hf-errorForeground);
  }

  .more-item.danger:hover {
    background: var(--hf-menu-selectionBackground);
    color: var(--hf-errorForeground);
  }

  .more-icon {
    font-size: 14px;
    width: 16px;
    text-align: center;
  }

  .menu-divider {
    height: 1px;
    margin: 4px 0;
    background: var(--hf-menu-border, var(--hf-panel-border));
  }

  /* Filter bar (combined method + scope pills) */
  .filter-bar {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 4px 8px 6px;
    flex-wrap: wrap;
    flex-shrink: 0;
  }

  .filter-separator {
    width: 1px;
    height: 16px;
    background: var(--hf-panel-border);
    margin: 0 4px;
    flex-shrink: 0;
  }

  .method-pill {
    padding: 2px 8px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    background: var(--mb);
    color: var(--mc);
    border: 1px solid color-mix(in srgb, var(--mc) 30%, transparent);
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.1s;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    opacity: 0.65;
  }

  .method-pill:hover {
    opacity: 1;
    background: color-mix(in srgb, var(--mc) 18%, transparent);
    border-color: color-mix(in srgb, var(--mc) 50%, transparent);
  }

  .method-pill.active {
    opacity: 1;
    background: color-mix(in srgb, var(--mc) 22%, transparent);
    border-color: var(--mc);
  }

  .scope-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    font-size: 10px;
    font-weight: 600;
    background: transparent;
    color: var(--hf-descriptionForeground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.1s;
  }

  .scope-pill .codicon {
    font-size: 10px;
  }

  .scope-pill:hover {
    background: var(--hf-list-hoverBackground);
    color: var(--hf-foreground);
    border-color: var(--hf-focusBorder);
  }

  .scope-pill.active {
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

  /* Collection filter badge */
  .collection-filter-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    margin: 0 8px 4px;
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

  /* History list */
  .history-list {
    flex: 1;
    overflow-y: auto;
    padding: 0 4px;
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
    gap: 8px;
    padding: 6px 8px;
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
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .entry-path {
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--hf-foreground);
  }

  .entry-host {
    font-size: 11px;
    color: var(--hf-descriptionForeground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
