<script lang="ts">
  import { ui, toggleSidebar } from '../../stores';
  import { collections } from '../../stores/collections';
  import { postMessage } from '../../lib/vscode';
  import SidebarTabs from './SidebarTabs.svelte';
  import CollectionsTab from './CollectionsTab.svelte';

  const sidebarCollapsed = $derived($ui.sidebarCollapsed);
  const sidebarTab = $derived($ui.sidebarTab);
  const sidebarWidth = $derived($ui.sidebarWidth);
</script>

<aside
  class="sidebar"
  class:collapsed={sidebarCollapsed}
  style="--sidebar-width: {sidebarWidth}px"
>
  {#if !sidebarCollapsed}
    <SidebarTabs />

    <div class="sidebar-content">
      <CollectionsTab {postMessage} />
    </div>
  {/if}

  <button
    class="collapse-button"
    onclick={toggleSidebar}
    title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
  >
    {#if sidebarCollapsed}
      <span class="icon codicon codicon-chevron-right"></span>
    {:else}
      <span class="icon codicon codicon-chevron-left"></span>
      <span class="text">Collapse</span>
    {/if}
  </button>
</aside>

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    width: var(--sidebar-width);
    min-width: var(--sidebar-width);
    background: var(--vscode-sideBar-background);
    border-right: 1px solid var(--vscode-panel-border);
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

  .collapse-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px;
    margin: 8px;
    background: transparent;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    color: var(--vscode-foreground);
    cursor: pointer;
    font-size: 12px;
    opacity: 0.7;
    transition: opacity 0.15s, background 0.15s;
  }

  .collapse-button:hover {
    opacity: 1;
    background: var(--vscode-list-hoverBackground);
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
