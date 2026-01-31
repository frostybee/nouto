<script lang="ts">
  import type { Collection } from '../../types';
  import {
    toggleCollectionExpanded,
    renameCollection,
    deleteCollection,
    addRequestToCollection,
    updateRequest,
    selectedCollectionId,
  } from '../../stores/collections';
  import { request } from '../../stores/request';
  import { get } from 'svelte/store';
  import RequestItem from './RequestItem.svelte';

  export let collection: Collection;

  let showContextMenu = false;
  let contextMenuX = 0;
  let contextMenuY = 0;
  let isEditing = false;
  let editName = collection.name;

  $: isSelected = $selectedCollectionId === collection.id;
  $: expanded = collection.expanded;
  $: requestCount = collection.requests.length;

  function handleToggle() {
    toggleCollectionExpanded(collection.id);
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    showContextMenu = true;
    contextMenuX = e.clientX;
    contextMenuY = e.clientY;
  }

  function closeContextMenu() {
    showContextMenu = false;
  }

  function handleRename() {
    closeContextMenu();
    isEditing = true;
    editName = collection.name;
  }

  function handleDelete() {
    closeContextMenu();
    if (confirm(`Delete collection "${collection.name}"?`)) {
      deleteCollection(collection.id);
    }
  }

  function handleAddRequest() {
    closeContextMenu();
    // Get current request state and save it to this collection
    const currentRequest = get(request);
    addRequestToCollection(collection.id, {
      name: currentRequest.url ? getNameFromUrl(currentRequest.url) : 'New Request',
      method: currentRequest.method,
      url: currentRequest.url,
      params: currentRequest.params,
      headers: currentRequest.headers,
      auth: currentRequest.auth,
      body: currentRequest.body,
    });
    // Ensure collection is expanded to show new request
    if (!expanded) {
      toggleCollectionExpanded(collection.id);
    }
  }

  function getNameFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      return path === '/' ? urlObj.hostname : path.split('/').filter(Boolean).pop() || 'New Request';
    } catch {
      return 'New Request';
    }
  }

  function finishEditing() {
    isEditing = false;
    if (editName.trim() && editName !== collection.name) {
      renameCollection(collection.id, editName.trim());
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      finishEditing();
    } else if (e.key === 'Escape') {
      isEditing = false;
      editName = collection.name;
    }
  }

  function handleRequestRename(event: CustomEvent<{ id: string; name: string }>) {
    updateRequest(event.detail.id, { name: event.detail.name });
  }
</script>

<svelte:window on:click={closeContextMenu} />

<div class="collection-item">
  <div
    class="collection-header"
    class:selected={isSelected}
    on:click={handleToggle}
    on:contextmenu={handleContextMenu}
    on:keydown={(e) => e.key === 'Enter' && handleToggle()}
    role="button"
    tabindex="0"
  >
    <span class="expand-icon" class:expanded>
      {expanded ? '▼' : '▶'}
    </span>

    <span class="folder-icon">📁</span>

    {#if isEditing}
      <input
        type="text"
        class="edit-input"
        bind:value={editName}
        on:blur={finishEditing}
        on:keydown={handleKeydown}
        on:click|stopPropagation
        autofocus
      />
    {:else}
      <span class="collection-name">{collection.name}</span>
      <span class="request-count">{requestCount}</span>
    {/if}
  </div>

  {#if expanded && collection.requests.length > 0}
    <div class="requests-list">
      {#each collection.requests as req (req.id)}
        <RequestItem
          item={req}
          collectionId={collection.id}
          on:rename={handleRequestRename}
        />
      {/each}
    </div>
  {/if}
</div>

{#if showContextMenu}
  <div
    class="context-menu"
    style="left: {contextMenuX}px; top: {contextMenuY}px"
    on:click|stopPropagation
  >
    <button class="context-item" on:click={handleAddRequest}>
      Save Current Request Here
    </button>
    <div class="context-divider"></div>
    <button class="context-item" on:click={handleRename}>
      Rename
    </button>
    <button class="context-item danger" on:click={handleDelete}>
      Delete
    </button>
  </div>
{/if}

<style>
  .collection-item {
    user-select: none;
  }

  .collection-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.1s;
  }

  .collection-header:hover {
    background: var(--vscode-list-hoverBackground);
  }

  .collection-header.selected {
    background: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
  }

  .expand-icon {
    font-size: 10px;
    width: 12px;
    color: var(--vscode-foreground);
    opacity: 0.7;
    transition: transform 0.15s;
  }

  .folder-icon {
    font-size: 14px;
  }

  .collection-name {
    flex: 1;
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .request-count {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    background: var(--vscode-badge-background);
    padding: 1px 6px;
    border-radius: 10px;
  }

  .selected .request-count {
    background: var(--vscode-list-activeSelectionForeground);
    color: var(--vscode-list-activeSelectionBackground);
    opacity: 0.8;
  }

  .requests-list {
    margin-left: 8px;
    border-left: 1px solid var(--vscode-panel-border);
  }

  .edit-input {
    flex: 1;
    padding: 2px 4px;
    font-size: 13px;
    font-weight: 500;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    border-radius: 3px;
    outline: none;
  }

  .edit-input:focus {
    border-color: var(--vscode-focusBorder);
  }

  .context-menu {
    position: fixed;
    z-index: 1000;
    min-width: 180px;
    background: var(--vscode-menu-background);
    border: 1px solid var(--vscode-menu-border, var(--vscode-panel-border));
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    padding: 4px 0;
  }

  .context-item {
    display: block;
    width: 100%;
    padding: 6px 12px;
    background: none;
    border: none;
    color: var(--vscode-menu-foreground);
    font-size: 13px;
    text-align: left;
    cursor: pointer;
  }

  .context-item:hover {
    background: var(--vscode-menu-selectionBackground);
    color: var(--vscode-menu-selectionForeground);
  }

  .context-item.danger {
    color: var(--vscode-errorForeground);
  }

  .context-divider {
    height: 1px;
    margin: 4px 0;
    background: var(--vscode-menu-separatorBackground, var(--vscode-panel-border));
  }
</style>
