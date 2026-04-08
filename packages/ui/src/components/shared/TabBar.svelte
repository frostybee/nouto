<script lang="ts">
  import {
    tabs,
    activeTabId,
    switchTab,
    closeTab,
    closeOtherTabs,
    closeAllTabs,
    reorderTabs,
    pinTab,
    unpinTab,
  } from '../../stores/tabs.svelte';
  import Tooltip from './Tooltip.svelte';


  const tabList = $derived(tabs());
  const currentTabId = $derived(activeTabId());

  // Context menu state
  let contextMenu = $state<{ x: number; y: number; tabId: string } | null>(null);

  // Scroll container ref
  let scrollContainer = $state<HTMLDivElement>(undefined!);

  // Scroll arrow state
  let canScrollLeft = $state(false);
  let canScrollRight = $state(false);
  let isScrolling = $state(false);

  function updateScrollState() {
    if (!scrollContainer) return;
    canScrollLeft = scrollContainer.scrollLeft > 0;
    canScrollRight = scrollContainer.scrollLeft < scrollContainer.scrollWidth - scrollContainer.clientWidth - 1;
  }

  function scrollTabsLeft() {
    isScrolling = true;
    scrollContainer?.scrollBy({ left: -200, behavior: 'smooth' });
  }

  function scrollTabsRight() {
    isScrolling = true;
    scrollContainer?.scrollBy({ left: 200, behavior: 'smooth' });
  }

  $effect(() => {
    // Re-evaluate overflow when tab list changes
    tabList;
    setTimeout(updateScrollState, 50);
  });

  $effect(() => {
    // Scroll active tab into view when it changes
    const activeId = currentTabId;
    if (!scrollContainer || !activeId) return;
    setTimeout(() => {
      const activeTab = scrollContainer.querySelector<HTMLElement>('.tab.active');
      activeTab?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      updateScrollState();
    }, 0);
  });

  function handleTabClick(tabId: string) {
    switchTab(tabId);
  }

  function handleTabClose(e: MouseEvent, tabId: string) {
    e.stopPropagation();
    const tab = tabList.find(t => t.id === tabId);
    if (tab?.pinned) return;
    closeTab(tabId);
  }

  function handleMiddleClick(e: MouseEvent, tabId: string) {
    if (e.button === 1) {
      e.preventDefault();
      const tab = tabList.find(t => t.id === tabId);
      if (tab?.pinned) return;
      closeTab(tabId);
    }
  }

  function handleContextMenu(e: MouseEvent, tabId: string) {
    e.preventDefault();
    e.stopPropagation();
    contextMenu = { x: e.clientX, y: e.clientY, tabId };
  }

  function closeContextMenu() {
    contextMenu = null;
  }

  function handleContextAction(action: string) {
    if (!contextMenu) return;
    const tabId = contextMenu.tabId;
    const tab = tabList.find(t => t.id === tabId);
    closeContextMenu();

    switch (action) {
      case 'close':
        closeTab(tabId);
        break;
      case 'closeOthers':
        closeOtherTabs(tabId);
        break;
      case 'closeAll':
        closeAllTabs();
        break;
      case 'pin':
        pinTab(tabId);
        break;
      case 'unpin':
        unpinTab(tabId);
        break;
    }
  }

  // Drag state
  let dragIndex = $state<number | null>(null);
  let dragOverIndex = $state<number | null>(null);

  function handleDragStart(e: DragEvent, index: number) {
    dragIndex = index;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
    }
  }

  function handleDragOver(e: DragEvent, index: number) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    dragOverIndex = index;
  }

  function handleDrop(e: DragEvent, index: number) {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== index) {
      reorderTabs(dragIndex, index);
    }
    dragIndex = null;
    dragOverIndex = null;
  }

  function handleDragEnd() {
    dragIndex = null;
    dragOverIndex = null;
  }

  // Close context menu on click outside
  function handleWindowClick() {
    if (contextMenu) closeContextMenu();
  }

  // Connection mode labels and colors for non-HTTP protocols
  const connectionDisplay: Record<string, { label: string; color: string }> = {
    websocket: { label: 'WS', color: '#e535ab' },
    sse: { label: 'SSE', color: '#ff6b35' },
    'graphql-ws': { label: 'GQL-S', color: '#e535ab' },
    grpc: { label: 'gRPC', color: '#4db848' },
  };

  // Resolve the display label and color for a tab's method badge
  function tabBadge(tab: { icon?: string; connectionMode?: string; body?: any }): { label: string; color: string } {
    const mode = tab.connectionMode;
    if (mode && connectionDisplay[mode]) {
      return connectionDisplay[mode];
    }
    if (tab.body?.type === 'graphql') {
      return { label: 'GQL', color: '#e535ab' };
    }
    const method = tab.icon || 'GET';
    return { label: method, color: methodColor(method) };
  }

  // Method badge color for HTTP methods
  function methodColor(method: string): string {
    switch (method?.toUpperCase()) {
      case 'GET': return 'var(--hf-charts-green)';
      case 'POST': return 'var(--hf-charts-yellow)';
      case 'PUT': return 'var(--hf-charts-blue)';
      case 'PATCH': return 'var(--hf-charts-orange)';
      case 'DELETE': return 'var(--hf-charts-red)';
      case 'HEAD': return 'var(--hf-charts-purple)';
      case 'OPTIONS': return 'var(--hf-descriptionForeground)';
      default: return 'var(--hf-descriptionForeground)';
    }
  }

  // Separate pinned and unpinned tabs for rendering
  const pinnedTabs = $derived(tabList.filter(t => t.pinned));
  const unpinnedTabs = $derived(tabList.filter(t => !t.pinned));

  function getTabIndex(tab: { id: string }): number {
    return tabList.findIndex(t => t.id === tab.id);
  }
