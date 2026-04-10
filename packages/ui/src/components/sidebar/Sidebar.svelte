<script lang="ts">
  import { ui, toggleSidebar } from '../../stores';
  import { collections } from '../../stores/collections.svelte';
  import { postMessage } from '../../lib/vscode';
  import SidebarTabs from './SidebarTabs.svelte';
  import CollectionsTab from './CollectionsTab.svelte';
  import HistoryTab from './HistoryTab.svelte';
  import Tooltip from '../shared/Tooltip.svelte';

  const sidebarCollapsed = $derived(ui.sidebarCollapsed);
  const sidebarTab = $derived(ui.sidebarTab);
  const sidebarWidth = $derived(ui.sidebarWidth);

  function openMockServer() {
    postMessage({ type: 'openMockServer' } as any);
  }

  function openBenchmark() {
    postMessage({ type: 'openBenchmark' } as any);
  }
</script>

<aside
  class="sidebar"
  class:collapsed={sidebarCollapsed}
  style="--sidebar-width: {sidebarWidth}px"
>
  {#if !sidebarCollapsed}
    <SidebarTabs />

    <div class="sidebar-content">
      <div class="sidebar-panel" class:hidden={sidebarTab !== 'collections'}>
        <CollectionsTab {postMessage} />
      </div>
      <div class="sidebar-panel" class:hidden={sidebarTab !== 'history'}>
        <HistoryTab {postMessage} />
      </div>
    </div>
  {/if}

  {#if !sidebarCollapsed}
    <div class="sidebar-tools">
      <Tooltip text="Environments" position="top">
        <button class="tool-button" onclick={() => postMessage({ type: 'openEnvironmentsPanel' } as any)}>
          <span class="codicon codicon-symbol-variable"></span>
          <span class="tool-label">Environments</span>
        </button>
      </Tooltip>
      <Tooltip text="Mock Server" position="top">
        <button class="tool-button" onclick={openMockServer}>
          <span class="codicon codicon-server"></span>
          <span class="tool-label">Mock Server</span>
        </button>
      </Tooltip>
      <Tooltip text="Benchmark" position="top">
        <button class="tool-button" onclick={openBenchmark}>
          <span class="codicon codicon-pulse"></span>
          <span class="tool-label">Benchmark</span>
        </button>
      </Tooltip>
    </div>
  {/if}

  <Tooltip text={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} position="top">
  <button
    class="collapse-button"
    onclick={toggleSidebar}
  >
    {#if sidebarCollapsed}
      <span class="icon codicon codicon-chevron-right"></span>
    {:else}
      <span class="icon codicon codicon-chevron-left"></span>
      <span class="text">Collapse</span>
    {/if}
  </button>
  </Tooltip>
</aside>

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    width: var(--sidebar-width);
    min-width: var(--sidebar-width);
    background: var(--hf-sideBar-background);
    border-right: 1px solid var(--hf-panel-border);
    transition: width 0.2s ease, min-width 0.2s ease;
  }

  .sidebar.collapsed {
    width: 40px;
    min-width: 40px;
  }

  .sidebar-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .sidebar-panel {
    height: 100%;
  }

  .sidebar-panel.hidden {
    display: none;
  }

  .sidebar-tools {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px;
    border-top: 1px solid var(--hf-panel-border);
  }

  .tool-button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 8px;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--hf-foreground);
    font-size: 12px;
    cursor: pointer;
    opacity: 0.8;
    transition: opacity 0.15s, background 0.15s;
  }

  .tool-button:hover {
    opacity: 1;
    background: var(--hf-list-hoverBackground);
  }

  .tool-button .codicon {
    font-size: 14px;
    width: 16px;
    text-align: center;
  }

  .tool-label {
    white-space: nowrap;
  }

  .collapse-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px;
    margin: 8px;
    background: transparent;
    border: 1px solid var(--hf-panel-border);
    border-radius: 4px;
    color: var(--hf-foreground);
    cursor: pointer;
    font-size: 12px;
    opacity: 0.7;
    transition: opacity 0.15s, background 0.15s;
  }

  .collapse-button:hover {
    opacity: 1;
    background: var(--hf-list-hoverBackground);
  }

  .collapsed .collapse-button {
    margin: 4px;
    padding: 10px 8px;
  }

  .icon {
    font-size: 10px;
  }

  .text {
    white-space: nowrap;
  }
</style>
