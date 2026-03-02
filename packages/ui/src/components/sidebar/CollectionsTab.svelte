<script lang="ts">
  import { collections, addCollection, sortCollections } from '../../stores/collections';
  import type { Collection, CollectionItem as CollectionItemType, SavedRequest, Folder } from '../../types';
  import { isFolder, isRequest } from '../../types';
  import { ui, setCollectionSortOrder, type CollectionSortOrder } from '../../stores/ui';
  import { isMultiSelectActive, selectedCount, clearMultiSelect, getTopLevelSelectedIds, multiSelect } from '../../stores/multiSelect';
  import { get } from 'svelte/store';
  import CollectionTree from './CollectionTree.svelte';
  import Tooltip from '../shared/Tooltip.svelte';

  interface Props {
    postMessage: (message: any) => void;
  }
  let { postMessage }: Props = $props();

  let isCreating = $state(false);
  let newCollectionName = $state('');
  let searchQuery = $state('');
  let searchInput: HTMLInputElement | undefined = $state();
  let debounceTimer: ReturnType<typeof setTimeout>;

  const hasCollections = $derived($collections.length > 0);

  // Recursively filter items that match the query
  function filterItems(items: CollectionItemType[], query: string): CollectionItemType[] {
    const result: CollectionItemType[] = [];

    for (const item of items) {
      if (isFolder(item)) {
        // Check if folder name matches
        const folderMatches = item.name.toLowerCase().includes(query);
        // Recursively filter children
        const filteredChildren = filterItems(item.children, query);

        // Include folder if name matches or has matching children
        if (folderMatches || filteredChildren.length > 0) {
          result.push({
            ...item,
            children: folderMatches ? item.children : filteredChildren,
            expanded: filteredChildren.length > 0 || item.expanded,
          } as Folder);
        }
      } else if (isRequest(item)) {
        // Check if request matches
        if (
          item.name.toLowerCase().includes(query) ||
          item.url.toLowerCase().includes(query) ||
          item.method.toLowerCase().includes(query)
        ) {
          result.push(item);
        }
      }
    }

    return result;
  }

  function filterCollections(cols: Collection[], query: string): Collection[] {
    if (!query.trim()) return cols;

    const lowerQuery = query.toLowerCase();
    return cols
      .map(collection => {
        // Check if collection name matches
        const collectionMatches = collection.name.toLowerCase().includes(lowerQuery);

        // Filter items recursively
        const matchingItems = filterItems(collection.items, lowerQuery);

        // Include collection if its name matches OR it has matching items
        if (collectionMatches || matchingItems.length > 0) {
          return {
            ...collection,
            // If collection name matches, show all items; otherwise show only matching
            items: collectionMatches ? collection.items : matchingItems,
            // Auto-expand collections with matching items
            expanded: matchingItems.length > 0 || collection.expanded
          };
        }
        return null;
      })
      .filter((col): col is Collection => col !== null);
  }

  // Filter and sort collections
  const filteredCollections = $derived(sortCollections(filterCollections($collections, searchQuery), sortOrder));
  const hasResults = $derived(filteredCollections.length > 0);
  const showNoResults = $derived(hasCollections && !hasResults && searchQuery.trim().length > 0);

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

  function handleSearchKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && searchQuery) {
      e.preventDefault();
      clearSearch();
    }
  }

  let showImportMenu = $state(false);
  let showSortMenu = $state(false);

  const sortOrder = $derived($ui.collectionSortOrder);
  const isSorting = $derived(sortOrder !== 'manual');

  const sortOptions: { key: CollectionSortOrder; label: string }[] = [
    { key: 'manual', label: 'Manual (Drag & Drop)' },
    { key: 'name-asc', label: 'Name (A → Z)' },
    { key: 'name-desc', label: 'Name (Z → A)' },
    { key: 'method', label: 'Method' },
    { key: 'created-desc', label: 'Created (Newest)' },
    { key: 'created-asc', label: 'Created (Oldest)' },
    { key: 'modified-desc', label: 'Modified (Newest)' },
    { key: 'modified-asc', label: 'Modified (Oldest)' },
  ];

  function handleSortSelect(key: CollectionSortOrder) {
    setCollectionSortOrder(key);
    showSortMenu = false;
  }

  function toggleSortMenu(e: MouseEvent) {
    e.stopPropagation();
    showSortMenu = !showSortMenu;
    showImportMenu = false;
  }

  function closeSortMenu() {
    showSortMenu = false;
  }

  function handleNewCollection() {
    isCreating = true;
    newCollectionName = '';
  }

  function handleImportPostman() {
    showImportMenu = false;
    postMessage({ type: 'importPostman' });
  }

  function handleImportOpenApi() {
    showImportMenu = false;
    postMessage({ type: 'importOpenApi' });
  }

  function handleImportInsomnia() {
    showImportMenu = false;
    postMessage({ type: 'importInsomnia' });
  }

  function handleImportHoppscotch() {
    showImportMenu = false;
    postMessage({ type: 'importHoppscotch' });
  }

  function handleImportCurl() {
    showImportMenu = false;
    postMessage({ type: 'importCurl' });
  }

  function handleImportFromUrl() {
    showImportMenu = false;
    postMessage({ type: 'importFromUrl' });
  }

  function toggleImportMenu(e: MouseEvent) {
    e.stopPropagation();
    showImportMenu = !showImportMenu;
    showSortMenu = false;
  }

  function closeImportMenu() {
    showImportMenu = false;
    showSortMenu = false;
  }

  function createCollection() {
    const name = newCollectionName.trim();
    if (name) {
      const result = addCollection(name);
      if (!result) {
        // Duplicate name — keep the input open so user can correct
        return;
      }
    }
    isCreating = false;
    newCollectionName = '';
  }

  function cancelCreate() {
    isCreating = false;
    newCollectionName = '';
  }

  function handleCreateKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      createCollection();
    } else if (e.key === 'Escape') {
      cancelCreate();
    }
  }

  function handleBulkDelete() {
    const state = get(multiSelect);
    const topLevel = getTopLevelSelectedIds();
    postMessage({
      type: 'bulkDelete',
      data: { itemIds: topLevel, collectionId: state.collectionId },
    });
    clearMultiSelect();
  }

  function handleGlobalKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && $isMultiSelectActive) {
      clearMultiSelect();
    }
  }

  function handleListClick(e: MouseEvent) {
    // Click on empty area of the list clears multi-select
    if (e.target === e.currentTarget && $isMultiSelectActive) {
      clearMultiSelect();
    }
  }
