<script lang="ts">
  // Desktop App - Single-window SPA merging sidebar + main/runner/mock/benchmark views
  import { onMount } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { getMessageBus } from './lib/tauri';
  import { initMessageBus } from '@hivefetch/ui/lib/vscode';

  // Import UI components from @hivefetch/ui
  import MainPanel from '@hivefetch/ui/components/main-panel/MainPanel.svelte';
  import CollectionsTab from '@hivefetch/ui/components/sidebar/CollectionsTab.svelte';
  import CollectionRunnerPanel from '@hivefetch/ui/components/runner/CollectionRunnerPanel.svelte';
  import MockServerPanel from '@hivefetch/ui/components/mock/MockServerPanel.svelte';
  import BenchmarkPanel from '@hivefetch/ui/components/benchmark/BenchmarkPanel.svelte';
  import Tooltip from '@hivefetch/ui/components/shared/Tooltip.svelte';
  import PanelSplitter from '@hivefetch/ui/components/shared/PanelSplitter.svelte';
  import NotificationStack from '@hivefetch/ui/components/shared/NotificationStack.svelte';
  import InputBoxModal from '@hivefetch/ui/components/shared/InputBoxModal.svelte';
  import QuickPickModal from '@hivefetch/ui/components/shared/QuickPickModal.svelte';
  import ConfirmDialog from '@hivefetch/ui/components/shared/ConfirmDialog.svelte';

  // Import stores from @hivefetch/ui
  import { collections as collectionsStore, initCollections, addRequestToCollection, addCollection } from '@hivefetch/ui/stores/collections.svelte';
  import { loadEnvironments, loadEnvFileVariables, updateCollectionScopedVariables } from '@hivefetch/ui/stores/environment.svelte';
  import { setResponse, setLoading, clearResponse, setMethod, setUrl, setParams, setHeaders, setAuth, setBody, setAssertions, setAuthInheritance, setScripts, setDescription, setUrlAndParams, setDownloadProgress } from '@hivefetch/ui/stores';
  import { request } from '@hivefetch/ui/stores/request.svelte';
  import { storeResponse } from '@hivefetch/ui/stores/responseContext.svelte';
  import { setAssertionResults, clearAssertionResults } from '@hivefetch/ui/stores/assertions.svelte';
  import { setScriptOutput, clearScriptOutput } from '@hivefetch/ui/stores/scripts.svelte';
  import { setWsStatus, addWsMessage } from '@hivefetch/ui/stores/websocket.svelte';
  import { setSSEStatus, addSSEEvent } from '@hivefetch/ui/stores/sse.svelte';
  import { setConnectionMode, ui } from '@hivefetch/ui/stores/ui.svelte';
  import { loadSettings, settingsOpen, setSettingsOpen } from '@hivefetch/ui/stores/settings.svelte';
  import { setCookieJarData, loadCookieJars } from '@hivefetch/ui/stores/cookieJar.svelte';
  import { showNotification, setPendingInput, clearPendingInput, pendingInput } from '@hivefetch/ui/stores/notifications.svelte';

  // Sidebar split ratio from ui store
  const sidebarSplitRatio = $derived(ui.sidebarSplitRatio || 0.2); // Default 20% width

  import { getDefaultsForRequestKind, type RequestKind, type SavedRequest, type Collection, type ConnectionMode } from '@hivefetch/core';
  import type { IncomingMessage } from '@hivefetch/transport';

  // View routing
  type View = 'main' | 'runner' | 'mock' | 'benchmark';
  let currentView = $state<View>('main');

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

  // Keep collection/folder scoped variables in sync with the active request context
  $effect(() => {
    updateCollectionScopedVariables(collections, collectionId, requestId);
  });

  // Persist state on changes
  $effect(() => {
    if (messageBus) {
      messageBus.setState({
        currentView,
        collections,
      });
    }
  });

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
      request?: SavedRequest;
      collections?: Collection[];
    }>();

    if (savedState) {
      if (savedState.currentView) currentView = savedState.currentView;
      if (savedState.collections) collections = savedState.collections;
      if (savedState.request) loadRequest(savedState.request);
    }

    // Request initial data from Rust backend
    messageBus.send({ type: 'ready' });
    messageBus.send({ type: 'loadData' });

    return () => {
      document.removeEventListener('contextmenu', preventContextMenu);
      unsubscribe();
      messageBus?.destroy();
    };
  });

  async function handleMessage(message: IncomingMessage) {
    try {
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

      case 'downloadProgress':
        setDownloadProgress(message.data.loaded, message.data.total);
        break;

      case 'requestCancelled':
        setLoading(false);
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

      case 'cookieJarData':
        setCookieJarData(message.data || {});
        break;

      case 'cookieJarsList':
        loadCookieJars(message.data || { jars: [], activeJarId: null });
        break;

      case 'error':
        console.error('[HiveFetch]', message.message);
        break;

      case 'showNotification':
        showNotification(message.data.level, message.data.message);
        break;
      case 'showInputBox':
        setPendingInput({ type: 'inputBox', requestId: message.data.requestId, data: message.data });
        break;
      case 'showQuickPick':
        setPendingInput({ type: 'quickPick', requestId: message.data.requestId, data: message.data });
        break;
      case 'showConfirm':
        setPendingInput({ type: 'confirm', requestId: message.data.requestId, data: message.data });
        break;
    }
    } catch (err) {
      console.error('[HiveFetch] Error handling message:', (message as any)?.type, err);
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

  let newRequestDropdownOpen = $state(false);

  function toggleNewRequestDropdown() {
    newRequestDropdownOpen = !newRequestDropdownOpen;
  }

  function handleNewRequestKind(kind: string) {
    newRequestDropdownOpen = false;
    const defaults = getDefaultsForRequestKind(kind as RequestKind);

    // Find or create a collection to save the request into
    let targetCollection = collections[0];
    if (!targetCollection) {
      const created = addCollection('My Collection');
      if (created) {
        targetCollection = created;
        collections = collectionsStore();
      }
    }

    if (targetCollection) {
      // Create request in the collection
      const savedRequest = addRequestToCollection(targetCollection.id, {
        name: defaults.name,
        method: defaults.method,
        url: defaults.url,
        params: [],
        headers: [],
        auth: { type: 'none' },
        body: defaults.body,
      });

      // Sync local state with store
      collections = get(collectionsStore);

      // Load the saved request into the form
      clearResponse();
      clearAssertionResults();
      clearScriptOutput();
      setMethod(savedRequest.method);
      setUrlAndParams(savedRequest.url, []);
      setHeaders([]);
      setAuth({ type: 'none' });
      setBody(savedRequest.body || { type: 'none', content: '' });
      setAssertions([]);
      setAuthInheritance(undefined);
      setScripts({ preRequest: '', postResponse: '' });
      setDescription('');
      setConnectionMode(defaults.connectionMode);

      collectionId = targetCollection.id;
      collectionName = targetCollection.name;
      requestId = savedRequest.id;
    } else {
      // Fallback: open as unsaved draft
      clearResponse();
      clearAssertionResults();
      clearScriptOutput();
      setMethod(defaults.method);
      setUrlAndParams(defaults.url, []);
      setHeaders([]);
      setAuth({ type: 'none' });
      setBody(defaults.body);
      setAssertions([]);
      setAuthInheritance(undefined);
      setScripts({ preRequest: '', postResponse: '' });
      setDescription('');
      setConnectionMode(defaults.connectionMode);
      collectionId = null;
      collectionName = null;
    }

    showSaveNudge = false;
    nudgeDismissed = false;
    currentView = 'main';
  }

  function postMessage(message: any) {
    messageBus.send(message);
  }

  // UI Interaction response helpers
  function respondInputBox(value: string | null) {
    const pending = pendingInput();
    if (pending?.type === 'inputBox') {
      messageBus.send({ type: 'inputBoxResult', data: { requestId: pending.requestId, value } } as any);
      clearPendingInput();
    }
  }

  function respondQuickPick(value: string | string[] | null) {
    const pending = pendingInput();
    if (pending?.type === 'quickPick') {
      messageBus.send({ type: 'quickPickResult', data: { requestId: pending.requestId, value } } as any);
      clearPendingInput();
    }
  }

  function respondConfirm(confirmed: boolean) {
    const pending = pendingInput();
    if (pending?.type === 'confirm') {
      messageBus.send({ type: 'confirmResult', data: { requestId: pending.requestId, confirmed } } as any);
      clearPendingInput();
    }
  }
</script>

<NotificationStack />

{#if pendingInput()?.type === 'inputBox'}
  <InputBoxModal
    open={true}
    prompt={pendingInput().data.prompt}
    placeholder={pendingInput().data.placeholder}
    value={pendingInput().data.value}
    validateNotEmpty={pendingInput().data.validateNotEmpty}
    onsubmit={(value) => respondInputBox(value)}
    oncancel={() => respondInputBox(null)}
  />
{:else if pendingInput()?.type === 'quickPick'}
  <QuickPickModal
    open={true}
    title={pendingInput().data.title}
    items={pendingInput().data.items}
    canPickMany={pendingInput().data.canPickMany}
    onselect={(value) => respondQuickPick(value)}
    oncancel={() => respondQuickPick(null)}
  />
{:else if pendingInput()?.type === 'confirm'}
  <ConfirmDialog
    open={true}
    message={pendingInput().data.message}
    confirmLabel={pendingInput().data.confirmLabel}
    variant={pendingInput().data.variant}
    onconfirm={() => respondConfirm(true)}
    oncancel={() => respondConfirm(false)}
  />
{/if}

<div class="app-container" style="grid-template-columns: {sidebarSplitRatio}fr 4px {1 - sidebarSplitRatio}fr;">
  <!-- Sidebar -->
  <aside class="sidebar">
    <div class="sidebar-header">
      <h1>HiveFetch</h1>
      <Tooltip text="Settings">
        <button class="settings-btn" onclick={() => setSettingsOpen(true)} aria-label="Settings">
          <span class="codicon codicon-gear"></span>
        </button>
      </Tooltip>
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
      <div class="new-request-dropdown">
        <Tooltip text="New Request (Ctrl+N)">
          <button class="new-request-button" onclick={toggleNewRequestDropdown}>
            <span class="codicon codicon-add"></span>
            <span class="button-label">New Request</span>
            <span class="codicon codicon-chevron-down dropdown-chevron"></span>
          </button>
        </Tooltip>
        {#if newRequestDropdownOpen}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="dropdown-backdrop" onclick={() => { newRequestDropdownOpen = false; }}></div>
          <div class="dropdown-menu">
            <button class="dropdown-item" onclick={() => handleNewRequestKind('http')}>
              <span class="codicon codicon-globe"></span>
              New HTTP Request
            </button>
            <button class="dropdown-item" onclick={() => handleNewRequestKind('graphql')}>
              <svg class="dropdown-icon" viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
                <path d="M8 1.5L2.5 4.75v6.5L8 14.5l5.5-3.25v-6.5L8 1.5zm0 1.15l4.1 2.42v4.86L8 12.35 3.9 9.93V5.07L8 2.65z"/>
                <circle cx="8" cy="3" r="1.2"/>
                <circle cx="12" cy="5.5" r="1.2"/>
                <circle cx="12" cy="10.5" r="1.2"/>
                <circle cx="8" cy="13" r="1.2"/>
                <circle cx="4" cy="10.5" r="1.2"/>
                <circle cx="4" cy="5.5" r="1.2"/>
              </svg>
              New GraphQL Request
            </button>
            <button class="dropdown-item" onclick={() => handleNewRequestKind('websocket')}>
              <span class="codicon codicon-plug"></span>
              New WebSocket
            </button>
            <button class="dropdown-item" onclick={() => handleNewRequestKind('sse')}>
              <span class="codicon codicon-broadcast"></span>
              New SSE Connection
            </button>
          </div>
        {/if}
      </div>
    </div>

    <!-- Sidebar Content -->
    <div class="sidebar-content">
      <CollectionsTab {postMessage} />
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
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--hf-sideBar-border);
  }

  .sidebar-header h1 {
    font-size: 16px;
    font-weight: 600;
    margin: 0;
    color: var(--hf-sideBarTitle-foreground);
  }

  .settings-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--hf-sideBar-foreground);
    cursor: pointer;
    opacity: 0.6;
    transition: opacity 0.15s, background 0.15s;
    flex-shrink: 0;
  }

  .settings-btn:hover {
    opacity: 1;
    background: var(--hf-list-hoverBackground);
  }

  .settings-btn .codicon {
    font-size: 16px;
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
    font-weight: 600;
  }

  .new-request-bar {
    padding: 8px;
    border-bottom: 1px solid var(--hf-sideBar-border);
  }

  .new-request-dropdown {
    position: relative;
  }

  .new-request-dropdown :global(.tooltip-wrapper) {
    width: 100%;
  }

  .new-request-button {
    position: relative;
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

  .dropdown-chevron {
    position: absolute;
    right: 10px;
    font-size: 12px;
    opacity: 0.7;
  }

  .dropdown-backdrop {
    position: fixed;
    inset: 0;
    z-index: 999;
  }

  .dropdown-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    background: var(--hf-dropdown-background, var(--hf-input-background));
    border: 1px solid var(--hf-dropdown-border, var(--hf-panel-border));
    border-radius: 6px;
    padding: 4px;
    z-index: 1000;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px 10px;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--hf-foreground, var(--hf-sideBar-foreground));
    font-size: 12px;
    cursor: pointer;
    text-align: left;
    white-space: nowrap;
  }

  .dropdown-item:hover {
    background: var(--hf-list-hoverBackground);
  }

  .dropdown-item .codicon {
    font-size: 16px;
    width: 16px;
    text-align: center;
    flex-shrink: 0;
  }

  .dropdown-icon {
    flex-shrink: 0;
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
    font-weight: 600;
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
