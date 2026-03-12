<script lang="ts">
  import type { Collection, CollectionItem as CollectionItemType, SavedRequest, RequestKind } from '../../types';
  import { isFolder, isRequest, REQUEST_KIND } from '../../types';
  import { countAllItems } from '../../lib/tree-helpers';
  import { ui } from '../../stores/ui.svelte';
  import {
    toggleCollectionExpanded,
    editCollection,
    addFolder,
    updateRequest,
    moveItem,
    moveItemToPosition,
    reorderCollections,
    sortItems,
    selectedCollectionId,
    getAllRequests,
    isDraftsCollection,
  } from '../../stores/collections.svelte';
  import { dragState, startDrag, endDrag, setDropTarget, dropTarget, computeDropPosition } from '../../stores/dragdrop.svelte';
  import { clearMultiSelect } from '../../stores/multiSelect.svelte';
  import RequestItem from './RequestItem.svelte';
  import FolderItem from './FolderItem.svelte';
  import CreateItemDialog from '../shared/CreateItemDialog.svelte';
  import ConfirmDialog from '../shared/ConfirmDialog.svelte';
  import Tooltip from '../shared/Tooltip.svelte';
  interface Props {
    collection: Collection;
    postMessage: (message: any) => void;
  }
  let { collection, postMessage }: Props = $props();

  let showContextMenu = $state(false);
  let contextMenuX = $state(0);
  let contextMenuY = $state(0);
  let contextMenuEl: HTMLDivElement | undefined = $state();
  let showCreateFolderDialog = $state(false);
  let showEditDialog = $state(false);
  let showDeleteConfirm = $state(false);

  $effect(() => {
    const close = () => { showContextMenu = false; };
    window.addEventListener('close-context-menus', close);
    return () => window.removeEventListener('close-context-menus', close);
  });

  $effect(() => {
    if (contextMenuEl) {
      const rect = contextMenuEl.getBoundingClientRect();
      if (rect.bottom > window.innerHeight) {
        contextMenuY = Math.max(4, window.innerHeight - rect.height - 4);
      }
    }
  });
  const isSelected = $derived(selectedCollectionId() === collection.id);
  const expanded = $derived(collection.expanded);
  const itemCount = $derived(countAllItems(collection.items));
  const isDropTarget = $derived(dropTarget()?.id === collection.id);
  const currentDropPosition = $derived(isDropTarget ? dropTarget()?.position : undefined);
  const canAcceptDrop = $derived(dragState.isDragging && dragState.draggedItemId !== collection.id);
  const isBeingDragged = $derived(dragState.isDragging && dragState.draggedItemId === collection.id);
  const isDrafts = $derived(isDraftsCollection(collection));
  const isWorkspace = $derived(collection.source === 'workspace');
  const isSorting = $derived(ui.collectionSortOrder !== 'manual');
  const collectionIconClass = $derived(
    isDrafts ? 'codicon-edit' : collection.icon ?? 'codicon-folder'
  );

  function handleToggle() {
    toggleCollectionExpanded(collection.id);
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('close-context-menus'));
    showContextMenu = true;
    const menuWidth = 210;
    const menuHeight = 200;
    contextMenuX = Math.min(e.clientX, window.innerWidth - menuWidth);
    contextMenuY = Math.min(e.clientY, window.innerHeight - menuHeight);
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
    showDeleteConfirm = true;
  }

  function confirmDelete() {
    showDeleteConfirm = false;
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
    postMessage({ type: 'clearDrafts' });
  }

  function handleQuickAddClick(e: MouseEvent) {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('close-context-menus'));
    showContextMenu = true;
    const menuWidth = 210;
    const menuHeight = 200;
    contextMenuX = Math.min(e.clientX, window.innerWidth - menuWidth);
    contextMenuY = Math.min(e.clientY, window.innerHeight - menuHeight);
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

  // Drag handlers (collection header is draggable for reordering)
  let collectionHeaderEl = $state<HTMLElement>(undefined!);

  function handleCollectionDragStart(e: DragEvent) {
    if (isSorting || isDrafts) {
      e.preventDefault();
      return;
    }
    e.dataTransfer?.setData('text/plain', collection.id);
    e.dataTransfer!.effectAllowed = 'move';
    startDrag(collection.id, 'collection', collection.id);
  }

  function handleCollectionDragEnd() {
    endDrag();
  }

  // Drop handlers (collection can receive drops at root level or reorder)
  function handleDragOver(e: DragEvent) {
    if (!canAcceptDrop) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';

    if (dragState.draggedItemType === 'collection') {
      // Collection-to-collection reorder: only before/after
      const position = collectionHeaderEl ? computeDropPosition(e, collectionHeaderEl, false) : 'after';
      setDropTarget({ type: 'collection', id: collection.id, collectionId: collection.id, position });
    } else {
      // Item drop: before/inside/after
      const position = collectionHeaderEl ? computeDropPosition(e, collectionHeaderEl, true) : 'inside';
      setDropTarget({ type: 'collection', id: collection.id, collectionId: collection.id, position });
    }
  }

  function handleDragEnter(e: DragEvent) {
    if (!canAcceptDrop) return;
    e.preventDefault();
    setDropTarget({ type: 'collection', id: collection.id, collectionId: collection.id, position: 'inside' });
  }

  function handleDragLeave(e: DragEvent) {
    const relatedTarget = e.relatedTarget as HTMLElement;
    const currentTarget = e.currentTarget as HTMLElement;
    if (!currentTarget.contains(relatedTarget)) {
      if (dropTarget()?.id === collection.id) {
        setDropTarget(null);
      }
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();

    const draggedId = dragState.draggedItemId;
    const position = dropTarget()?.position || 'inside';
    if (!draggedId || !canAcceptDrop) {
      endDrag();
      return;
    }

    // Collection reorder
    if (dragState.draggedItemType === 'collection') {
      const reorderPos = position === 'inside' ? 'after' : position;
      reorderCollections(draggedId, collection.id, reorderPos);
      endDrag();
      return;
    }

    // Item drop with position
    if (dragState.draggedItemIds.length > 1) {
      for (const id of dragState.draggedItemIds) {
        moveItemToPosition(id, collection.id, collection.id, position === 'inside' ? 'inside' : position);
      }
      clearMultiSelect();
    } else {
      moveItemToPosition(draggedId, collection.id, collection.id, position);
    }

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
  class:drop-target={isDropTarget && currentDropPosition === 'inside'}
  class:drop-before={isDropTarget && currentDropPosition === 'before'}
  class:drop-after={isDropTarget && currentDropPosition === 'after'}
  role="group"
  ondragover={isSorting ? undefined : handleDragOver}
  ondragenter={isSorting ? undefined : handleDragEnter}
  ondragleave={isSorting ? undefined : handleDragLeave}
  ondrop={isSorting ? undefined : handleDrop}
>
  <div
    class="collection-header"
    class:selected={isSelected}
    class:dragging={isBeingDragged}
    draggable={!isSorting && !isDrafts}
    onclick={handleToggle}
    oncontextmenu={handleContextMenu}
    onkeydown={(e) => e.key === 'Enter' && handleToggle()}
    ondragstart={handleCollectionDragStart}
    ondragend={handleCollectionDragEnd}
    bind:this={collectionHeaderEl}
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
      <Tooltip text="Workspace collection (.hivefetch/)" position="top"><span class="source-badge codicon codicon-root-folder"></span></Tooltip>
    {/if}
    <span class="request-count">{itemCount}</span>
    {#if !isDrafts}
      <Tooltip text="Collection settings" position="top">
        <button
          class="collection-action-btn settings-btn"
          onclick={(e) => { e.stopPropagation(); handleOpenSettings(); }}
          aria-label="Collection settings"
        >
          <span class="codicon codicon-settings-gear"></span>
        </button>
      </Tooltip>
    {/if}
    <Tooltip text="More actions" position="top">
      <button
        class="quick-add-btn"
        class:hidden-spacer={isDrafts}
        onclick={handleQuickAddClick}
        aria-label="More actions"
      >
        <span class="codicon codicon-kebab-vertical"></span>
      </button>
    </Tooltip>
  </div>

  {#if expanded && collection.items.length > 0}
    <div class="items-list">
      {#each sortItems(collection.items, ui.collectionSortOrder) as item (item.id)}
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
    bind:this={contextMenuEl}
    role="menu"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.key === 'Escape' && closeContextMenu()}
  >
    {#if isDrafts}
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
      <button class="context-item" onclick={() => handleCreateTypedRequest(REQUEST_KIND.GRAPHQL_SUBSCRIPTION)}>
        <span class="context-icon codicon codicon-radio-tower"></span>
        New GraphQL Subscription
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

<ConfirmDialog
  open={showDeleteConfirm}
  title="Delete collection"
  message="This collection and all its requests will be permanently removed. This action cannot be undone."
  confirmLabel="Delete"
  variant="danger"
  onconfirm={confirmDelete}
  oncancel={() => (showDeleteConfirm = false)}
/>

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

  .collection-item.drop-before {
    box-shadow: inset 0 2px 0 0 var(--hf-focusBorder);
  }

  .collection-item.drop-after {
    box-shadow: inset 0 -2px 0 0 var(--hf-focusBorder);
  }

  .collection-header.dragging {
    opacity: 0.5;
    background: var(--hf-list-hoverBackground);
  }

  .collection-header[draggable="true"] {
    cursor: pointer;
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
    font-weight: 600;
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
    font-weight: 600;
    color: var(--hf-badge-foreground);
    background: var(--hf-badge-background);
    padding: 1px 6px;
    border-radius: 10px;
  }


  .collection-action-btn {
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

  .collection-header:hover .collection-action-btn {
    opacity: 0.6;
  }

  .collection-action-btn:hover {
    opacity: 1 !important;
    background: var(--hf-toolbar-hoverBackground, rgba(90, 93, 94, 0.31));
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
