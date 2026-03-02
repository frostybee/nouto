<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import CollectionsTab from './components/sidebar/CollectionsTab.svelte';
  import VariablesTab from './components/sidebar/VariablesTab.svelte';
  import HistoryTab from './components/sidebar/HistoryTab.svelte';
  import { loadEnvironments, loadEnvFileVariables } from './stores/environment';
  import { collections as collectionsStore, initCollections, duplicateRequest, selectedRequestId } from './stores/collections';
  import { get } from 'svelte/store';
  import { setDirtyRequestIds } from './stores/dirtyState';
  import { initHistory, historyStats, historyStatsLoading } from './stores/history';
  import Tooltip from './components/shared/Tooltip.svelte';

  type SidebarTab = 'collections' | 'variables' | 'history';

  let activeTab = $state<SidebarTab>('collections');
  let isLoading = $state(true);



  // Message handler
  function handleMessage(event: MessageEvent) {
    const message = event.data;

    switch (message.type) {
      case 'initialData':
        initCollections(message.data.collections || []);
        // Load environments into the store
        loadEnvironments({
          ...(message.data.environments || { environments: [], activeId: null, globalVariables: [] }),
          envFileVariables: message.data.envFileVariables,
          envFilePath: message.data.envFilePath,
        });
        isLoading = false;
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

      case 'dirtyRequestIds':
        setDirtyRequestIds(message.data || []);
        break;

      case 'historyLoaded':
      case 'historyUpdated':
        initHistory(message.data);
        break;

      case 'historyStatsLoaded':
        historyStats.set(message.data);
        historyStatsLoading.set(false);
        break;

      case 'triggerDuplicateSelected': {
        const reqId = get(selectedRequestId);
        if (reqId) {
          duplicateRequest(reqId);
        }
        break;
      }
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
    <Tooltip text="New Request (Ctrl+N)">
      <button class="new-request-button" onclick={handleNewRequest}>
        <span class="button-icon codicon codicon-add"></span>
        <span class="button-label">New Request</span>
      </button>
    </Tooltip>
  </div>

  <div class="tab-bar">
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
      <button
        class="tab-button"
        class:active={activeTab === 'history'}
        onclick={() => setActiveTab('history')}
        title="History"
      >
        History
      </button>
    </div>

  <div class="tab-content">
      {#if isLoading}
        <div class="loading">Loading...</div>
      {:else if activeTab === 'collections'}
        <CollectionsTab {postMessage} />
      {:else if activeTab === 'variables'}
        <VariablesTab {postMessage} />
      {:else if activeTab === 'history'}
        <HistoryTab {postMessage} />
      {/if}
  </div>
</div>

<style>
  .sidebar {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: visible;
    position: relative;
    padding-right: 4px;
  }

  .sidebar::before {
    content: '';
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    background: var(--hf-panel-border);
    z-index: 1;
  }

  .sidebar::after {
    content: '';
    position: absolute;
    right: 1px;
    top: 50%;
    transform: translateY(-50%);
    width: 2px;
    height: 40px;
    background: var(--hf-scrollbarSlider-background);
    border-radius: 2px;
    pointer-events: none;
    z-index: 2;
  }


  .new-request-bar {
    padding: 10px 10px 6px;
    flex-shrink: 0;
  }

  .new-request-bar :global(.tooltip-wrapper) {
    width: 100%;
  }

  .new-request-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    width: 100%;
    padding: 8px 12px;
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
    white-space: nowrap;
  }

  .new-request-button:hover {
    background: var(--hf-button-hoverBackground);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
    transform: translateY(-1px);
  }

  .new-request-button:active {
    transform: translateY(0);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  }

  .button-icon {
    font-size: 14px;
    font-weight: bold;
  }

  .button-label {
    line-height: 1;
  }

  .tab-bar {
    display: flex;
    border-bottom: 1px solid var(--hf-panel-border);
    background: var(--hf-sideBar-background);
    flex-shrink: 0;
  }

  .tab-button {
    flex: 1;
    padding: 8px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--hf-foreground);
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
    background: var(--hf-list-hoverBackground);
  }

  .tab-button.active {
    opacity: 1;
    border-bottom-color: var(--hf-focusBorder);
  }

  .tab-content {
    flex: 1;
    overflow: visible;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--hf-descriptionForeground);
    font-size: 12px;
  }
</style>
