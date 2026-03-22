<script lang="ts">
  import { pinnedRequests, togglePinRequest, selectRequest } from '../../stores/collections.svelte';
  import { selectedRequestId } from '../../stores/collections.svelte';
  import { substituteVariables } from '../../stores/environment.svelte';
  import MethodBadge from '../shared/MethodBadge.svelte';
  import Tooltip from '../shared/Tooltip.svelte';
  import type { HttpMethod } from '../../types';
  import type { SavedRequest } from '../../types';

  interface Props {
    postMessage: (message: any) => void;
  }
  let { postMessage }: Props = $props();

  let collapsed = $state(localStorage.getItem('nouto-pinned-collapsed') === 'true');

  $effect(() => {
    localStorage.setItem('nouto-pinned-collapsed', String(collapsed));
  });

  const pinned = $derived(pinnedRequests());

  // Context menu state
  let showContextMenu = $state(false);
  let contextMenuX = $state(0);
  let contextMenuY = $state(0);
  let contextEntry = $state<{ request: SavedRequest; collectionId: string; collectionName: string } | null>(null);

  $effect(() => {
    if (!showContextMenu) return;
    const close = () => { showContextMenu = false; contextEntry = null; };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    // Use setTimeout so the opening click doesn't immediately close
    const timer = setTimeout(() => {
      window.addEventListener('click', close);
      window.addEventListener('keydown', handleKey);
      window.addEventListener('close-context-menus', close);
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('close-context-menus', close);
    };
  });

  function handleContextMenu(e: MouseEvent, entry: typeof pinned[0]) {
    e.preventDefault();
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('close-context-menus'));
    showContextMenu = true;
    contextMenuX = Math.min(e.clientX, window.innerWidth - 200);
    contextMenuY = Math.min(e.clientY, window.innerHeight - 180);
    contextEntry = entry;
  }

  function closeContextMenu() {
    showContextMenu = false;
    contextEntry = null;
  }

  function handleClick(entry: typeof pinned[0]) {
    selectRequest(entry.collectionId, entry.request.id);
    postMessage({
      type: 'openCollectionRequest',
      data: { requestId: entry.request.id, collectionId: entry.collectionId, newTab: false },
    });
  }

  function handleOpenInNewTab() {
    if (!contextEntry) return;
    postMessage({
      type: 'openCollectionRequest',
      data: { requestId: contextEntry.request.id, collectionId: contextEntry.collectionId, newTab: true },
    });
    closeContextMenu();
  }

  function handleCopyUrl() {
    if (!contextEntry) return;
    navigator.clipboard.writeText(substituteVariables(contextEntry.request.url));
    closeContextMenu();
  }

  function handleUnpinContext() {
    if (!contextEntry) return;
    togglePinRequest(contextEntry.request.id);
    closeContextMenu();
  }

  function handleUnpin(e: MouseEvent, requestId: string) {
    e.stopPropagation();
    togglePinRequest(requestId);
  }
</script>

