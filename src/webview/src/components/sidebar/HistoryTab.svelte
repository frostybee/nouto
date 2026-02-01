<script lang="ts">
  import type { HistoryEntry, Collection } from '../../types';
  import HistoryItem from './HistoryItem.svelte';

  export let history: HistoryEntry[];
  export let collections: Collection[];
  export let postMessage: (message: any) => void;

  let searchQuery = '';
  let searchInput: HTMLInputElement;
  let debounceTimer: ReturnType<typeof setTimeout>;

  // Debounced search filter
  $: filteredHistory = filterHistory(history, searchQuery);

  function filterHistory(entries: HistoryEntry[], query: string): HistoryEntry[] {
    if (!query.trim()) return entries;

    const lowerQuery = query.toLowerCase();
    return entries.filter(entry => {
      // Search in URL
      if (entry.url.toLowerCase().includes(lowerQuery)) return true;
      // Search in method
      if (entry.method.toLowerCase().includes(lowerQuery)) return true;
      // Search in status code
      if (entry.status.toString().includes(lowerQuery)) return true;
      return false;
    });
  }

  function handleSearchInput(e: Event) {
    const target = e.target as HTMLInputElement;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      searchQuery = target.value;
    }, 150);
  }

  function clearSearch() {
    searchQuery = '';
    if (searchInput) {
      searchInput.value = '';
      searchInput.focus();
    }
  }

  function handleClearHistory() {
    if (history.length === 0) return;
    postMessage({ type: 'clearHistory' });
  }

  function handleKeydown(e: KeyboardEvent) {
    // Escape clears the search
    if (e.key === 'Escape' && searchQuery) {
      e.preventDefault();
      clearSearch();
    }
  }

  $: hasHistory = history.length > 0;
  $: hasResults = filteredHistory.length > 0;
  $: showNoResults = hasHistory && !hasResults && searchQuery.trim().length > 0;
</script>

<div class="history-tab">
  <div class="toolbar">
    <div class="search-wrapper">
      <span class="search-icon">&#128269;</span>
      <input
        type="text"
        class="search-input"
        placeholder="Filter history..."
        bind:this={searchInput}
        on:input={handleSearchInput}
        on:keydown={handleKeydown}
      />
      {#if searchQuery}
        <button class="clear-search" on:click={clearSearch} title="Clear search">
          &times;
        </button>
      {/if}
    </div>
    <button
      class="toolbar-button"
      class:disabled={!hasHistory}
      on:click={handleClearHistory}
      title="Clear all history"
      disabled={!hasHistory}
    >
      <span class="codicon">&#128465;</span>
    </button>
  </div>

  {#if hasHistory}
    {#if hasResults}
      <div class="history-list">
        {#each filteredHistory as entry (entry.id)}
          <HistoryItem {entry} {collections} {postMessage} />
        {/each}
      </div>
    {:else if showNoResults}
      <div class="empty-state">
        <div class="empty-icon">&#128269;</div>
        <p class="empty-title">No results</p>
        <p class="empty-description">
          No requests match "{searchQuery}"
        </p>
        <button class="clear-search-button" on:click={clearSearch}>
          Clear search
        </button>
      </div>
    {/if}
  {:else}
    <div class="empty-state">
      <div class="empty-icon">&#128337;</div>
      <p class="empty-title">No History</p>
      <p class="empty-description">
        Your request history will appear here after you send requests
      </p>
    </div>
  {/if}
</div>

<style>
  .history-tab {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    border-bottom: 1px solid var(--vscode-panel-border);
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
    padding: 6px 28px 6px 28px;
    font-size: 12px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    border-radius: 4px;
    outline: none;
  }

  .search-input:focus {
    border-color: var(--vscode-focusBorder);
  }

  .search-input::placeholder {
    color: var(--vscode-input-placeholderForeground);
  }

  .clear-search {
    position: absolute;
    right: 4px;
    padding: 2px 6px;
    background: none;
    border: none;
    color: var(--vscode-foreground);
    font-size: 14px;
    cursor: pointer;
    opacity: 0.6;
    border-radius: 3px;
  }

  .clear-search:hover {
    opacity: 1;
    background: var(--vscode-list-hoverBackground);
  }

  .toolbar-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    color: var(--vscode-foreground);
    cursor: pointer;
    opacity: 0.7;
    transition: opacity 0.15s, background 0.15s;
    flex-shrink: 0;
  }

  .toolbar-button:hover:not(.disabled) {
    opacity: 1;
    background: var(--vscode-list-hoverBackground);
    border-color: var(--vscode-panel-border);
  }

  .toolbar-button.disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .codicon {
    font-size: 14px;
  }

  .history-list {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 20px;
    text-align: center;
  }

  .empty-icon {
    font-size: 48px;
    margin-bottom: 12px;
    opacity: 0.5;
  }

  .empty-title {
    margin: 0 0 8px;
    font-size: 14px;
    font-weight: 500;
    color: var(--vscode-foreground);
  }

  .empty-description {
    margin: 0;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    max-width: 200px;
  }

  .clear-search-button {
    margin-top: 12px;
    padding: 6px 12px;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: none;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .clear-search-button:hover {
    background: var(--vscode-button-secondaryHoverBackground);
  }
</style>
