<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import HistoryTab from './components/sidebar/HistoryTab.svelte';
  import CollectionsTab from './components/sidebar/CollectionsTab.svelte';
  import VariablesTab from './components/sidebar/VariablesTab.svelte';
  import { loadEnvironments, loadEnvFileVariables } from './stores/environment';
  import { collections as collectionsStore, initCollections } from './stores/collections';
  import type { HistoryEntry } from './types';

  type SidebarTab = 'history' | 'collections' | 'variables';

  let activeTab = $state<SidebarTab>('history');
  let history = $state<HistoryEntry[]>([]);
  let isLoading = $state(true);

  const isMac = navigator.platform?.toUpperCase().includes('MAC');
  const shortcutLabel = isMac ? '\u2318 N' : 'Ctrl+N';

  // Message handler
  function handleMessage(event: MessageEvent) {
    const message = event.data;

    switch (message.type) {
      case 'initialData':
        history = message.data.history || [];
        initCollections(message.data.collections || []);
        // Load environments into the store
        loadEnvironments({
          ...(message.data.environments || { environments: [], activeId: null, globalVariables: [] }),
          envFileVariables: message.data.envFileVariables,
          envFilePath: message.data.envFilePath,
        });
        isLoading = false;
        break;

      case 'historyUpdated':
        history = message.data || [];
        break;

      case 'collectionsUpdated':
        initCollections(message.data || []);
        break;

      case 'environmentsUpdated':
        // Update environments in the store
        loadEnvironments(message.data || { environments: [], activeId: null, globalVariables: [] });
        break;

      case 'envFileVariablesUpdated':
        loadEnvFileVariables(message.data);
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

  function handleNewRequest() {
    postMessage({ type: 'newRequest' });
  }

  // Tab handlers
  function setActiveTab(tab: SidebarTab) {
    activeTab = tab;
  }
</script>

<div class="sidebar">
  <div class="new-request-bar">
    <button class="new-request-button" onclick={handleNewRequest}>
      <span class="button-content">
        <span class="button-icon codicon codicon-add"></span>
        <span class="button-label">New Request</span>
      </span>
      <kbd class="shortcut">{shortcutLabel}</kbd>
    </button>
  </div>

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
      <HistoryTab {history} collections={$collectionsStore} {postMessage} />
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

  .new-request-bar {
    padding: 10px 10px 6px;
    flex-shrink: 0;
  }

  .new-request-button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 8px 12px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  }

  .new-request-button:hover {
    background: var(--vscode-button-hoverBackground);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
    transform: translateY(-1px);
  }

  .new-request-button:active {
    transform: translateY(0);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  }

  .button-content {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .button-icon {
    font-size: 14px;
    font-weight: bold;
  }

  .button-label {
    line-height: 1;
  }

  .shortcut {
    font-size: 10px;
    font-weight: 500;
    font-family: inherit;
    padding: 2px 6px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.15);
    border: none;
    color: inherit;
    opacity: 0.7;
    letter-spacing: 0.3px;
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
