<script lang="ts">
  import type { Collection, Folder } from '../../types';
  import { isFolder } from '../../types';
  import { postMessage } from '../../lib/vscode';
  import { get } from 'svelte/store';
  import { request, isDirty } from '../../stores/request';
  import Tooltip from './Tooltip.svelte';

  interface Props {
    collectionId: string | null;
    collectionName: string | null;
    collections: Collection[];
    onSaveToCollection?: () => void;
    onSaveRequest?: () => void;
    onRevertRequest?: () => void;
  }
  let { collectionId, collectionName, collections, onSaveToCollection, onSaveRequest, onRevertRequest }: Props = $props();

  const dirty = $derived($isDirty);

  let showPicker = $state(false);
  let searchQuery = $state('');
  let showNewCollectionInput = $state(false);
  let newCollectionName = $state('');
  let buttonEl: HTMLButtonElement | undefined = $state();
  let dropdownPos = $state({ top: 0, right: 0 });

  const filteredCollections = $derived(
    searchQuery
      ? collections.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : collections
  );

  function handleSaveClick() {
    if (collectionId) {
      // Already in a collection - no action (just shows badge)
      return;
    }
    if (buttonEl) {
      const rect = buttonEl.getBoundingClientRect();
      dropdownPos = { top: rect.bottom + 4, right: window.innerWidth - rect.right };
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
      pathParams: r.pathParams,
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
  {#if collectionId && dirty}
    <div class="dirty-actions">
      <Tooltip text="Save to Collection (Ctrl+S)">
        <button class="dirty-save-btn" onclick={() => onSaveRequest?.()} aria-label="Save to Collection">
          <span class="codicon codicon-save"></span>
        </button>
      </Tooltip>
      <Tooltip text="Revert to Saved">
        <button class="dirty-revert-btn" onclick={() => onRevertRequest?.()} aria-label="Revert to Saved">
          <span class="codicon codicon-discard"></span>
        </button>
      </Tooltip>
      <Tooltip text={collectionName || 'Collection'}>
        <span class="collection-badge dirty">
          <span class="codicon codicon-folder"></span>
          <span class="badge-label">{collectionName || 'Collection'}</span>
          <span class="dirty-dot"><svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><circle cx="4" cy="4" r="4"/></svg></span>
        </span>
      </Tooltip>
    </div>
  {:else if collectionId}
    <Tooltip text={collectionName || 'Collection'}>
      <span class="collection-badge">
        <span class="codicon codicon-folder"></span>
        <span class="badge-label">{collectionName || 'Collection'}</span>
      </span>
    </Tooltip>
  {:else}
    <Tooltip text="Save to Collection">
      <button bind:this={buttonEl} class="save-btn" onclick={handleSaveClick}>
        <span class="codicon codicon-save"></span>
        <span class="save-label">Save</span>
      </button>
    </Tooltip>
  {/if}

  {#if showPicker}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="picker-dropdown" role="dialog" tabindex="-1" style="top: {dropdownPos.top}px; right: {dropdownPos.right}px;" onkeydown={handleKeydown}>
      <div class="picker-header">
        <!-- svelte-ignore a11y_autofocus -->
        <input
          type="text"
          class="picker-search"
          placeholder="Search collections..."
          bind:value={searchQuery}
          autofocus
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
  .dirty-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .dirty-save-btn,
  .dirty-revert-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px 6px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    font-size: 14px;
    transition: background 0.15s;
  }

  .dirty-save-btn {
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
  }

  .dirty-save-btn:hover {
    background: var(--hf-button-hoverBackground);
  }

  .dirty-revert-btn {
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
  }

  .dirty-revert-btn:hover {
    background: var(--hf-button-secondaryHoverBackground);
  }

  .collection-badge.dirty {
    border: 1px solid var(--hf-editorWarning-foreground, #cca700);
  }

  .dirty-dot {
    color: var(--hf-editorWarning-foreground, #cca700);
    font-size: 10px;
    margin-left: 2px;
    flex-shrink: 0;
  }

  .save-button-wrapper {
    position: relative;
  }

  .save-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 4px;
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: none;
    cursor: pointer;
    font-size: 11px;
    white-space: nowrap;
    transition: background 0.15s;
  }

  .save-btn:hover {
    background: var(--hf-button-secondaryHoverBackground);
  }

  .save-btn .codicon {
    font-size: 14px;
  }

  .collection-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 4px;
    background: var(--hf-badge-background);
    color: var(--hf-badge-foreground);
    border: none;
    cursor: default;
    font-size: 11px;
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
    position: fixed;
    width: 280px;
    max-height: 320px;
    background: var(--hf-menu-background);
    border: 1px solid var(--hf-menu-border, var(--hf-panel-border));
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 1000;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .picker-header {
    padding: 8px;
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .picker-search {
    width: 100%;
    padding: 6px 8px;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border);
    border-radius: 4px;
    font-size: 12px;
    outline: none;
    box-sizing: border-box;
  }

  .picker-search:focus {
    border-color: var(--hf-focusBorder);
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
    color: var(--hf-menu-foreground);
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .picker-item:hover {
    background: var(--hf-menu-selectionBackground);
    color: var(--hf-menu-selectionForeground);
  }

  .picker-item.new-collection {
    color: var(--hf-textLink-foreground);
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
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border);
    border-radius: 4px;
    font-size: 12px;
    outline: none;
  }

  .new-collection-input:focus {
    border-color: var(--hf-focusBorder);
  }

  .new-collection-save {
    padding: 4px 8px;
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  .new-collection-save:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
