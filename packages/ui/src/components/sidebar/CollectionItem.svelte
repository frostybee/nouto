<script lang="ts">
  import type { Collection, CollectionItem as CollectionItemType, SavedRequest, RequestKind } from '../../types';
  import { isFolder, isRequest, REQUEST_KIND } from '../../types';
  import { getNameFromUrl } from '@hivefetch/core';
  import { countAllItems } from '../../lib/tree-helpers';
  import { ui } from '../../stores/ui';
  import {
    toggleCollectionExpanded,
    editCollection,
    addRequestToCollection,
    addFolder,
    updateRequest,
    moveItem,
    sortItems,
    selectedCollectionId,
    getAllRequests,
    isRecentCollection,
  } from '../../stores/collections';
  import { request } from '../../stores/request';
  import { dragState, endDrag, setDropTarget, dropTarget } from '../../stores/dragdrop';
  import { clearMultiSelect } from '../../stores/multiSelect';
  import { get } from 'svelte/store';
  import RequestItem from './RequestItem.svelte';
  import FolderItem from './FolderItem.svelte';
  import CreateItemDialog from '../shared/CreateItemDialog.svelte';
  interface Props {
    collection: Collection;
    postMessage: (message: any) => void;
  }
  let { collection, postMessage }: Props = $props();

  let showContextMenu = $state(false);
  let contextMenuX = $state(0);
  let contextMenuY = $state(0);
  let showCreateFolderDialog = $state(false);
  let showEditDialog = $state(false);
  const isSelected = $derived($selectedCollectionId === collection.id);
  const expanded = $derived(collection.expanded);
  const itemCount = $derived(countAllItems(collection.items));
  const isDropTarget = $derived($dropTarget?.type === 'collection' && $dropTarget?.id === collection.id);
  const canAcceptDrop = $derived($dragState.isDragging);
  const isRecent = $derived(isRecentCollection(collection));
  const isWorkspace = $derived(collection.source === 'workspace');
  const isSorting = $derived($ui.collectionSortOrder !== 'manual');
  const collectionIconClass = $derived(
    isRecent ? 'codicon-history' : collection.icon ?? 'codicon-folder'
  );

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

  function handleEdit() {
    closeContextMenu();
    showEditDialog = true;
  }

  function handleEditSave(data: { name: string; color?: string; icon?: string }) {
    editCollection(collection.id, data.name, data.color, data.icon);
    showEditDialog = false;
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

  function handleExportNative() {
    closeContextMenu();
    postMessage({
      type: 'exportNative',
      data: { collectionId: collection.id }
    });
  }

  function handleOpenSettings() {
    closeContextMenu();
    postMessage({
      type: 'openCollectionSettings',
      data: { collectionId: collection.id }
    });
  }

  function handleClearRecent() {
    closeContextMenu();
    postMessage({ type: 'clearRecent' });
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
      pathParams: currentRequest.pathParams,
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
    showCreateFolderDialog = true;
  }

  function handleCreateFolder(data: { name: string; color?: string; icon?: string }) {
    addFolder(collection.id, data.name, undefined, data.color, data.icon);
    showCreateFolderDialog = false;
    if (!expanded) {
      toggleCollectionExpanded(collection.id);
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

    // Multi-item drop: move all dragged items to collection root
    if ($dragState.draggedItemIds.length > 1) {
      for (const id of $dragState.draggedItemIds) {
        moveItem(id, collection.id);
      }
      clearMultiSelect();
    } else {
      // Single item drop
      moveItem(draggedId, collection.id);
    }

    // Expand collection to show the dropped item(s)
    if (!expanded) {
      toggleCollectionExpanded(collection.id);
    }

    endDrag();
  }
</script>

<svelte:window onclick={closeContextMenu} onkeydown={(e) => e.key === 'Escape' && closeContextMenu()} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="collection-item"
  class:drop-target={isDropTarget}
  role="group"
  ondragover={isSorting ? undefined : handleDragOver}
  ondragenter={isSorting ? undefined : handleDragEnter}
  ondragleave={isSorting ? undefined : handleDragLeave}
  ondrop={isSorting ? undefined : handleDrop}
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

    <span
      class="folder-icon codicon {collectionIconClass}"
      style={collection.color ? `color: ${collection.color}` : ''}
    ></span>

    <span class="collection-name">{collection.name}</span>
    {#if isWorkspace}
      <span class="source-badge codicon codicon-root-folder" title="Workspace collection (.hivefetch/)"></span>
    {/if}
    <span class="request-count">{itemCount}</span>
    <button
      class="quick-add-btn"
      class:hidden-spacer={isRecent}
      title="Add new request"
      onclick={handleQuickAddClick}
    >
      <span class="codicon codicon-kebab-vertical"></span>
    </button>
  </div>

  {#if expanded && collection.items.length > 0}
    <div class="items-list">
      {#each sortItems(collection.items, $ui.collectionSortOrder) as item (item.id)}
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
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="context-backdrop" role="presentation" onclick={closeContextMenu}></div>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="context-menu"
    style="left: {contextMenuX}px; top: {contextMenuY}px"
    role="menu"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.key === 'Escape' && closeContextMenu()}
  >
    {#if isRecent}
      <button class="context-item" onclick={handleRunAll}>
        <span class="context-icon codicon codicon-play"></span>
        Run All
      </button>
      <div class="context-divider"></div>
      <button class="context-item danger" onclick={handleClearRecent}>
        <span class="context-icon codicon codicon-clear-all"></span>
        Clear All
      </button>
    {:else}
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
      <button class="context-item" onclick={handleEdit}>
        <span class="context-icon codicon codicon-edit"></span>
        Edit...
      </button>
      <button class="context-item" onclick={handleDuplicate}>
        <span class="context-icon codicon codicon-copy"></span>
        Duplicate
      </button>
      <button class="context-item" onclick={handleExport}>
        <span class="context-icon codicon codicon-export"></span>
        Export to Postman
      </button>
      <button class="context-item" onclick={handleExportNative}>
        <span class="context-icon codicon codicon-export"></span>
        Export as HiveFetch
      </button>
      <div class="context-divider"></div>
      <button class="context-item danger" onclick={handleDelete}>
        <span class="context-icon codicon codicon-trash"></span>
        Delete
      </button>
    {/if}
  </div>
{/if}

{#if showEditDialog}
  <CreateItemDialog
    mode="collection"
    editMode={true}
    initialName={collection.name}
    initialColor={collection.color}
    initialIcon={collection.icon}
    oncreate={handleEditSave}
    oncancel={() => (showEditDialog = false)}
  />
{/if}

{#if showCreateFolderDialog}
  <CreateItemDialog
    mode="folder"
    oncreate={handleCreateFolder}
    oncancel={() => (showCreateFolderDialog = false)}
  />
{/if}

<style>
  .collection-item {
    user-select: none;
  }

  .collection-item.drop-target {
    outline: 2px dashed var(--hf-focusBorder);
    outline-offset: -2px;
    border-radius: 4px;
    background: var(--hf-list-dropBackground, rgba(0, 120, 215, 0.1));
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
    background: var(--hf-list-hoverBackground);
  }

  .collection-header.selected {
    background: transparent;
    outline: 1px solid var(--hf-focusBorder);
    outline-offset: -1px;
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

  .collection-name {
    flex: 1;
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .source-badge {
    font-size: 11px;
    color: var(--hf-textLink-foreground, #3794ff);
    opacity: 0.7;
    flex-shrink: 0;
  }

  .request-count {
    font-size: 11px;
    font-family: var(--hf-font-family), system-ui, -apple-system, sans-serif;
    font-weight: 500;
    color: var(--hf-badge-foreground);
    background: var(--hf-badge-background);
    padding: 1px 6px;
    border-radius: 10px;
  }


  .quick-add-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--hf-foreground);
    font-size: 14px;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s, background 0.15s;
  }

  .collection-header:hover .quick-add-btn:not(.hidden-spacer) {
    opacity: 0.6;
  }

  .hidden-spacer {
    visibility: hidden;
    pointer-events: none;
  }

  .quick-add-btn:hover {
    opacity: 1 !important;
    background: var(--hf-toolbar-hoverBackground, rgba(90, 93, 94, 0.31));
  }

  .items-list {
    margin-left: 8px;
    border-left: 1px solid var(--hf-panel-border);
  }

  .context-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 999;
    background: transparent;
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
