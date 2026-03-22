<script lang="ts">
  import MethodBadge from './MethodBadge.svelte';
  import Tooltip from './Tooltip.svelte';
  import { ui, toggleHistoryDrawer, setHistoryDrawerHeight } from '../../stores/ui.svelte';
  import type { HistoryIndexEntry } from '@nouto/core/services';
  import type { HttpMethod } from '../../types';

  interface Props {
    postMessage: (msg: any) => void;
    requestId: string | null;
  }
  let { postMessage, requestId }: Props = $props();

  const drawerOpen = $derived(ui.historyDrawerOpen);
  const drawerHeight = $derived(ui.historyDrawerHeight);

  let isDragging = $state(false);
  let drawerEl = $state<HTMLDivElement>(undefined!);
  let isLoading = $state(false);
  let entries = $state<HistoryIndexEntry[]>([]);
  let totalCount = $state(0);

  // Track the requestId we last fetched for, so we refetch when it changes
  let lastFetchedRequestId: string | null = null;
  let listenerReady = $state(false);

  // Listen for history responses from the extension
  function handleMessage(event: MessageEvent) {
    const message = event.data;
    if (message.type === 'drawerHistoryLoaded' || message.type === 'historyLoaded') {
      entries = message.data.entries || [];
      totalCount = message.data.total || entries.length;
      isLoading = false;
    }
  }

  // Register listener with cleanup via $effect
  $effect(() => {
    window.addEventListener('message', handleMessage);
    listenerReady = true;
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  });

  // Fetch recent runs when drawer opens or requestId changes
  $effect(() => {
    if (drawerOpen && listenerReady) {
      const rid = requestId; // track dependency
      if (rid !== lastFetchedRequestId || entries.length === 0) {
        fetchRecentRuns();
        lastFetchedRequestId = rid;
      }
    }
  });

  function fetchRecentRuns() {
    isLoading = true;
    postMessage({
      type: 'getHistory',
      data: {
        requestId: requestId || undefined,
        limit: 50,
        offset: 0,
      },
    });
  }

  function handleClick(entry: HistoryIndexEntry) {
    postMessage({ type: 'openHistoryEntry', data: { id: entry.id } });
  }

  // Drag-to-resize
  function startResize(e: MouseEvent) {
    e.preventDefault();
    isDragging = true;
    document.body.classList.add('splitter-dragging');
    document.body.style.cursor = 'row-resize';

    const parentEl = drawerEl.parentElement!;

    function handleMouseMove(e: MouseEvent) {
      const parentRect = parentEl.getBoundingClientRect();
      const newHeight = parentRect.bottom - e.clientY;
      const maxHeight = parentRect.height * 0.6;
      setHistoryDrawerHeight(Math.min(newHeight, maxHeight));
    }

    function handleMouseUp() {
      isDragging = false;
      document.body.classList.remove('splitter-dragging');
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }

  function handleDoubleClick() {
    if (!drawerOpen) {
      toggleHistoryDrawer();
      return;
    }
    const parentEl = drawerEl.parentElement;
    if (parentEl) {
      const targetHeight = parentEl.getBoundingClientRect().height * 0.4;
      setHistoryDrawerHeight(targetHeight);
    }
  }

  function handleSeparatorKeydown(e: KeyboardEvent) {
    const step = 20;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const parentEl = drawerEl.parentElement;
      if (parentEl) {
        const maxHeight = parentEl.getBoundingClientRect().height * 0.6;
        setHistoryDrawerHeight(Math.min((drawerEl.offsetHeight || 200) + step, maxHeight));
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHistoryDrawerHeight(Math.max((drawerEl.offsetHeight || 200) - step, 40));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleHistoryDrawer();
    } else if (e.key === 'Escape' && drawerOpen) {
      toggleHistoryDrawer();
    }
  }

  function formatDuration(ms?: number): string {
    if (ms === undefined) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  function formatRelativeTime(timestamp: string): string {
    const diff = Date.now() - new Date(timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  }

  function getStatusClass(status?: number): string {
    if (!status || status === 0) return 'status-err';
    if (status < 300) return 'status-2xx';
    if (status < 400) return 'status-3xx';
    if (status < 500) return 'status-4xx';
    return 'status-5xx';
  }

  function extractPath(url: string): string {
    try {
      const u = new URL(url);
      return u.pathname + u.search;
    } catch {
      return url;
    }
  }

  // Cleanup is handled by $effect return above
</script>

<div class="history-drawer" class:open={drawerOpen} bind:this={drawerEl} role="region" aria-label="Recent runs">
  <!-- Drag handle -->
  <div
    class="drawer-handle"
    class:dragging={isDragging}
    onmousedown={startResize}
    ondblclick={handleDoubleClick}
    onkeydown={handleSeparatorKeydown}
    role="slider"
    tabindex="0"
    aria-orientation="vertical"
    aria-valuenow={drawerEl?.offsetHeight ?? 200}
    aria-label="Resize history drawer"
  >
    <div class="handle-grip"></div>
    <span class="drawer-title">
      <i class="codicon codicon-history"></i>
      Recent Runs{#if totalCount > 0} ({totalCount}){/if}
    </span>
    <button class="drawer-toggle" onclick={(e) => { e.stopPropagation(); toggleHistoryDrawer(); }} aria-label={drawerOpen ? 'Collapse' : 'Expand'}>
      <i class="codicon codicon-chevron-{drawerOpen ? 'down' : 'up'}"></i>
    </button>
  </div>

  <!-- Drawer content -->
  {#if drawerOpen}
    <div class="drawer-content" style="height: {drawerHeight}px">
      <div class="history-list">
        {#if isLoading && entries.length === 0}
          <div class="empty-state">Loading...</div>
        {:else if entries.length === 0}
          <div class="empty-state">
            {#if requestId}
              No runs yet for this request.
            {:else}
              No history yet. Send a request to get started.
            {/if}
          </div>
        {:else}
          {#each entries as entry}
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <div
              class="history-row"
              onclick={() => handleClick(entry)}
              role="button"
              tabindex="0"
              onkeydown={(e) => e.key === 'Enter' && handleClick(entry)}
            >
              <span class="row-method">
                <MethodBadge method={entry.method as HttpMethod} />
              </span>
              <Tooltip text={entry.url} position="top"><span class="row-url">{extractPath(entry.url)}</span></Tooltip>
              <span class="row-status">
                {#if entry.responseStatus}
                  <span class="status-badge {getStatusClass(entry.responseStatus)}">{entry.responseStatus}</span>
                {/if}
              </span>
              <span class="row-duration">{formatDuration(entry.responseDuration)}</span>
              <span class="row-time">{formatRelativeTime(entry.timestamp)}</span>
            </div>
          {/each}
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .history-drawer {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--hf-panel-border);
  }

  /* Drag handle */
  .drawer-handle {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    height: 28px;
    min-height: 28px;
    background: var(--hf-editor-background);
    cursor: row-resize;
    user-select: none;
    flex-shrink: 0;
  }

  .drawer-handle:hover,
  .drawer-handle.dragging {
    background: var(--hf-list-hoverBackground);
  }

  .handle-grip {
    width: 32px;
    height: 2px;
    border-radius: 1px;
    background: var(--hf-scrollbarSlider-background);
    flex-shrink: 0;
  }

  .drawer-handle:hover .handle-grip,
  .drawer-handle.dragging .handle-grip {
    background: var(--hf-scrollbarSlider-hoverBackground);
  }

  .drawer-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    color: var(--hf-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    flex: 1;
    pointer-events: none;
  }

  .drawer-title .codicon {
    font-size: 13px;
  }

  .drawer-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2px;
    background: none;
    border: none;
    color: var(--hf-descriptionForeground);
    cursor: pointer;
    border-radius: 3px;
    font-size: 14px;
  }

  .drawer-toggle:hover {
    color: var(--hf-foreground);
    background: var(--hf-list-hoverBackground);
  }

  /* Drawer content */
  .drawer-content {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
  }

  /* History list */
  .history-list {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  /* Table-style rows */
  .history-row {
    display: grid;
    grid-template-columns: 56px 1fr 52px 60px 36px;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    cursor: pointer;
    transition: background 0.1s;
    min-height: 28px;
  }

  .history-row:hover {
    background: var(--hf-list-hoverBackground);
  }

  .row-method {
    display: flex;
    align-items: center;
    justify-content: flex-start;
  }

  .row-url {
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--hf-foreground);
  }

  .row-status {
    display: flex;
    justify-content: center;
  }

  .status-badge {
    font-size: 10px;
    font-weight: 600;
    padding: 1px 4px;
    border-radius: 3px;
  }

  .status-badge.status-2xx {
    background: #2ea04360;
    color: #3fb950;
  }

  .status-badge.status-3xx {
    background: #d29922a0;
    color: #d29922;
  }

  .status-badge.status-4xx {
    background: #f8514960;
    color: #f85149;
  }

  .status-badge.status-5xx {
    background: #f8514960;
    color: #f85149;
  }

  .status-badge.status-err {
    background: #f8514940;
    color: #f85149;
  }

  .row-duration {
    font-size: 10px;
    color: var(--hf-descriptionForeground);
    white-space: nowrap;
    text-align: right;
  }

  .row-time {
    font-size: 10px;
    color: var(--hf-descriptionForeground);
    opacity: 0.7;
    white-space: nowrap;
    text-align: right;
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
    color: var(--hf-descriptionForeground);
    font-size: 12px;
    text-align: center;
  }
</style>
