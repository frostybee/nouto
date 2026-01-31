<script lang="ts">
  import type { SavedRequest } from '../../types';
  import MethodBadge from '../shared/MethodBadge.svelte';
  import { request, setMethod, setUrl, setParams, setHeaders, setAuth, setBody } from '../../stores/request';
  import { selectRequest, deleteRequest, selectedRequestId } from '../../stores/collections';
  import { createEventDispatcher } from 'svelte';

  export let item: SavedRequest;
  export let collectionId: string;

  const dispatch = createEventDispatcher<{
    rename: { id: string; name: string };
  }>();

  let showContextMenu = false;
  let contextMenuX = 0;
  let contextMenuY = 0;
  let isEditing = false;
  let editName = item.name;

  $: isSelected = $selectedRequestId === item.id;

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
    dispatch('rename', { id: item.id, name: `${item.name} (copy)` });
  }

  function finishEditing() {
    isEditing = false;
    if (editName.trim() && editName !== item.name) {
      dispatch('rename', { id: item.id, name: editName.trim() });
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

  // Extract display URL (strip protocol and trailing slash)
  function getDisplayUrl(url: string): string {
    return url
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '')
      || 'No URL';
  }
</script>

<svelte:window on:click={closeContextMenu} />

<div
  class="request-item"
  class:selected={isSelected}
  on:click={handleClick}
  on:contextmenu={handleContextMenu}
  on:keydown={(e) => e.key === 'Enter' && handleClick()}
  role="button"
  tabindex="0"
>
  <MethodBadge method={item.method} />

  <div class="request-info">
    {#if isEditing}
      <input
        type="text"
        class="edit-input"
        bind:value={editName}
        on:blur={finishEditing}
        on:keydown={handleKeydown}
        autofocus
      />
    {:else}
      <span class="request-name">{item.name}</span>
      <span class="request-url">{getDisplayUrl(item.url)}</span>
    {/if}
  </div>
</div>

{#if showContextMenu}
  <div
    class="context-menu"
    style="left: {contextMenuX}px; top: {contextMenuY}px"
    on:click|stopPropagation
  >
    <button class="context-item" on:click={handleRename}>
      Rename
    </button>
    <button class="context-item" on:click={handleDuplicate}>
      Duplicate
    </button>
    <div class="context-divider"></div>
    <button class="context-item danger" on:click={handleDelete}>
      Delete
    </button>
  </div>
{/if}

<style>
  .request-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px 6px 28px;
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
