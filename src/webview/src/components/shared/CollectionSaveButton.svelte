<script lang="ts">
  import type { Collection, Folder } from '../../types';
  import { isFolder } from '../../types';
  import { postMessage } from '../../lib/vscode';
  import { get } from 'svelte/store';
  import { request } from '../../stores/request';

  interface Props {
    collectionId: string | null;
    collectionName: string | null;
    collections: Collection[];
    onSaveToCollection?: () => void;
  }
  let { collectionId, collectionName, collections, onSaveToCollection }: Props = $props();

  let showPicker = $state(false);
  let searchQuery = $state('');
  let showNewCollectionInput = $state(false);
  let newCollectionName = $state('');

  const filteredCollections = $derived(
    searchQuery
      ? collections.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : collections
  );

  function handleSaveClick() {
    if (collectionId) {
      // Already in a collection — no action (just shows badge)
      return;
    }
    showPicker = true;
    searchQuery = '';
    showNewCollectionInput = false;
  }

  function getCurrentRequestData() {
    const r = get(request);
    return {
      method: r.method,
      url: r.url,
      params: r.params,
      headers: r.headers,
      auth: r.auth,
      body: r.body,
      assertions: r.assertions,
      authInheritance: r.authInheritance,
      scripts: r.scripts,
    };
  }

  function handleSelectCollection(targetCollectionId: string, folderId?: string) {
    postMessage({
      type: 'saveToCollectionWithLink',
      data: { collectionId: targetCollectionId, folderId, request: getCurrentRequestData() },
    });
    showPicker = false;
    onSaveToCollection?.();
  }

  function handleCreateAndSave() {
    if (!newCollectionName.trim()) return;
    postMessage({
      type: 'saveToNewCollectionWithLink',
      data: { name: newCollectionName.trim(), request: getCurrentRequestData() },
    });
    showPicker = false;
    showNewCollectionInput = false;
    newCollectionName = '';
    onSaveToCollection?.();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      showPicker = false;
    }
  }

  function handleNewCollectionKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      handleCreateAndSave();
    } else if (e.key === 'Escape') {
      showNewCollectionInput = false;
    }
  }

  function closePicker() {
    showPicker = false;
  }
</script>

{#if showPicker}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="picker-overlay" onclick={closePicker} onkeydown={handleKeydown}></div>
{/if}

<div class="save-button-wrapper">
  {#if collectionId}
    <button class="collection-badge" title={collectionName || 'Collection'}>
      <span class="codicon codicon-folder"></span>
      <span class="badge-label">{collectionName || 'Collection'}</span>
    </button>
  {:else}
    <button class="save-btn" onclick={handleSaveClick} title="Save to Collection">
      <span class="codicon codicon-save"></span>
      <span class="save-label">Save</span>
    </button>
  {/if}

  {#if showPicker}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="picker-dropdown" role="dialog" tabindex="-1" onkeydown={handleKeydown}>
      <div class="picker-header">
        <input
          type="text"
          class="picker-search"
          placeholder="Search collections..."
          bind:value={searchQuery}
          autofocus={true}
        />
      </div>
      <div class="picker-list">
        <button class="picker-item new-collection" onclick={() => { showNewCollectionInput = true; }}>
          <span class="codicon codicon-new-folder"></span>
          Create New Collection...
        </button>

        {#if showNewCollectionInput}
          <div class="new-collection-input-row">
            <!-- svelte-ignore a11y_autofocus -->
            <input
              type="text"
              class="new-collection-input"
              placeholder="Collection name..."
              bind:value={newCollectionName}
              onkeydown={handleNewCollectionKeydown}
              autofocus={true}
            />
            <button class="new-collection-save" onclick={handleCreateAndSave} disabled={!newCollectionName.trim()} title="Create collection">
              <span class="codicon codicon-check"></span>
            </button>
          </div>
        {/if}

        {#each filteredCollections as col (col.id)}
          <button class="picker-item" onclick={() => handleSelectCollection(col.id)}>
            <span class="codicon codicon-folder"></span>
            {col.name}
          </button>
          {#each col.items as item (item.id)}
            {#if isFolder(item)}
              {@render folderPickerItem(item, col.id, 1)}
            {/if}
          {/each}
        {/each}
      </div>
    </div>
  {/if}
</div>

{#snippet folderPickerItem(folder: Folder, colId: string, depth: number)}
  <button
    class="picker-item folder-indent"
    style="padding-left: {12 + depth * 16}px"
    onclick={() => handleSelectCollection(colId, folder.id)}
  >
    <span class="codicon codicon-folder"></span>
    {folder.name}
  </button>
  {#each folder.children as child (child.id)}
    {#if isFolder(child)}
      {@render folderPickerItem(child, colId, depth + 1)}
    {/if}
  {/each}
{/snippet}

<style>
  .save-button-wrapper {
    position: relative;
  }

  .save-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    border-radius: 4px;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: none;
    cursor: pointer;
    font-size: 12px;
    white-space: nowrap;
    transition: background 0.15s;
  }

  .save-btn:hover {
    background: var(--vscode-button-secondaryHoverBackground);
  }

  .save-btn .codicon {
    font-size: 14px;
  }

  .collection-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    border-radius: 4px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    border: none;
    cursor: default;
    font-size: 12px;
    white-space: nowrap;
    max-width: 160px;
    overflow: hidden;
  }

  .badge-label {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .collection-badge .codicon {
    font-size: 12px;
    flex-shrink: 0;
  }

  .picker-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 999;
  }

  .picker-dropdown {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 4px;
    width: 280px;
    max-height: 320px;
    background: var(--vscode-menu-background);
    border: 1px solid var(--vscode-menu-border, var(--vscode-panel-border));
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 1000;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .picker-header {
    padding: 8px;
    border-bottom: 1px solid var(--vscode-panel-border);
  }

  .picker-search {
    width: 100%;
    padding: 6px 8px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    border-radius: 4px;
    font-size: 12px;
    outline: none;
    box-sizing: border-box;
  }

  .picker-search:focus {
    border-color: var(--vscode-focusBorder);
  }

  .picker-list {
    overflow-y: auto;
    padding: 4px 0;
  }

  .picker-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 12px;
    background: none;
    border: none;
    color: var(--vscode-menu-foreground);
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .picker-item:hover {
    background: var(--vscode-menu-selectionBackground);
    color: var(--vscode-menu-selectionForeground);
  }

  .picker-item.new-collection {
    color: var(--vscode-textLink-foreground);
  }

  .picker-item .codicon {
    font-size: 14px;
    flex-shrink: 0;
  }

  .new-collection-input-row {
    display: flex;
    gap: 4px;
    padding: 4px 12px;
  }

  .new-collection-input {
    flex: 1;
    padding: 4px 8px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    border-radius: 4px;
    font-size: 12px;
    outline: none;
  }

  .new-collection-input:focus {
    border-color: var(--vscode-focusBorder);
  }

  .new-collection-save {
    padding: 4px 8px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  .new-collection-save:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
