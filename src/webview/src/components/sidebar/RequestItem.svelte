<script lang="ts">
  import type { SavedRequest } from '../../types';
  import MethodBadge from '../shared/MethodBadge.svelte';
  import { getDisplayUrl } from '../../lib/formatters';
  import { request, setMethod, setUrl, setParams, setHeaders, setAuth, setBody } from '../../stores/request';
  import { selectRequest, deleteRequest, duplicateRequest, selectedRequestId } from '../../stores/collections';
  import { dragState, startDrag, endDrag } from '../../stores/dragdrop';

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

  function handleClick() {
    selectRequest(collectionId, item.id);
    // Load request data into the request store
    setMethod(item.method);
    setUrl(item.url);
    setParams(item.params);
    setHeaders(item.headers);
    setAuth(item.auth);
    setBody(item.body);
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
    editName = item.name;
  }

  function handleDelete() {
    closeContextMenu();
    deleteRequest(item.id);
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

<svelte:window onclick={closeContextMenu} />

<div
  class="request-item"
  class:selected={isSelected}
  class:dragging={isBeingDragged}
  style="padding-left: {8 + depth * 12}px"
  draggable={!isEditing}
  onclick={handleClick}
  oncontextmenu={handleContextMenu}
  onkeydown={(e) => e.key === 'Enter' && handleClick()}
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
      <span class="request-name">{item.name}</span>
      <span class="request-url">{getDisplayUrl(item.url)}</span>
    {/if}
  </div>
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
      <span class="context-icon">&#128448;</span>
      Open in New Tab
    </button>
    <button class="context-item" onclick={handleRunRequest}>
      <span class="context-icon">&#9654;</span>
      Run Request
    </button>
    <div class="context-divider"></div>
    <button class="context-item" onclick={handleRename}>
      <span class="context-icon">&#128221;</span>
      Rename
    </button>
    <button class="context-item" onclick={handleDuplicate}>
      <span class="context-icon">&#128464;</span>
      Duplicate
    </button>
    <div class="context-divider"></div>
    <button class="context-item danger" onclick={handleDelete}>
      <span class="context-icon">&#128465;</span>
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
    background: var(--vscode-list-hoverBackground);
  }

  .request-item.selected {
    background: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
  }

  .request-item.dragging {
    opacity: 0.5;
    background: var(--vscode-list-hoverBackground);
  }

  .request-item[draggable="true"] {
    cursor: grab;
  }

  .request-item[draggable="true"]:active {
    cursor: grabbing;
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

  .request-url {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .selected .request-url {
    color: var(--vscode-list-activeSelectionForeground);
    opacity: 0.8;
  }

  .edit-input {
    width: 100%;
    padding: 2px 4px;
    font-size: 13px;
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
    min-width: 140px;
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
