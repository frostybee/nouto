<script lang="ts">
  import { ui, setSidebarTab, type SidebarTab } from '../../stores';

  const tabs: { id: SidebarTab; label: string }[] = [
    { id: 'collections', label: 'Collections' },
    { id: 'history', label: 'History' },
  ];

  $: activeTab = $ui.sidebarTab;
</script>

<div class="sidebar-tabs">
  {#each tabs as tab}
    <button
      class="tab"
      class:active={activeTab === tab.id}
      on:click={() => setSidebarTab(tab.id)}
    >
      {tab.label}
    </button>
  {/each}
</div>

<style>
  .sidebar-tabs {
    display: flex;
    border-bottom: 1px solid var(--vscode-panel-border);
  }

  .tab {
    flex: 1;
    padding: 10px 12px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--vscode-foreground);
    cursor: pointer;
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.6;
    transition: opacity 0.15s, border-color 0.15s;
  }

  .tab:hover {
    opacity: 0.9;
  }

  .tab.active {
    opacity: 1;
    border-bottom-color: var(--vscode-focusBorder);
  }
</style>
