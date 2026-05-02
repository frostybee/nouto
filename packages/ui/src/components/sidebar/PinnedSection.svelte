<script lang="ts">
  import { pinnedRequests, togglePinRequest, selectRequest } from '../../stores/collections.svelte';
  import { selectedRequestId } from '../../stores/collections.svelte';
  import { substituteVariables } from '../../stores/environment.svelte';
  import MethodBadge from '../shared/MethodBadge.svelte';
  import Tooltip from '../shared/Tooltip.svelte';
  import ContextMenu from '../shared/ContextMenu.svelte';
  import type { ContextMenuItem } from '../shared/ContextMenu.svelte';
  import { recordOpen } from '../../stores/frecency.svelte';
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

  function handleContextMenu(e: MouseEvent, entry: typeof pinned[0]) {
    e.preventDefault();
    e.stopPropagation();
    showContextMenu = true;
    contextMenuX = e.clientX;
    contextMenuY = e.clientY;
    contextEntry = entry;
  }

  function closeContextMenu() {
    showContextMenu = false;
    contextEntry = null;
  }

  function handleClick(entry: typeof pinned[0]) {
    selectRequest(entry.collectionId, entry.request.id);
    recordOpen(entry.request.id);
    postMessage({
      type: 'openCollectionRequest',
      data: { requestId: entry.request.id, collectionId: entry.collectionId, newTab: false },
    });
  }

  const contextMenuItems: ContextMenuItem[] = $derived.by(() => {
    if (!contextEntry) return [];
    const entry = contextEntry;
    return [
      {
        label: 'Open in New Tab',
        icon: 'codicon-link-external',
        action: () => postMessage({
          type: 'openCollectionRequest',
          data: { requestId: entry.request.id, collectionId: entry.collectionId, newTab: true },
        }),
      },
      {
        label: 'Copy URL',
        icon: 'codicon-copy',
        action: () => navigator.clipboard.writeText(substituteVariables(entry.request.url)),
      },
      { label: '', divider: true },
      {
        label: 'Unpin',
        icon: 'codicon-pinned',
        action: () => togglePinRequest(entry.request.id),
      },
    ];
  });

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

<ContextMenu
  items={contextMenuItems}
  x={contextMenuX}
  y={contextMenuY}
  show={showContextMenu}
  onclose={closeContextMenu}
/>

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

</style>
