<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import HistoryTab from './components/sidebar/HistoryTab.svelte';
  import CollectionsTab from './components/sidebar/CollectionsTab.svelte';
  import VariablesTab from './components/sidebar/VariablesTab.svelte';
  import { loadEnvironments } from './stores/environment';
  import { initCollections } from './stores/collections';
  import type { HistoryEntry, Collection } from './types';

  type SidebarTab = 'history' | 'collections' | 'variables';

  let activeTab = $state<SidebarTab>('history');
  let history = $state<HistoryEntry[]>([]);
  let collections = $state<Collection[]>([]);
  let isLoading = $state(true);

  // Message handler
  function handleMessage(event: MessageEvent) {
    const message = event.data;

    switch (message.type) {
      case 'initialData':
        history = message.data.history || [];
        collections = message.data.collections || [];
        // Initialize collections store for CollectionsTab
        initCollections(message.data.collections || []);
        // Load environments into the store
        loadEnvironments(message.data.environments || { environments: [], activeId: null, globalVariables: [] });
        isLoading = false;
        break;

      case 'historyUpdated':
        history = message.data || [];
        break;

      case 'collectionsUpdated':
        collections = message.data || [];
        initCollections(message.data || []);
        break;

      case 'environmentsUpdated':
        // Update environments in the store
        loadEnvironments(message.data || { environments: [], activeId: null, globalVariables: [] });
        break;
    }
  }

  onMount(() => {
    window.addEventListener('message', handleMessage);

    // Notify extension that we're ready
    window.vscode?.postMessage({ type: 'ready' });
  });

  onDestroy(() => {
    window.removeEventListener('message', handleMessage);
  });

  function postMessage(message: any) {
    window.vscode?.postMessage(message);
  }

  // Tab handlers
  function setActiveTab(tab: SidebarTab) {
    activeTab = tab;
  }
</script>

<div class="sidebar">
  <div class="tab-bar">
    <button
      class="tab-button"
      class:active={activeTab === 'history'}
      onclick={() => setActiveTab('history')}
      title="History"
    >
      History
    </button>
    <button
      class="tab-button"
      class:active={activeTab === 'collections'}
      onclick={() => setActiveTab('collections')}
      title="Collections"
    >
      Collections
    </button>
    <button
      class="tab-button"
      class:active={activeTab === 'variables'}
      onclick={() => setActiveTab('variables')}
      title="Variables"
    >
      Variables
    </button>
  </div>

  <div class="tab-content">
    {#if isLoading}
      <div class="loading">Loading...</div>
    {:else if activeTab === 'history'}
      <HistoryTab {history} {collections} {postMessage} />
    {:else if activeTab === 'collections'}
      <CollectionsTab {postMessage} />
    {:else if activeTab === 'variables'}
      <VariablesTab {postMessage} />
    {/if}
  </div>
</div>

<style>
  .sidebar {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .tab-bar {
    display: flex;
    border-bottom: 1px solid var(--vscode-panel-border);
    background: var(--vscode-sideBar-background);
    flex-shrink: 0;
  }

  .tab-button {
    flex: 1;
    padding: 8px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--vscode-foreground);
    cursor: pointer;
    opacity: 0.6;
    transition: opacity 0.15s, border-color 0.15s;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .tab-button:hover {
    opacity: 0.9;
    background: var(--vscode-list-hoverBackground);
  }

  .tab-button.active {
    opacity: 1;
    border-bottom-color: var(--vscode-focusBorder);
  }

  .tab-content {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
  }
</style>
