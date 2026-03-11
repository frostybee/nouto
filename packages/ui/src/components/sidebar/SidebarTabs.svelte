<script lang="ts">
  import { ui, setSidebarTab, type SidebarTab } from '../../stores';

  const tabs: { id: SidebarTab; label: string; icon: string }[] = [
    { id: 'collections', label: 'Collections', icon: 'codicon-folder-library' },
    { id: 'history', label: 'History', icon: 'codicon-history' },
  ];

  const activeTab = $derived(ui.sidebarTab);
</script>

<div class="sidebar-tabs">
  {#each tabs as tab}
    <button
      class="tab"
      class:active={activeTab === tab.id}
      onclick={() => setSidebarTab(tab.id)}
    >
      <span class="tab-icon codicon {tab.icon}"></span>
      {tab.label}
    </button>
  {/each}
</div>

<style>
  .sidebar-tabs {
    display: flex;
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .tab {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 10px 8px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--hf-foreground);
    cursor: pointer;
    font-size: 10px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.6;
    transition: opacity 0.15s, border-color 0.15s;
  }

  .tab-icon {
    font-size: 12px;
  }

  .tab:hover {
    opacity: 0.9;
  }

  .tab.active {
    opacity: 1;
    border-bottom-color: var(--hf-focusBorder);
  }
</style>
