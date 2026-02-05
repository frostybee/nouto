<script lang="ts">
  import { onMount } from 'svelte';
  import type { HistoryEntry, Collection } from '../../types';
  import MethodBadge from '../shared/MethodBadge.svelte';
  import { formatTimestamp, formatDuration, formatSize, getDisplayUrl } from '../../lib/formatters';
  import { getStatusColor } from '../../lib/http-helpers';

  export let entry: HistoryEntry;
  export let collections: Collection[];
  export let postMessage: (message: any) => void;

  let showContextMenu = false;
  let contextMenuX = 0;
  let contextMenuY = 0;
  let showSaveSubmenu = false;
  let menuButtonRef: HTMLButtonElement | null = null;

  function handleClick(e: MouseEvent) {
    // Ctrl+Click opens in new tab
    postMessage({
      type: 'openHistoryEntry',
      data: { id: entry.id, newTab: e.ctrlKey || e.metaKey }
    });
  }

  function broadcastMenuOpen() {
    // Dispatch custom event to close other open menus
    window.dispatchEvent(new CustomEvent('historyMenuOpen', { detail: entry.id }));
  }

  function handleGlobalMenuOpen(e: CustomEvent<string>) {
    // Close this menu if another menu was opened
    if (e.detail !== entry.id && showContextMenu) {
      closeContextMenu();
    }
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    broadcastMenuOpen();
    showContextMenu = true;
    showSaveSubmenu = false;

    const menuWidth = 180;
    const viewportWidth = window.innerWidth;

    // Keep menu within sidebar bounds
    contextMenuX = Math.min(e.clientX, viewportWidth - menuWidth - 4);
    contextMenuY = e.clientY;
  }

  function handleMenuButtonClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    const wasOpen = showContextMenu;
    broadcastMenuOpen();

    showContextMenu = !wasOpen;
    showSaveSubmenu = false;
    if (menuButtonRef && !wasOpen) {
      const rect = menuButtonRef.getBoundingClientRect();
      const menuWidth = 180;
      const viewportWidth = window.innerWidth;

      // Keep menu within sidebar bounds
      contextMenuX = Math.min(rect.right - menuWidth, Math.max(4, viewportWidth - menuWidth - 4));
      contextMenuY = rect.bottom + 2;
    }
  }

  function closeContextMenu() {
    showContextMenu = false;
    showSaveSubmenu = false;
  }

  function handleRun() {
    closeContextMenu();
    postMessage({ type: 'runHistoryEntry', data: { id: entry.id } });
  }

  function handleOpenNewTab() {
    closeContextMenu();
    postMessage({ type: 'openHistoryEntry', data: { id: entry.id, newTab: true } });
  }

  function toggleSaveSubmenu(e: MouseEvent) {
    e.stopPropagation();
    showSaveSubmenu = !showSaveSubmenu;
  }

  function handleSaveToCollection(collectionId: string) {
    closeContextMenu();
    postMessage({
      type: 'saveHistoryToCollection',
      data: { historyId: entry.id, collectionId }
    });
  }

  function handleDelete() {
    closeContextMenu();
    postMessage({ type: 'deleteHistoryEntry', data: { id: entry.id } });
  }

  $: statusColor = getStatusColor(entry.status);

  onMount(() => {
    window.addEventListener('historyMenuOpen', handleGlobalMenuOpen as EventListener);
    return () => {
      window.removeEventListener('historyMenuOpen', handleGlobalMenuOpen as EventListener);
    };
  });
</script>

<svelte:window on:click={closeContextMenu} />

<div
  class="history-item"
  on:click={handleClick}
  on:contextmenu={handleContextMenu}
  on:keydown={(e) => e.key === 'Enter' && handleClick(new MouseEvent('click'))}
  role="button"
  tabindex="0"
