<script lang="ts">
  import type { Collection, CollectionItem as CollectionItemType, SavedRequest, RequestKind } from '../../types';
  import { isFolder, isRequest, REQUEST_KIND } from '../../types';
  import { getNameFromUrl } from '../../lib/formatters';
  import { countAllItems } from '../../lib/tree-helpers';
  import {
    toggleCollectionExpanded,
    renameCollection,
    addRequestToCollection,
    addFolder,
    updateRequest,
    moveItem,
    selectedCollectionId,
    getAllRequests,
  } from '../../stores/collections';
  import { request } from '../../stores/request';
  import { dragState, endDrag, setDropTarget, dropTarget } from '../../stores/dragdrop';
  import { get } from 'svelte/store';
  import RequestItem from './RequestItem.svelte';
  import FolderItem from './FolderItem.svelte';
  interface Props {
    collection: Collection;
    postMessage: (message: any) => void;
  }
  let { collection, postMessage }: Props = $props();

  let showContextMenu = $state(false);
  let contextMenuX = $state(0);
  let contextMenuY = $state(0);
  let isEditing = $state(false);
  let editName = $state('');
  const isSelected = $derived($selectedCollectionId === collection.id);
  const expanded = $derived(collection.expanded);
  const itemCount = $derived(countAllItems(collection.items));
  const isDropTarget = $derived($dropTarget?.type === 'collection' && $dropTarget?.id === collection.id);
  const canAcceptDrop = $derived($dragState.isDragging);

  function handleToggle() {
    toggleCollectionExpanded(collection.id);
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    showContextMenu = true;
    const menuWidth = 210;
    contextMenuX = Math.min(e.clientX, window.innerWidth - menuWidth);
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
    postMessage({
      type: 'deleteCollection',
      data: { id: collection.id }
    });
  }

  function handleRunAll() {
    closeContextMenu();
    postMessage({
      type: 'runAllInCollection',
      data: { collectionId: collection.id }
    });
  }

  function handleDuplicate() {
    closeContextMenu();
    postMessage({
      type: 'duplicateCollection',
      data: { id: collection.id }
    });
  }

  function handleExport() {
    closeContextMenu();
    postMessage({
      type: 'exportCollection',
      data: { collectionId: collection.id }
    });
  }

  function handleSetAuth() {
    closeContextMenu();
    postMessage({
      type: 'setCollectionAuth',
      data: { collectionId: collection.id }
    });
  }

  function handleSetHeaders() {
    closeContextMenu();
    postMessage({
      type: 'setCollectionHeaders',
      data: { collectionId: collection.id }
    });
  }

  function handleQuickAddClick(e: MouseEvent) {
    e.stopPropagation();
    showContextMenu = true;
    const menuWidth = 210;
    contextMenuX = Math.min(e.clientX, window.innerWidth - menuWidth);
    contextMenuY = e.clientY;
  }

  function handleCreateTypedRequest(kind: RequestKind) {
    closeContextMenu();
    postMessage({
      type: 'createRequest',
      data: { collectionId: collection.id, openInPanel: true, requestKind: kind },
    });
    if (!expanded) {
      toggleCollectionExpanded(collection.id);
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

  function handleAddFolder() {
    closeContextMenu();
    addFolder(collection.id, 'New Folder');
    // Ensure collection is expanded to show new folder
    if (!expanded) {
      toggleCollectionExpanded(collection.id);
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

  function handleRequestRename(data: { id: string; name: string }) {
    updateRequest(data.id, { name: data.name });
  }

  // Drop handlers (collection can receive drops at root level)
  function handleDragOver(e: DragEvent) {
    if (!canAcceptDrop) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';
    setDropTarget({ type: 'collection', id: collection.id, collectionId: collection.id });
  }

  function handleDragEnter(e: DragEvent) {
    if (!canAcceptDrop) return;
    e.preventDefault();
    setDropTarget({ type: 'collection', id: collection.id, collectionId: collection.id });
  }

  function handleDragLeave(e: DragEvent) {
    // Only clear if leaving to outside this element
    const relatedTarget = e.relatedTarget as HTMLElement;
    const currentTarget = e.currentTarget as HTMLElement;
    if (!currentTarget.contains(relatedTarget)) {
      if ($dropTarget?.id === collection.id) {
        setDropTarget(null);
      }
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();

    const draggedId = $dragState.draggedItemId;
    if (!draggedId || !canAcceptDrop) {
      endDrag();
      return;
    }

    // Move the item to collection root (no targetFolderId)
    moveItem(draggedId, collection.id);

    // Expand collection to show the dropped item
    if (!expanded) {
      toggleCollectionExpanded(collection.id);
    }

    endDrag();
  }
</script>

<svelte:window onclick={closeContextMenu} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="collection-item"
  class:drop-target={isDropTarget}
  role="group"
  ondragover={handleDragOver}
  ondragenter={handleDragEnter}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
>
  <div
    class="collection-header"
    class:selected={isSelected}
    onclick={handleToggle}
    oncontextmenu={handleContextMenu}
    onkeydown={(e) => e.key === 'Enter' && handleToggle()}
    role="button"
    tabindex="0"
  >
    <span class="expand-icon codicon" class:expanded class:codicon-chevron-down={expanded} class:codicon-chevron-right={!expanded}></span>

    <span class="folder-icon codicon codicon-folder"></span>

    {#if isEditing}
      <!-- svelte-ignore a11y_autofocus -->
      <input
        type="text"
        class="edit-input"
        bind:value={editName}
        onblur={finishEditing}
        onkeydown={handleKeydown}
        onclick={(e) => e.stopPropagation()}
        autofocus
      />
    {:else}
      <span class="collection-name">{collection.name}</span>
      <span class="request-count">{itemCount}</span>
      <button
        class="quick-add-btn"
        title="Add new request"
        onclick={handleQuickAddClick}
      >+</button>
    {/if}
  </div>

  {#if expanded && collection.items.length > 0}
    <div class="items-list">
      {#each collection.items as item (item.id)}
        {#if isFolder(item)}
          <FolderItem
            folder={item}
            collectionId={collection.id}
            depth={1}
            {postMessage}
          />
        {:else if isRequest(item)}
          <RequestItem
            item={item}
            collectionId={collection.id}
            depth={1}
            {postMessage}
            onrename={handleRequestRename}
          />
        {/if}
      {/each}
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
    <button class="context-item" onclick={() => handleCreateTypedRequest(REQUEST_KIND.HTTP)}>
      <span class="context-icon codicon codicon-globe"></span>
      New HTTP Request
    </button>
    <button class="context-item" onclick={() => handleCreateTypedRequest(REQUEST_KIND.GRAPHQL)}>
      <span class="context-icon codicon codicon-symbol-structure"></span>
      New GraphQL Request
    </button>
    <button class="context-item" onclick={() => handleCreateTypedRequest(REQUEST_KIND.WEBSOCKET)}>
      <span class="context-icon codicon codicon-plug"></span>
      New WebSocket
    </button>
    <button class="context-item" onclick={() => handleCreateTypedRequest(REQUEST_KIND.SSE)}>
      <span class="context-icon codicon codicon-broadcast"></span>
      New SSE Connection
    </button>
    <div class="context-divider"></div>
    <button class="context-item" role="menuitem" onclick={handleAddRequest}>
      <span class="context-icon codicon codicon-file-add"></span>
      Save Current Request Here
    </button>
    <button class="context-item" onclick={handleAddFolder}>
      <span class="context-icon codicon codicon-new-folder"></span>
      New Folder
    </button>
    <div class="context-divider"></div>
    <button class="context-item" onclick={handleRunAll}>
      <span class="context-icon codicon codicon-play"></span>
      Run All
    </button>
    <div class="context-divider"></div>
    <button class="context-item" onclick={handleSetAuth}>
      <span class="context-icon codicon codicon-key"></span>
      Set Auth...
    </button>
    <button class="context-item" onclick={handleSetHeaders}>
      <span class="context-icon codicon codicon-list-flat"></span>
      Set Headers...
    </button>
    <div class="context-divider"></div>
    <button class="context-item" onclick={handleRename}>
      <span class="context-icon codicon codicon-edit"></span>
      Rename
    </button>
    <button class="context-item" onclick={handleDuplicate}>
      <span class="context-icon codicon codicon-copy"></span>
      Duplicate
    </button>
    <button class="context-item" onclick={handleExport}>
      <span class="context-icon codicon codicon-export"></span>
      Export
    </button>
    <div class="context-divider"></div>
    <button class="context-item danger" onclick={handleDelete}>
      <span class="context-icon codicon codicon-trash"></span>
      Delete
    </button>
  </div>
{/if}


<style>
  .collection-item {
    user-select: none;
  }

  .collection-item.drop-target {
    outline: 2px dashed var(--vscode-focusBorder);
    outline-offset: -2px;
    border-radius: 4px;
    background: var(--vscode-list-dropBackground, rgba(0, 120, 215, 0.1));
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

  .quick-add-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    margin-left: auto;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--vscode-foreground);
    font-size: 16px;
    font-weight: 500;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s, background 0.15s;
  }

  .collection-header:hover .quick-add-btn {
    opacity: 0.6;
  }

  .quick-add-btn:hover {
    opacity: 1 !important;
    background: var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31));
  }

  .items-list {
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
  }

  .context-item:hover {
    background: var(--vscode-menu-selectionBackground);
    color: var(--vscode-menu-selectionForeground);
  }

  .context-item.danger {
    color: var(--vscode-errorForeground);
  }

  .context-icon {
    font-size: 12px;
    width: 16px;
    text-align: center;
  }

  .context-divider {
    height: 1px;
    margin: 4px 0;
    background: var(--vscode-menu-separatorBackground, var(--vscode-panel-border));
  }
</style>
