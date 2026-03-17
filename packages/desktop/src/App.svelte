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
  import { collections as collectionsStore, initCollections, addRequestToCollection, addCollection, setCollections, deleteCollection as storeDeleteCollection, deleteRequest as storeDeleteRequest, deleteFolder as storeDeleteFolder, moveItem, findItemById, findItemRecursive, findCollectionForItem, isDraftsCollection, addFolder, updateRequest } from '@nouto/ui/stores/collections.svelte';
  import { loadEnvironments, loadEnvFileVariables, updateCollectionScopedVariables } from '@nouto/ui/stores/environment.svelte';
  import { setResponse, setLoading, clearResponse, setMethod, setUrl, setParams, setHeaders, setAuth, setBody, setAssertions, setAuthInheritance, setScriptInheritance, setScripts, setDescription, setUrlAndParams, setDownloadProgress, setSsl, setProxy, setTimeout as setRequestTimeout, setRedirects, setPathParams, setGrpc, request as requestStore, setOriginalSnapshot, setRequestContext, clearOriginalSnapshot, clearRequestContext } from '@nouto/ui/stores';
  import { storeResponse } from '@nouto/ui/stores/responseContext.svelte';
  import { setAssertionResults, clearAssertionResults } from '@nouto/ui/stores/assertions.svelte';
  import { setScriptOutput, clearScriptOutput } from '@nouto/ui/stores/scripts.svelte';
  import { setWsStatus, addWsMessage } from '@nouto/ui/stores/websocket.svelte';
  import { setSSEStatus, addSSEEvent } from '@nouto/ui/stores/sse.svelte';
  import { setConnectionMode, ui } from '@nouto/ui/stores/ui.svelte';
  import { loadSettings, settingsOpen, setSettingsOpen } from '@nouto/ui/stores/settings.svelte';
  import { setCookieJarData, loadCookieJars } from '@nouto/ui/stores/cookieJar.svelte';
  import { showNotification, setPendingInput, clearPendingInput, pendingInput } from '@nouto/ui/stores/notifications.svelte';

  // Sidebar split ratio from ui store
  const sidebarSplitRatio = $derived(ui.sidebarSplitRatio || 0.2); // Default 20% width

  import { getDefaultsForRequestKind, isFolder, isRequest, generateId, type RequestKind, type SavedRequest, type Collection, type Folder, type CollectionItem, type ConnectionMode } from '@nouto/core';
  import type { IncomingMessage } from '@nouto/transport';

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
        console.error('[Nouto]', message.message);
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

    collectionId = data.collectionId;
    collectionName = col.name;
    requestId = data.requestId;
    if (!panelId) panelId = 'desktop-main';
    loadRequest(item);
    // Set up dirty tracking context so Ctrl+S works
    setOriginalSnapshot($state.snapshot(requestStore));
    setRequestContext({ panelId, requestId: data.requestId, collectionId: data.collectionId, collectionName: col.name });
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

  async function handleCreateFolder(data: { collectionId: string; parentFolderId?: string }) {
    const name = await showLocalInputBox('Folder name', 'New Folder');
    if (!name) return;
    addFolder(data.collectionId, name, data.parentFolderId);
    syncCollections();
  }

  // Messages that are handled locally in the desktop app
  const LOCAL_CRUD_MESSAGES = new Set([
    'deleteCollection', 'deleteRequest', 'deleteFolder',
    'duplicateCollection', 'duplicateFolder',
    'bulkDelete', 'bulkMovePickTarget',
    'createRequest', 'createFolder',
    'openCollectionRequest', 'runCollectionRequest',
    'clearDrafts',
    'newRequest', 'duplicateRequest',
    'openCollectionSettings', 'openFolderSettings',
    'exportCollection', 'exportFolder', 'exportNative',
    'exportAllPostman', 'exportAllNative',
    'runAllInCollection', 'runAllInFolder',
    'importAuto', 'importCurl', 'importFromUrl',
    'saveCollectionRequest', 'draftUpdated', 'revertRequest',
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
      case 'newRequest':
        await handleNewRequestKind(data?.requestKind || 'http');
        break;
      case 'duplicateRequest':
        // In desktop, duplicate isn't meaningful without multi-tab; ignore silently
        break;
      // Stub handlers for features not yet implemented in desktop
      case 'openCollectionSettings':
      case 'openFolderSettings':
        showNotification('info', 'Collection/folder settings are not yet available in the desktop app.');
        break;
      case 'exportCollection':
      case 'exportFolder':
      case 'exportNative':
      case 'exportAllPostman':
      case 'exportAllNative':
        showNotification('info', 'Export is not yet available in the desktop app.');
        break;
      case 'importAuto':
      case 'importCurl':
      case 'importFromUrl':
        showNotification('info', 'Import is not yet available in the desktop app.');
        break;
      case 'runAllInCollection':
      case 'runAllInFolder':
        showNotification('info', 'Collection runner is not yet available in the desktop app.');
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

  function handleRevertRequest(data: { requestId: string; collectionId: string }) {
    if (!data.requestId || !data.collectionId) return;
    const col = collections.find(c => c.id === data.collectionId);
    if (!col) return;
    const item = findItemRecursive(col.items, data.requestId);
    if (!item || !isRequest(item)) return;
    loadRequest(item);
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
