<script lang="ts">
  import { ui, toggleSidebar } from '../../stores';
  import SidebarTabs from './SidebarTabs.svelte';
  import CollectionsTab from './CollectionsTab.svelte';
  import HistoryTab from './HistoryTab.svelte';

  $: sidebarCollapsed = $ui.sidebarCollapsed;
  $: sidebarTab = $ui.sidebarTab;
  $: sidebarWidth = $ui.sidebarWidth;
</script>

<aside
  class="sidebar"
  class:collapsed={sidebarCollapsed}
  style="--sidebar-width: {sidebarWidth}px"
>
  {#if !sidebarCollapsed}
    <SidebarTabs />

    <div class="sidebar-content">
      {#if sidebarTab === 'collections'}
        <CollectionsTab />
      {:else}
        <HistoryTab />
      {/if}
    </div>
  {/if}

  <button
    class="collapse-button"
    on:click={toggleSidebar}
    title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
  >
    {#if sidebarCollapsed}
      <span class="icon">&#9654;</span>
    {:else}
      <span class="icon">&#9664;</span>
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
