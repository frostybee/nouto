<script lang="ts">
  import { collections, addCollection } from '../../stores/collections';
  import type { Collection, CollectionItem as CollectionItemType, SavedRequest, Folder } from '../../types';
  import { isFolder, isRequest } from '../../types';
  import CollectionTree from './CollectionTree.svelte';

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

  // Filter collections by name and request names/URLs (recursively)
  const filteredCollections = $derived(filterCollections($collections, searchQuery));
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

  function toggleImportMenu() {
    showImportMenu = !showImportMenu;
  }

  function closeImportMenu() {
    showImportMenu = false;
  }

  function createCollection() {
    const name = newCollectionName.trim();
    if (name) {
      addCollection(name);
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
</script>

<svelte:window onclick={closeImportMenu} />

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
      <button class="toolbar-button" onclick={handleNewCollection} title="New Collection">
        <span class="codicon codicon-add"></span>
      </button>
    {/if}
    <div class="import-wrapper">
      <button class="toolbar-button" onclick={toggleImportMenu} title="Import">
        <span class="codicon codicon-cloud-download"></span>
      </button>
      {#if showImportMenu}
        <div class="import-menu">
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

  {#if hasCollections}
    {#if hasResults}
      <div class="collections-list">
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
    background: var(--vscode-button-secondaryBackground);
    border: none;
    border-radius: 4px;
    color: var(--vscode-button-secondaryForeground);
    cursor: pointer;
    font-size: 16px;
    font-weight: bold;
    transition: background 0.15s;
    flex-shrink: 0;
  }

  .toolbar-button:hover {
    background: var(--vscode-button-secondaryHoverBackground);
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
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    border-radius: 4px;
    outline: none;
  }

  .create-input:focus {
    border-color: var(--vscode-focusBorder);
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
    background: var(--vscode-menu-background);
    border: 1px solid var(--vscode-menu-border, var(--vscode-panel-border));
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
    color: var(--vscode-menu-foreground);
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }

  .import-item:hover {
    background: var(--vscode-menu-selectionBackground);
    color: var(--vscode-menu-selectionForeground);
  }
</style>