>
  <button
    class="menu-button"
    bind:this={menuButtonRef}
    on:click={handleMenuButtonClick}
    title="More actions"
  >
    &#8942;
  </button>
  <div class="item-header">
    <MethodBadge method={entry.method} />
    <span class="status-badge" style="--status-color: {statusColor}">
      {entry.status}
    </span>
  </div>

  <div class="item-url">{getDisplayUrl(entry.url)}</div>

  <div class="item-meta">
    <span class="meta-item" title="Duration">{formatDuration(entry.duration)}</span>
    <span class="meta-separator">|</span>
    <span class="meta-item" title="Response size">{formatSize(entry.size)}</span>
    <span class="meta-separator">|</span>
    <span class="meta-item timestamp" title={new Date(entry.timestamp).toLocaleString()}>
      {formatTimestamp(entry.timestamp)}
    </span>
  </div>
</div>

{#if showContextMenu}
  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
  <div
    class="context-menu"
    style="left: {contextMenuX}px; top: {contextMenuY}px"
    role="menu"
    tabindex="-1"
    on:click|stopPropagation
    on:keydown={(e) => e.key === 'Escape' && closeContextMenu()}
  >
    <button class="context-item" role="menuitem" on:click={handleRun}>
      <span class="context-icon">&#9654;</span>
      Run Request
    </button>
    <button class="context-item" role="menuitem" on:click={handleOpenNewTab}>
      <span class="context-icon">&#128448;</span>
      Open in New Tab
    </button>
    <div class="context-divider"></div>
    <div class="context-submenu-wrapper">
      <button class="context-item has-submenu" role="menuitem" on:click={toggleSaveSubmenu}>
        <span class="context-icon">&#128190;</span>
        Save to Collection
        <span class="submenu-arrow">&#9662;</span>
      </button>
      {#if showSaveSubmenu}
        <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
        <div class="submenu" role="menu" tabindex="-1" on:click|stopPropagation on:keydown={() => {}}>
          {#if collections.length === 0}
            <div class="submenu-empty">No collections</div>
          {:else}
            {#each collections as collection}
              <button
                class="context-item"
                role="menuitem"
                on:click={() => handleSaveToCollection(collection.id)}
              >
                {collection.name}
              </button>
            {/each}
          {/if}
        </div>
      {/if}
    </div>
    <div class="context-divider"></div>
    <button class="context-item danger" role="menuitem" on:click={handleDelete}>
      <span class="context-icon">&#128465;</span>
      Delete
    </button>
  </div>
{/if}

<style>
  .history-item {
    position: relative;
    padding: 8px 12px;
    cursor: pointer;
    border-bottom: 1px solid var(--vscode-panel-border);
    transition: background 0.1s;
  }

  .history-item:hover {
    background: var(--vscode-list-hoverBackground);
  }

  .menu-button {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 24px;
    height: 24px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--vscode-foreground);
    font-size: 16px;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.1s, background 0.1s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .history-item:hover .menu-button,
  .menu-button:focus {
    opacity: 1;
  }

  .menu-button:hover {
    background: var(--vscode-toolbar-hoverBackground);
  }

  .history-item:focus {
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: -1px;
  }

  .item-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  .status-badge {
    font-size: 11px;
    font-weight: 600;
    color: var(--status-color);
    font-family: var(--vscode-editor-font-family), monospace;
  }

  .item-url {
    font-size: 12px;
    color: var(--vscode-foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 4px;
  }

  .item-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
  }

  .meta-item {
    white-space: nowrap;
  }

  .meta-separator {
    opacity: 0.5;
  }

  .timestamp {
    margin-left: auto;
  }

  /* Context Menu */
  .context-menu {
    position: fixed;
    z-index: 99999;
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

  .context-item.danger:hover {
    background: var(--vscode-menu-selectionBackground);
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

  .context-submenu-wrapper {
    position: relative;
  }

  .has-submenu {
    justify-content: flex-start;
  }

  .submenu-arrow {
    margin-left: auto;
    font-size: 10px;
    opacity: 0.7;
  }

  .submenu {
    position: absolute;
    left: 0;
    top: 100%;
    right: 0;
    min-width: 150px;
    background: var(--vscode-menu-background);
    border: 1px solid var(--vscode-menu-border, var(--vscode-panel-border));
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    padding: 4px 0;
  }

  .submenu-empty {
    padding: 8px 12px;
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
    font-style: italic;
  }
</style>
