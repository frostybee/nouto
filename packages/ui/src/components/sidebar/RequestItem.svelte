<script lang="ts">
  import type { SavedRequest } from '../../types';
  import MethodBadge from '../shared/MethodBadge.svelte';
  import { getBaseUrl, generateCode, formatTimestamp, formatFullDate } from '@nouto/core';
  import { substituteVariables, substituteVariablesWithScope, getScopedContextForRequest } from '../../stores/environment.svelte';
  import { request } from '../../stores/request.svelte';
  import { selectRequest, duplicateRequest, selectedRequestId, collections } from '../../stores/collections.svelte';
  import { dragState, startDrag, startMultiDrag, endDrag, setDropTarget, dropTarget, computeDropPosition } from '../../stores/dragdrop.svelte';
  import { moveItemToPosition } from '../../stores/collections.svelte';
  import { dirtyRequestIds } from '../../stores/dirtyState.svelte';
  import { setHistoryCollectionFilter } from '../../stores/history.svelte';
  import { setSidebarTab, ui } from '../../stores/ui.svelte';
  import { multiSelect, isMultiSelectActive, selectedCount, toggleItemSelection, rangeSelectTo, clearMultiSelect, getTopLevelSelectedIds } from '../../stores/multiSelect.svelte';
  import ConfirmDialog from '../shared/ConfirmDialog.svelte';
  import Tooltip from '../shared/Tooltip.svelte';

  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const mins = Math.floor(ms / 60000);
    const secs = Math.round((ms % 60000) / 1000);
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }

  interface Props {
    item: SavedRequest;
    collectionId: string;
    depth?: number;
    parentFolderId?: string;
    postMessage?: (message: any) => void;
    onrename?: (data: { id: string; name: string }) => void;
  }
  let { item, collectionId, depth = 1, parentFolderId = undefined, postMessage = undefined, onrename }: Props = $props();

  let showContextMenu = $state(false);
  let contextMenuX = $state(0);
  let contextMenuY = $state(0);
  let isEditing = $state(false);
  let editName = $state('');
  let showDeleteConfirm = $state(false);
  let pendingBulkDelete = $state(false);

  $effect(() => {
    const close = () => { showContextMenu = false; };
    window.addEventListener('close-context-menus', close);
    return () => window.removeEventListener('close-context-menus', close);
  });

  const isInMultiSelect = $derived(multiSelect().selectedIds.has(item.id));
  const isSelected = $derived(isInMultiSelect || (!isMultiSelectActive() && selectedRequestId() === item.id));
  const isBeingDragged = $derived(dragState.isDragging && (dragState.draggedItemId === item.id || dragState.draggedItemIds.includes(item.id)));
  const itemIsDirty = $derived(dirtyRequestIds().has(item.id));
  const hasDescription = $derived(!!item.description?.trim());
  const enabledAssertionCount = $derived(item.assertions?.filter(a => a.enabled).length ?? 0);
  const resolvedUrl = $derived(substituteVariables(item.url));


  function handleClick(e: MouseEvent) {
    if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd+Click: toggle multi-select
      toggleItemSelection(item.id, collectionId);
      return;
    }
    if (e.shiftKey) {
      // Shift+Click: range select
      rangeSelectTo(item.id, collectionId);
      return;
    }
    // Regular click: clear multi-select, normal single-select + open
    clearMultiSelect();
    selectRequest(collectionId, item.id);
    postMessage?.({
      type: 'openCollectionRequest',
      data: {
        requestId: item.id,
        collectionId,
        newTab: false,
      }
    });
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

  function handleMoreButton(e: MouseEvent) {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('close-context-menus'));
    showContextMenu = true;
    const btn = e.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    const menuWidth = 210;
    const menuHeight = 200;
    contextMenuX = Math.min(rect.right, window.innerWidth - menuWidth);
    contextMenuY = Math.min(rect.bottom + 4, window.innerHeight - menuHeight);
  }

  function closeContextMenu() {
    showContextMenu = false;
  }

  function handleRename() {
    closeContextMenu();
    isEditing = true;
    editName = item.name;
  }

  function handleDelete() {
    closeContextMenu();
    pendingBulkDelete = false;
    showDeleteConfirm = true;
  }

  function handleBulkDelete() {
    closeContextMenu();
    pendingBulkDelete = true;
    showDeleteConfirm = true;
  }

  function confirmDelete() {
    showDeleteConfirm = false;
    if (pendingBulkDelete) {
      const state = multiSelect();
      const topLevel = getTopLevelSelectedIds();
      postMessage?.({
        type: 'bulkDelete',
        data: { itemIds: topLevel, collectionId: state.collectionId },
      });
      clearMultiSelect();
    } else {
      postMessage?.({
        type: 'deleteRequest',
        data: { requestId: item.id },
      });
    }
  }

  function handleBulkMove() {
    closeContextMenu();
    const state = multiSelect();
    const topLevel = getTopLevelSelectedIds();
    postMessage?.({
      type: 'bulkMovePickTarget',
      data: { itemIds: topLevel, sourceCollectionId: state.collectionId },
    });
  }

  function handleDuplicate() {
    closeContextMenu();
    duplicateRequest(item.id);
  }

  function handleCopyAsCurl() {
    closeContextMenu();
    const { variables: scopedVars, headers: inheritedHeaders } = getScopedContextForRequest(collections(), collectionId, item.id);
    const sub = (text: string) => substituteVariablesWithScope(text, scopedVars);

    // Merge inherited headers (collection/folder) with request headers.
    // Request headers override inherited ones (by key, case-insensitive).
    const requestHeaderKeys = new Set(item.headers.filter(h => h.enabled && h.key).map(h => h.key.toLowerCase()));
    const mergedHeaders = [
      ...inheritedHeaders.filter(h => h.enabled && !requestHeaderKeys.has(h.key.toLowerCase())),
      ...item.headers.filter(h => h.enabled),
    ];

    const curl = generateCode('curl', {
      method: item.method,
      url: sub(item.url),
      headers: mergedHeaders.map(h => ({ ...h, key: sub(h.key), value: sub(h.value) })),
      params: item.params.map(p => ({ ...p, key: sub(p.key), value: sub(p.value) })),
      auth: {
        ...item.auth,
        username: item.auth.username ? sub(item.auth.username) : undefined,
        password: item.auth.password ? sub(item.auth.password) : undefined,
        token: item.auth.token ? sub(item.auth.token) : undefined,
        apiKeyName: item.auth.apiKeyName ? sub(item.auth.apiKeyName) : undefined,
        apiKeyValue: item.auth.apiKeyValue ? sub(item.auth.apiKeyValue) : undefined,
      },
      body: {
        ...item.body,
        content: item.body.content ? sub(item.body.content) : item.body.content,
      },
    });
    navigator.clipboard.writeText(curl);
  }

  function handleOpenNewTab() {
    closeContextMenu();
    postMessage?.({
      type: 'openCollectionRequest',
      data: { requestId: item.id, collectionId, newTab: true }
    });
  }

  function handleRunRequest() {
    closeContextMenu();
    postMessage?.({
      type: 'runCollectionRequest',
      data: { requestId: item.id, collectionId }
    });
  }

  function handleViewSendHistory() {
    closeContextMenu();
    setHistoryCollectionFilter({ collectionId, requestName: item.name });
    setSidebarTab('history');
  }

  function finishEditing() {
    isEditing = false;
    if (editName.trim() && editName !== item.name) {
      onrename?.({ id: item.id, name: editName.trim() });
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      finishEditing();
    } else if (e.key === 'Escape') {
      isEditing = false;
      editName = item.name;
    }
  }

  const isDropTarget = $derived(dropTarget()?.type === 'request' && dropTarget()?.id === item.id);
  const currentDropPosition = $derived(isDropTarget ? dropTarget()?.position : undefined);
  const canAcceptDrop = $derived(dragState.isDragging && dragState.draggedItemId !== item.id);

  let requestEl = $state<HTMLElement>(undefined!);

  // Drop handlers (request items can receive before/after drops)
  function handleItemDragOver(e: DragEvent) {
    if (!canAcceptDrop) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer!.dropEffect = 'move';
    const position = requestEl ? computeDropPosition(e, requestEl, false) : 'after';
    setDropTarget({ type: 'request', id: item.id, collectionId, position });
  }

  function handleItemDragEnter(e: DragEvent) {
    if (!canAcceptDrop) return;
    e.preventDefault();
    e.stopPropagation();
    const position = requestEl ? computeDropPosition(e, requestEl, false) : 'after';
    setDropTarget({ type: 'request', id: item.id, collectionId, position });
  }

  function handleItemDragLeave(e: DragEvent) {
    const relatedTarget = e.relatedTarget as HTMLElement;
    const currentTarget = e.currentTarget as HTMLElement;
    if (!currentTarget.contains(relatedTarget)) {
      if (dropTarget()?.id === item.id) {
        setDropTarget(null);
      }
    }
  }

  function handleItemDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();

    const draggedId = dragState.draggedItemId;
    const position = dropTarget()?.position || 'after';
    if (!draggedId || !canAcceptDrop) {
      endDrag();
      return;
    }

    if (dragState.draggedItemIds.length > 1) {
      for (const id of dragState.draggedItemIds) {
        if (id !== item.id) {
          moveItemToPosition(id, item.id, collectionId, position);
        }
      }
      clearMultiSelect();
    } else {
      moveItemToPosition(draggedId, item.id, collectionId, position);
    }

    endDrag();
  }

  // Drag handlers
  function handleDragStart(e: DragEvent) {
    if (isEditing) {
      e.preventDefault();
      return;
    }
    e.dataTransfer?.setData('text/plain', item.id);
    e.dataTransfer!.effectAllowed = 'move';

    // Multi-drag: if this item is part of a multi-selection, drag all selected items
    if (isInMultiSelect && multiSelect().selectedIds.size > 1) {
      const topLevel = getTopLevelSelectedIds();
      startMultiDrag(item.id, topLevel, collectionId);
      // Custom drag image with count badge
      const badge = document.createElement('div');
      badge.textContent = `${topLevel.length} items`;
      badge.style.cssText = 'position:absolute;top:-1000px;padding:4px 8px;background:#007acc;color:#fff;border-radius:4px;font-size:12px;white-space:nowrap;';
      document.body.appendChild(badge);
      e.dataTransfer!.setDragImage(badge, 0, 0);
      requestAnimationFrame(() => badge.remove());
    } else {
      startDrag(item.id, 'request', collectionId, parentFolderId);
    }
  }

  function handleDragEnd() {
    endDrag();
  }
