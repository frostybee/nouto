<script lang="ts">
  import type { SavedRequest } from '../../types';
  import MethodBadge from '../shared/MethodBadge.svelte';
  import { getDisplayUrl } from '@hivefetch/core';
  import { request } from '../../stores/request';
  import { selectRequest, duplicateRequest, selectedRequestId } from '../../stores/collections';
  import { dragState, startDrag, endDrag } from '../../stores/dragdrop';
  import { dirtyRequestIds } from '../../stores/dirtyState';

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

  const isSelected = $derived($selectedRequestId === item.id);
  const isBeingDragged = $derived($dragState.isDragging && $dragState.draggedItemId === item.id);
  const itemIsDirty = $derived($dirtyRequestIds.has(item.id));

  function handleClick(e: MouseEvent) {
    selectRequest(collectionId, item.id);
    // Open request in panel (or reveal existing panel)
    postMessage?.({
      type: 'openCollectionRequest',
      data: {
        requestId: item.id,
        collectionId,
        newTab: e.ctrlKey || e.metaKey  // Ctrl+Click for new tab
      }
    });
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
    editName = item.name;
  }

  function handleDelete() {
    closeContextMenu();
    postMessage?.({
      type: 'deleteRequest',
      data: { requestId: item.id },
    });
  }

  function handleDuplicate() {
    closeContextMenu();
    duplicateRequest(item.id);
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

  // Drag handlers
  function handleDragStart(e: DragEvent) {
    if (isEditing) {
      e.preventDefault();
      return;
    }
    e.dataTransfer?.setData('text/plain', item.id);
    e.dataTransfer!.effectAllowed = 'move';
    startDrag(item.id, 'request', collectionId, parentFolderId);
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
  style="padding-left: {8 + depth * 12}px"
  draggable={!isEditing}
  onclick={handleClick}
  oncontextmenu={handleContextMenu}
  onkeydown={(e) => e.key === 'Enter' && handleClick(new MouseEvent('click'))}
  ondragstart={handleDragStart}
  ondragend={handleDragEnd}
  role="button"
  tabindex="0"
>
  <MethodBadge method={item.method} />

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
      <span class="request-name">{item.name}{#if itemIsDirty}<span class="dirty-indicator"> &#x25CF;</span>{/if}</span>
      <span class="request-url">{getDisplayUrl(item.url)}</span>
    {/if}
  </div>
  {#if item.lastResponseStatus}
    <div class="response-meta">
      <span class="status-badge" class:status-2xx={item.lastResponseStatus >= 200 && item.lastResponseStatus < 300} class:status-3xx={item.lastResponseStatus >= 300 && item.lastResponseStatus < 400} class:status-4xx={item.lastResponseStatus >= 400 && item.lastResponseStatus < 500} class:status-5xx={item.lastResponseStatus >= 500}>{item.lastResponseStatus}</span>
      {#if item.lastResponseDuration}
        <span class="response-duration">{formatDuration(item.lastResponseDuration)}</span>
      {/if}
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
    <button class="context-item" role="menuitem" onclick={handleOpenNewTab}>
      <span class="context-icon codicon codicon-link-external"></span>
      Open in New Tab
    </button>
    <button class="context-item" onclick={handleRunRequest}>
      <span class="context-icon codicon codicon-play"></span>
      Run Request
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
    <div class="context-divider"></div>
    <button class="context-item danger" onclick={handleDelete}>
      <span class="context-icon codicon codicon-trash"></span>
      Delete
    </button>
  </div>
{/if}

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

  .request-item.selected {
    background: var(--hf-list-activeSelectionBackground);
    color: var(--hf-list-activeSelectionForeground);
  }

  .request-item.dragging {
    opacity: 0.5;
    background: var(--hf-list-hoverBackground);
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

  .request-name {
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dirty-indicator {
    color: var(--hf-editorWarning-foreground, #cca700);
    font-size: 10px;
  }

  .request-url {
    font-size: 11px;
    color: var(--hf-descriptionForeground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
