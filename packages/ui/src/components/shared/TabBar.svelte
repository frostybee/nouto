<script lang="ts">
  import {
    tabs,
    activeTabId,
    switchTab,
    closeTab,
    closeOtherTabs,
    closeAllTabs,
    reorderTabs,
  } from '../../stores/tabs.svelte';
  import Tooltip from './Tooltip.svelte';

  interface Props {
    onNewTab?: () => void;
  }

  let { onNewTab }: Props = $props();

  const tabList = $derived(tabs());
  const currentTabId = $derived(activeTabId());

  // Context menu state
  let contextMenu = $state<{ x: number; y: number; tabId: string } | null>(null);

  // Scroll container ref
  let scrollContainer = $state<HTMLDivElement>(undefined!);

  function handleTabClick(tabId: string) {
    switchTab(tabId);
  }

  function handleTabClose(e: MouseEvent, tabId: string) {
    e.stopPropagation();
    closeTab(tabId);
  }

  function handleMiddleClick(e: MouseEvent, tabId: string) {
    if (e.button === 1) {
      e.preventDefault();
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

  // Method badge color
  function methodColor(method: string): string {
    switch (method?.toUpperCase()) {
      case 'GET': return 'var(--vscode-charts-green, #4ec9b0)';
      case 'POST': return 'var(--vscode-charts-yellow, #dcdcaa)';
      case 'PUT': return 'var(--vscode-charts-blue, #569cd6)';
      case 'PATCH': return 'var(--vscode-charts-orange, #ce9178)';
      case 'DELETE': return 'var(--vscode-charts-red, #f44747)';
      case 'HEAD': return 'var(--vscode-charts-purple, #c586c0)';
      case 'OPTIONS': return 'var(--vscode-descriptionForeground, #808080)';
      default: return 'var(--vscode-descriptionForeground, #808080)';
    }
  }
</script>

<svelte:window onclick={handleWindowClick} />

<div class="tab-bar">
  <div class="tab-list" bind:this={scrollContainer}>
    {#each tabList as tab, index (tab.id)}
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
          <span class="method-badge" style="color: {methodColor(tab.icon)}">{tab.icon}</span>
        {:else if tab.type === 'settings'}
          <span class="codicon codicon-gear tab-icon"></span>
        {:else if tab.type === 'environments'}
          <span class="codicon codicon-symbol-variable tab-icon"></span>
        {/if}
        <span class="tab-label">{tab.label}</span>
        {#if tab.dirty}
          <span class="dirty-dot"></span>
        {/if}
        {#if tab.closable}
          <span
            class="close-btn"
            role="button"
            tabindex="-1"
            onclick={(e) => handleTabClose(e, tab.id)}
            onkeydown={(e) => { if (e.key === 'Enter') handleTabClose(e as any, tab.id); }}
            aria-label="Close tab"
          >
            <span class="codicon codicon-close"></span>
          </span>
        {/if}
      </button>
    {/each}
  </div>

  {#if onNewTab}
    <Tooltip text="New Request" position="bottom">
      <button class="new-tab-btn" onclick={onNewTab} aria-label="New request tab">
        <span class="codicon codicon-add"></span>
      </button>
    </Tooltip>
  {/if}
</div>

{#if contextMenu}
  <div
    class="context-menu"
    style="left: {contextMenu.x}px; top: {contextMenu.y}px"
  >
    <button class="context-item" onclick={() => handleContextAction('close')}>Close</button>
    <button class="context-item" onclick={() => handleContextAction('closeOthers')}>Close Others</button>
    <button class="context-item" onclick={() => handleContextAction('closeAll')}>Close All</button>
  </div>
{/if}

<style>
  .tab-bar {
    display: flex;
    align-items: stretch;
    background: var(--vscode-editorGroupHeader-tabsBackground, #252526);
    border-bottom: 1px solid var(--vscode-editorGroupHeader-tabsBorder, #1e1e1e);
    height: 36px;
    min-height: 36px;
    user-select: none;
  }

  .tab-list {
    display: flex;
    flex: 1;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: thin;
  }

  .tab-list::-webkit-scrollbar {
    height: 3px;
  }

  .tab-list::-webkit-scrollbar-thumb {
    background: var(--vscode-scrollbarSlider-background, rgba(121, 121, 121, 0.4));
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    height: 100%;
    border: none;
    background: transparent;
    color: var(--vscode-tab-inactiveForeground, #ffffff80);
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
    min-width: 0;
    max-width: 200px;
    border-right: 1px solid var(--vscode-tab-border, #252526);
    position: relative;
    flex-shrink: 0;
  }

  .tab:hover {
    background: var(--vscode-tab-hoverBackground, rgba(255, 255, 255, 0.05));
  }

  .tab.active {
    background: var(--vscode-tab-activeBackground, #1e1e1e);
    color: var(--vscode-tab-activeForeground, #ffffff);
    border-bottom: 2px solid var(--vscode-tab-activeBorderTop, #007acc);
  }

  .tab.drag-over {
    border-left: 2px solid var(--vscode-focusBorder, #007acc);
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

  .dirty-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--vscode-editorInfo-foreground, #3794ff);
    flex-shrink: 0;
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    border-radius: 3px;
    opacity: 0;
    flex-shrink: 0;
    padding: 0;
  }

  .close-btn:hover {
    background: var(--vscode-toolbar-hoverBackground, rgba(255, 255, 255, 0.1));
    opacity: 1;
  }

  .tab:hover .close-btn {
    opacity: 0.6;
  }

  .tab.active .close-btn {
    opacity: 0.6;
  }

  .close-btn .codicon {
    font-size: 12px;
  }

  .new-tab-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    min-width: 32px;
    height: 100%;
    border: none;
    background: transparent;
    color: var(--vscode-tab-inactiveForeground, #ffffff80);
    cursor: pointer;
    padding: 0;
  }

  .new-tab-btn:hover {
    background: var(--vscode-tab-hoverBackground, rgba(255, 255, 255, 0.05));
    color: var(--vscode-tab-activeForeground, #ffffff);
  }

  .new-tab-btn .codicon {
    font-size: 14px;
  }

  .context-menu {
    position: fixed;
    z-index: 10000;
    background: var(--vscode-menu-background, #252526);
    border: 1px solid var(--vscode-menu-border, #454545);
    border-radius: 4px;
    padding: 4px 0;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    min-width: 160px;
  }

  .context-item {
    display: block;
    width: 100%;
    padding: 6px 16px;
    border: none;
    background: transparent;
    color: var(--vscode-menu-foreground, #cccccc);
    font-size: 12px;
    cursor: pointer;
    text-align: left;
  }

  .context-item:hover {
    background: var(--vscode-menu-selectionBackground, #094771);
    color: var(--vscode-menu-selectionForeground, #ffffff);
  }
</style>