</script>

<svelte:window onclick={closeContextMenu} onkeydown={(e) => e.key === 'Escape' && closeContextMenu()} />

<div
  class="request-item"
  class:selected={isSelected}
  class:dragging={isBeingDragged}
  class:drop-before={isDropTarget && currentDropPosition === 'before'}
  class:drop-after={isDropTarget && currentDropPosition === 'after'}
  data-request-id={item.id}
  style="padding-left: {8 + depth * 12}px"
  draggable={!isEditing && ui.collectionSortOrder === 'manual'}
  onclick={handleClick}
  oncontextmenu={handleContextMenu}
  onkeydown={(e) => e.key === 'Enter' && handleClick(new MouseEvent('click', { ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey }))}
  ondragstart={handleDragStart}
  ondragend={handleDragEnd}
  ondragover={ui.collectionSortOrder === 'manual' ? handleItemDragOver : undefined}
  ondragenter={ui.collectionSortOrder === 'manual' ? handleItemDragEnter : undefined}
  ondragleave={ui.collectionSortOrder === 'manual' ? handleItemDragLeave : undefined}
  ondrop={ui.collectionSortOrder === 'manual' ? handleItemDrop : undefined}
  bind:this={requestEl}
  role="button"
  tabindex="0"
>
  <MethodBadge method={item.method} connectionMode={item.connectionMode} bodyType={item.body?.type} />

  <div class="request-info">
    {#if isEditing}
      <!-- svelte-ignore a11y_autofocus -->
      <input
        type="text"
        class="edit-input"
        bind:value={editName}
        onblur={finishEditing}
        onkeydown={handleKeydown}
        autofocus
      />
    {:else}
      <div class="request-name">
        <span class="request-name-text">{item.name}</span>
        {#if itemIsDirty}<span class="dirty-indicator"></span>{/if}
        {#if hasDescription}
          <Tooltip text="Has description" position="top">
            <span class="indicator-icon note-indicator codicon codicon-note"></span>
          </Tooltip>
        {/if}
        {#if enabledAssertionCount > 0}
          <Tooltip text="{enabledAssertionCount} assertion{enabledAssertionCount > 1 ? 's' : ''}" position="top">
            <span class="assertion-badge">{enabledAssertionCount}</span>
          </Tooltip>
        {/if}
      </div>
      <Tooltip text={resolvedUrl || 'No URL'} position="bottom" delay={400}>
        <span class="request-url">{getBaseUrl(resolvedUrl)}</span>
      </Tooltip>
    {/if}
  </div>
  <div class="response-meta">
    <Tooltip text={formatFullDate(item.updatedAt)} position="top">
      <span class="request-time">{formatTimestamp(item.updatedAt)}</span>
    </Tooltip>
    {#if item.lastResponseStatus}
      <span class="status-badge" class:status-2xx={item.lastResponseStatus >= 200 && item.lastResponseStatus < 300} class:status-3xx={item.lastResponseStatus >= 300 && item.lastResponseStatus < 400} class:status-4xx={item.lastResponseStatus >= 400 && item.lastResponseStatus < 500} class:status-5xx={item.lastResponseStatus >= 500}>{item.lastResponseStatus}</span>
    {/if}
    {#if item.lastResponseDuration}
      <span class="response-duration">{formatDuration(item.lastResponseDuration)}</span>
    {/if}
  </div>
  <button
    class="item-more-btn"
    onclick={handleMoreButton}
    aria-label="More actions"
  >
    <span class="codicon codicon-kebab-vertical"></span>
  </button>
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
      <button class="context-item" role="menuitem" onclick={handleOpenNewTab}>
        <span class="context-icon codicon codicon-link-external"></span>
        Open in New Tab
      </button>
      <button class="context-item" onclick={handleRunRequest}>
        <span class="context-icon codicon codicon-play"></span>
        Run Request
      </button>
      <button class="context-item" onclick={handleViewSendHistory}>
        <span class="context-icon codicon codicon-history"></span>
        View Send History
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
      {#if !item.connectionMode || item.connectionMode === 'http'}
        <button class="context-item" onclick={handleCopyAsCurl}>
          <span class="context-icon codicon codicon-terminal"></span>
          Copy as cURL
        </button>
      {/if}
      <div class="context-divider"></div>
      <button class="context-item danger" onclick={handleDelete}>
        <span class="context-icon codicon codicon-trash"></span>
        Delete
      </button>
    {/if}
  </div>
{/if}

<ConfirmDialog
  open={showDeleteConfirm}
  title={pendingBulkDelete ? 'Delete selected items' : 'Delete request'}
  message={pendingBulkDelete
    ? `${selectedCount()} selected items will be permanently removed. This action cannot be undone.`
    : 'This request will be permanently removed. This action cannot be undone.'}
  confirmLabel="Delete"
  variant="danger"
  onconfirm={confirmDelete}
  oncancel={() => (showDeleteConfirm = false)}
/>

<style>
  .request-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.1s;
  }

  .request-item:hover {
    background: var(--hf-list-hoverBackground);
  }

  .item-more-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    background: none;
    border: none;
    border-radius: 3px;
    color: var(--hf-descriptionForeground);
    cursor: pointer;
    font-size: 14px;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.1s, background 0.1s;
  }

  .request-item:hover .item-more-btn {
    opacity: 1;
  }

  .item-more-btn:hover {
    background: var(--hf-button-secondaryHoverBackground, var(--hf-list-hoverBackground));
    color: var(--hf-foreground);
  }

  .request-item.selected {
    background: var(--hf-list-activeSelectionBackground);
    color: var(--hf-list-activeSelectionForeground);
  }

  .request-item.dragging {
    opacity: 0.5;
    background: var(--hf-list-hoverBackground);
  }

  .request-item.drop-before {
    box-shadow: inset 0 2px 0 0 var(--hf-focusBorder);
  }

  .request-item.drop-after {
    box-shadow: inset 0 -2px 0 0 var(--hf-focusBorder);
  }

  .request-item[draggable="true"] {
    cursor: pointer;
  }

  .request-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .request-info > :global(.tooltip-wrapper) {
    min-width: 0;
  }

  .request-name :global(.tooltip-wrapper) {
    flex-shrink: 0;
  }

  .request-name {
    display: flex;
    align-items: center;
    font-size: 13px;
    min-width: 0;
  }

  .request-name-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .dirty-indicator {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--hf-editorWarning-foreground, #cca700);
    margin-left: 6px;
    vertical-align: middle;
    flex-shrink: 0;
  }

  .indicator-icon {
    font-size: 11px;
    margin-left: 4px;
    opacity: 0.5;
    vertical-align: middle;
  }

  .note-indicator {
    color: var(--hf-charts-yellow, #f0c040);
    opacity: 0.85;
  }

  .assertion-badge {
    display: inline-block;
    font-size: 9px;
    font-weight: 700;
    padding: 0 4px;
    margin-left: 4px;
    border-radius: 3px;
    background: var(--hf-badge-background);
    color: var(--hf-badge-foreground);
    vertical-align: middle;
    line-height: 15px;
  }

  .request-url {
    font-size: 11px;
    color: var(--hf-descriptionForeground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
  }

  .request-time {
    font-size: 10px;
    color: var(--hf-descriptionForeground);
    opacity: 0.7;
    white-space: nowrap;
  }

  .selected .request-url {
    color: var(--hf-list-activeSelectionForeground);
    opacity: 0.8;
  }

  .edit-input {
    width: 100%;
    padding: 2px 4px;
    font-size: 13px;
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
    min-width: 140px;
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

  .response-meta {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .status-badge {
    font-size: 10px;
    font-weight: 600;
    padding: 1px 4px;
    border-radius: 3px;
    background: var(--hf-badge-background);
    color: var(--hf-badge-foreground);
  }

  .status-badge.status-2xx {
    background: #2ea04360;
    color: #3fb950;
  }

  .status-badge.status-3xx {
    background: #d29922a0;
    color: #e3b341;
  }

  .status-badge.status-4xx {
    background: #da363460;
    color: #f85149;
  }

  .status-badge.status-5xx {
    background: #da363480;
    color: #f85149;
  }

  .response-duration {
    font-size: 10px;
    color: var(--hf-descriptionForeground);
    white-space: nowrap;
  }
</style>
