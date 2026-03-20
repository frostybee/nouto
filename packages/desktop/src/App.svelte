<script lang="ts">
  // Desktop App - Single-window SPA merging sidebar + main/runner/mock/benchmark views
  import { onMount } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { getMessageBus } from './lib/tauri';
  import { initMessageBus } from '@nouto/ui/lib/vscode';

  // Import UI components from @nouto/ui
  import MainPanel from '@nouto/ui/components/main-panel/MainPanel.svelte';
  import CollectionsTab from '@nouto/ui/components/sidebar/CollectionsTab.svelte';
  import CollectionRunnerPanel from '@nouto/ui/components/runner/CollectionRunnerPanel.svelte';
  import MockServerPanel from '@nouto/ui/components/mock/MockServerPanel.svelte';
  import BenchmarkPanel from '@nouto/ui/components/benchmark/BenchmarkPanel.svelte';
  import Tooltip from '@nouto/ui/components/shared/Tooltip.svelte';
  import PanelSplitter from '@nouto/ui/components/shared/PanelSplitter.svelte';
  import NotificationStack from '@nouto/ui/components/shared/NotificationStack.svelte';
  import InputBoxModal from '@nouto/ui/components/shared/InputBoxModal.svelte';
  import QuickPickModal from '@nouto/ui/components/shared/QuickPickModal.svelte';
  import ConfirmDialog from '@nouto/ui/components/shared/ConfirmDialog.svelte';

  // Import stores from @nouto/ui
  import { collections as collectionsStore, initCollections, addRequestToCollection, addCollection, setCollections, deleteCollection as storeDeleteCollection, deleteRequest as storeDeleteRequest, deleteFolder as storeDeleteFolder, moveItem, findItemById, findItemRecursive, findCollectionForItem, isDraftsCollection, addFolder, updateRequest, renameCollection as storeRenameCollection, renameFolder as storeRenameFolder } from '@nouto/ui/stores/collections.svelte';
  import { loadEnvironments, loadEnvFileVariables, updateCollectionScopedVariables, environments as environmentsList, activeEnvironmentId, globalVariables, updateGlobalVariables, updateEnvironmentVariables, addEnvironment } from '@nouto/ui/stores/environment.svelte';
  import { setResponse, setLoading, clearResponse, setMethod, setUrl, setParams, setHeaders, setAuth, setBody, setAssertions, setAuthInheritance, setScriptInheritance, setScripts, setDescription, setUrlAndParams, setDownloadProgress, setSsl, setProxy, setTimeout as setRequestTimeout, setRedirects, setPathParams, setGrpc, request as requestStore, setOriginalSnapshot, setRequestContext, clearOriginalSnapshot, clearRequestContext } from '@nouto/ui/stores';
  import { storeResponse } from '@nouto/ui/stores/responseContext.svelte';
  import { setAssertionResults, clearAssertionResults } from '@nouto/ui/stores/assertions.svelte';
  import { setScriptOutput, clearScriptOutput } from '@nouto/ui/stores/scripts.svelte';
  import { setWsStatus, addWsMessage } from '@nouto/ui/stores/websocket.svelte';
  import { setSSEStatus, addSSEEvent } from '@nouto/ui/stores/sse.svelte';
  import { setConnectionMode, ui } from '@nouto/ui/stores/ui.svelte';
  import { loadSettings, settingsOpen, setSettingsOpen, resolvedShortcuts } from '@nouto/ui/stores/settings.svelte';
  import { matchesBinding } from '@nouto/ui/lib/shortcuts';
  import { setCookieJarData, loadCookieJars } from '@nouto/ui/stores/cookieJar.svelte';
  import { showNotification, setPendingInput, clearPendingInput, pendingInput } from '@nouto/ui/stores/notifications.svelte';
  import { initRunner } from '@nouto/ui/stores/collectionRunner.svelte';
  import TabBar from '@nouto/ui/components/shared/TabBar.svelte';
  import SettingsPage from '@nouto/ui/components/shared/SettingsPage.svelte';
  import EnvironmentsPanel from '@nouto/ui/components/environments/EnvironmentsPanel.svelte';
  import CollectionSettingsPanel from '@nouto/ui/components/settings/CollectionSettingsPanel.svelte';
  import { initSettings, notifySettingsSaved } from '@nouto/ui/stores/collectionSettings.svelte';
  import {
    tabs as tabsList, activeTabId as activeTabIdFn, activeTab as activeTabFn,
    openTab, closeTab, switchTab as switchTabFn, updateTabLabel, setTabDirty, setTabIcon,
    setTabRequestId, findTabByRequestId, findSingletonTab,
    saveCurrentSnapshot, restoreSnapshot,
    createRequestTab, createSingletonTab, loadFromStorage as loadTabsFromStorage,
  } from '@nouto/ui/stores/tabs.svelte';
  import { setMockStatus, addLog as addMockLog, initMockServer as initMockStore, mockServerState } from '@nouto/ui/stores/mockServer.svelte';
  import { benchmarkState, updateProgress as updateBenchmarkProgress, addIteration as addBenchmarkIteration, setCompleted as setBenchmarkCompleted, setCancelled as setBenchmarkCancelled } from '@nouto/ui/stores/benchmark.svelte';

  // Sidebar split ratio from ui store
  const sidebarSplitRatio = $derived(ui.sidebarSplitRatio || 0.2); // Default 20% width

  import { getDefaultsForRequestKind, isFolder, isRequest, generateId, type RequestKind, type SavedRequest, type Collection, type Folder, type CollectionItem, type ConnectionMode, parseCurl, isCurlCommand } from '@nouto/core';
  import type { IncomingMessage } from '@nouto/transport';

  // Import services (browser-safe, no Node.js fs dependency)
  import { InsomniaImportService } from '@nouto/core/services/InsomniaImportService';
  import { HoppscotchImportService } from '@nouto/core/services/HoppscotchImportService';
  import { HarImportService } from '@nouto/core/services/HarImportService';
  import { ThunderClientImportService } from '@nouto/core/services/ThunderClientImportService';
  import { BrunoImportService } from '@nouto/core/services/BrunoImportService';
  import { PostmanImportService } from '@nouto/core/services/PostmanImportService';
  import { OpenApiImportService } from '@nouto/core/services/OpenApiImportService';
  import { HarExportService } from '@nouto/core/services/HarExportService';

  const insomniaImportService = new InsomniaImportService();
  const hoppscotchImportService = new HoppscotchImportService();
  const harImportService = new HarImportService();
  const thunderClientImportService = new ThunderClientImportService();
  const brunoImportService = new BrunoImportService();
  const postmanImportService = new PostmanImportService();
  const openApiImportService = new OpenApiImportService();
  const harExportService = new HarExportService();

  // Tauri dialog/fs for import/export
  import { save as saveDialog, open as openDialog } from '@tauri-apps/plugin-dialog';
  import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';

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

  // Persist UI state on changes (collections are persisted via Rust storage)
  $effect(() => {
    if (messageBus) {
      messageBus.setState({
        currentView,
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

    // Restore persisted UI state (collections come from Rust storage via loadData)
    const savedState = messageBus.getState<{
      currentView?: View;
      request?: SavedRequest;
    }>();

    if (savedState) {
      if (savedState.currentView) currentView = savedState.currentView;
    }

    // Restore tab state from localStorage
    loadTabsFromStorage();

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
        console.error('[Nouto]', message.message);
        break;

      case 'openSettings':
        openSettingsTab();
        break;

      case 'setVariables': {
        const vars = message.data as { key: string; value: string; scope: 'environment' | 'global' }[];
        const activeId = activeEnvironmentId();
        const envs = environmentsList();
        const activeEnv = activeId ? envs.find(e => e.id === activeId) : null;
        for (const v of vars) {
          if (v.scope === 'global') {
            const current = globalVariables();
            const idx = current.findIndex(g => g.key === v.key);
            if (idx >= 0) {
              const updated = [...current];
              updated[idx] = { ...updated[idx], value: v.value };
              updateGlobalVariables(updated);
            } else {
              updateGlobalVariables([...current, { key: v.key, value: v.value, enabled: true }]);
            }
          } else if (activeEnv) {
            const idx = activeEnv.variables.findIndex(e => e.key === v.key);
            if (idx >= 0) {
              const updated = [...activeEnv.variables];
              updated[idx] = { ...updated[idx], value: v.value };
              updateEnvironmentVariables(activeEnv.id, updated);
            } else {
              updateEnvironmentVariables(activeEnv.id, [...activeEnv.variables, { key: v.key, value: v.value, enabled: true }]);
            }
          }
        }
        break;
      }

      case 'collectionRequestSaved':
        setOriginalSnapshot($state.snapshot(requestStore));
        showNotification('info', 'Request saved.');
        break;

      case 'updateRequestIdentity': {
        requestId = message.data.requestId ?? null;
        collectionId = message.data.collectionId ?? null;
        collectionName = message.data.collectionName ?? null;
        // Sync with active tab
        const atId = activeTabIdFn();
        if (atId) {
          setTabRequestId(atId, requestId, collectionId, collectionName);
          if (message.data.requestName) updateTabLabel(atId, message.data.requestName);
        }
        break;
      }

      case 'requestLinkedToCollection': {
        collectionId = message.data.collectionId ?? null;
        collectionName = message.data.collectionName ?? null;
        const atId2 = activeTabIdFn();
        if (atId2) setTabRequestId(atId2, requestId, collectionId, collectionName);
        break;
      }

      case 'requestUnlinked': {
        collectionId = null;
        collectionName = null;
        const atId3 = activeTabIdFn();
        if (atId3) setTabRequestId(atId3, null, null, null);
        break;
      }

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

      // Collection Runner events: forward to window so CollectionRunnerPanel receives them
      case 'collectionRunProgress':
      case 'collectionRunRequestResult':
      case 'collectionRunComplete':
      case 'collectionRunCancelled':
        window.postMessage({ type: message.type, data: message.data }, '*');
        break;

      // Mock Server events: update store directly
      case 'mockStatusChanged':
        setMockStatus(message.data.status);
        break;
      case 'mockLogAdded':
        addMockLog(message.data);
        break;

      // Benchmark events: update store directly
      case 'benchmarkProgress':
        updateBenchmarkProgress(message.data.current, message.data.total);
        break;
      case 'benchmarkIterationComplete':
        addBenchmarkIteration(message.data);
        break;
      case 'benchmarkComplete':
        setBenchmarkCompleted(message.data);
        break;
      case 'benchmarkCancelled':
        setBenchmarkCancelled();
        break;
    }
    } catch (err) {
      console.error('[Nouto] Error handling message:', (message as any)?.type, err);
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
    setScriptInheritance(data.scriptInheritance);
    setScripts(data.scripts || { preRequest: '', postResponse: '' });
    setDescription(data.description || '');
    setPathParams(data.pathParams || []);
    setSsl(data.ssl);
    setProxy(data.proxy);
    setRequestTimeout(data.timeout);
    setRedirects(data.followRedirects, data.maxRedirects);
    setGrpc(data.grpc);

    const connMode = (data as any)._connectionMode || data.connectionMode;
    if (connMode) {
      setConnectionMode(connMode as ConnectionMode);
    }
  }

  function switchView(view: View) {
    currentView = view;
  }

  let newRequestDropdownOpen = $state(false);

  function handleNewRequest() {
    handleNewRequestKind('http');
  }

  function toggleNewRequestDropdown(e: MouseEvent) {
    e.stopPropagation();
    newRequestDropdownOpen = !newRequestDropdownOpen;
  }

  // Local QuickPick/InputBox/Confirm helpers that show the modal and return a promise
  let localQuickPickResolve: ((value: string | null) => void) | null = null;
  let localInputBoxResolve: ((value: string | null) => void) | null = null;
  let localConfirmResolve: ((value: boolean) => void) | null = null;

  function showLocalQuickPick(title: string, items: { label: string; value: string; description?: string; kind?: string; icon?: string; accent?: boolean }[]): Promise<string | null> {
    return new Promise((resolve) => {
      localQuickPickResolve = resolve;
      setPendingInput({ type: 'quickPick', requestId: '_local', data: { title, items, canPickMany: false } });
    });
  }

  function showLocalInputBox(prompt: string, placeholder?: string, value?: string): Promise<string | null> {
    return new Promise((resolve) => {
      localInputBoxResolve = resolve;
      setPendingInput({ type: 'inputBox', requestId: '_local', data: { prompt, placeholder, value, validateNotEmpty: true } });
    });
  }

  function showLocalConfirm(message: string, confirmLabel?: string, variant?: 'danger' | 'warning' | 'info'): Promise<boolean> {
    return new Promise((resolve) => {
      localConfirmResolve = resolve;
      setPendingInput({ type: 'confirm', requestId: '_local', data: { message, confirmLabel, variant } });
    });
  }

  function resolveLocalConfirm(confirmed: boolean) {
    if (localConfirmResolve) {
      localConfirmResolve(confirmed);
      localConfirmResolve = null;
    }
    clearPendingInput();
  }

  function resolveLocalQuickPick(value: string | string[] | null) {
    if (localQuickPickResolve) {
      localQuickPickResolve(typeof value === 'string' ? value : null);
      localQuickPickResolve = null;
    }
    clearPendingInput();
  }

  function resolveLocalInputBox(value: string | null) {
    if (localInputBoxResolve) {
      localInputBoxResolve(value);
      localInputBoxResolve = null;
    }
    clearPendingInput();
  }

  function countAllItems(items: (SavedRequest | Folder)[]): number {
    let count = 0;
    for (const item of items) {
      if (isFolder(item)) {
        count += countAllItems(item.children);
      } else {
        count++;
      }
    }
    return count;
  }

  function buildCollectionPickerItems(cols: Collection[]): { label: string; value: string; description?: string; kind?: string; icon?: string; accent?: boolean }[] {
    const items: { label: string; value: string; description?: string; kind?: string; icon?: string; accent?: boolean }[] = [
      { label: 'Quick Start', value: '_sep_quick', kind: 'separator' },
      { label: 'No Collection (Quick Request)', value: 'no-collection', description: 'Saved to Drafts and History after sending' },
      { label: 'Collections', value: '_sep_collections', kind: 'separator' },
      { label: 'Create New Collection...', value: 'new-collection', icon: 'codicon-new-folder', accent: true },
      { label: '', value: '_sep_existing', kind: 'separator' },
    ];
    for (const col of cols) {
      const itemCount = countAllItems(col.items);
      items.push({
        label: col.name,
        value: `collection:${col.id}`,
        description: `${itemCount} item${itemCount !== 1 ? 's' : ''}`,
      });
    }
    return items;
  }

  function loadNewRequestIntoForm(defaults: ReturnType<typeof getDefaultsForRequestKind>, savedReq: SavedRequest | null, targetColId: string | null, targetColName: string | null) {
    clearResponse();
    clearAssertionResults();
    clearScriptOutput();
    setMethod(savedReq?.method ?? defaults.method);
    setUrlAndParams(savedReq?.url ?? defaults.url, []);
    setHeaders([]);
    setAuth({ type: 'none' });
    setBody(savedReq?.body ?? defaults.body ?? { type: 'none', content: '' });
    setAssertions([]);
    setAuthInheritance(undefined);
    setScripts({ preRequest: '', postResponse: '' });
    setDescription('');
    setConnectionMode(defaults.connectionMode);
    collectionId = targetColId;
    collectionName = targetColName;
    requestId = savedReq?.id ?? null;
    showSaveNudge = false;
    nudgeDismissed = false;

    // Open as a new tab
    const tab = createRequestTab(
      savedReq?.name ?? defaults.name,
      savedReq?.id ?? null,
      targetColId,
      targetColName,
    );
    tab.icon = savedReq?.method ?? defaults.method;
    tab.connectionMode = defaults.connectionMode;

    if (savedReq?.id && targetColId) {
      setOriginalSnapshot($state.snapshot(requestStore));
      setRequestContext({ panelId: 'desktop-main', requestId: savedReq.id, collectionId: targetColId, collectionName: targetColName || '' });
    }

    openTab(tab, saveCurrentSnapshot());
    currentView = 'main';
  }

  async function handleNewRequestKind(kind: string) {
    newRequestDropdownOpen = false;
    const defaults = getDefaultsForRequestKind(kind as RequestKind);

    // Show collection picker
    const pickerItems = buildCollectionPickerItems(collections);
    const selectedValue = await showLocalQuickPick('New Request', pickerItems);
    if (!selectedValue) return;

    if (selectedValue === 'no-collection') {
      // Open as unsaved draft
      loadNewRequestIntoForm(defaults, null, null, null);
      return;
    }

    if (selectedValue === 'new-collection') {
      const name = await showLocalInputBox('Collection name', 'My Collection');
      if (!name) return;

      const created = addCollection(name);
      if (!created) return;
      collections = collectionsStore();

      const savedRequest = addRequestToCollection(created.id, {
        name: defaults.name,
        method: defaults.method,
        url: defaults.url,
        params: [],
        headers: [],
        auth: { type: 'none' },
        body: defaults.body,
        connectionMode: defaults.connectionMode,
        grpc: defaults.grpc,
      });
      collections = collectionsStore();
      loadNewRequestIntoForm(defaults, savedRequest, created.id, created.name);
      return;
    }

    // Selected an existing collection
    const colId = selectedValue.replace('collection:', '');
    const targetCollection = collections.find(c => c.id === colId);
    if (!targetCollection) return;

    const savedRequest = addRequestToCollection(targetCollection.id, {
      name: defaults.name,
      method: defaults.method,
      url: defaults.url,
      params: [],
      headers: [],
      auth: { type: 'none' },
      body: defaults.body,
      connectionMode: defaults.connectionMode,
      grpc: defaults.grpc,
    });
    collections = collectionsStore();
    loadNewRequestIntoForm(defaults, savedRequest, targetCollection.id, targetCollection.name);
  }

  // Sync local collections state from store
  function syncCollections() {
    collections = collectionsStore();
  }

  // Deep-clone items with new IDs for duplication
  function duplicateItemsRecursive(items: CollectionItem[]): CollectionItem[] {
    const now = new Date().toISOString();
    return items.map(item => {
      if (isFolder(item)) {
        return {
          ...item,
          id: generateId(),
          children: duplicateItemsRecursive(item.children),
          createdAt: now,
          updatedAt: now,
        };
      }
      return {
        ...item,
        id: generateId(),
        createdAt: now,
        updatedAt: now,
      };
    });
  }

  // Build QuickPick items for move target picker (collections + nested folders)
  function buildMoveTargetItems(excludeIds: Set<string>): { label: string; value: string; description?: string; kind?: string }[] {
    const items: { label: string; value: string; description?: string; kind?: string }[] = [];
    const cols = collectionsStore();

    for (const col of cols) {
      if (col.builtin) continue;
      items.push({
        label: col.name,
        value: `collection:${col.id}`,
        description: `${countAllItems(col.items)} items`,
      });
      // Add nested folders (indented)
      addFolderTargets(col.items, items, excludeIds, 1);
    }
    return items;
  }

  function addFolderTargets(
    items: CollectionItem[],
    result: { label: string; value: string; description?: string }[],
    excludeIds: Set<string>,
    depth: number
  ) {
    for (const item of items) {
      if (isFolder(item) && !excludeIds.has(item.id)) {
        const indent = '\u00A0\u00A0'.repeat(depth);
        result.push({
          label: `${indent}${item.name}`,
          value: `folder:${item.id}`,
        });
        addFolderTargets(item.children, result, excludeIds, depth + 1);
      }
    }
  }

  // --- CRUD message handlers ---

  async function handleDeleteCollection(id: string) {
    const col = collections.find(c => c.id === id);
    if (!col) return;
    if (isDraftsCollection(col)) {
      showNotification('warning', 'Cannot delete the Drafts collection. Use "Clear All" instead.');
      return;
    }
    storeDeleteCollection(id);
    syncCollections();
  }

  function handleDeleteRequest(requestId: string) {
    storeDeleteRequest(requestId);
    syncCollections();
  }

  function handleDeleteFolder(folderId: string) {
    storeDeleteFolder(folderId);
    syncCollections();
  }

  function handleDuplicateCollection(id: string) {
    const col = collections.find(c => c.id === id);
    if (!col) return;
    const now = new Date().toISOString();
    const newCol: Collection = {
      ...col,
      id: generateId(),
      name: `${col.name} (copy)`,
      items: duplicateItemsRecursive(col.items),
      variables: col.variables ? [...col.variables] : undefined,
      headers: col.headers ? [...col.headers] : undefined,
      createdAt: now,
      updatedAt: now,
      builtin: undefined,
    };
    setCollections([...collectionsStore(), newCol]);
    syncCollections();
    messageBus.send({ type: 'saveCollections', data: $state.snapshot(collectionsStore()) } as any);
  }

  function handleDuplicateFolder(folderId: string, collectionId: string) {
    const col = collections.find(c => c.id === collectionId);
    if (!col) return;
    const folder = findItemRecursive(col.items, folderId);
    if (!folder || !isFolder(folder)) return;

    const now = new Date().toISOString();
    const duplicate: Folder = {
      ...folder,
      id: generateId(),
      name: `${folder.name} (copy)`,
      children: duplicateItemsRecursive(folder.children),
      createdAt: now,
      updatedAt: now,
    };

    // Add to collection root
    col.items.push(duplicate);
    col.updatedAt = now;
    syncCollections();
    // Trigger persistence
    messageBus.send({ type: 'saveCollections', data: $state.snapshot(collectionsStore()) } as any);
  }

  async function handleBulkDelete(itemIds: string[], collectionId: string) {
    for (const id of itemIds) {
      const found = findItemById(id);
      if (found) {
        if (isFolder(found.item)) {
          storeDeleteFolder(id);
        } else {
          storeDeleteRequest(id);
        }
      }
    }
    syncCollections();
  }

  async function handleBulkMovePickTarget(itemIds: string[], sourceCollectionId: string) {
    const excludeIds = new Set(itemIds);
    const targets = buildMoveTargetItems(excludeIds);
    if (targets.length === 0) {
      showNotification('info', 'No valid move targets available.');
      return;
    }

    const selected = await showLocalQuickPick('Move to...', targets);
    if (!selected) return;

    let targetCollectionId: string;
    let targetFolderId: string | undefined;

    if (selected.startsWith('collection:')) {
      targetCollectionId = selected.replace('collection:', '');
    } else if (selected.startsWith('folder:')) {
      targetFolderId = selected.replace('folder:', '');
      const folderCol = findCollectionForItem(targetFolderId);
      if (!folderCol) return;
      targetCollectionId = folderCol.id;
    } else {
      return;
    }

    for (const id of itemIds) {
      moveItem(id, targetCollectionId, targetFolderId);
    }
    syncCollections();
  }

  function handleCreateRequest(data: { collectionId: string; parentFolderId?: string; openInPanel?: boolean; requestKind?: string }) {
    const defaults = getDefaultsForRequestKind((data.requestKind || 'http') as RequestKind);
    const savedRequest = addRequestToCollection(data.collectionId, {
      name: defaults.name,
      method: defaults.method,
      url: defaults.url,
      params: [],
      headers: [],
      auth: { type: 'none' },
      body: defaults.body,
      connectionMode: defaults.connectionMode,
      grpc: defaults.grpc,
    }, data.parentFolderId);
    syncCollections();

    if (data.openInPanel) {
      loadNewRequestIntoForm(defaults, savedRequest, data.collectionId, collections.find(c => c.id === data.collectionId)?.name || null);
    }
  }

  function handleOpenCollectionRequest(data: { requestId: string; collectionId: string }) {
    const col = collections.find(c => c.id === data.collectionId);
    if (!col) return;
    const item = findItemRecursive(col.items, data.requestId);
    if (!item || !isRequest(item)) return;

    // Check if a tab already exists for this request
    const existingTab = findTabByRequestId(data.requestId);
    if (existingTab) {
      switchTabFn(existingTab.id);
      currentView = 'main';
      return;
    }

    // Open a new tab
    const tab = createRequestTab(item.name, data.requestId, data.collectionId, col.name);
    tab.icon = item.method || 'GET';
    tab.connectionMode = (item as any).connectionMode || 'http';

    // Load request into stores first
    collectionId = data.collectionId;
    collectionName = col.name;
    requestId = data.requestId;
    if (!panelId) panelId = 'desktop-main';
    loadRequest(item);
    setOriginalSnapshot($state.snapshot(requestStore));
    setRequestContext({ panelId, requestId: data.requestId, collectionId: data.collectionId, collectionName: col.name });

    // Open the tab (snapshot will be taken from current store state)
    openTab(tab, saveCurrentSnapshot());
    currentView = 'main';
  }

  function handleRunCollectionRequest(data: { requestId: string; collectionId: string }) {
    // Load the request into the form (user can then click Send)
    handleOpenCollectionRequest(data);
  }

  async function handleClearDrafts() {
    const confirmed = await showLocalConfirm(
      'Clear all draft requests? This cannot be undone.',
      'Clear',
      'danger'
    );
    if (!confirmed) return;

    const cols = collectionsStore();
    const drafts = cols.find(c => c.builtin === 'drafts');
    if (drafts) {
      drafts.items = [];
      drafts.updatedAt = new Date().toISOString();
      syncCollections();
      messageBus.send({ type: 'saveCollections', data: $state.snapshot(collectionsStore()) } as any);
    }
  }

  async function handleRenameCollection(id: string, currentName?: string) {
    const col = collections.find(c => c.id === id);
    if (!col) return;
    const newName = await showLocalInputBox('Rename collection', 'Collection name', currentName || col.name);
    if (!newName || newName === col.name) return;
    storeRenameCollection(id, newName);
    syncCollections();
    messageBus.send({ type: 'saveCollections', data: $state.snapshot(collectionsStore()) } as any);
  }

  async function handleRenameFolder(folderId: string, currentName?: string) {
    const newName = await showLocalInputBox('Rename folder', 'Folder name', currentName || '');
    if (!newName) return;
    storeRenameFolder(folderId, newName);
    syncCollections();
    messageBus.send({ type: 'saveCollections', data: $state.snapshot(collectionsStore()) } as any);
  }

  async function handleCreateFolder(data: { collectionId: string; parentFolderId?: string }) {
    const name = await showLocalInputBox('Folder name', 'New Folder');
    if (!name) return;
    addFolder(data.collectionId, name, data.parentFolderId);
    syncCollections();
  }

  // --- Collection/Folder Settings ---

  function handleOpenCollectionSettings(collectionId: string) {
    const col = collections.find(c => c.id === collectionId);
    if (!col) {
      showNotification('error', 'Collection not found.');
      return;
    }

    initSettings({
      entityType: 'collection',
      entityName: col.name,
      collectionId: col.id,
      initialAuth: col.auth,
      initialHeaders: col.headers as any,
      initialVariables: col.variables as any,
      initialScripts: col.scripts as any,
      initialAssertions: col.assertions as any,
      initialNotes: col.description,
    });

    // Open or switch to collection-settings tab
    const tabId = `collection-settings-${collectionId}`;
    const existing = tabsList().find(t => t.id === tabId);
    if (existing) {
      switchTabFn(tabId);
    } else {
      openTab({
        id: tabId,
        type: 'collection-settings',
        label: `${col.name} Settings`,
        icon: 'codicon-gear',
        closable: true,
        dirty: false,
        collectionId,
        collectionName: col.name,
      });
    }
  }

  function handleOpenFolderSettings(collectionId: string, folderId: string) {
    const col = collections.find(c => c.id === collectionId);
    if (!col) {
      showNotification('error', 'Collection not found.');
      return;
    }
    const folder = findItemRecursive(col.items, folderId);
    if (!folder || !isFolder(folder)) {
      showNotification('error', 'Folder not found.');
      return;
    }

    initSettings({
      entityType: 'folder',
      entityName: folder.name,
      collectionId,
      folderId,
      initialAuth: folder.auth,
      initialHeaders: folder.headers as any,
      initialVariables: folder.variables as any,
      initialScripts: folder.scripts as any,
      initialAssertions: folder.assertions as any,
      initialNotes: folder.description,
    });

    const tabId = `folder-settings-${folderId}`;
    const existing = tabsList().find(t => t.id === tabId);
    if (existing) {
      switchTabFn(tabId);
    } else {
      openTab({
        id: tabId,
        type: 'collection-settings',
        label: `${folder.name} Settings`,
        icon: 'codicon-gear',
        closable: true,
        dirty: false,
        collectionId,
        collectionName: col.name,
      });
    }
  }

  function handleSaveCollectionSettings(data: any) {
    const col = collections.find(c => c.id === data.collectionId);
    if (!col) return;

    if (data.folderId) {
      // Update folder
      const folder = findItemRecursive(col.items, data.folderId);
      if (folder && isFolder(folder)) {
        if (data.auth !== undefined) (folder as any).auth = data.auth;
        if (data.headers !== undefined) (folder as any).headers = data.headers;
        if (data.variables !== undefined) (folder as any).variables = data.variables;
        if (data.scripts !== undefined) (folder as any).scripts = data.scripts;
        if (data.assertions !== undefined) (folder as any).assertions = data.assertions;
        if (data.notes !== undefined) (folder as any).description = data.notes;
      }
    } else {
      // Update collection
      if (data.auth !== undefined) col.auth = data.auth;
      if (data.headers !== undefined) col.headers = data.headers;
      if (data.variables !== undefined) col.variables = data.variables;
      if (data.scripts !== undefined) (col as any).scripts = data.scripts;
      if (data.assertions !== undefined) (col as any).assertions = data.assertions;
      if (data.notes !== undefined) col.description = data.notes;
    }

    syncCollections();
    messageBus.send({ type: 'saveCollections', data: $state.snapshot(collectionsStore()) } as any);
    notifySettingsSaved();
    showNotification('info', 'Settings saved.');
  }

  // --- Export / Import handlers ---

  async function handleExportNative(itemId?: string) {
    const cols = $state.snapshot(collectionsStore()) as Collection[];
    let exportData: any;
    let defaultName: string;

    if (itemId) {
      const col = cols.find(c => c.id === itemId);
      if (!col) {
        showNotification('error', 'Collection not found.');
        return;
      }
      exportData = {
        _format: 'nouto',
        _version: '1.0',
        _exportedAt: new Date().toISOString(),
        collection: col,
      };
      defaultName = `${col.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
    } else {
      // Export first collection by default
      if (cols.length === 0) {
        showNotification('info', 'No collections to export.');
        return;
      }
      exportData = {
        _format: 'nouto',
        _version: '1.0',
        _exportedAt: new Date().toISOString(),
        collection: cols[0],
      };
      defaultName = `${cols[0].name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
    }

    try {
      const filePath = await saveDialog({
        defaultPath: defaultName,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!filePath) return;
      await writeTextFile(filePath, JSON.stringify(exportData, null, 2));
      showNotification('info', 'Collection exported successfully.');
    } catch (e: any) {
      showNotification('error', `Export failed: ${e.message || e}`);
    }
  }

  async function handleExportAllNative() {
    const cols = $state.snapshot(collectionsStore()) as Collection[];
    if (cols.length === 0) {
      showNotification('info', 'No collections to export.');
      return;
    }

    const exportData = {
      _format: 'nouto',
      _version: '1.0',
      _exportedAt: new Date().toISOString(),
      collections: cols,
    };

    try {
      const filePath = await saveDialog({
        defaultPath: 'nouto-collections.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!filePath) return;
      await writeTextFile(filePath, JSON.stringify(exportData, null, 2));
      showNotification('info', `Exported ${cols.length} collection(s) successfully.`);
    } catch (e: any) {
      showNotification('error', `Export failed: ${e.message || e}`);
    }
  }

  async function handleExportPostman(collectionIds?: string[]) {
    const cols = $state.snapshot(collectionsStore()) as Collection[];
    const toExport = collectionIds
      ? cols.filter(c => collectionIds.includes(c.id))
      : cols;

    if (toExport.length === 0) {
      showNotification('info', 'No collections to export.');
      return;
    }

    try {
      for (const col of toExport) {
        const postman = convertToPostmanCollection(col);
        const defaultName = `${col.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.postman_collection.json`;
        const filePath = await saveDialog({
          defaultPath: defaultName,
          filters: [{ name: 'Postman Collection', extensions: ['json'] }],
        });
        if (!filePath) continue;
        await writeTextFile(filePath, JSON.stringify(postman, null, 2));
      }
      showNotification('info', `Exported ${toExport.length} collection(s) in Postman v2.1 format.`);
    } catch (e: any) {
      showNotification('error', `Export failed: ${e.message || e}`);
    }
  }

  function convertToPostmanCollection(col: Collection): any {
    const result: any = {
      info: {
        name: col.name,
        _postman_id: col.id,
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      },
      item: convertItemsToPostman(col.items),
    };
    if (col.auth && col.auth.type !== 'none') {
      result.auth = convertAuthToPostman(col.auth);
    }
    if (col.headers?.length) {
      result.header = (col.headers as any[]).map((h: any) => ({ key: h.key, value: h.value, disabled: !h.enabled }));
    }
    if (col.variables?.length) {
      result.variable = (col.variables as any[]).map((v: any) => ({ key: v.key, value: v.value, disabled: !v.enabled }));
    }
    return result;
  }

  function convertItemsToPostman(items: CollectionItem[]): any[] {
    return items.map(item => {
      if (isFolder(item)) {
        const folder: any = { name: item.name, id: item.id, item: convertItemsToPostman(item.children) };
        if (item.auth && item.auth.type !== 'none') folder.auth = convertAuthToPostman(item.auth);
        return folder;
      }
      const req = item as SavedRequest;
      const enabledParams = (req.params || []).filter((p: any) => p.enabled);
      const qs = enabledParams.length > 0
        ? '?' + enabledParams.map((p: any) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&')
        : '';
      return {
        name: req.name,
        id: req.id,
        request: {
          method: req.method,
          url: { raw: req.url + qs, query: (req.params || []).map((p: any) => ({ key: p.key, value: p.value, disabled: !p.enabled })) },
          header: (req.headers || []).map((h: any) => ({ key: h.key, value: h.value, disabled: !h.enabled })),
          auth: convertAuthToPostman(req.auth),
          body: convertBodyToPostman(req.body),
          description: req.description,
        },
      };
    });
  }

  function convertAuthToPostman(auth: any): any {
    if (!auth) return { type: 'noauth' };
    switch (auth.type) {
      case 'basic': return { type: 'basic', basic: [{ key: 'username', value: auth.username || '' }, { key: 'password', value: auth.password || '' }] };
      case 'bearer': return { type: 'bearer', bearer: [{ key: 'token', value: auth.token || '' }] };
      case 'apikey': return { type: 'apikey', apikey: [{ key: 'key', value: auth.apiKeyName || '' }, { key: 'value', value: auth.apiKeyValue || '' }, { key: 'in', value: auth.apiKeyIn || 'header' }] };
      default: return { type: 'noauth' };
    }
  }

  function convertBodyToPostman(body: any): any {
    if (!body) return { mode: 'none' };
    switch (body.type) {
      case 'json': return { mode: 'raw', raw: body.content, options: { raw: { language: 'json' } } };
      case 'text': return { mode: 'raw', raw: body.content, options: { raw: { language: 'text' } } };
      case 'xml': return { mode: 'raw', raw: body.content, options: { raw: { language: 'xml' } } };
      case 'x-www-form-urlencoded': return { mode: 'urlencoded', urlencoded: (body.formItems || []).map((p: any) => ({ key: p.key, value: p.value, disabled: !p.enabled })) };
      case 'form-data': return { mode: 'formdata', formdata: (body.formItems || []).map((p: any) => ({ key: p.key, value: p.value, disabled: !p.enabled, type: p.type || 'text' })) };
      case 'graphql': return { mode: 'graphql', graphql: { query: body.content, variables: body.graphqlVariables || '' } };
      default: return { mode: 'none' };
    }
  }

  function regenerateIds(collection: any): Collection {
    const now = new Date().toISOString();
    function regenItems(items: any[]): any[] {
      return items.map(item => {
        if (item.type === 'folder' && item.children) {
          return { ...item, id: generateId(), children: regenItems(item.children) };
        }
        return { ...item, id: generateId() };
      });
    }
    return {
      ...collection,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
      items: regenItems(collection.items || []),
    };
  }

  async function handleImportAuto() {
    try {
      const selected = await openDialog({
        multiple: false,
        filters: [{ name: 'Collections', extensions: ['json', 'yaml', 'yml', 'bru'] }],
        title: 'Import Collection',
      });
      if (!selected) return;

      const filePath = selected as string;
      const content = await readTextFile(filePath);
      const isYaml = filePath.endsWith('.yaml') || filePath.endsWith('.yml');
      const isBru = filePath.endsWith('.bru');

      // Handle .bru files directly
      if (isBru) {
        try {
          const fileName = filePath.split(/[/\\]/).pop()?.replace('.bru', '') || 'Bruno Request';
          const result = brunoImportService.importFromString(content, fileName);
          addCollection(result.collection);
          syncCollections();
          messageBus.send({ type: 'saveCollections', data: $state.snapshot(collectionsStore()) } as any);
          showNotification('info', `Imported Bruno collection: ${result.collection.name}`);
          return;
        } catch (e: any) {
          showNotification('error', `Failed to parse Bruno file: ${e.message || e}`);
          return;
        }
      }

      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch {
        if (isYaml) {
          // YAML file, could be OpenAPI or Insomnia
          try {
            const result = openApiImportService.importFromString(content, true);
            addCollection(result.collection);
            syncCollections();
            messageBus.send({ type: 'saveCollections', data: $state.snapshot(collectionsStore()) } as any);
            showNotification('info', `Imported OpenAPI collection: ${result.collection.name}`);
            if (result.variables) {
              showNotification('info', `Found ${result.variables.variables.length} variables. Add them manually to an environment.`);
            }
            return;
          } catch {
            // Not OpenAPI YAML, try Insomnia YAML
            try {
              const result = insomniaImportService.importFromString(content);
              if (result.collections.length > 0) {
                for (const col of result.collections) addCollection(col);
                syncCollections();
                messageBus.send({ type: 'saveCollections', data: $state.snapshot(collectionsStore()) } as any);
                const names = result.collections.map(c => c.name).join(', ');
                showNotification('info', `Imported ${result.collections.length} Insomnia collection(s): ${names}`);
                return;
              }
            } catch {}
          }
          showNotification('error', 'Failed to parse YAML file as OpenAPI or Insomnia format.');
          return;
        }
        showNotification('error', 'Failed to parse file. Ensure it is valid JSON or YAML.');
        return;
      }

      let importedCollections: Collection[] = [];
      let formatName = 'Unknown';

      // Auto-detect format from parsed JSON
      if (parsed._format === 'nouto') {
        if (Array.isArray(parsed.collections)) {
          importedCollections = parsed.collections.map((c: any) => regenerateIds(c));
        } else if (parsed.collection) {
          importedCollections = [regenerateIds(parsed.collection)];
        }
        formatName = 'Nouto';
      } else if (parsed.info?.schema?.includes('getpostman.com')) {
        const result = postmanImportService.importFromString(content);
        importedCollections = [result.collection];
        formatName = 'Postman';
      } else if (parsed.openapi && parsed.paths) {
        const result = openApiImportService.importFromString(content, false);
        importedCollections = [result.collection];
        formatName = 'OpenAPI';
        if (result.variables) {
          showNotification('info', `Found ${result.variables.variables.length} server/path variables.`);
        }
      } else if (parsed._type === 'export' && parsed.resources) {
        const result = insomniaImportService.importFromString(content);
        importedCollections = result.collections;
        formatName = 'Insomnia';
      } else if ((parsed.v !== undefined && (parsed.folders || parsed.requests)) ||
                 (Array.isArray(parsed) && parsed[0]?.folders !== undefined)) {
        const result = hoppscotchImportService.importFromString(content);
        importedCollections = result.collections;
        formatName = 'Hoppscotch';
      } else if (parsed.log && (parsed.log.entries || parsed.log.version)) {
        const result = harImportService.importFromString(content);
        importedCollections = [result.collection];
        formatName = 'HAR';
      } else if (parsed.client === 'Thunder Client' || parsed.colName || parsed._id ||
                 (Array.isArray(parsed) && parsed[0]?.colName)) {
        const result = thunderClientImportService.importFromString(content);
        importedCollections = result.collections;
        formatName = 'Thunder Client';
      } else if (parsed.values && Array.isArray(parsed.values) && !parsed.item) {
        showNotification('info', 'This looks like a Postman Environment file, not a collection.');
        return;
      } else {
        showNotification('error', 'Could not detect collection format. Supported: Nouto, Postman, OpenAPI, Insomnia, Hoppscotch, HAR, Thunder Client, Bruno.');
        return;
      }

      if (importedCollections.length === 0) {
        showNotification('error', 'No collections found in file.');
        return;
      }

      for (const col of importedCollections) {
        addCollection(col);
      }
      syncCollections();
      messageBus.send({ type: 'saveCollections', data: $state.snapshot(collectionsStore()) } as any);

      const names = importedCollections.map(c => c.name).join(', ');
      showNotification('info', `Imported ${importedCollections.length} ${formatName} collection(s): ${names}`);
    } catch (e: any) {
      showNotification('error', `Import failed: ${e.message || e}`);
    }
  }

  async function handleImportCurl() {
    const curlStr = await showLocalInputBox('Import cURL', 'Paste a cURL command');
    if (!curlStr || !curlStr.trim()) return;

    try {
      if (!isCurlCommand(curlStr)) {
        showNotification('error', 'Input does not appear to be a valid cURL command.');
        return;
      }
      const parsed = parseCurl(curlStr);
      // Apply parsed cURL data to the current request
      setMethod(parsed.method as any);
      setUrl(parsed.url);
      if (parsed.headers?.length) setHeaders(parsed.headers);
      if (parsed.params?.length) setParams(parsed.params);
      if (parsed.body) setBody(parsed.body);
      if (parsed.auth) setAuth(parsed.auth);
      showNotification('info', 'cURL command imported successfully.');
    } catch (e: any) {
      showNotification('error', `Failed to parse cURL: ${e.message || e}`);
    }
  }

  async function handleImportFromUrl() {
    const url = await showLocalInputBox('Import from URL', 'Enter a URL to a collection file');
    if (!url || !url.trim()) return;

    showNotification('info', 'Fetching collection from URL...');

    // Use the Rust HTTP client to fetch the URL content
    const responseHandler = (msg: IncomingMessage) => {
      if (msg.type === 'requestResponse') {
        const resp = (msg as any).data;
        if (resp && resp.data) {
          const bodyStr = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
          try {
            const parsed = JSON.parse(bodyStr);
            let importedCollections: Collection[] = [];

            if (parsed._format === 'nouto') {
              if (Array.isArray(parsed.collections)) {
                importedCollections = parsed.collections.map((c: any) => regenerateIds(c));
              } else if (parsed.collection) {
                importedCollections = [regenerateIds(parsed.collection)];
              }
            } else if (parsed.info?.schema?.includes('getpostman.com')) {
              const result = postmanImportService.importFromString(bodyStr);
              importedCollections = [result.collection];
            } else if (parsed.openapi && parsed.paths) {
              const result = openApiImportService.importFromString(bodyStr, false);
              importedCollections = [result.collection];
            } else if (parsed._type === 'export' && parsed.resources) {
              const result = insomniaImportService.importFromString(bodyStr);
              importedCollections = result.collections;
            } else if ((parsed.v !== undefined && (parsed.folders || parsed.requests)) ||
                       (Array.isArray(parsed) && parsed[0]?.folders !== undefined)) {
              const result = hoppscotchImportService.importFromString(bodyStr);
              importedCollections = result.collections;
            } else if (parsed.log && (parsed.log.entries || parsed.log.version)) {
              const result = harImportService.importFromString(bodyStr);
              importedCollections = [result.collection];
            } else if (parsed.client === 'Thunder Client' || parsed.colName || parsed._id ||
                       (Array.isArray(parsed) && parsed[0]?.colName)) {
              const result = thunderClientImportService.importFromString(bodyStr);
              importedCollections = result.collections;
            } else {
              showNotification('error', 'Could not detect collection format from URL.');
              return;
            }

            for (const col of importedCollections) {
              addCollection(col);
            }
            syncCollections();
            messageBus.send({ type: 'saveCollections', data: $state.snapshot(collectionsStore()) } as any);
            showNotification('info', `Imported ${importedCollections.length} collection(s) from URL.`);
          } catch {
            showNotification('error', 'Failed to parse response as a collection file.');
          }
        }
      }
    };

    // Temporarily listen for the response
    const unsub = messageBus.onMessage(responseHandler);
    messageBus.send({
      type: 'sendRequest',
      data: {
        method: 'GET',
        url,
        headers: [],
        params: [],
        body: { type: 'none', content: '' },
        timeout: 30000,
      },
    } as any);

    // Clean up listener after a timeout
    setTimeout(() => unsub(), 60000);
  }

  // --- History Export ---

  function csvEscape(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  async function handleExportHistory() {
    try {
      const format = await showLocalQuickPick('Export History', [
        { label: 'JSON', value: 'json' },
        { label: 'CSV', value: 'csv' },
      ]);
      if (!format) return;

      // Get history from Rust backend
      const entries = await new Promise<any[]>((resolve) => {
        const unsub = messageBus.onMessage((msg: IncomingMessage) => {
          if (msg.type === 'historyLoaded') {
            unsub();
            resolve((msg as any).data?.data || []);
          }
        });
        messageBus.send({ type: 'getHistory' } as any);
        setTimeout(() => { unsub(); resolve([]); }, 5000);
      });

      if (entries.length === 0) {
        showNotification('info', 'No history entries to export.');
        return;
      }

      let content: string;
      let defaultName: string;
      let filterName: string;

      if (format === 'csv') {
        const header = 'timestamp,method,url,status,duration,size,requestName';
        const rows = entries.map((e: any) => {
          const fields = [
            e.timestamp || '',
            e.method || '',
            csvEscape(e.url || ''),
            e.responseStatus ?? '',
            e.responseDuration ?? '',
            e.responseSize ?? '',
            csvEscape(e.requestName || ''),
          ];
          return fields.join(',');
        });
        content = [header, ...rows].join('\n');
        defaultName = 'nouto-history.csv';
        filterName = 'CSV';
      } else {
        content = JSON.stringify({ _format: 'nouto-history', _version: 1, entries }, null, 2);
        defaultName = 'nouto-history.json';
        filterName = 'JSON';
      }

      const filePath = await saveDialog({
        defaultPath: defaultName,
        filters: [{ name: filterName, extensions: [format === 'csv' ? 'csv' : 'json'] }],
      });
      if (!filePath) return;
      await writeTextFile(filePath, content);
      showNotification('info', `Exported ${entries.length} history entries as ${filterName}.`);
    } catch (e: any) {
      showNotification('error', `History export failed: ${e.message || e}`);
    }
  }

  // --- History Import ---

  async function handleImportHistory() {
    try {
      const selected = await openDialog({
        multiple: false,
        filters: [{ name: 'Nouto History', extensions: ['json'] }],
        title: 'Import History',
      });
      if (!selected) return;

      const content = await readTextFile(selected as string);
      let data: any;
      try {
        data = JSON.parse(content);
      } catch {
        showNotification('error', 'Invalid JSON file.');
        return;
      }

      if (data._format !== 'nouto-history') {
        showNotification('error', 'Not a Nouto history export file.');
        return;
      }

      if (!Array.isArray(data.entries) || data.entries.length === 0) {
        showNotification('info', 'No history entries found in file.');
        return;
      }

      // Get existing history to deduplicate
      const existingEntries = await new Promise<any[]>((resolve) => {
        const unsub = messageBus.onMessage((msg: IncomingMessage) => {
          if (msg.type === 'historyLoaded') {
            unsub();
            resolve((msg as any).data?.data || []);
          }
        });
        messageBus.send({ type: 'getHistory' } as any);
        setTimeout(() => { unsub(); resolve([]); }, 5000);
      });

      const existingIds = new Set(existingEntries.map((e: any) => e.id));
      const newEntries = data.entries.filter((e: any) =>
        e.id && e.timestamp && e.method && e.url && !existingIds.has(e.id)
      );

      if (newEntries.length === 0) {
        showNotification('info', 'All entries already exist in history (deduplicated).');
        return;
      }

      // Append each new entry via Rust backend
      for (const entry of newEntries) {
        messageBus.send({ type: 'appendHistoryEntry', data: entry } as any);
      }

      // Refresh history
      messageBus.send({ type: 'getHistory' } as any);
      showNotification('info', `Imported ${newEntries.length} history entries (${data.entries.length - newEntries.length} duplicates skipped).`);
    } catch (e: any) {
      showNotification('error', `History import failed: ${e.message || e}`);
    }
  }

  // --- Postman Environment Import ---

  async function handleImportPostmanEnvironment() {
    try {
      const selected = await openDialog({
        multiple: true,
        filters: [{ name: 'Postman Environment / Globals', extensions: ['json'] }],
        title: 'Import Postman Environment or Globals',
      });
      if (!selected) return;

      const files = Array.isArray(selected) ? selected : [selected];
      let importedCount = 0;

      for (const filePath of files) {
        const content = await readTextFile(filePath as string);
        let parsed: any;
        try {
          parsed = JSON.parse(content);
        } catch {
          showNotification('error', `Failed to parse ${filePath} as JSON.`);
          continue;
        }

        if (!parsed.values || !Array.isArray(parsed.values)) {
          showNotification('error', 'Skipped: not a valid Postman environment or globals file.');
          continue;
        }

        // Extract filename for fallback name
        const pathStr = filePath as string;
        const fileName = pathStr.split(/[/\\]/).pop() || 'Imported';
        const fallbackName = fileName
          .replace('.json', '')
          .replace('.postman_environment', '')
          .replace('.postman_globals', '');

        const envName = parsed.name || fallbackName;
        const variables = parsed.values.map((v: any) => ({
          key: v.key || '',
          value: v.value || '',
          enabled: v.enabled !== false,
        }));

        // Create the environment and then populate its variables
        const env = addEnvironment(envName);
        updateEnvironmentVariables(env.id, variables);
        importedCount++;
      }

      if (importedCount > 0) {
        showNotification('info', `Imported ${importedCount} environment(s) successfully.`);
      }
    } catch (e: any) {
      showNotification('error', `Environment import failed: ${e.message || e}`);
    }
  }

  // --- HAR Export ---

  async function handleExportHar(collectionId?: string) {
    const cols = $state.snapshot(collectionsStore()) as Collection[];

    let collection: Collection | undefined;
    if (collectionId) {
      collection = cols.find(c => c.id === collectionId);
    } else {
      // Let user pick a collection
      const items = cols.map(c => ({ label: c.name, value: c.id }));
      if (items.length === 0) {
        showNotification('info', 'No collections to export.');
        return;
      }
      const picked = await showLocalQuickPick('Export as HAR', items);
      if (!picked) return;
      collection = cols.find(c => c.id === picked);
    }

    if (!collection) {
      showNotification('error', 'Collection not found.');
      return;
    }

    try {
      const harContent = harExportService.exportCollectionItems(collection.items);
      const defaultName = `${collection.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.har`;
      const filePath = await saveDialog({
        defaultPath: defaultName,
        filters: [{ name: 'HAR File', extensions: ['har'] }],
      });
      if (!filePath) return;
      await writeTextFile(filePath, harContent);
      showNotification('info', `Exported "${collection.name}" as HAR.`);
    } catch (e: any) {
      showNotification('error', `HAR export failed: ${e.message || e}`);
    }
  }

  // Messages that are handled locally in the desktop app
  const LOCAL_CRUD_MESSAGES = new Set([
    'deleteCollection', 'deleteRequest', 'deleteFolder',
    'duplicateCollection', 'duplicateFolder',
    'bulkDelete', 'bulkMovePickTarget',
    'createRequest', 'createFolder',
    'openCollectionRequest', 'runCollectionRequest',
    'clearDrafts',
    'renameCollection', 'renameFolder',
    'newRequest', 'duplicateRequest',
    'openCollectionSettings', 'openFolderSettings',
    'saveCollectionSettings', 'saveFolderSettings', 'closeSettingsPanel',
    'exportCollection', 'exportFolder', 'exportNative',
    'exportAllPostman', 'exportAllNative',
    'runAllInCollection', 'runAllInFolder',
    'importCollectionAsMocks',
    'startBenchmark', 'exportBenchmarkResults',
    'importAuto', 'importCurl', 'importFromUrl',
    'saveCollectionRequest', 'draftUpdated', 'revertRequest',
    'exportHar', 'exportHistory', 'importHistory', 'importPostmanEnvironment',
  ]);

  function postMessage(message: any) {
    if (LOCAL_CRUD_MESSAGES.has(message.type)) {
      handleLocalMessage(message);
      return;
    }
    messageBus.send(message);
  }

  async function handleLocalMessage(message: any) {
    const data = message.data;
    switch (message.type) {
      case 'deleteCollection':
        handleDeleteCollection(data.id);
        break;
      case 'deleteRequest':
        handleDeleteRequest(data.requestId);
        break;
      case 'deleteFolder':
        handleDeleteFolder(data.folderId);
        break;
      case 'duplicateCollection':
        handleDuplicateCollection(data.id);
        break;
      case 'duplicateFolder':
        handleDuplicateFolder(data.folderId, data.collectionId);
        break;
      case 'bulkDelete':
        handleBulkDelete(data.itemIds, data.collectionId);
        break;
      case 'bulkMovePickTarget':
        await handleBulkMovePickTarget(data.itemIds, data.sourceCollectionId);
        break;
      case 'createRequest':
        handleCreateRequest(data);
        break;
      case 'createFolder':
        await handleCreateFolder(data);
        break;
      case 'openCollectionRequest':
        handleOpenCollectionRequest(data);
        break;
      case 'runCollectionRequest':
        handleRunCollectionRequest(data);
        break;
      case 'clearDrafts':
        await handleClearDrafts();
        break;
      case 'renameCollection':
        await handleRenameCollection(data.id, data.currentName);
        break;
      case 'renameFolder':
        await handleRenameFolder(data.folderId, data.currentName);
        break;
      case 'newRequest':
        await handleNewRequestKind(data?.requestKind || 'http');
        break;
      case 'duplicateRequest':
        // In desktop, duplicate isn't meaningful without multi-tab; ignore silently
        break;
      case 'openCollectionSettings':
        handleOpenCollectionSettings(data.collectionId);
        break;
      case 'openFolderSettings':
        handleOpenFolderSettings(data.collectionId, data.folderId);
        break;
      case 'saveCollectionSettings':
      case 'saveFolderSettings':
        handleSaveCollectionSettings(data);
        break;
      case 'closeSettingsPanel': {
        const activeTab = activeTabFn();
        if (activeTab?.type === 'collection-settings') closeTab(activeTab.id);
        break;
      }
      case 'exportCollection':
      case 'exportFolder':
      case 'exportNative':
        handleExportNative(data?.id || data?.collectionId || data?.folderId);
        break;
      case 'exportAllNative':
        handleExportAllNative();
        break;
      case 'exportAllPostman':
        handleExportPostman(data?.collectionIds);
        break;
      case 'importAuto':
        handleImportAuto();
        break;
      case 'importCurl':
        handleImportCurl();
        break;
      case 'importFromUrl':
        handleImportFromUrl();
        break;
      case 'runAllInCollection':
      case 'runAllInFolder':
        handleOpenRunner(data);
        break;
      case 'importCollectionAsMocks':
        handleImportCollectionAsMocks();
        break;
      case 'startBenchmark':
        handleStartBenchmark(data);
        break;
      case 'exportBenchmarkResults':
        handleExportBenchmarkResults(data);
        break;
      case 'saveCollectionRequest':
        handleSaveCollectionRequest(data);
        break;
      case 'draftUpdated':
        // Desktop doesn't use drafts, ignore silently
        break;
      case 'revertRequest':
        handleRevertRequest(data);
        break;
      case 'exportHar':
        handleExportHar(data?.collectionId);
        break;
      case 'exportHistory':
        handleExportHistory();
        break;
      case 'importHistory':
        handleImportHistory();
        break;
      case 'importPostmanEnvironment':
        handleImportPostmanEnvironment();
        break;
    }
  }

  function handleSaveCollectionRequest(data: { requestId: string; collectionId: string; request: SavedRequest }) {
    if (!data.requestId || !data.collectionId) return;
    const { method, url, params, pathParams, headers, auth, body, assertions, authInheritance, scriptInheritance, scripts, description, ssl, proxy, timeout, followRedirects, maxRedirects, connectionMode, grpc } = data.request;
    updateRequest(data.requestId, { method, url, params, pathParams, headers, auth, body, assertions, authInheritance, scriptInheritance, scripts, description, ssl, proxy, timeout, followRedirects, maxRedirects, connectionMode, grpc });
    syncCollections();
    messageBus.send({ type: 'saveCollections', data: $state.snapshot(collectionsStore()) } as any);
    // Re-snapshot to clear dirty state
    setOriginalSnapshot($state.snapshot(requestStore));
  }

  function handleOpenRunner(data: { collectionId: string; folderId?: string }) {
    const col = collections.find(c => c.id === data.collectionId);
    if (!col) {
      showNotification('error', 'Collection not found.');
      return;
    }

    // Recursively collect all requests from items
    function getAllRequests(items: any[]): any[] {
      const requests: any[] = [];
      for (const item of items) {
        if (isRequest(item)) {
          requests.push(item);
        } else if (isFolder(item)) {
          requests.push(...getAllRequests(item.children));
        }
      }
      return requests;
    }

    let requestItems: any[];
    if (data.folderId) {
      const folder = findItemRecursive(col.items, data.folderId);
      if (!folder || !isFolder(folder)) {
        showNotification('error', 'Folder not found.');
        return;
      }
      requestItems = getAllRequests((folder as any).children);
    } else {
      requestItems = getAllRequests(col.items);
    }

    if (requestItems.length === 0) {
      showNotification('info', 'No requests to run in this collection.');
      return;
    }

    initRunner({
      collectionId: col.id,
      collectionName: col.name,
      folderId: data.folderId,
      requests: requestItems.map((r: any) => ({ id: r.id, name: r.name, method: r.method, url: r.url })),
    });
    switchView('runner');
  }

  function handleStartBenchmark(data: any) {
    // Enrich with current request data from the benchmark store (which holds the request details)
    const reqStore = requestStore;
    messageBus.send({ type: 'startBenchmark', data: $state.snapshot({
      config: data.config,
      method: benchmarkState.requestMethod || reqStore.method || 'GET',
      url: benchmarkState.requestUrl || reqStore.url || '',
      headers: reqStore.headers || [],
      params: reqStore.params || [],
      body: reqStore.body,
      auth: reqStore.auth,
      requestName: benchmarkState.requestName || '',
    })} as any);
  }

  async function handleExportBenchmarkResults(data: any) {
    const { format } = data;
    const iterations = benchmarkState.iterations;
    const statistics = benchmarkState.statistics;
    const requestName = benchmarkState.requestName;

    let content: string;
    let defaultName: string;

    if (format === 'csv') {
      const header = '#,Status,StatusText,Duration(ms),Size,Success,Error';
      const rows = iterations.map((r: any, i: number) =>
        `${i + 1},${r.status},${r.statusText || ''},${r.duration},${r.size},${r.success ? 'Yes' : 'No'},"${(r.error || '').replace(/"/g, '""')}"`
      );
      content = [header, ...rows].join('\n');
      defaultName = `${(requestName || 'benchmark').replace(/[^a-zA-Z0-9]/g, '_')}_benchmark.csv`;
    } else {
      content = JSON.stringify({ requestName, statistics, iterations }, null, 2);
      defaultName = `${(requestName || 'benchmark').replace(/[^a-zA-Z0-9]/g, '_')}_benchmark.json`;
    }

    try {
      const filePath = await saveDialog({ defaultPath: defaultName, filters: [{ name: 'All Files', extensions: ['*'] }] });
      if (filePath) {
        await writeTextFile(filePath, content);
        showNotification('info', 'Benchmark results exported successfully.');
      }
    } catch (err) {
      showNotification('error', `Failed to export results: ${err}`);
    }
  }

  async function handleImportCollectionAsMocks() {
    if (collections.length === 0) {
      showNotification('info', 'No collections available to import.');
      return;
    }

    const items = collections.map(c => ({ label: c.name, value: c.id }));
    const picked = await showLocalQuickPick('Select a collection to import as mock routes', items);
    if (!picked) return;

    const col = collections.find(c => c.id === picked);
    if (!col) return;

    // Recursively get all requests
    function getAllRequests(items: any[]): any[] {
      const requests: any[] = [];
      for (const item of items) {
        if (isRequest(item)) requests.push(item);
        else if (isFolder(item)) requests.push(...getAllRequests(item.children));
      }
      return requests;
    }

    const requests = getAllRequests(col.items);
    const routes = requests.map((r: any) => {
      // Extract path from URL
      let path = '/';
      try {
        const url = new URL(r.url.startsWith('http') ? r.url : `http://localhost${r.url}`);
        path = url.pathname || '/';
      } catch { path = r.url || '/'; }

      return {
        id: generateId(),
        enabled: true,
        method: r.method || 'GET',
        path,
        statusCode: 200,
        responseBody: '{}',
        responseHeaders: [],
        latencyMin: 0,
        latencyMax: 0,
        description: r.name || '',
      };
    });

    initMockStore({
      config: { port: mockServerState.config.port, routes },
      status: mockServerState.status,
    });

    showNotification('info', `Imported ${routes.length} routes from "${col.name}".`);
  }

  function handleRevertRequest(data: { requestId: string; collectionId: string }) {
    if (!data.requestId || !data.collectionId) return;
    const col = collections.find(c => c.id === data.collectionId);
    if (!col) return;
    const item = findItemRecursive(col.items, data.requestId);
    if (!item || !isRequest(item)) return;
    loadRequest(item);
  }

  // Global keyboard shortcut handler
  function handleAppKeydown(e: KeyboardEvent) {
    // Don't fire shortcuts when a modal is open
    if (pendingInput()) return;

    const shortcuts = resolvedShortcuts();

    if (matchesBinding(e, shortcuts.newRequest)) {
      e.preventDefault();
      handleNewRequestKind('http');
      return;
    }

    if (matchesBinding(e, shortcuts.openCommandPalette)) {
      e.preventDefault();
      // Command palette not yet implemented in desktop; show notification
      showNotification('info', 'Command palette is not yet available in the desktop app.');
      return;
    }

    if (matchesBinding(e, shortcuts.duplicateRequest)) {
      e.preventDefault();
      handleDuplicateTab();
      return;
    }

    // Ctrl+W: close current tab
    if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
      e.preventDefault();
      const atid = activeTabIdFn();
      if (atid) closeTab(atid);
      return;
    }

    // Ctrl+Tab / Ctrl+Shift+Tab: tab navigation
    if ((e.ctrlKey || e.metaKey) && e.key === 'Tab') {
      e.preventDefault();
      const allTabs = tabsList();
      if (allTabs.length <= 1) return;
      const currentIdx = allTabs.findIndex(t => t.id === activeTabIdFn());
      if (currentIdx === -1) return;
      const nextIdx = e.shiftKey
        ? (currentIdx - 1 + allTabs.length) % allTabs.length
        : (currentIdx + 1) % allTabs.length;
      switchTabFn(allTabs[nextIdx].id);
      return;
    }
  }

  function openSettingsTab() {
    const existing = findSingletonTab('settings');
    if (existing) {
      switchTabFn(existing.id);
    } else {
      openTab(createSingletonTab('settings', 'Settings'));
    }
    currentView = 'main';
  }

  function openEnvironmentsTab() {
    const existing = findSingletonTab('environments');
    if (existing) {
      switchTabFn(existing.id);
    } else {
      openTab(createSingletonTab('environments', 'Environments'));
    }
    currentView = 'main';
  }

  function handleDuplicateTab() {
    const currentTab = activeTabFn();
    if (!currentTab || currentTab.type !== 'request') return;

    // Save current state, then create a duplicate tab with the same snapshot
    const snap = saveCurrentSnapshot();
    const newTab = createRequestTab(
      currentTab.label + ' (copy)',
      null, // no requestId for duplicated unsaved request
      currentTab.collectionId,
      currentTab.collectionName,
    );
    newTab.icon = currentTab.icon;
    newTab.connectionMode = currentTab.connectionMode;
    openTab(newTab, snap);
  }

  // UI Interaction response helpers
  function respondInputBox(value: string | null) {
    const pending = pendingInput();
    if (pending?.type === 'inputBox') {
      if (pending.requestId === '_local') {
        resolveLocalInputBox(value);
      } else {
        messageBus.send({ type: 'inputBoxResult', data: { requestId: pending.requestId, value } } as any);
        clearPendingInput();
      }
    }
  }

  function respondQuickPick(value: string | string[] | null) {
    const pending = pendingInput();
    if (pending?.type === 'quickPick') {
      if (pending.requestId === '_local') {
        resolveLocalQuickPick(value);
      } else {
        messageBus.send({ type: 'quickPickResult', data: { requestId: pending.requestId, value } } as any);
        clearPendingInput();
      }
    }
  }

  function respondConfirm(confirmed: boolean) {
    const pending = pendingInput();
    if (pending?.type === 'confirm') {
      if (pending.requestId === '_local') {
        resolveLocalConfirm(confirmed);
      } else {
        messageBus.send({ type: 'confirmResult', data: { requestId: pending.requestId, confirmed } } as any);
        clearPendingInput();
      }
    }
  }
</script>

<svelte:window onkeydown={handleAppKeydown} />

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
      <h1>Nouto</h1>
      <div class="sidebar-header-actions">
        <Tooltip text="Open Project Folder">
          <button class="settings-btn" onclick={() => messageBus.send({ type: 'openProjectDir' } as any)} aria-label="Open Project Folder">
            <span class="codicon codicon-folder-opened"></span>
          </button>
        </Tooltip>
        <Tooltip text="Settings">
          <button class="settings-btn" onclick={openSettingsTab} aria-label="Settings">
            <span class="codicon codicon-gear"></span>
          </button>
        </Tooltip>
      </div>
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
          <div class="new-request-group">
            <button class="new-request-button" onclick={handleNewRequest}>
              <span class="codicon codicon-add"></span>
              <span class="button-label">New Request</span>
            </button>
            <span class="new-request-divider"></span>
            <button
              class="new-request-arrow"
              onclick={toggleNewRequestDropdown}
              type="button"
              aria-label="Request type options"
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 10.5L2.5 5h11L8 10.5z"/>
              </svg>
            </button>
          </div>
        </Tooltip>
        {#if newRequestDropdownOpen}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div class="dropdown-backdrop" role="none" onclick={() => { newRequestDropdownOpen = false; }}></div>
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
      <TabBar onNewTab={() => handleNewRequestKind('http')} />
      {#if activeTabFn()?.type === 'settings'}
        <SettingsPage standalone onclose={() => closeTab(activeTabIdFn()!)} />
      {:else if activeTabFn()?.type === 'environments'}
        <EnvironmentsPanel />
      {:else if activeTabFn()?.type === 'collection-settings'}
        <CollectionSettingsPanel {postMessage} />
      {:else}
        <MainPanel
          collectionId={activeTabFn()?.collectionId ?? collectionId}
          collectionName={activeTabFn()?.collectionName ?? collectionName}
          {collections}
          {showSaveNudge}
          {postMessage}
          onDismissNudge={() => { showSaveNudge = false; nudgeDismissed = true; }}
          onSaveToCollection={() => { messageBus.send({ type: 'getCollections' }); }}
        />
      {/if}
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

  .sidebar-header-actions {
    display: flex;
    align-items: center;
    gap: 4px;
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

  .new-request-group {
    display: flex;
    align-items: stretch;
    width: 100%;
    border-radius: 4px;
    overflow: hidden;
  }

  .new-request-button {
    flex: 1;
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
    border: none;
    padding: 6px 12px;
    border-radius: 0;
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

  .new-request-divider {
    width: 1px;
    background: rgba(255, 255, 255, 0.3);
  }

  .new-request-arrow {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px 16px;
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
    border: none;
    cursor: pointer;
    transition: background-color 0.15s ease;
  }

  .new-request-arrow:hover {
    background: var(--hf-button-hoverBackground);
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
