<script lang="ts">
  import type { Folder, CollectionItem as CollectionItemType, SavedRequest, RequestKind } from '../../types';
  import { isFolder, isRequest, REQUEST_KIND } from '../../types';
  import {
    toggleFolderExpanded,
    renameFolder,
    addFolder,
    addRequestToCollection,
    updateRequest,
    moveItem,
    selectedFolderId,
    findItemRecursive,
  } from '../../stores/collections';
  import { request } from '../../stores/request';
  import { dragState, startDrag, endDrag, setDropTarget, dropTarget } from '../../stores/dragdrop';
  import { get } from 'svelte/store';
  import RequestItem from './RequestItem.svelte';

  interface Props {
    folder: Folder;
    collectionId: string;
    depth?: number;
    parentFolderId?: string;
    postMessage: (message: any) => void;
  }
  let { folder, collectionId, depth = 1, parentFolderId = undefined, postMessage }: Props = $props();

  // Self-reference for recursive rendering
  import FolderItem from './FolderItem.svelte';

  let showContextMenu = $state(false);
  let contextMenuX = $state(0);
  let contextMenuY = $state(0);
  let isEditing = $state(false);
  let editName = $state('');

  const isSelected = $derived($selectedFolderId === folder.id);
  const expanded = $derived(folder.expanded);
  const childCount = $derived(countItems(folder.children));
  const isBeingDragged = $derived($dragState.isDragging && $dragState.draggedItemId === folder.id);
  const isDropTarget = $derived($dropTarget?.type === 'folder' && $dropTarget?.id === folder.id);
  const canAcceptDrop = $derived($dragState.isDragging && $dragState.draggedItemId !== folder.id && !isDescendant($dragState.draggedItemId));

  // Check if the dragged item is a descendant of this folder (prevent circular reference)
  function isDescendant(itemId: string | null): boolean {
    if (!itemId) return false;
    return findItemRecursive(folder.children, itemId) !== null;
  }

  function countItems(items: CollectionItemType[]): number {
    let count = 0;
    for (const item of items) {
      if (isRequest(item)) {
        count++;
      } else if (isFolder(item)) {
        count += countItems(item.children);
      }
    }
    return count;
  }

  function handleToggle() {
    toggleFolderExpanded(folder.id);
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
    editName = folder.name;
  }

  function handleDelete() {
    closeContextMenu();
    postMessage({
      type: 'deleteFolder',
      data: { folderId: folder.id, collectionId }
    });
  }

  function handleRunAll() {
    closeContextMenu();
    postMessage({
      type: 'runAllInFolder',
      data: { folderId: folder.id, collectionId }
    });
  }

  function handleDuplicate() {
    closeContextMenu();
    postMessage({
      type: 'duplicateFolder',
      data: { folderId: folder.id, collectionId }
    });
  }

  function handleExport() {
    closeContextMenu();
    postMessage({
      type: 'exportFolder',
      data: { folderId: folder.id, collectionId }
    });
  }

  function handleOpenSettings() {
    closeContextMenu();
    postMessage({
      type: 'openFolderSettings',
      data: { collectionId, folderId: folder.id }
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
      data: { collectionId, parentFolderId: folder.id, openInPanel: true, requestKind: kind },
    });
    if (!expanded) {
      toggleFolderExpanded(folder.id);
    }
  }

  function handleAddFolder() {
    closeContextMenu();
    addFolder(collectionId, 'New Folder', folder.id);
    if (!expanded) {
      toggleFolderExpanded(folder.id);
    }
  }

  function handleAddRequest() {
    closeContextMenu();
    const currentRequest = get(request);
    addRequestToCollection(
      collectionId,
      {
        name: currentRequest.url ? getNameFromUrl(currentRequest.url) : 'New Request',
        method: currentRequest.method,
        url: currentRequest.url,
        params: currentRequest.params,
        headers: currentRequest.headers,
        auth: currentRequest.auth,
        body: currentRequest.body,
      },
      folder.id
    );
    if (!expanded) {
      toggleFolderExpanded(folder.id);
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
    if (editName.trim() && editName !== folder.name) {
      renameFolder(folder.id, editName.trim());
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      finishEditing();
    } else if (e.key === 'Escape') {
      isEditing = false;
      editName = folder.name;
    }
  }

  function handleRequestRename(data: { id: string; name: string }) {
    updateRequest(data.id, { name: data.name });
  }

  // Drag handlers (this folder is draggable)
  function handleDragStart(e: DragEvent) {
    if (isEditing) {
      e.preventDefault();
      return;
    }
    e.dataTransfer?.setData('text/plain', folder.id);
    e.dataTransfer!.effectAllowed = 'move';
    startDrag(folder.id, 'folder', collectionId, parentFolderId);
  }

  function handleDragEnd() {
    endDrag();
  }

  // Drop handlers (this folder can receive drops)
  function handleDragOver(e: DragEvent) {
    if (!canAcceptDrop) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';
    setDropTarget({ type: 'folder', id: folder.id, collectionId });
  }

  function handleDragEnter(e: DragEvent) {
    if (!canAcceptDrop) return;
    e.preventDefault();
    setDropTarget({ type: 'folder', id: folder.id, collectionId });
  }

  function handleDragLeave(e: DragEvent) {
    // Only clear if leaving to outside this element (not entering children)
    const relatedTarget = e.relatedTarget as HTMLElement;
    const currentTarget = e.currentTarget as HTMLElement;
    if (!currentTarget.contains(relatedTarget)) {
      if ($dropTarget?.id === folder.id) {
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

    // Move the item to this folder
    moveItem(draggedId, collectionId, folder.id);

    // Expand folder to show the dropped item
    if (!expanded) {
      toggleFolderExpanded(folder.id);
    }

    endDrag();
  }
</script>

<svelte:window onclick={closeContextMenu} onkeydown={(e) => e.key === 'Escape' && closeContextMenu()} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="folder-item"
  class:drop-target={isDropTarget}
  role="group"
  ondragover={handleDragOver}
  ondragenter={handleDragEnter}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
>
  <div
    class="folder-header"
    class:selected={isSelected}
    class:dragging={isBeingDragged}
    style="padding-left: {8 + depth * 12}px"
    draggable={!isEditing}
    onclick={handleToggle}
    oncontextmenu={handleContextMenu}
    onkeydown={(e) => e.key === 'Enter' && handleToggle()}
    ondragstart={handleDragStart}
    ondragend={handleDragEnd}
    role="button"
    tabindex="0"
  >
    <span class="expand-icon codicon" class:expanded class:codicon-chevron-down={expanded} class:codicon-chevron-right={!expanded}></span>

    <span class="folder-icon codicon" class:codicon-folder-opened={expanded} class:codicon-folder={!expanded}></span>

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
      <span class="folder-name">{folder.name}</span>
      {#if childCount > 0}
        <span class="item-count">{childCount}</span>
      {/if}
      <button
        class="quick-add-btn"
        title="Add new request"
        onclick={handleQuickAddClick}
      >+</button>
    {/if}
  </div>

  {#if expanded && folder.children.length > 0}
    <div class="children-list">
      {#each folder.children as child (child.id)}
        {#if isFolder(child)}
          <FolderItem
            folder={child}
            {collectionId}
            parentFolderId={folder.id}
            depth={depth + 1}
            {postMessage}
          />
        {:else if isRequest(child)}
          <RequestItem
            item={child}
            {collectionId}
            parentFolderId={folder.id}
            depth={depth + 1}
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
    <button class="context-item" onclick={handleOpenSettings}>
      <span class="context-icon codicon codicon-settings-gear"></span>
      Settings...
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
  .folder-item {
    user-select: none;
  }

  .folder-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.1s;
  }

  .folder-header:hover {
    background: var(--hf-list-hoverBackground);
  }

  .folder-header.selected {
    background: var(--hf-list-activeSelectionBackground);
    color: var(--hf-list-activeSelectionForeground);
  }

  .folder-header.dragging {
    opacity: 0.5;
    background: var(--hf-list-hoverBackground);
  }

  .folder-header[draggable="true"] {
    cursor: pointer;
  }

  .folder-item.drop-target {
    outline: 2px dashed var(--hf-focusBorder);
    outline-offset: -2px;
    border-radius: 4px;
    background: var(--hf-list-dropBackground, rgba(0, 120, 215, 0.1));
  }

  .expand-icon {
    font-size: 10px;
    width: 12px;
    color: var(--hf-foreground);
    opacity: 0.7;
    transition: transform 0.15s;
  }

  .folder-icon {
    font-size: 14px;
  }

  .folder-name {
    flex: 1;
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item-count {
    font-size: 11px;
    color: var(--hf-descriptionForeground);
    background: var(--hf-badge-background);
    padding: 1px 6px;
    border-radius: 10px;
  }

  .selected .item-count {
    background: var(--hf-list-activeSelectionForeground);
    color: var(--hf-list-activeSelectionBackground);
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
    color: var(--hf-foreground);
    font-size: 16px;
    font-weight: 500;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s, background 0.15s;
  }

  .folder-header:hover .quick-add-btn {
    opacity: 0.6;
  }

  .quick-add-btn:hover {
    opacity: 1 !important;
    background: var(--hf-toolbar-hoverBackground, rgba(90, 93, 94, 0.31));
  }

  .children-list {
    margin-left: 8px;
    border-left: 1px solid var(--hf-panel-border);
  }

  .edit-input {
    flex: 1;
    padding: 2px 4px;
    font-size: 13px;
    font-weight: 500;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 3px;
    outline: none;
  }

  .edit-input:focus {
    border-color: var(--hf-focusBorder);
  }

  .context-menu {
    position: fixed;
    z-index: 1000;
    min-width: 180px;
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
