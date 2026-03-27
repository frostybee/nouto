<script lang="ts">
  import type { Folder, CollectionItem as CollectionItemType, SavedRequest, RequestKind } from '../../types';
  import { isFolder, isRequest, REQUEST_KIND } from '../../types';
  import {
    toggleFolderExpanded,
    editFolder,
    addFolder,
    deleteFolder,
    bulkDelete,
    updateRequest,
    moveItem,
    moveItemToPosition,
    sortItems,
    selectedFolderId,
    findItemRecursive,
  } from '../../stores/collections.svelte';
  import { ui } from '../../stores/ui.svelte';
  import { dragState, startDrag, startMultiDrag, endDrag, setDropTarget, dropTarget, computeDropPosition } from '../../stores/dragdrop.svelte';
  import type { DropPosition } from '../../stores/dragdrop.svelte';
  import { multiSelect, isMultiSelectActive, selectedCount, toggleItemSelection, rangeSelectTo, clearMultiSelect, getTopLevelSelectedIds } from '../../stores/multiSelect.svelte';
  import RequestItem from './RequestItem.svelte';
  import CreateItemDialog from '../shared/CreateItemDialog.svelte';
  import ConfirmDialog from '../shared/ConfirmDialog.svelte';
  import Tooltip from '../shared/Tooltip.svelte';

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
  let contextMenuEl: HTMLDivElement | undefined = $state();
  let showCreateSubfolderDialog = $state(false);
  let showEditDialog = $state(false);
  let showDeleteConfirm = $state(false);
  let pendingBulkDelete = $state(false);

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

  const isInMultiSelect = $derived(multiSelect().selectedIds.has(folder.id));
  const isSelected = $derived(isInMultiSelect || (!isMultiSelectActive() && selectedFolderId() === folder.id));
  const expanded = $derived(folder.expanded);
  const childCount = $derived(countItems(folder.children));
  const folderIconClass = $derived(
    folder.icon ?? (expanded ? 'codicon-folder-opened' : 'codicon-folder')
  );
  const isBeingDragged = $derived(dragState.isDragging && (dragState.draggedItemId === folder.id || dragState.draggedItemIds.includes(folder.id)));
  const isDropTarget = $derived(dropTarget()?.id === folder.id);
  const currentDropPosition = $derived(isDropTarget ? dropTarget()?.position : undefined);
  const canAcceptDrop = $derived(dragState.isDragging && dragState.draggedItemId !== folder.id && !isDescendant(dragState.draggedItemId));

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

  function handleToggle(e: MouseEvent) {
    if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd+Click: toggle multi-select (don't toggle expand)
      toggleItemSelection(folder.id, collectionId);
      return;
    }
    if (e.shiftKey) {
      // Shift+Click: range select
      rangeSelectTo(folder.id, collectionId);
      return;
    }
    // Regular click: clear multi-select, toggle expand
    clearMultiSelect();
    toggleFolderExpanded(folder.id);
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    // If right-clicking a non-selected item while multi-select is active, clear multi-select
    if (isMultiSelectActive() && !isInMultiSelect) {
      clearMultiSelect();
    }
    window.dispatchEvent(new CustomEvent('close-context-menus'));
    showContextMenu = true;
    const menuWidth = 210;
    const menuHeight = 200;
    contextMenuX = Math.min(e.clientX, window.innerWidth - menuWidth);
    contextMenuY = Math.min(e.clientY, window.innerHeight - menuHeight);
  }

  function handleBulkDelete() {
    closeContextMenu();
    pendingBulkDelete = true;
    showDeleteConfirm = true;
  }

  function handleBulkMove() {
    closeContextMenu();
    const state = multiSelect();
    const topLevel = getTopLevelSelectedIds();
    postMessage({
      type: 'bulkMovePickTarget',
      data: { itemIds: topLevel, sourceCollectionId: state.collectionId },
    });
  }

  function closeContextMenu() {
    showContextMenu = false;
  }

  function handleEdit() {
    closeContextMenu();
    showEditDialog = true;
  }

  function handleEditSave(data: { name: string; color?: string; icon?: string }) {
    editFolder(folder.id, data.name, data.color, data.icon);
    showEditDialog = false;
  }

  function handleDelete() {
    closeContextMenu();
    pendingBulkDelete = false;
    showDeleteConfirm = true;
  }

  function confirmDelete() {
    showDeleteConfirm = false;
    if (pendingBulkDelete) {
      const state = multiSelect();
      const topLevel = getTopLevelSelectedIds();
      bulkDelete(topLevel, state.collectionId!);
      clearMultiSelect();
    } else {
      deleteFolder(folder.id);
    }
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
      data: { collectionId, parentFolderId: folder.id, openInPanel: true, requestKind: kind },
    });
    if (!expanded) {
      toggleFolderExpanded(folder.id);
    }
  }

  function handleAddFolder() {
    closeContextMenu();
    showCreateSubfolderDialog = true;
  }

  function handleCreateSubfolder(data: { name: string; color?: string; icon?: string }) {
    addFolder(collectionId, data.name, folder.id, data.color, data.icon);
    showCreateSubfolderDialog = false;
    if (!expanded) {
      toggleFolderExpanded(folder.id);
    }
  }

  function handleRequestRename(data: { id: string; name: string }) {
    updateRequest(data.id, { name: data.name });
  }

  const isSorting = $derived(ui.collectionSortOrder !== 'manual');

  // Drag handlers (this folder is draggable)
  function handleDragStart(e: DragEvent) {
    if (isSorting) {
      e.preventDefault();
      return;
    }
    e.dataTransfer?.setData('text/plain', folder.id);
    e.dataTransfer!.effectAllowed = 'move';

    // Multi-drag: if this item is part of a multi-selection, drag all selected items
    if (isInMultiSelect && multiSelect().selectedIds.size > 1) {
      const topLevel = getTopLevelSelectedIds();
      startMultiDrag(folder.id, topLevel, collectionId);
      const badge = document.createElement('div');
      badge.textContent = `${topLevel.length} items`;
      badge.style.cssText = 'position:absolute;top:-1000px;padding:4px 8px;background:#007acc;color:#fff;border-radius:4px;font-size:12px;white-space:nowrap;';
      document.body.appendChild(badge);
      e.dataTransfer!.setDragImage(badge, 0, 0);
      requestAnimationFrame(() => badge.remove());
    } else {
      startDrag(folder.id, 'folder', collectionId, parentFolderId);
    }
  }

  function handleDragEnd() {
    endDrag();
  }

  // Drop handlers (this folder can receive drops)
  let folderHeaderEl = $state<HTMLElement>(undefined!);

  function handleDragOver(e: DragEvent) {
    if (!canAcceptDrop) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer!.dropEffect = 'move';
    const position = folderHeaderEl ? computeDropPosition(e, folderHeaderEl, true) : 'inside';
    setDropTarget({ type: 'folder', id: folder.id, collectionId, position });
  }

  function handleDragEnter(e: DragEvent) {
    if (!canAcceptDrop) return;
    e.preventDefault();
    e.stopPropagation();
    const position = folderHeaderEl ? computeDropPosition(e, folderHeaderEl, true) : 'inside';
    setDropTarget({ type: 'folder', id: folder.id, collectionId, position });
  }

  function handleDragLeave(e: DragEvent) {
    // Only clear if leaving to outside this element (not entering children)
    const relatedTarget = e.relatedTarget as HTMLElement;
    const currentTarget = e.currentTarget as HTMLElement;
    if (!currentTarget.contains(relatedTarget)) {
      if (dropTarget()?.id === folder.id) {
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

    // Multi-item drop: move all dragged items
    if (dragState.draggedItemIds.length > 1) {
      for (const id of dragState.draggedItemIds) {
        if (id !== folder.id && !isDescendant(id)) {
          moveItemToPosition(id, folder.id, collectionId, position);
        }
      }
      clearMultiSelect();
    } else {
      // Single item drop with position
      moveItemToPosition(draggedId, folder.id, collectionId, position);
    }

    // Expand folder to show the dropped item(s) when dropping inside
    if (position === 'inside' && !expanded) {
      toggleFolderExpanded(folder.id);
    }

    endDrag();
  }
</script>

<svelte:window onclick={closeContextMenu} onkeydown={(e) => e.key === 'Escape' && closeContextMenu()} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="folder-item"
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
    class="folder-header"
    class:selected={isSelected}
    class:dragging={isBeingDragged}
    style="padding-left: {8 + depth * 12}px"
    draggable={!isSorting}
    onclick={handleToggle}
    oncontextmenu={handleContextMenu}
    onkeydown={(e) => e.key === 'Enter' && handleToggle(new MouseEvent('click', { ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey }))}
    ondragstart={handleDragStart}
    ondragend={handleDragEnd}
    bind:this={folderHeaderEl}
    role="button"
    tabindex="0"
  >
    <span class="expand-icon codicon" class:expanded class:codicon-chevron-down={expanded} class:codicon-chevron-right={!expanded}></span>

    <span
      class="folder-icon codicon {folderIconClass}"
      style={folder.color ? `color: ${folder.color}` : ''}
    ></span>

    <span class="folder-name">{folder.name}</span>
    {#if childCount > 0}
      <span class="item-count">{childCount}</span>
    {/if}
    <span class="spacer"></span>
    <Tooltip text="More actions" position="top">
      <button
        class="quick-add-btn"
        onclick={handleQuickAddClick}
        aria-label="More actions"
      >
        <span class="codicon codicon-kebab-vertical"></span>
      </button>
    </Tooltip>
  </div>

  {#if expanded && folder.children.length > 0}
    <div class="children-list">
      {#each sortItems(folder.children, ui.collectionSortOrder) as child (child.id)}
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
    bind:this={contextMenuEl}
    role="menu"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.key === 'Escape' && closeContextMenu()}
  >
    {#if isMultiSelectActive() && isInMultiSelect}
      <button class="context-item" onclick={handleBulkMove}>
        <span class="context-icon codicon codicon-move"></span>
        Move {selectedCount()} items...
      </button>
      <div class="context-divider"></div>
      <button class="context-item danger" onclick={handleBulkDelete}>
        <span class="context-icon codicon codicon-trash"></span>
        Delete {selectedCount()} items
      </button>
      <div class="context-divider"></div>
      <button class="context-item" onclick={() => { closeContextMenu(); clearMultiSelect(); }}>
        <span class="context-icon codicon codicon-close"></span>
        Deselect All
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
      <button class="context-item" onclick={() => handleCreateTypedRequest(REQUEST_KIND.GRPC)}>
        <span class="context-icon codicon codicon-server"></span>
        New gRPC Call
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
        Export
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
    mode="folder"
    editMode={true}
    initialName={folder.name}
    initialColor={folder.color}
    initialIcon={folder.icon}
    oncreate={handleEditSave}
    oncancel={() => (showEditDialog = false)}
  />
{/if}

{#if showCreateSubfolderDialog}
  <CreateItemDialog
    mode="folder"
    oncreate={handleCreateSubfolder}
    oncancel={() => (showCreateSubfolderDialog = false)}
  />
{/if}

<ConfirmDialog
  open={showDeleteConfirm}
  title={pendingBulkDelete ? 'Delete selected items' : 'Delete folder'}
  message={pendingBulkDelete
    ? `${selectedCount()} selected items will be permanently removed. This action cannot be undone.`
    : 'This folder and all its contents will be permanently removed. This action cannot be undone.'}
  confirmLabel="Delete"
  variant="danger"
  onconfirm={confirmDelete}
  oncancel={() => (showDeleteConfirm = false)}
/>

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

  .folder-item.drop-before {
    box-shadow: inset 0 2px 0 0 var(--hf-focusBorder);
  }

  .folder-item.drop-after {
    box-shadow: inset 0 -2px 0 0 var(--hf-focusBorder);
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
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .item-count {
    font-size: 11px;
    color: var(--hf-descriptionForeground);
    background: var(--hf-badge-background);
    padding: 1px 6px;
    border-radius: 10px;
    flex-shrink: 0;
  }

  .spacer {
    flex: 1;
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
    width: 22px;
    height: 22px;
    padding: 0;
    margin-left: auto;
    background: transparent;
    border: none;
    border-radius: 3px;
    color: var(--hf-descriptionForeground);
    font-size: 14px;
    cursor: pointer;
    opacity: 0;
    flex-shrink: 0;
    transition: opacity 0.1s, background 0.1s;
  }

  .folder-header:hover .quick-add-btn {
    opacity: 1;
  }

  .quick-add-btn:hover {
    background: var(--hf-button-secondaryHoverBackground, var(--hf-list-hoverBackground));
    color: var(--hf-foreground);
  }

  .children-list {
    margin-left: 8px;
    border-left: 1px solid var(--hf-panel-border);
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