</script>

<svelte:window onclick={closeImportMenu} onkeydown={handleGlobalKeydown} />

<div class="collections-tab">
  <div class="toolbar">
    <div class="search-wrapper">
      <span class="search-icon codicon codicon-search"></span>
      <input
        type="text"
        class="search-input"
        placeholder="Filter collections..."
        bind:this={searchInput}
        oninput={handleSearchInput}
        onkeydown={handleSearchKeydown}
      />
      {#if searchQuery}
        <button class="clear-search" onclick={clearSearch} title="Clear search">
          <i class="codicon codicon-close"></i>
        </button>
      {/if}
    </div>
    {#if isCreating}
      <div class="create-form">
        <!-- svelte-ignore a11y_autofocus -->
        <input
          type="text"
          class="create-input"
          placeholder="Name..."
          bind:value={newCollectionName}
          onkeydown={handleCreateKeydown}
          onblur={createCollection}
          autofocus
        />
      </div>
    {:else}
      <Tooltip text="New Collection">
        <button class="toolbar-button" onclick={handleNewCollection} aria-label="New Collection">
          <span class="codicon codicon-add"></span>
        </button>
      </Tooltip>
    {/if}
    <div class="sort-wrapper">
      <Tooltip text="Sort">
        <button
          class="toolbar-button"
          class:active={isSorting}
          onclick={toggleSortMenu}
          aria-label="Sort collections"
        >
          <span class="codicon codicon-sort-precedence"></span>
        </button>
      </Tooltip>
      {#if showSortMenu}
        <div class="sort-menu" onclick={(e) => e.stopPropagation()}>
          {#each sortOptions as option}
            <button
              class="sort-item"
              class:selected={sortOrder === option.key}
              onclick={() => handleSortSelect(option.key)}
            >
              <span class="sort-check">{sortOrder === option.key ? '✓' : ''}</span>
              {option.label}
            </button>
          {/each}
        </div>
      {/if}
    </div>
    <div class="import-wrapper">
      <Tooltip text="Import">
        <button class="toolbar-button" onclick={toggleImportMenu} aria-label="Import">
          <span class="codicon codicon-cloud-download"></span>
        </button>
      </Tooltip>
      {#if showImportMenu}
        <div class="import-menu" onclick={(e) => e.stopPropagation()}>
          <button class="import-item" onclick={handleImportPostman}>
            Import Postman
          </button>
          <button class="import-item" onclick={handleImportOpenApi}>
            Import OpenAPI
          </button>
          <button class="import-item" onclick={handleImportInsomnia}>
            Import Insomnia
          </button>
          <button class="import-item" onclick={handleImportHoppscotch}>
            Import Hoppscotch
          </button>
          <button class="import-item" onclick={handleImportCurl}>
            Import cURL
          </button>
          <button class="import-item" onclick={handleImportFromUrl}>
            Import from URL
          </button>
        </div>
      {/if}
    </div>
  </div>

  {#if $isMultiSelectActive}
    <div class="selection-bar">
      <span class="selection-count">{$selectedCount} selected</span>
      <div class="selection-actions">
        <button class="selection-btn danger" onclick={handleBulkDelete} title="Delete selected items">
          <span class="codicon codicon-trash"></span>
          Delete
        </button>
        <button class="selection-btn" onclick={clearMultiSelect} title="Deselect all">
          <span class="codicon codicon-close"></span>
          Deselect
        </button>
      </div>
    </div>
  {/if}

  {#if hasCollections}
    {#if hasResults}
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <div class="collections-list" onclick={handleListClick}>
        <CollectionTree collections={filteredCollections} {postMessage} />
      </div>
    {:else if showNoResults}
      <div class="empty-state">
        <div class="empty-icon codicon codicon-search"></div>
        <p class="empty-title">No results</p>
        <p class="empty-description">
          No collections or requests match "{searchQuery}"
        </p>
        <button class="clear-search-button" onclick={clearSearch}>
          Clear search
        </button>
      </div>
    {/if}
  {:else}
    <div class="empty-state">
      <div class="empty-icon codicon codicon-folder"></div>
      <p class="empty-title">No Collections</p>
      <p class="empty-description">
        Create a collection to organize your API requests
      </p>
    </div>
  {/if}
</div>

<style>
  .collections-tab {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

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
    padding: 6px 28px 6px 28px;
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
    color: var(--hf-input-placeholderForeground);
  }

  .clear-search {
    position: absolute;
    right: 4px;
    padding: 2px 6px;
    background: none;
    border: none;
    color: var(--hf-foreground);
    font-size: 14px;
    cursor: pointer;
    opacity: 0.6;
    border-radius: 3px;
  }

  .clear-search:hover {
    opacity: 1;
    background: var(--hf-list-hoverBackground);
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

  .codicon {
    line-height: 1;
  }

  .create-form {
    flex-shrink: 0;
  }

  .create-input {
    width: 100px;
    padding: 6px 8px;
    font-size: 12px;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 4px;
    outline: none;
  }

  .create-input:focus {
    border-color: var(--hf-focusBorder);
  }

  .collections-list {
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
    color: var(--hf-foreground);
  }

  .empty-description {
    margin: 0;
    font-size: 12px;
    color: var(--hf-descriptionForeground);
    max-width: 200px;
  }

  .clear-search-button {
    margin-top: 12px;
    padding: 6px 12px;
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: none;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .clear-search-button:hover {
    background: var(--hf-button-secondaryHoverBackground);
  }

  .sort-wrapper {
    position: relative;
    flex-shrink: 0;
  }

  .toolbar-button.active {
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
  }

  .sort-menu {
    position: absolute;
    top: 100%;
    right: 0;
    z-index: 100;
    min-width: 170px;
    margin-top: 4px;
    background: var(--hf-menu-background);
    border: 1px solid var(--hf-menu-border, var(--hf-panel-border));
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    padding: 4px 0;
  }

  .sort-item {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 6px 12px;
    background: none;
    border: none;
    color: var(--hf-menu-foreground);
    font-size: 12px;
    text-align: left;
    cursor: pointer;
    gap: 6px;
  }

  .sort-item:hover {
    background: var(--hf-menu-selectionBackground);
    color: var(--hf-menu-selectionForeground);
  }

  .sort-item.selected {
    font-weight: 600;
  }

  .sort-check {
    width: 14px;
    font-size: 11px;
    text-align: center;
    flex-shrink: 0;
  }

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
    display: block;
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

  .selection-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px;
    background: var(--hf-list-activeSelectionBackground);
    color: var(--hf-list-activeSelectionForeground);
    border-bottom: 1px solid var(--hf-panel-border);
    font-size: 12px;
  }

  .selection-count {
    font-weight: 500;
  }

  .selection-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .selection-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    background: transparent;
    border: 1px solid var(--hf-list-activeSelectionForeground);
    border-radius: 3px;
    color: var(--hf-list-activeSelectionForeground);
    font-size: 11px;
    cursor: pointer;
    opacity: 0.8;
    transition: opacity 0.15s;
  }

  .selection-btn:hover {
    opacity: 1;
  }

  .selection-btn.danger:hover {
    background: var(--hf-errorForeground);
    color: #fff;
    border-color: var(--hf-errorForeground);
  }
</style>
