<script lang="ts">
  // Desktop App - Single-window SPA merging sidebar + main/runner/mock/benchmark views
  import { onMount } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { getMessageBus } from './lib/tauri';
  import { initMessageBus } from '@hivefetch/ui/lib/vscode';

  // Import UI components from @hivefetch/ui
  import MainPanel from '@hivefetch/ui/components/main-panel/MainPanel.svelte';
  import CollectionsTab from '@hivefetch/ui/components/sidebar/CollectionsTab.svelte';
  import VariablesTab from '@hivefetch/ui/components/sidebar/VariablesTab.svelte';
  import CollectionRunnerPanel from '@hivefetch/ui/components/runner/CollectionRunnerPanel.svelte';
  import MockServerPanel from '@hivefetch/ui/components/mock/MockServerPanel.svelte';
  import BenchmarkPanel from '@hivefetch/ui/components/benchmark/BenchmarkPanel.svelte';
  import Tooltip from '@hivefetch/ui/components/shared/Tooltip.svelte';
  import PanelSplitter from '@hivefetch/ui/components/shared/PanelSplitter.svelte';

  // Import stores from @hivefetch/ui
  import { collections as collectionsStore, initCollections } from '@hivefetch/ui/stores/collections';
  import { loadEnvironments, loadEnvFileVariables } from '@hivefetch/ui/stores/environment';
  import { setResponse, isLoading, clearResponse, setMethod, setUrl, setParams, setHeaders, setAuth, setBody, setAssertions, setAuthInheritance, setScripts, setDescription, setUrlAndParams } from '@hivefetch/ui/stores';
  import { request } from '@hivefetch/ui/stores/request';
  import { storeResponse } from '@hivefetch/ui/stores/responseContext';
  import { setAssertionResults, clearAssertionResults } from '@hivefetch/ui/stores/assertions';
  import { setScriptOutput, clearScriptOutput } from '@hivefetch/ui/stores/scripts';
  import { setWsStatus, addWsMessage } from '@hivefetch/ui/stores/websocket';
  import { setSSEStatus, addSSEEvent } from '@hivefetch/ui/stores/sse';
  import { setConnectionMode, ui } from '@hivefetch/ui/stores/ui';
  import { loadSettings } from '@hivefetch/ui/stores/settings';

  // Sidebar split ratio from ui store
  const sidebarSplitRatio = $derived($ui.sidebarSplitRatio || 0.2); // Default 20% width

  import type { SavedRequest, Collection, ConnectionMode } from '@hivefetch/core';
  import type { IncomingMessage } from '@hivefetch/transport';

  // View routing
  type View = 'main' | 'runner' | 'mock' | 'benchmark';
  let currentView = $state<View>('main');

  // Sidebar tab state
  type SidebarTab = 'collections' | 'variables';
  let activeSidebarTab = $state<SidebarTab>('collections');

  // App state
  let messageBus: ReturnType<typeof getMessageBus>;
  let appLoading = $state(true);
  let collections = $state<Collection[]>([]);

  // Request identity (for MainPanel)
  let panelId: string | null = null;
  let requestId: string | null = null;
  let collectionId: string | null = $state<string | null>(null);
  let collectionName: string | null = $state<string | null>(null);
  let showSaveNudge = $state(false);
  let nudgeDismissed = $state(false);

  onMount(async () => {
    // Prevent default browser context menu globally
    // Existing custom menus will continue to work because they use stopPropagation()
    const preventContextMenu = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('contextmenu', preventContextMenu);

    // Show window immediately
    try {
      const appWindow = getCurrentWindow();
      await appWindow.show();
      await appWindow.setFocus();
    } catch (err) {
      console.error('Failed to show window:', err);
    }

    // Initialize Tauri message bus
    messageBus = getMessageBus();
    // Wire all packages/ui components to Tauri IPC instead of VSCode IPC
    initMessageBus(messageBus);

    // Subscribe to messages from Rust backend
    const unsubscribe = messageBus.onMessage((message: IncomingMessage) => {
      handleMessage(message);
    });

    // Restore persisted state
    const savedState = messageBus.getState<{
      currentView?: View;
      activeSidebarTab?: SidebarTab;
      request?: SavedRequest;
      collections?: Collection[];
    }>();

    if (savedState) {
      if (savedState.currentView) currentView = savedState.currentView;
      if (savedState.activeSidebarTab) activeSidebarTab = savedState.activeSidebarTab;
      if (savedState.collections) collections = savedState.collections;
      if (savedState.request) loadRequest(savedState.request);
    }

    // Request initial data from Rust backend
    messageBus.send({ type: 'ready' });
    messageBus.send({ type: 'loadData' });

    // Persist state on changes
    $effect(() => {
      messageBus.setState({
        currentView,
        activeSidebarTab,
        collections,
      });
    });

    return () => {
      document.removeEventListener('contextmenu', preventContextMenu);
      unsubscribe();
      messageBus?.destroy();
    };
  });

  async function handleMessage(message: IncomingMessage) {
    switch (message.type) {
      case 'initialData':
        if (message.data?.collections) {
          collections = message.data.collections;
          initCollections(message.data.collections);
        }
        if (message.data?.environments) {
          loadEnvironments(message.data.environments);
        }
        appLoading = false;
        break;

      case 'collectionsLoaded':
      case 'collections':
        collections = message.data || [];
        initCollections(message.data || []);
        break;

      case 'loadEnvironments':
        loadEnvironments(message.data);
        break;

      case 'envFileVariablesUpdated':
        loadEnvFileVariables(message.data);
        break;

      case 'loadRequest':
        loadRequest(message.data);
        currentView = 'main'; // Switch to main view when loading a request
        break;

      case 'requestResponse':
        setResponse(message.data);
        if (message.data.assertionResults) {
          setAssertionResults(message.data.assertionResults);
        }
        if (!collectionId && !nudgeDismissed && !message.data.error) {
          showSaveNudge = true;
        }
        break;

      case 'requestCancelled':
        isLoading.set(false);
        break;

      case 'storeResponseContext':
        storeResponse(message.data.requestId, message.data.response, message.data.requestName);
        break;

      case 'loadSettings':
        loadSettings(message.data);
        break;

      case 'scriptOutput':
        if (message.data.phase === 'preRequest') {
          setScriptOutput('preRequest', message.data.result);
        } else if (message.data.phase === 'postResponse') {
          setScriptOutput('postResponse', message.data.result);
        }
        break;

      case 'wsStatus':
        setWsStatus(message.data.status, message.data.error);
        break;

      case 'wsMessage':
        addWsMessage(message.data);
        break;

      case 'sseStatus':
        setSSEStatus(message.data.status, message.data.error);
        break;

      case 'sseEvent':
        addSSEEvent(message.data);
        break;

      case 'error':
        console.error('[HiveFetch]', message.message);
        break;
    }
  }

  function loadRequest(data: SavedRequest) {
    clearResponse();
    clearAssertionResults();
    clearScriptOutput();
    setMethod(data.method || 'GET');
    const params = Array.isArray(data.params) ? data.params : [];
    const headers = Array.isArray(data.headers) ? data.headers : [];
    setUrlAndParams(data.url || '', params);
    setHeaders(headers);
    setAuth(data.auth || { type: 'none' });
    setBody(data.body || { type: 'none', content: '' });
    setAssertions(data.assertions || []);
    setAuthInheritance(data.authInheritance);
    setScripts(data.scripts || { preRequest: '', postResponse: '' });
    setDescription(data.description || '');

    const connMode = (data as any)._connectionMode;
    if (connMode) {
      setConnectionMode(connMode as ConnectionMode);
    }
  }

  function switchView(view: View) {
    currentView = view;
  }

  function setActiveSidebarTab(tab: SidebarTab) {
    activeSidebarTab = tab;
  }

  function handleNewRequest() {
    messageBus.send({ type: 'newRequest' });
  }

  function postMessage(message: any) {
    messageBus.send(message);
  }