</script>

<svelte:window onclick={handleWindowClick} />

<div class="tab-bar">
  {#if canScrollLeft}
    <button class="scroll-btn" onclick={scrollTabsLeft} aria-label="Scroll tabs left">
      <span class="codicon codicon-chevron-left"></span>
    </button>
  {/if}
  <div class="tab-list-wrapper">
    {#if canScrollLeft}
      <div class="fade fade-left"></div>
    {/if}
    <div class="tab-list" bind:this={scrollContainer} onscroll={updateScrollState} onscrollend={() => isScrolling = false} class:scrolling={isScrolling}>
      {#each pinnedTabs as tab (tab.id)}
        {@const index = getTabIndex(tab)}
        <Tooltip text={tab.label} position="bottom">
          <button
            class="tab pinned"
            class:active={tab.id === currentTabId}
            class:drag-over={dragOverIndex === index && dragIndex !== index}
            draggable="true"
            onclick={() => handleTabClick(tab.id)}
            onauxclick={(e) => handleMiddleClick(e, tab.id)}
            oncontextmenu={(e) => handleContextMenu(e, tab.id)}
            ondragstart={(e) => handleDragStart(e, index)}
            ondragover={(e) => handleDragOver(e, index)}
            ondrop={(e) => handleDrop(e, index)}
            ondragend={handleDragEnd}
            aria-label="{tab.label} (pinned)"
          >
            {#if tab.type === 'request' && tab.icon}
              {@const badge = tabBadge(tab)}
              <span class="method-badge" style="color: {badge.color}">{badge.label}</span>
            {:else if tab.type === 'settings'}
              <span class="codicon codicon-gear tab-icon"></span>
            {:else if tab.type === 'environments'}
              <span class="codicon codicon-symbol-variable tab-icon"></span>
            {/if}
            <span class="codicon codicon-pinned pin-indicator"></span>
          </button>
        </Tooltip>
      {/each}
      {#if pinnedTabs.length > 0 && unpinnedTabs.length > 0}
        <div class="pin-separator"></div>
      {/if}
      {#each unpinnedTabs as tab (tab.id)}
        {@const index = getTabIndex(tab)}
        <button
          class="tab"
          class:active={tab.id === currentTabId}
          class:drag-over={dragOverIndex === index && dragIndex !== index}
          draggable="true"
          onclick={() => handleTabClick(tab.id)}
          onauxclick={(e) => handleMiddleClick(e, tab.id)}
          oncontextmenu={(e) => handleContextMenu(e, tab.id)}
          ondragstart={(e) => handleDragStart(e, index)}
          ondragover={(e) => handleDragOver(e, index)}
          ondrop={(e) => handleDrop(e, index)}
          ondragend={handleDragEnd}
          aria-label={tab.label}
          title={tab.label}
        >
          {#if tab.type === 'request' && tab.icon}
            {@const badge = tabBadge(tab)}
            <span class="method-badge" style="color: {badge.color}">{badge.label}</span>
          {:else if tab.type === 'settings'}
            <span class="codicon codicon-gear tab-icon"></span>
          {:else if tab.type === 'environments'}
            <span class="codicon codicon-symbol-variable tab-icon"></span>
          {/if}
          <span class="tab-label">{tab.label}</span>
          {#if tab.closable}
            <span
              class="tab-action"
              class:dirty={tab.dirty}
              role="button"
              tabindex="-1"
              onclick={(e) => handleTabClose(e, tab.id)}
              onkeydown={(e) => { if (e.key === 'Enter') handleTabClose(e as any, tab.id); }}
              aria-label={tab.dirty ? 'Unsaved changes, close tab' : 'Close tab'}
            >
              {#if tab.dirty}
                <span class="dirty-dot"></span>
              {/if}
              <span class="codicon codicon-close close-icon"></span>
            </span>
          {/if}
        </button>
      {/each}
    </div>
    {#if canScrollRight}
      <div class="fade fade-right"></div>
    {/if}
  </div>
  {#if canScrollRight}
    <button class="scroll-btn" onclick={scrollTabsRight} aria-label="Scroll tabs right">
      <span class="codicon codicon-chevron-right"></span>
    </button>
  {/if}
</div>

{#if contextMenu}
  {@const ctxTab = tabList.find(t => t.id === contextMenu.tabId)}
  <div
    class="context-menu"
    style="left: {contextMenu.x}px; top: {contextMenu.y}px"
  >
    {#if ctxTab?.pinned}
      <button class="context-item" onclick={() => handleContextAction('unpin')}>Unpin Tab</button>
    {:else}
      <button class="context-item" onclick={() => handleContextAction('pin')}>Pin Tab</button>
    {/if}
    <div class="context-separator"></div>
    {#if !ctxTab?.pinned}
      <button class="context-item" onclick={() => handleContextAction('close')}>Close</button>
    {/if}
    <button class="context-item" onclick={() => handleContextAction('closeOthers')}>Close Others</button>
    <button class="context-item" onclick={() => handleContextAction('closeAll')}>Close All</button>
  </div>
{/if}

<style>
  .tab-bar {
    display: flex;
    align-items: stretch;
    background: var(--hf-editorGroupHeader-tabsBackground);
    height: 35px;
    min-height: 35px;
    user-select: none;
  }

  .tab-list-wrapper {
    position: relative;
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .fade {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 40px;
    pointer-events: auto;
    z-index: 2;
  }

  .fade-left {
    left: 0;
    background: linear-gradient(to right, var(--hf-editorGroupHeader-tabsBackground) 30%, transparent);
  }

  .fade-right {
    right: 0;
    background: linear-gradient(to left, var(--hf-editorGroupHeader-tabsBackground) 30%, transparent);
  }

  .tab-list {
    display: flex;
    flex: 1;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
  }

  .tab-list::-webkit-scrollbar {
    display: none;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    height: 100%;
    border: none;
    background: var(--hf-tab-inactiveBackground);
    color: var(--hf-tab-inactiveForeground);
    font-size: 13px;
    cursor: pointer;
    white-space: nowrap;
    min-width: 0;
    max-width: 200px;
    position: relative;
    flex-shrink: 0;
    box-sizing: border-box;
    border-top: 1px solid transparent;
    border-bottom: 1px solid var(--hf-editorGroupHeader-tabsBorder);
    border-right: 1px solid var(--hf-tab-border);
  }

  .tab.pinned {
    max-width: none;
    padding: 0 8px;
    gap: 4px;
  }

  .tab:hover {
    background: var(--hf-tab-hoverBackground);
  }

  .tab.active {
    background: var(--hf-tab-activeBackground);
    color: var(--hf-tab-activeForeground);
    border-top-color: var(--hf-tab-activeBorderTop);
    border-bottom-color: var(--hf-tab-activeBackground);
  }

  .tab.drag-over {
    border-left: 2px solid var(--hf-focusBorder);
  }

  .pin-separator {
    width: 1px;
    background: var(--hf-tab-border);
    margin: 6px 2px;
    flex-shrink: 0;
  }

  .pin-indicator {
    font-size: 9px;
    opacity: 0.5;
    flex-shrink: 0;
  }

  .method-badge {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.02em;
    flex-shrink: 0;
  }

  .tab-icon {
    font-size: 14px;
    flex-shrink: 0;
    opacity: 0.8;
  }

  .tab-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Tab action area: holds either dirty dot or close icon */
  .tab-action {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    border-radius: 3px;
    flex-shrink: 0;
    padding: 0;
    position: relative;
  }

  .tab-action .close-icon {
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .tab-action .dirty-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--hf-editorInfo-foreground);
    position: absolute;
  }

  /* Non-dirty tabs: hide close icon until hover */
  .tab-action:not(.dirty) .close-icon {
    opacity: 0;
  }

  .tab:hover .tab-action:not(.dirty) .close-icon {
    opacity: 0.7;
  }

  .tab-action:not(.dirty):hover .close-icon {
    opacity: 1;
  }

  /* Dirty tabs: show dot, hide close icon; on hover swap */
  .tab-action.dirty .dirty-dot {
    opacity: 1;
  }

  .tab-action.dirty .close-icon {
    opacity: 0;
  }

  .tab-action.dirty:hover .dirty-dot {
    opacity: 0;
  }

  .tab-action.dirty:hover .close-icon {
    opacity: 1;
  }

  .tab-list.scrolling .tab-action {
    pointer-events: none;
  }

  .tab-action:hover {
    background: var(--hf-toolbar-hoverBackground);
  }

  .scroll-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    min-width: 36px;
    height: 100%;
    border: none;
    background: var(--hf-editorGroupHeader-tabsBackground);
    color: var(--hf-tab-activeForeground);
    cursor: pointer;
    padding: 0;
    flex-shrink: 0;
    border-right: 1px solid var(--hf-tab-border);
    opacity: 0.8;
    z-index: 3;
  }

  .scroll-btn:last-child {
    border-right: none;
    border-left: 1px solid var(--hf-tab-border);
  }

  .scroll-btn:hover {
    background: var(--hf-tab-hoverBackground);
    color: var(--hf-tab-activeForeground);
    opacity: 1;
  }

  .scroll-btn .codicon {
    font-size: 14px;
  }

  .context-menu {
    position: fixed;
    z-index: 10000;
    background: var(--hf-menu-background);
    border: 1px solid var(--hf-menu-border);
    border-radius: 4px;
    padding: 4px 0;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    min-width: 180px;
  }

  .context-item {
    display: block;
    width: 100%;
    padding: 6px 16px;
    border: none;
    background: transparent;
    color: var(--hf-menu-foreground);
    font-size: 12px;
    cursor: pointer;
    text-align: left;
  }

  .context-item:hover {
    background: var(--hf-menu-selectionBackground);
    color: var(--hf-menu-selectionForeground);
  }

  .context-separator {
    height: 1px;
    background: var(--hf-menu-separatorBackground, var(--hf-menu-border));
    margin: 4px 8px;
  }
</style>