{#if pinned.length > 0}
  <div class="pinned-section">
    <button class="pinned-header" onclick={() => (collapsed = !collapsed)}>
      <span class="codicon {collapsed ? 'codicon-chevron-right' : 'codicon-chevron-down'}" style="font-size: 12px; margin-right: 2px;"></span>
      <span class="codicon codicon-pinned" style="font-size: 12px; margin-right: 4px;"></span>
      <span class="pinned-label">Pinned</span>
      <span class="pinned-count">{pinned.length}</span>
    </button>
    {#if !collapsed}
      <div class="pinned-list">
        {#each pinned as entry (entry.request.id)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="pinned-row"
            class:selected={selectedRequestId() === entry.request.id}
            onclick={() => handleClick(entry)}
            oncontextmenu={(e) => handleContextMenu(e, entry)}
            role="button"
            tabindex="0"
            onkeydown={(e) => e.key === 'Enter' && handleClick(entry)}
          >
            <MethodBadge method={entry.request.method as HttpMethod} connectionMode={entry.request.connectionMode as any} />
            <div class="pinned-info">
              <span class="pinned-name">{entry.request.name || entry.request.url}</span>
              <span class="pinned-collection">{entry.collectionName}</span>
            </div>
            <Tooltip text="Unpin" position="top">
              <button
                class="unpin-btn"
                onclick={(e) => handleUnpin(e, entry.request.id)}
                aria-label="Unpin request"
              >
                <span class="codicon codicon-pinned"></span>
              </button>
            </Tooltip>
            <button
              class="item-more-btn"
              onclick={(e) => { e.stopPropagation(); handleContextMenu(e, entry); }}
              aria-label="More actions"
            >
              <span class="codicon codicon-kebab-vertical"></span>
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

{#if showContextMenu}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="context-menu"
    style="left: {contextMenuX}px; top: {contextMenuY}px"
    role="menu"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
  >
    <button class="context-item" role="menuitem" onclick={handleOpenInNewTab}>
      <span class="context-icon codicon codicon-link-external"></span>
      Open in New Tab
    </button>
    <button class="context-item" role="menuitem" onclick={handleCopyUrl}>
      <span class="context-icon codicon codicon-copy"></span>
      Copy URL
    </button>
    <div class="context-divider"></div>
    <button class="context-item" role="menuitem" onclick={handleUnpinContext}>
      <span class="context-icon codicon codicon-pinned"></span>
      Unpin
    </button>
  </div>
{/if}

<style>
  .pinned-section {
    border-bottom: 1px solid var(--hf-panel-border);
    flex-shrink: 0;
  }

  .pinned-header {
    all: unset;
    display: flex;
    align-items: center;
    width: 100%;
    box-sizing: border-box;
    padding: 6px 8px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--hf-foreground);
    opacity: 0.8;
  }

  .pinned-header:hover {
    opacity: 1;
    background: var(--hf-list-hoverBackground);
  }

  .pinned-label {
    flex: 1;
  }

  .pinned-count {
    font-size: 10px;
    font-weight: 600;
    background: var(--hf-badge-background, rgba(255, 255, 255, 0.15));
    color: var(--hf-badge-foreground, var(--hf-foreground));
    padding: 1px 6px;
    border-radius: 8px;
    margin-right: 4px;
    min-width: 14px;
    text-align: center;
  }

  .pinned-list {
    display: flex;
    flex-direction: column;
  }

  .pinned-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px 4px 20px;
    cursor: pointer;
    min-height: 28px;
    box-sizing: border-box;
    outline: none;
  }

  .pinned-row:hover {
    background: var(--hf-list-hoverBackground);
  }

  .pinned-row.selected {
    background: var(--hf-list-activeSelectionBackground);
    color: var(--hf-list-activeSelectionForeground);
  }

  .pinned-row.selected .pinned-collection {
    color: var(--hf-list-activeSelectionForeground);
    opacity: 0.7;
  }

  .pinned-row.selected :global(.method-badge) {
    color: var(--hf-list-activeSelectionForeground) !important;
  }

  .pinned-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .pinned-name {
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pinned-collection {
    font-size: 10px;
    color: var(--hf-descriptionForeground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .unpin-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border: none;
    background: transparent;
    color: var(--hf-descriptionForeground);
    cursor: pointer;
    border-radius: 3px;
    padding: 0;
    flex-shrink: 0;
    opacity: 0;
    font-size: 12px;
    transition: opacity 0.1s, background 0.1s;
  }

  .pinned-row:hover .unpin-btn,
  .pinned-row:hover .item-more-btn {
    opacity: 1;
  }

  .item-more-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border: none;
    background: transparent;
    color: var(--hf-descriptionForeground);
    cursor: pointer;
    border-radius: 3px;
    padding: 0;
    flex-shrink: 0;
    opacity: 0;
    font-size: 12px;
    transition: opacity 0.1s, background 0.1s;
  }

  .item-more-btn:hover {
    background: var(--hf-button-secondaryHoverBackground, var(--hf-list-hoverBackground));
    color: var(--hf-foreground);
  }

  .unpin-btn:hover {
    background: var(--hf-button-secondaryHoverBackground, var(--hf-list-hoverBackground));
    color: var(--hf-foreground);
  }

  .context-menu {
    position: fixed;
    z-index: 1000;
    min-width: 180px;
    background: var(--hf-menu-background);
    border: 1px solid var(--hf-menu-border);
    border-radius: 4px;
    padding: 4px 0;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .context-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 5px 12px;
    border: none;
    background: transparent;
    color: var(--hf-menu-foreground, var(--hf-foreground));
    font-size: 12px;
    cursor: pointer;
    text-align: left;
  }

  .context-item:hover {
    background: var(--hf-list-activeSelectionBackground);
    color: var(--hf-list-activeSelectionForeground);
  }

  .context-icon {
    font-size: 14px;
    width: 16px;
    text-align: center;
  }

  .context-divider {
    height: 1px;
    background: var(--hf-menu-border);
    margin: 4px 0;
  }
</style>
