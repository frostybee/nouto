<script lang="ts">
  import { collections, addCollection, sortCollections, expandAllFolders, collapseAllFolders, revealActiveRequest, selectedRequestId } from '../../stores/collections.svelte';
  import type { Collection, CollectionItem as CollectionItemType, SavedRequest, Folder } from '../../types';
  import { isFolder, isRequest } from '../../types';
  import { ui, setCollectionSortOrder, type CollectionSortOrder } from '../../stores/ui.svelte';
  import { isMultiSelectActive, selectedCount, clearMultiSelect, getTopLevelSelectedIds, multiSelect } from '../../stores/multiSelect.svelte';
  import CollectionTree from './CollectionTree.svelte';
  import Tooltip from '../shared/Tooltip.svelte';
  import BulkExportModal from '../shared/BulkExportModal.svelte';
  import CreateItemDialog from '../shared/CreateItemDialog.svelte';
  import ConfirmDialog from '../shared/ConfirmDialog.svelte';

  interface Props {
    postMessage: (message: any) => void;
  }
  let { postMessage }: Props = $props();

  let showCreateDialog = $state(false);
  let showBulkDeleteConfirm = $state(false);
  let searchQuery = $state('');
  let searchInput: HTMLInputElement | undefined = $state();
  let debounceTimer: ReturnType<typeof setTimeout>;

  const hasCollections = $derived(collections().length > 0);

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
  const filteredCollections = $derived(sortCollections(filterCollections(collections(), searchQuery), sortOrder));
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
  let showMoreMenu = $state(false);
  let showBulkExportModal = $state(false);
  let bulkExportFormat = $state<'postman' | 'nouto'>('postman');

  const sortOrder = $derived(ui.collectionSortOrder);
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
    showMoreMenu = false;
  }

  function closeSortMenu() {
    showSortMenu = false;
  }

  function handleNewCollection() {
    showCreateDialog = true;
  }

  function handleImportCollection() {
    showImportMenu = false;
    postMessage({ type: 'importAuto' });
  }

  function handleImportCurl() {
    showImportMenu = false;
    postMessage({ type: 'importCurl' });
  }

  function handleImportFromUrl() {
    showImportMenu = false;
    postMessage({ type: 'importFromUrl' });
  }

  function handleBulkExportPostman() {
    showImportMenu = false;
    bulkExportFormat = 'postman';
    showBulkExportModal = true;
  }

  function handleBulkExportNative() {
    showImportMenu = false;
    bulkExportFormat = 'nouto';
    showBulkExportModal = true;
  }

  function handleBulkExport(collectionIds: string[]) {
    showBulkExportModal = false;
    const type = bulkExportFormat === 'postman' ? 'exportAllPostman' : 'exportAllNative';
    postMessage({ type, data: { collectionIds } });
  }

  function toggleImportMenu(e: MouseEvent) {
    e.stopPropagation();
    showImportMenu = !showImportMenu;
    showSortMenu = false;
    showMoreMenu = false;
  }

  function toggleMoreMenu(e: MouseEvent) {
    e.stopPropagation();
    showMoreMenu = !showMoreMenu;
    showImportMenu = false;
    showSortMenu = false;
  }

  function handleExpandAll() {
    showMoreMenu = false;
    expandAllFolders();
  }

  function handleCollapseAll() {
    showMoreMenu = false;
    collapseAllFolders();
  }

  function handleFocusActiveRequest() {
    showMoreMenu = false;
    revealActiveRequest();
  }

  function closeImportMenu() {
    showImportMenu = false;
    showSortMenu = false;
    showMoreMenu = false;
  }

  function handleCreateCollection(data: { name: string; color?: string; icon?: string }) {
    const result = addCollection(data.name, data.color, data.icon);
    if (result) {
      showCreateDialog = false;
    }
  }

  function handleBulkDelete() {
    showBulkDeleteConfirm = true;
  }

  function confirmBulkDelete() {
    showBulkDeleteConfirm = false;
    const state = multiSelect();
    const topLevel = getTopLevelSelectedIds();
    postMessage({
      type: 'bulkDelete',
      data: { itemIds: topLevel, collectionId: state.collectionId },
    });
    clearMultiSelect();
  }

  function handleGlobalKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && isMultiSelectActive()) {
      clearMultiSelect();
    }
  }

  function handleListClick(e: MouseEvent) {
    // Click on empty area of the list clears multi-select
    if (e.target === e.currentTarget && isMultiSelectActive()) {
      clearMultiSelect();
    }
  }

  function handleListKeydown(e: KeyboardEvent) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget && isMultiSelectActive()) {
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
        <Tooltip text="Clear search" position="top">
          <button class="clear-search" onclick={clearSearch} aria-label="Clear search">
            <i class="codicon codicon-close"></i>
          </button>
        </Tooltip>
      {/if}
    </div>
    <Tooltip text="New Collection">
      <button class="toolbar-button" onclick={handleNewCollection} aria-label="New Collection">
        <span class="codicon codicon-add"></span>
      </button>
    </Tooltip>
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
        <div class="sort-menu" role="menu" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
          {#each sortOptions as option}
            <button
              class="sort-item"
              class:selected={sortOrder === option.key}
              onclick={() => handleSortSelect(option.key)}
            >
              <span class="sort-check">{#if sortOrder === option.key}<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M6.27 10.87h.71l4.56-4.56-.71-.71-4.2 4.21-1.92-1.92-.71.71 2.27 2.27z"/></svg>{/if}</span>
              {option.label}
            </button>
          {/each}
        </div>
      {/if}
    </div>
    <div class="import-wrapper">
      <Tooltip text="Import / Export" position="top">
        <button class="toolbar-button" onclick={toggleImportMenu} aria-label="Import / Export">
          <span class="codicon codicon-cloud-download"></span>
        </button>
      </Tooltip>
      {#if showImportMenu}
        <div class="import-menu" role="menu" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
          <button class="import-item" onclick={handleImportCollection}>
            Import Collection
          </button>
          <button class="import-item" onclick={handleImportCurl}>
            Import cURL
          </button>
          <button class="import-item" onclick={handleImportFromUrl}>
            Import from URL
          </button>
          <div class="menu-divider"></div>
          <button class="import-item" onclick={handleBulkExportPostman}>
            Bulk Export to Postman
          </button>
          <button class="import-item" onclick={handleBulkExportNative}>
            Bulk Export as Nouto
          </button>
        </div>
      {/if}
    </div>
    <div class="more-wrapper">
      <Tooltip text="More Actions">
        <button class="toolbar-button" onclick={toggleMoreMenu} aria-label="More actions">
          <span class="codicon codicon-ellipsis"></span>
        </button>
      </Tooltip>
      {#if showMoreMenu}
        <div class="more-menu" role="menu" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
          <button class="more-item" onclick={handleFocusActiveRequest} disabled={!selectedRequestId()}>
            <span class="more-icon codicon codicon-target"></span>
            Reveal Active Request
          </button>
          <button class="more-item" onclick={handleExpandAll}>
            <span class="more-icon codicon codicon-unfold"></span>
            Expand All Folders
          </button>
          <button class="more-item" onclick={handleCollapseAll}>
            <span class="more-icon codicon codicon-fold"></span>
            Collapse All Folders
          </button>
        </div>
      {/if}
    </div>
  </div>

  {#if isMultiSelectActive()}
    <div class="selection-bar">
      <span class="selection-count">{selectedCount()} selected</span>
      <div class="selection-actions">
        <Tooltip text="Delete selected items" position="top">
          <button class="selection-btn danger" onclick={handleBulkDelete}>
            <span class="codicon codicon-trash"></span>
            Delete
          </button>
        </Tooltip>
        <Tooltip text="Deselect all" position="top">
          <button class="selection-btn" onclick={clearMultiSelect}>
            <span class="codicon codicon-close"></span>
            Deselect
          </button>
        </Tooltip>
      </div>
    </div>
  {/if}

  {#if hasCollections}
    {#if hasResults}
      <div class="collections-list" role="tree" tabindex="-1" onclick={handleListClick} onkeydown={handleListKeydown}>
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

<BulkExportModal
  open={showBulkExportModal}
  format={bulkExportFormat}
  onexport={handleBulkExport}
  oncancel={() => (showBulkExportModal = false)}
/>

{#if showCreateDialog}
  <CreateItemDialog
    mode="collection"
    oncreate={handleCreateCollection}
    oncancel={() => (showCreateDialog = false)}
  />
{/if}

<ConfirmDialog
  open={showBulkDeleteConfirm}
  title="Delete selected items"
  message={`${selectedCount()} selected items will be permanently removed. This action cannot be undone.`}
  confirmLabel="Delete"
  variant="danger"
  onconfirm={confirmBulkDelete}
  oncancel={() => (showBulkDeleteConfirm = false)}
/>

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
    font-weight: 600;
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

  .menu-divider {
    height: 1px;
    margin: 4px 0;
    background: var(--hf-menu-border, var(--hf-panel-border));
  }

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

  .more-item:hover:not(:disabled) {
    background: var(--hf-menu-selectionBackground);
    color: var(--hf-menu-selectionForeground);
  }

  .more-item:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .more-icon {
    font-size: 14px;
    width: 16px;
    text-align: center;
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
    font-weight: 600;
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