</script>

<div class="app-container" style="grid-template-columns: {sidebarSplitRatio}fr 4px {1 - sidebarSplitRatio}fr;">
  <!-- Sidebar -->
  <aside class="sidebar">
    <div class="sidebar-header">
      <h1>HiveFetch</h1>
    </div>

    <!-- View Navigation Tabs -->
    <nav class="view-tabs">
      <button
        class="view-tab"
        class:active={currentView === 'main'}
        onclick={() => switchView('main')}
      >
        <span class="codicon codicon-request"></span>
        Requests
      </button>
      <button
        class="view-tab"
        class:active={currentView === 'runner'}
        onclick={() => switchView('runner')}
      >
        <span class="codicon codicon-play"></span>
        Runner
      </button>
      <button
        class="view-tab"
        class:active={currentView === 'mock'}
        onclick={() => switchView('mock')}
      >
        <span class="codicon codicon-server"></span>
        Mock Server
      </button>
      <button
        class="view-tab"
        class:active={currentView === 'benchmark'}
        onclick={() => switchView('benchmark')}
      >
        <span class="codicon codicon-pulse"></span>
        Benchmark
      </button>
    </nav>

    <!-- New Request Button -->
    <div class="new-request-bar">
      <Tooltip text="New Request (Ctrl+N)">
        <button class="new-request-button" onclick={handleNewRequest}>
          <span class="codicon codicon-add"></span>
          <span class="button-label">New Request</span>
        </button>
      </Tooltip>
    </div>

    <!-- Sidebar Tabs (Collections/Variables) -->
    <div class="sidebar-tab-bar">
      <button
        class="sidebar-tab"
        class:active={activeSidebarTab === 'collections'}
        onclick={() => setActiveSidebarTab('collections')}
      >
        Collections
      </button>
      <button
        class="sidebar-tab"
        class:active={activeSidebarTab === 'variables'}
        onclick={() => setActiveSidebarTab('variables')}
      >
        Variables
      </button>
    </div>

    <!-- Sidebar Content -->
    <div class="sidebar-content">
      {#if activeSidebarTab === 'collections'}
        <CollectionsTab {postMessage} />
      {:else}
        <VariablesTab {postMessage} />
      {/if}
    </div>
  </aside>

  <!-- Sidebar Resizer -->
  <PanelSplitter orientation="horizontal" target="sidebar" />

  <!-- Main Content Area -->
  <main class="content">
    {#if currentView === 'main'}
      <MainPanel
        {collectionId}
        {collectionName}
        {collections}
        {showSaveNudge}
        {postMessage}
        onDismissNudge={() => { showSaveNudge = false; nudgeDismissed = true; }}
        onSaveToCollection={() => { messageBus.send({ type: 'getCollections' }); }}
      />
    {:else if currentView === 'runner'}
      <CollectionRunnerPanel {postMessage} />
    {:else if currentView === 'mock'}
      <MockServerPanel {postMessage} />
    {:else if currentView === 'benchmark'}
      <BenchmarkPanel {postMessage} />
    {/if}
  </main>
</div>

<style>
  .app-container {
    display: grid;
    grid-template-rows: 1fr;
    width: 100%;
    height: 100vh;
    overflow: hidden;
    background: var(--hf-editor-background);
    color: var(--hf-editor-foreground);
  }

  .sidebar {
    background: var(--hf-sideBar-background);
    border-right: 1px solid var(--hf-sideBar-border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 200px;
  }

  .sidebar-header {
    padding: 16px;
    border-bottom: 1px solid var(--hf-sideBar-border);
  }

  .sidebar-header h1 {
    font-size: 16px;
    font-weight: 600;
    margin: 0;
    color: var(--hf-sideBarTitle-foreground);
  }

  .view-tabs {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px;
    border-bottom: 1px solid var(--hf-sideBar-border);
  }

  .view-tab {
    background: transparent;
    border: none;
    color: var(--hf-sideBar-foreground);
    padding: 8px 12px;
    text-align: left;
    cursor: pointer;
    border-radius: 4px;
    font-size: 13px;
    transition: background-color 0.15s ease;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .view-tab:hover {
    background: var(--hf-list-hoverBackground);
  }

  .view-tab.active {
    background: var(--hf-list-activeSelectionBackground);
    font-weight: 500;
  }

  .new-request-bar {
    padding: 8px;
    border-bottom: 1px solid var(--hf-sideBar-border);
  }

  .new-request-button {
    width: 100%;
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
    border: none;
    padding: 6px 12px;
    border-radius: 2px;
    cursor: pointer;
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    transition: background-color 0.15s ease;
  }

  .new-request-button:hover {
    background: var(--hf-button-hoverBackground);
  }

  .sidebar-tab-bar {
    display: flex;
    border-bottom: 1px solid var(--hf-sideBar-border);
  }

  .sidebar-tab {
    flex: 1;
    background: transparent;
    border: none;
    color: var(--hf-sideBar-foreground);
    padding: 8px 12px;
    cursor: pointer;
    font-size: 12px;
    border-bottom: 2px solid transparent;
    transition: all 0.15s ease;
  }

  .sidebar-tab:hover {
    background: var(--hf-list-hoverBackground);
  }

  .sidebar-tab.active {
    border-bottom-color: var(--hf-focusBorder);
    font-weight: 500;
  }

  .sidebar-content {
    flex: 1;
    overflow-y: auto;
  }

  .content {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* codicons */
  .codicon {
    font-family: 'codicon', monospace;
    font-size: 16px;
  }
</style>
