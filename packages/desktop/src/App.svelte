<script lang="ts">
  // Desktop App - Single-window SPA merging sidebar + main/runner/mock/benchmark views
  import { onMount } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { listen as tauriListen } from '@tauri-apps/api/event';
  import { getVersion } from '@tauri-apps/api/app';
  import { getMessageBus } from './lib/tauri';
  import { initMessageBus } from '@nouto/ui/lib/vscode';

  // Import UI components from @nouto/ui
  import MainPanel from '@nouto/ui/components/main-panel/MainPanel.svelte';
  import ActionBar from '@nouto/ui/components/main-panel/ActionBar.svelte';
  import CollectionsTab from '@nouto/ui/components/sidebar/CollectionsTab.svelte';
  import TrashTab from '@nouto/ui/components/sidebar/TrashTab.svelte';
  import HistoryTab from '@nouto/ui/components/sidebar/HistoryTab.svelte';
  import CollectionRunnerPanel from '@nouto/ui/components/runner/CollectionRunnerPanel.svelte';
  import MockServerPanel from '@nouto/ui/components/mock/MockServerPanel.svelte';
  import BenchmarkPanel from '@nouto/ui/components/benchmark/BenchmarkPanel.svelte';
  import { JsonExplorerPanel, initJsonExplorer, updateJsonData, restorePersistedState as restoreJsonExplorerState } from '@nouto/json-explorer';
  import Tooltip from '@nouto/ui/components/shared/Tooltip.svelte';

  import CommandPaletteApp from '@nouto/ui/components/palette/CommandPaletteApp.svelte';
  import PanelSplitter from '@nouto/ui/components/shared/PanelSplitter.svelte';
  import NotificationStack from '@nouto/ui/components/shared/NotificationStack.svelte';
  import InputBoxModal from '@nouto/ui/components/shared/InputBoxModal.svelte';
  import QuickPickModal from '@nouto/ui/components/shared/QuickPickModal.svelte';
  import ConfirmDialog from '@nouto/ui/components/shared/ConfirmDialog.svelte';
  import WelcomeScreen from '@nouto/ui/components/shared/WelcomeScreen.svelte';
  import noutoIconUrl from '../../../assets/icons/icon.png';
  import UpdateBanner from '@nouto/ui/components/shared/UpdateBanner.svelte';
  import { loadOnboardingState, isFirstRun, completeOnboarding, markSampleLoaded, isSampleLoaded, trackRequest } from '@nouto/ui/stores/onboarding.svelte';
  import { checkForUpdates, showUpdateBanner, updateVersion, downloading, downloadProgress, installUpdate, dismissUpdate, preDownloaded } from './lib/updater.svelte';
  import { createSampleCollection, createSampleEnvironment } from '@nouto/core/data/sample-collection';

  // Import stores from @nouto/ui
  import { collections as collectionsStore, initCollections, addRequestToCollection, addCollection, setCollections, deleteCollection as storeDeleteCollection, deleteRequest as storeDeleteRequest, deleteFolder as storeDeleteFolder, moveItem, findItemById, findItemRecursive, findCollectionForItem, isDraftsCollection, addFolder, updateRequest, renameCollection as storeRenameCollection, renameFolder as storeRenameFolder, selectRequest } from '@nouto/ui/stores/collections.svelte';
  import { loadEnvironments, loadEnvFileVariables, updateCollectionScopedVariables, environments as environmentsList, activeEnvironmentId, globalVariables, updateGlobalVariables, updateEnvironmentVariables, addEnvironment, setEnvironments, setActiveEnvironment, substituteVariables } from '@nouto/ui/stores/environment.svelte';
  import { setResponse, setLoading, clearResponse, setMethod, setUrl, setParams, setHeaders, setAuth, setBody, setAssertions, setAuthInheritance, setScriptInheritance, setScripts, setDescription, setUrlAndParams, setDownloadProgress, setSsl, setProxy, setTimeout as setRequestTimeout, setRedirects, setPathParams, setGrpc, patchGrpc, request as requestStore, setOriginalSnapshot, setRequestContext, clearOriginalSnapshot, clearRequestContext } from '@nouto/ui/stores';
  import { storeResponse } from '@nouto/ui/stores/responseContext.svelte';
  import { setAssertionResults, clearAssertionResults } from '@nouto/ui/stores/assertions.svelte';
  import { setScriptOutput, clearScriptOutput } from '@nouto/ui/stores/scripts.svelte';
  import { setWsStatus, addWsMessage } from '@nouto/ui/stores/websocket.svelte';
  import { setSSEStatus, addSSEEvent } from '@nouto/ui/stores/sse.svelte';
  import { setConnectionMode, ui } from '@nouto/ui/stores/ui.svelte';
  import { loadSettings, settingsOpen, setSettingsOpen, resolvedShortcuts, setAppVersion, setIconUrl } from '@nouto/ui/stores/settings.svelte';
  import { initTrash, autoPurgeTrash, trashCount } from '@nouto/ui/stores/trash.svelte';
  import { initHistory, setHistoryStats, setHistoryStatsLoading } from '@nouto/ui/stores/history.svelte';
  import { matchesBinding } from '@nouto/ui/lib/shortcuts';
  import { undoRequest, redoRequest, canUndoRequest, canRedoRequest, initRequestUndo, lastUndoScope, clearRequestUndoStack } from '@nouto/ui/stores/requestUndo.svelte';
  import { undoCollection, redoCollection, canUndoCollection, canRedoCollection, initCollectionUndo } from '@nouto/ui/stores/collectionUndo.svelte';
  import { setCookieJarData, loadCookieJars } from '@nouto/ui/stores/cookieJar.svelte';
  import { showNotification, setPendingInput, clearPendingInput, pendingInput } from '@nouto/ui/stores/notifications.svelte';
  import { initRunner } from '@nouto/ui/stores/collectionRunner.svelte';
  import TabBar from '@nouto/ui/components/shared/TabBar.svelte';
  import TabSwitcher from '@nouto/ui/components/shared/TabSwitcher.svelte';
  import SettingsPage from '@nouto/ui/components/shared/SettingsPage.svelte';
  import EnvironmentsPanel from '@nouto/ui/components/environments/EnvironmentsPanel.svelte';
  import CollectionSettingsPanel from '@nouto/ui/components/settings/CollectionSettingsPanel.svelte';
  import { initSettings, notifySettingsSaved } from '@nouto/ui/stores/collectionSettings.svelte';
  import {
    tabs as tabsList, activeTabId as activeTabIdFn, activeTab as activeTabFn,
    openTab, closeTab, switchTab as switchTabFn, updateTabLabel, setTabDirty, setTabIcon,
    setTabRequestId, findTabByRequestId, findSingletonTab,
    saveCurrentSnapshot, createDefaultTabState,
    createRequestTab, createSingletonTab, loadFromStorage as loadTabsFromStorage,
    tabSearchOpen, openTabSearch, closeTabSearch,
  } from '@nouto/ui/stores/tabs.svelte';
  import { setMockStatus, addLog as addMockLog, initMockServer as initMockStore, mockServerState } from '@nouto/ui/stores/mockServer.svelte';
  import { benchmarkState, updateProgress as updateBenchmarkProgress, addIteration as addBenchmarkIteration, setCompleted as setBenchmarkCompleted, setCancelled as setBenchmarkCancelled } from '@nouto/ui/stores/benchmark.svelte';
  import { setGrpcProtoLoaded, setGrpcProtoError, setGrpcConnectionStart, addGrpcEvent, setGrpcConnectionEnd, setScannedDirFiles, grpcMethodType } from '@nouto/ui/stores/grpc.svelte';
  import { setGqlSubStatus, addGqlSubEvent } from '@nouto/ui/stores/graphqlSubscription.svelte';
  import { setCurrentSession, setSavedSessions } from '@nouto/ui/stores/wsRecording.svelte';

  // Sidebar split ratio from ui store
  const sidebarSplitRatio = $derived(ui.sidebarSplitRatio || 0.2); // Default 20% width

  import { getDefaultsForRequestKind, isFolder, isRequest, generateId, deriveNameFromUrl, type RequestKind, type SavedRequest, type Collection, type Folder, type CollectionItem, type ConnectionMode, parseCurl, isCurlCommand } from '@nouto/core';
  import { DraftsCollectionService } from '@nouto/core/services/RecentCollectionService';
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
  import { initTheme } from '@nouto/ui/stores/theme.svelte';

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
  type View = 'main' | 'runner' | 'mock' | 'benchmark' | 'json-explorer';
  let currentView = $state<View>('main');

  // App state
  let messageBus: ReturnType<typeof getMessageBus>;
  let appLoading = $state(true);
  let collections = $state<Collection[]>([]);
  let dataLoaded = $state(false);
  type SidebarView = 'collections' | 'history' | 'trash';
  let sidebarView = $state<SidebarView>('collections');

  // Project state
  let projectPath = $state<string | null>(null);
  let recentProjects = $state<Array<{ path: string; name: string; last_opened: string }>>([]);

  // Request identity (for MainPanel)
  let panelId: string | null = null;
  let requestId: string | null = null;
  let collectionId: string | null = $state<string | null>(null);
  let collectionName: string | null = $state<string | null>(null);
  let showSaveNudge = $state(false);
  let nudgeDismissed = $state(false);

  // Command palette state
  let showPalette = $state(false);

  // Conflict banner state
  let showConflictBanner = $state(false);
  let conflictMessage = $state('');

  // Draft auto-save state
  const DRAFTS_STORAGE_KEY = 'nouto_drafts';
  let draftSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let showDraftRecovery = $state(false);
  let pendingDrafts: Record<string, any> = {};

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
    // Initialize onboarding state from localStorage
    loadOnboardingState();

    // Set app version from Tauri config
    getVersion().then(v => setAppVersion(v)).catch(() => {});
    setIconUrl(noutoIconUrl);

    // Initialize undo/redo systems
    initRequestUndo();
    initCollectionUndo();

    // Initialize theme from saved preference or system default
    initTheme();

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

    // Listen for deep-link URLs (nouto:// protocol)
    const unlistenDeepLink = await tauriListen<string>('deepLinkReceived', (event) => {
      console.log('[Nouto] Deep link received:', event.payload);
      try {
        // Payload may be JSON-encoded string array or plain string
        const raw = typeof event.payload === 'string' ? event.payload : JSON.stringify(event.payload);
        const urls: string[] = JSON.parse(raw);
        for (const urlStr of urls) {
          const url = new URL(urlStr);
          if (url.pathname === '/oauth/callback' || url.pathname === '//oauth/callback') {
            // OAuth deep-link callback: extract code and state
            const code = url.searchParams.get('code');
            const state = url.searchParams.get('state');
            if (code) {
              console.log('[Nouto] OAuth callback via deep link, code:', code.substring(0, 8) + '...');
              // Emit as a message to be handled by the OAuth flow
              messageBus?.send({ type: 'oauthDeepLinkCallback', data: { code, state } } as any);
            }
          }
        }
      } catch (err) {
        console.warn('[Nouto] Failed to parse deep link:', err);
      }
    });

    // Initialize Tauri message bus
    messageBus = getMessageBus();
    // Wire all packages/ui components to Tauri IPC instead of VSCode IPC
    initMessageBus(messageBus);

    // Subscribe to messages from Rust backend
    const unsubscribe = messageBus.onMessage((message: IncomingMessage) => {
      handleMessage(message);
    });

    // Wait for all Tauri event listeners to be registered before requesting data
    // This prevents a race where Rust emits initialData before we're listening
    await messageBus.waitForListeners();

    // Restore persisted UI state (collections come from Rust storage via loadData)
    const savedState = messageBus.getState<{
      currentView?: View;
      request?: SavedRequest;
    }>();

    if (savedState) {
      // Don't restore json-explorer view (it has no data on fresh launch)
      if (savedState.currentView && savedState.currentView !== 'json-explorer') {
        currentView = savedState.currentView;
      }
    }

    // Restore tab state from localStorage
    loadTabsFromStorage();

    // Check for unsaved drafts from previous session
    const existingDrafts = loadDrafts();
    if (Object.keys(existingDrafts).length > 0) {
      pendingDrafts = existingDrafts;
      showDraftRecovery = true;
    }

    // Request initial data from Rust backend
    messageBus.send({ type: 'ready' });
    messageBus.send({ type: 'loadData' });
    messageBus.send({ type: 'getRecentProjects' } as any);

    // Check for updates after a short delay (non-blocking)
    setTimeout(() => checkForUpdates(), 5000);

    return () => {
      document.removeEventListener('contextmenu', preventContextMenu);
      unsubscribe();
      unlistenDeepLink();
      messageBus?.destroy();
    };
  });

  async function handleMessage(message: IncomingMessage) {
    try {
    switch (message.type) {
      case 'initialData': {
        const rawCollections = message.data?.collections || [];
        collections = DraftsCollectionService.ensureDraftsCollection(rawCollections);

        // Auto-load sample collection on first run (no user collections exist yet)
        const userCollections = collections.filter((c: any) => c.builtin !== 'drafts');
        if (userCollections.length === 0 && !isSampleLoaded()) {
          const sampleCollection = createSampleCollection();
          collections = [...collections, sampleCollection];
          markSampleLoaded();
          messageBus.send({ type: 'saveCollections', data: $state.snapshot(collections) } as any);
          // Add sample environment if none exist
          // (initialData.environments is a plain array, not a nested object)
          if (!message.data?.environments?.length) {
            const sampleEnv = createSampleEnvironment();
            setEnvironments([sampleEnv]);
            setActiveEnvironment(sampleEnv.id);
          }
        }

        initCollections(collections);
        // Environments are loaded via the separate 'loadEnvironments' event
        // (emitted by Rust before 'initialData'). Do NOT call loadEnvironments()
        // here: initialData.environments is a plain array, not the full
        // { environments, activeId, globalVariables } object the store expects,
        // so passing it would wipe the correctly-loaded state.

        // History is loaded lazily when the History tab is opened

        // Load trash
        if (message.data?.trash) {
          initTrash(message.data.trash);
          autoPurgeTrash();
        }
        // Track current project path (null when using default storage)
        projectPath = message.data?.projectPath ?? null;
        dataLoaded = true;
        appLoading = false;
        break;
      }

      case 'collectionsLoaded':
      case 'collections':
        collections = DraftsCollectionService.ensureDraftsCollection(message.data || []);
        initCollections(collections);
        break;

      case 'historyLoaded':
      case 'historyUpdated': {
        const entries = message.data || [];
        initHistory({ entries, total: entries.length, hasMore: false });
        break;
      }

      case 'historyStatsLoaded':
        setHistoryStats(message.data);
        setHistoryStatsLoading(false);
        break;

      case 'loadEnvironments':
        loadEnvironments(message.data);
        break;

      case 'secretsResolved': {
        // Background secret resolution completed: update collections and environments
        const resolvedCollections = message.data?.collections || [];
        collections = DraftsCollectionService.ensureDraftsCollection(resolvedCollections);
        initCollections(collections);
        if (message.data?.environments) {
          loadEnvironments(message.data.environments);
        }
        break;
      }

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
        if (!message.data.error) {
          trackRequest();
        }
        // Auto-refresh JSON Explorer if it's open for this request
        if (currentView === 'json-explorer' && jsonExplorerRequestId) {
          const tab = activeTabFn();
          if (tab?.requestId === jsonExplorerRequestId) {
            updateJsonData(message.data.data, new Date().toISOString());
          }
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

      case 'wsSessionSaved':
        setCurrentSession(message.data.session);
        break;
      case 'wsSessionLoaded':
        setCurrentSession(message.data.session);
        break;
      case 'wsSessionsList':
        setSavedSessions(message.data.sessions);
        break;

      case 'sseStatus':
        setSSEStatus(message.data.status, message.data.error);
        break;

      case 'sseEvent': {
        const raw = message.data;
        addSSEEvent({
          id: `sse-${generateId()}`,
          eventId: raw.id,
          eventType: raw.type || 'message',
          data: raw.data,
          timestamp: raw.timestamp,
        });
        break;
      }

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

      case 'collectionRequestSaved': {
        setOriginalSnapshot($state.snapshot(requestStore));
        showNotification('info', 'Request saved.');
        const savedTabId = activeTabIdFn();
        if (savedTabId) clearDraftForTab(savedTabId);
        break;
      }

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

      // GraphQL Subscription events
      case 'gqlSubStatus':
        setGqlSubStatus(message.data.status, message.data.error);
        break;
      case 'gqlSubEvent': {
        const gqlRaw = message.data;
        addGqlSubEvent({
          id: `gql-${generateId()}`,
          type: gqlRaw.error ? 'error' : 'data',
          data: JSON.stringify(gqlRaw.error || gqlRaw.payload),
          timestamp: gqlRaw.timestamp,
        });
        break;
      }

      // gRPC events
      case 'grpcProtoLoaded':
        setGrpcProtoLoaded(message.data);
        break;
      case 'grpcProtoError':
        setGrpcProtoError(message.data.message);
        setLoading(false);
        break;
      case 'protoFilesPicked':
        patchGrpc({ protoPaths: [...(requestStore.grpc?.protoPaths || []), ...(message.data.paths || [])] });
        break;
      case 'protoImportDirsPicked':
        patchGrpc({ protoImportDirs: [...(requestStore.grpc?.protoImportDirs || []), ...(message.data.paths || [])] });
        for (const dir of message.data.paths || []) {
          messageBus.send({ type: 'scanProtoDir', data: { dirPath: dir } } as any);
        }
        break;
      case 'grpcConnectionStart': {
        const mType = grpcMethodType();
        const isStreaming = mType === 'server_streaming' || mType === 'client_streaming' || mType === 'streaming';
        setGrpcConnectionStart(message.data, isStreaming);
        clearAssertionResults();
        setLoading(true);
        break;
      }
      case 'grpcEvent':
        addGrpcEvent(message.data);
        break;
      case 'grpcConnectionEnd':
        setGrpcConnectionEnd(message.data);
        if (message.data.assertionResults) {
          setAssertionResults(message.data.assertionResults);
        }
        setLoading(false);
        break;

      case 'openEnvironmentsPanel':
        openEnvironmentsTab();
        break;

      case 'openMockServer':
        switchView('mock');
        break;

      case 'openBenchmark':
        switchView('benchmark');
        break;

      case 'openJsonExplorer':
        handleOpenJsonExplorer((message as any).data || {});
        break;

      case 'showWarning':
        showNotification('warning', message.data?.message || 'Warning');
        break;

      case 'closePanelsForRequests': {
        const idsToClose: string[] = message.data?.requestIds || [];
        for (const rid of idsToClose) {
          const tab = findTabByRequestId(rid);
          if (tab) closeTab(tab.id);
        }
        break;
      }

      case 'createRequestFromUrl': {
        const urlForNew = message.data?.url;
        if (!urlForNew) break;
        const defaults = getDefaultsForRequestKind('http');
        loadNewRequestIntoForm({ ...defaults, url: urlForNew, name: deriveNameFromUrl(urlForNew) }, null, null, null);
        break;
      }

      case 'saveToCollectionWithLink': {
        const { collectionId: targetColId, folderId: targetFolderId, request: reqData } = message.data || {};
        if (!targetColId) break;
        const targetCol = collections.find(c => c.id === targetColId);
        if (!targetCol) break;
        const saved = addRequestToCollection(targetColId, {
          name: reqData?.name || requestStore.name || 'Request',
          method: reqData?.method || requestStore.method || 'GET',
          url: reqData?.url || requestStore.url || '',
          params: reqData?.params || requestStore.params || [],
          pathParams: reqData?.pathParams || requestStore.pathParams || [],
          headers: reqData?.headers || requestStore.headers || [],
          auth: reqData?.auth || requestStore.auth || { type: 'none' },
          body: reqData?.body || requestStore.body || { type: 'none', content: '' },
          assertions: reqData?.assertions || requestStore.assertions || [],
          authInheritance: reqData?.authInheritance || requestStore.authInheritance,
          scriptInheritance: reqData?.scriptInheritance || requestStore.scriptInheritance,
          scripts: reqData?.scripts || requestStore.scripts,
          description: requestStore.description || '',
          ssl: requestStore.ssl,
          proxy: requestStore.proxy,
          timeout: requestStore.timeout,
          followRedirects: requestStore.followRedirects,
          maxRedirects: requestStore.maxRedirects,
          connectionMode: reqData?.connectionMode || requestStore.connectionMode,
          grpc: requestStore.grpc,
        }, targetFolderId || undefined);
        if (!saved) break;
        collections = collectionsStore();
        requestId = saved.id;
        collectionId = targetColId;
        collectionName = targetCol.name;
        const atSave = activeTabIdFn();
        if (atSave) setTabRequestId(atSave, saved.id, targetColId, targetCol.name);
        setOriginalSnapshot($state.snapshot(requestStore));
        syncCollections();
        messageBus.send({ type: 'saveCollections', data: $state.snapshot(collectionsStore()) } as any);
        showNotification('info', `Saved to "${targetCol.name}".`);
        break;
      }

      case 'saveToNewCollectionWithLink': {
        const { name: newColName, color: newColColor, icon: newColIcon, request: newReqData } = message.data || {};
        if (!newColName) break;
        const newCol = addCollection(newColName);
        if (!newCol) break;
        if (newColColor) newCol.color = newColColor;
        if (newColIcon) newCol.icon = newColIcon;
        collections = collectionsStore();
        const savedNew = addRequestToCollection(newCol.id, {
          name: newReqData?.name || requestStore.name || 'Request',
          method: newReqData?.method || requestStore.method || 'GET',
          url: newReqData?.url || requestStore.url || '',
          params: newReqData?.params || requestStore.params || [],
          pathParams: newReqData?.pathParams || requestStore.pathParams || [],
          headers: newReqData?.headers || requestStore.headers || [],
          auth: newReqData?.auth || requestStore.auth || { type: 'none' },
          body: newReqData?.body || requestStore.body || { type: 'none', content: '' },
          assertions: newReqData?.assertions || requestStore.assertions || [],
          authInheritance: newReqData?.authInheritance || requestStore.authInheritance,
          scriptInheritance: newReqData?.scriptInheritance || requestStore.scriptInheritance,
          scripts: newReqData?.scripts || requestStore.scripts,
          description: requestStore.description || '',
          ssl: requestStore.ssl,
          proxy: requestStore.proxy,
          timeout: requestStore.timeout,
          followRedirects: requestStore.followRedirects,
          maxRedirects: requestStore.maxRedirects,
          connectionMode: newReqData?.connectionMode || requestStore.connectionMode,
          grpc: requestStore.grpc,
        });
        if (!savedNew) break;
        collections = collectionsStore();
        requestId = savedNew.id;
        collectionId = newCol.id;
        collectionName = newCol.name;
        const atNew = activeTabIdFn();
        if (atNew) setTabRequestId(atNew, savedNew.id, newCol.id, newCol.name);
        setOriginalSnapshot($state.snapshot(requestStore));
        syncCollections();
        messageBus.send({ type: 'saveCollections', data: $state.snapshot(collectionsStore()) } as any);
        showNotification('info', `Saved to new collection "${newCol.name}".`);
        break;
      }

      case 'selectRequest': {
        // From command palette: open the selected request
        const srData = (message as any).data || message;
        const srReqId = srData.requestId;
        const srColId = srData.collectionId;
        if (srReqId && srColId) {
          selectRequest(srColId, srReqId);
          handleOpenCollectionRequest({ requestId: srReqId, collectionId: srColId });
        }
        break;
      }

      case 'projectOpened': {
        projectPath = message.data?.path ?? null;
        break;
      }

      case 'projectClosed': {
        projectPath = null;
        break;
      }

      case 'recentProjectsLoaded': {
        recentProjects = message.data || [];
        break;
      }

      case 'projectFileChanged':
      case 'externalFileChanged': {
        // Check if the current request has unsaved changes
        const activeT = activeTabFn();
        if (activeT?.dirty) {
          conflictMessage = message.data?.message || 'Files changed externally. Reload to see changes.';
          showConflictBanner = true;
        } else {
          // No unsaved changes, just reload collections silently
          messageBus.send({ type: 'loadData' });
        }
        break;
      }
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

  // --- Draft auto-save ---

  function saveDraftDebounced() {
    if (draftSaveTimer) clearTimeout(draftSaveTimer);
    draftSaveTimer = setTimeout(() => {
      const atId = activeTabIdFn();
      if (!atId) return;
      const tab = activeTabFn();
      if (!tab || tab.dirty === false) return;
      try {
        const drafts = JSON.parse(localStorage.getItem(DRAFTS_STORAGE_KEY) || '{}');
        drafts[atId] = { ...$state.snapshot(requestStore), connectionMode: ui.connectionMode };
        localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
      } catch (e) {
        console.error('[Nouto] Failed to save draft:', e);
      }
    }, 2000);
  }

  function clearDraftForTab(tabId: string) {
    try {
      const drafts = JSON.parse(localStorage.getItem(DRAFTS_STORAGE_KEY) || '{}');
      delete drafts[tabId];
      localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
    } catch (e) {
      console.error('[Nouto] Failed to clear draft:', e);
    }
  }

  function loadDrafts(): Record<string, any> {
    try {
      const raw = localStorage.getItem(DRAFTS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function clearAllDraftsFromStorage() {
    localStorage.removeItem(DRAFTS_STORAGE_KEY);
  }

  function recoverDrafts() {
    for (const [tabId, snapshot] of Object.entries(pendingDrafts)) {
      const s = snapshot as any;
      const tab = createRequestTab(
        s.name || s.url || 'Recovered',
        null,
        null,
        null,
      );
      tab.icon = s.method || 'GET';
      tab.dirty = true;
      // Populate tab fields from the draft data
      tab.method = s.method || 'GET';
      tab.url = s.url || '';
      tab.params = Array.isArray(s.params) ? s.params : [];
      tab.pathParams = Array.isArray(s.pathParams) ? s.pathParams : [];
      tab.headers = Array.isArray(s.headers) ? s.headers : [];
      tab.auth = s.auth || { type: 'none' };
      tab.body = s.body || { type: 'none', content: '' };
      tab.assertions = s.assertions || [];
      tab.authInheritance = s.authInheritance;
      tab.scriptInheritance = s.scriptInheritance;
      tab.scripts = s.scripts || { preRequest: '', postResponse: '' };
      tab.description = s.description || '';
      tab.ssl = s.ssl;
      tab.proxy = s.proxy;
      tab.timeout = s.timeout;
      tab.followRedirects = s.followRedirects;
      tab.maxRedirects = s.maxRedirects;
      tab.grpc = s.grpc;
      const connMode = s._connectionMode || s.connectionMode;
      if (connMode) tab.connectionMode = connMode;
      openTab(tab);
    }
    clearAllDraftsFromStorage();
    pendingDrafts = {};
    showDraftRecovery = false;
  }

  function dismissDraftRecovery() {
    clearAllDraftsFromStorage();
    pendingDrafts = {};
    showDraftRecovery = false;
  }

  function handleConflictReload() {
    showConflictBanner = false;
    messageBus.send({ type: 'loadData' });
  }

  function handleConflictKeepMine() {
    showConflictBanner = false;
  }

  function switchView(view: View) {
    currentView = view;
  }

  let newRequestDropdownOpen = $state(false);

  function handleNewRequest() {
    handleNewRequestKind('http');
  }

  // Project actions
  function handleNewProject() {
    messageBus.send({ type: 'createProject' } as any);
  }

  function handleOpenFolder() {
    messageBus.send({ type: 'openProjectDir' } as any);
  }

  function handleOpenRecentProject(path: string) {
    messageBus.send({ type: 'openRecentProject', data: { path } } as any);
  }

  function handleRemoveRecentProject(path: string) {
    messageBus.send({ type: 'removeRecentProject', data: { path } } as any);
  }

  function handleCloseProject() {
    messageBus.send({ type: 'closeProject' } as any);
  }

  // Onboarding handlers
  function handleLoadSampleCollection() {
    const sampleCollection = createSampleCollection();
    const sampleEnv = createSampleEnvironment();
    markSampleLoaded();

    // Add the sample collection and persist
    setCollections([...collectionsStore(), sampleCollection]);
    collections = collectionsStore();
    messageBus.send({ type: 'saveCollections', data: $state.snapshot(collectionsStore()) } as any);

    // Add the sample environment and set it as active
    const currentEnvs = environmentsList();
    setEnvironments([...currentEnvs, sampleEnv]);
    setActiveEnvironment(sampleEnv.id);

    // Open the first request (GET /get) in a new tab
    const basicsFolder = sampleCollection.items[0];
    if (basicsFolder && 'children' in basicsFolder && basicsFolder.children.length > 0) {
      const firstRequest = basicsFolder.children[0] as SavedRequest;
      const tab = createRequestTab(
        firstRequest.name,
        firstRequest.id,
        sampleCollection.id,
        sampleCollection.name,
      );
      tab.icon = firstRequest.method;
      tab.method = firstRequest.method;
      tab.url = firstRequest.url;
      tab.params = firstRequest.params;
      tab.headers = firstRequest.headers;
      tab.auth = firstRequest.auth;
      tab.body = firstRequest.body;
      tab.context = {
        panelId: 'desktop-main',
        requestId: firstRequest.id,
        collectionId: sampleCollection.id,
        collectionName: sampleCollection.name,
      };
      openTab(tab);
      currentView = 'main';
    }

    markSampleLoaded();
    completeOnboarding();
    showNotification('info', 'Sample collection loaded. Try sending the GET request!');
  }

  function handleStartFromScratch() {
    // Open a blank unsaved request tab
    const tab = createRequestTab('New Request', null, null, null);
    tab.method = 'GET';
    openTab(tab);
    currentView = 'main';
    completeOnboarding();
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
    collectionId = targetColId;
    collectionName = targetColName;
    requestId = savedReq?.id ?? null;
    showSaveNudge = false;
    nudgeDismissed = false;

    // Build a complete tab with embedded state
    const tab = createRequestTab(
      savedReq?.name ?? defaults.name,
      savedReq?.id ?? null,
      targetColId,
      targetColName,
    );
    tab.icon = savedReq?.method ?? defaults.method;
    tab.method = savedReq?.method ?? defaults.method;
    tab.url = savedReq?.url ?? defaults.url;
    tab.body = savedReq?.body ?? defaults.body ?? { type: 'none', content: '' };
    tab.connectionMode = defaults.connectionMode;

    if (savedReq?.id && targetColId) {
      tab.context = { panelId: 'desktop-main', requestId: savedReq.id, collectionId: targetColId, collectionName: targetColName || '' };
      // Capture the tab's request state as original snapshot for dirty tracking
      tab.originalSnapshot = JSON.parse(JSON.stringify({
        method: tab.method, url: tab.url, params: tab.params, pathParams: tab.pathParams,
        headers: tab.headers, auth: tab.auth, body: tab.body, assertions: tab.assertions,
        scripts: tab.scripts, description: tab.description, ssl: tab.ssl, proxy: tab.proxy,
        timeout: tab.timeout, followRedirects: tab.followRedirects, maxRedirects: tab.maxRedirects,
        authInheritance: tab.authInheritance, scriptInheritance: tab.scriptInheritance, grpc: tab.grpc,
      }));
    }

    openTab(tab);
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
    // Persist deletions to disk
    messageBus.send({ type: 'saveCollections', data: $state.snapshot(collectionsStore()) } as any);
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

    // Build a complete tab with embedded state from the saved request
    const tab = createRequestTab(item.name, data.requestId, data.collectionId, col.name);
    tab.icon = item.method || 'GET';
    const connMode = (item as any)._connectionMode || (item as any).connectionMode || 'http';
    tab.connectionMode = connMode;
    tab.method = item.method || 'GET';
    tab.url = item.url || '';
    tab.params = Array.isArray(item.params) ? item.params : [];
    tab.pathParams = Array.isArray((item as any).pathParams) ? (item as any).pathParams : [];
    tab.headers = Array.isArray(item.headers) ? item.headers : [];
    tab.auth = item.auth || { type: 'none' };
    tab.body = item.body || { type: 'none', content: '' };
    tab.assertions = (item as any).assertions || [];
    tab.authInheritance = (item as any).authInheritance;
    tab.scriptInheritance = (item as any).scriptInheritance;
    tab.scripts = (item as any).scripts || { preRequest: '', postResponse: '' };
    tab.description = (item as any).description || '';
    tab.ssl = (item as any).ssl;
    tab.proxy = (item as any).proxy;
    tab.timeout = (item as any).timeout;
    tab.followRedirects = (item as any).followRedirects;
    tab.maxRedirects = (item as any).maxRedirects;
    tab.grpc = (item as any).grpc;
    tab.context = { panelId: panelId || 'desktop-main', requestId: data.requestId, collectionId: data.collectionId, collectionName: col.name };
    // Save a snapshot for dirty tracking (deep clone of request state)
    tab.originalSnapshot = JSON.parse(JSON.stringify({
      method: tab.method, url: tab.url, params: tab.params, pathParams: tab.pathParams,
      headers: tab.headers, auth: tab.auth, body: tab.body, assertions: tab.assertions,
      scripts: tab.scripts, description: tab.description, ssl: tab.ssl, proxy: tab.proxy,
      timeout: tab.timeout, followRedirects: tab.followRedirects, maxRedirects: tab.maxRedirects,
      authInheritance: tab.authInheritance, scriptInheritance: tab.scriptInheritance, grpc: tab.grpc,
    }));

    collectionId = data.collectionId;
    collectionName = col.name;
    requestId = data.requestId;
    if (!panelId) panelId = 'desktop-main';

    openTab(tab);
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
        ...createDefaultTabState(),
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
        ...createDefaultTabState(),
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

  async function handleExportFolder(folderId: string, collectionId: string) {
    const cols = $state.snapshot(collectionsStore()) as Collection[];
    const col = cols.find(c => c.id === collectionId);
    if (!col) { showNotification('error', 'Collection not found.'); return; }

    const folder = findItemRecursive(col.items, folderId) as Folder | null;
    if (!folder || !isFolder(folder)) { showNotification('error', 'Folder not found.'); return; }

    const exportData = {
      _format: 'nouto',
      _version: '1.0',
      _exportedAt: new Date().toISOString(),
      collection: {
        id: folder.id,
        name: folder.name,
        items: folder.children,
        expanded: folder.expanded,
        auth: folder.auth,
        headers: folder.headers,
        variables: folder.variables,
        scripts: folder.scripts,
        assertions: folder.assertions,
        description: folder.description,
        color: folder.color,
        icon: folder.icon,
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt,
      } as Collection,
    };

    try {
      const defaultName = `${folder.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
      const filePath = await saveDialog({
        defaultPath: defaultName,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!filePath) return;
      await writeTextFile(filePath, JSON.stringify(exportData, null, 2));
      showNotification('info', 'Folder exported successfully.');
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
        unsub(); // Clean up listener immediately to prevent stale interceptions
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
            resolve((msg as any).data || []);
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
            resolve((msg as any).data || []);
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

      // Batch import via the existing Rust importHistory command
      messageBus.send({ type: 'importHistory', data: { entries: newEntries } } as any);

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

  // --- Backup Export ---

  function handleExportBackup() {
    // Pass cookie data from localStorage so Rust can include it in the backup
    const cookieRaw = localStorage.getItem('nouto_cookie_jars');
    const cookies = cookieRaw ? JSON.parse(cookieRaw) : null;
    messageBus.send({ type: 'exportBackup', data: { cookies } } as any);
  }

  // --- Backup Import ---

  function handleImportBackup() {
    messageBus.send({ type: 'importBackup' } as any);
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
    'exportBackup', 'importBackup',
    'addResponseExample', 'deleteResponseExample',
    'openCommandPalette',
  ]);

  function postMessage(message: any) {
    if (LOCAL_CRUD_MESSAGES.has(message.type)) {
      handleLocalMessage(message);
      return;
    }
    messageBus?.send(message);
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
      case 'duplicateRequest': {
        // Clone the current request, assign new ID, open in a new tab as unsaved draft
        const currentReq = $state.snapshot(requestStore) as any;
        if (!currentReq) break;
        const cloned = structuredClone(currentReq);
        cloned.id = generateId();
        cloned.name = `${currentReq.name || 'Request'} (copy)`;
        // Capture current state and merge into the duplicate tab
        const dupSnap = saveCurrentSnapshot();
        const dupTab = createRequestTab(
          cloned.name,
          null, // no requestId (unsaved)
          null, // no collectionId
          null, // no collectionName
        );
        dupTab.icon = cloned.method || 'GET';
        dupTab.dirty = true;
        Object.assign(dupTab, dupSnap);
        // Clear identity (it's a copy, unsaved)
        dupTab.requestId = null;
        dupTab.context = { panelId: '', requestId: null, collectionId: null, collectionName: null };
        dupTab.originalSnapshot = null;
        openTab(dupTab);
        collectionId = null;
        collectionName = null;
        requestId = null;
        currentView = 'main';
        break;
      }
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
        handleExportPostman(data?.collectionId ? [data.collectionId] : undefined);
        break;
      case 'exportFolder':
        await handleExportFolder(data.folderId, data.collectionId);
        break;
      case 'exportNative':
        handleExportNative(data?.collectionId);
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
        saveDraftDebounced();
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
      case 'exportBackup':
        handleExportBackup();
        break;
      case 'importBackup':
        handleImportBackup();
        break;
      case 'addResponseExample': {
        const { requestId: exReqId, collectionId: exColId, example } = data;
        if (!exReqId || !exColId || !example) break;
        const exCol = collections.find(c => c.id === exColId);
        if (!exCol) break;
        const exReq = findItemRecursive(exCol.items, exReqId) as SavedRequest | null;
        if (!exReq || !isRequest(exReq)) break;
        const existingExamples = exReq.examples || [];
        updateRequest(exReqId, { examples: [...existingExamples, example] });
        syncCollections();
        messageBus.send({ type: 'saveCollections', data: $state.snapshot(collectionsStore()) } as any);
        break;
      }
      case 'deleteResponseExample': {
        const { requestId: delReqId, collectionId: delColId, exampleId } = data;
        if (!delReqId || !delColId || !exampleId) break;
        const delCol = collections.find(c => c.id === delColId);
        if (!delCol) break;
        const delReq = findItemRecursive(delCol.items, delReqId) as SavedRequest | null;
        if (!delReq || !isRequest(delReq) || !delReq.examples) break;
        updateRequest(delReqId, { examples: delReq.examples.filter(e => e.id !== exampleId) });
        syncCollections();
        messageBus.send({ type: 'saveCollections', data: $state.snapshot(collectionsStore()) } as any);
        break;
      }
      case 'openCommandPalette':
        showPalette = true;
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

  // ---- JSON Explorer ----

  let jsonExplorerReady = $state(false);
  let jsonExplorerRequestId = $state('');

  function handleOpenJsonExplorer(data: any) {
    // Enrich with active tab context if not provided
    const tab = activeTabFn();
    const resolvedRequestId = data.requestId || tab?.requestId || '';
    jsonExplorerRequestId = resolvedRequestId;
    initJsonExplorer({
      json: data.json,
      contentType: data.contentType || '',
      requestName: data.requestName || tab?.label || '',
      requestMethod: data.requestMethod || '',
      requestUrl: data.requestUrl || '',
      requestId: data.requestId || tab?.requestId || '',
      panelId: data.panelId || '',
      timestamp: data.timestamp || new Date().toISOString(),
    });
    restoreJsonExplorerState();
    jsonExplorerReady = true;
    currentView = 'json-explorer';
  }

  function handleJsonExplorerMessage(msg: any) {
    switch (msg.type) {
      case 'focusRequest': {
        const rid = msg.data?.requestId;
        if (!rid) break;
        const tab = findTabByRequestId(rid);
        if (tab) switchTabFn(tab.id);
        currentView = 'main';
        break;
      }
      case 'createAssertion': {
        const { requestId: aReqId, path, operator, expected } = msg.data || {};
        if (!aReqId) break;
        const tab = findTabByRequestId(aReqId);
        if (tab) switchTabFn(tab.id);
        currentView = 'main';
        // Add assertion to current request
        const currentAssertions = (requestStore as any).assertions || [];
        setAssertions([...currentAssertions, { id: generateId(), source: 'body', property: path, operator: operator || 'equals', expected: expected ?? '', enabled: true }]);
        break;
      }
      case 'saveToEnvironment': {
        const { key, value } = msg.data || {};
        if (!key) break;
        const activeEnvId = activeEnvironmentId();
        if (activeEnvId) {
          const envList = environmentsList();
          const activeEnv = envList.find((e: any) => e.id === activeEnvId);
          if (activeEnv) {
            const vars = [...(activeEnv.variables || []), { key, value: String(value ?? ''), enabled: true }];
            updateEnvironmentVariables(activeEnvId, vars);
            messageBus.send({ type: 'saveEnvironments', data: $state.snapshot(envList) } as any);
            showNotification('info', `Saved "${key}" to active environment`);
          }
        } else {
          showNotification('warning', 'No active environment. Select an environment first.');
        }
        break;
      }
    }
  }

  // Set up window.vscode shim for JSON Explorer's postToExtension() calls.
  // The json-explorer package checks (window as any).vscode?.postMessage.
  // Also provides getState/setState for search history + bookmark persistence.
  const JSON_EXPLORER_STATE_KEY = 'nouto_json_explorer_state';
  (window as any).vscode = {
    postMessage: (msg: any) => handleJsonExplorerMessage(msg),
    getState: () => {
      try { return JSON.parse(localStorage.getItem(JSON_EXPLORER_STATE_KEY) || 'null'); }
      catch { return null; }
    },
    setState: (state: any) => {
      try { localStorage.setItem(JSON_EXPLORER_STATE_KEY, JSON.stringify(state)); }
      catch { /* ignore */ }
    },
  };

  function handleCloseJsonExplorer() {
    currentView = 'main';
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
      environments: environmentsList().map(e => ({ id: e.id, name: e.name })),
      activeEnvironmentId: activeEnvironmentId() ?? null,
    });
    switchView('runner');
  }

  function handleStartBenchmark(data: any) {
    // Enrich with current request data from the benchmark store (which holds the request details)
    const reqStore = requestStore;
    const rawUrl = benchmarkState.requestUrl || reqStore.url || '';
    const rawHeaders = (reqStore.headers || []).map((h: any) => ({
      ...h,
      key: substituteVariables(h.key || ''),
      value: substituteVariables(h.value || ''),
    }));
    const rawParams = (reqStore.params || []).map((p: any) => ({
      ...p,
      key: substituteVariables(p.key || ''),
      value: substituteVariables(p.value || ''),
    }));
    const rawBody = reqStore.body ? {
      ...reqStore.body,
      content: reqStore.body.content ? substituteVariables(reqStore.body.content) : '',
    } : reqStore.body;
    messageBus.send({ type: 'startBenchmark', data: $state.snapshot({
      config: data.config,
      method: benchmarkState.requestMethod || reqStore.method || 'GET',
      url: substituteVariables(rawUrl),
      headers: rawHeaders,
      params: rawParams,
      body: rawBody,
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
    // Reset dirty-tracking baseline so the reverted request shows as clean
    setOriginalSnapshot($state.snapshot(requestStore));
  }

  // Global keyboard shortcut handler
  function isCodeMirrorFocused(): boolean {
    const active = document.activeElement;
    if (!active) return false;
    return !!active.closest('.cm-editor');
  }

  function handleAppUndo() {
    if (isCodeMirrorFocused()) return false;
    const scope = lastUndoScope();
    if (scope === 'request' && canUndoRequest()) {
      const label = undoRequest();
      if (label) showNotification('info', `Undo: ${label}`, 2000);
      return true;
    }
    if (scope === 'collection' && canUndoCollection()) {
      const label = undoCollection();
      if (label) showNotification('info', `Undo: ${label}`, 2000);
      return true;
    }
    if (canUndoRequest()) {
      const label = undoRequest();
      if (label) showNotification('info', `Undo: ${label}`, 2000);
      return true;
    }
    if (canUndoCollection()) {
      const label = undoCollection();
      if (label) showNotification('info', `Undo: ${label}`, 2000);
      return true;
    }
    return false;
  }

  function handleAppRedo() {
    if (isCodeMirrorFocused()) return false;
    const scope = lastUndoScope();
    if (scope === 'request' && canRedoRequest()) {
      const label = redoRequest();
      if (label) showNotification('info', `Redo: ${label}`, 2000);
      return true;
    }
    if (scope === 'collection' && canRedoCollection()) {
      const label = redoCollection();
      if (label) showNotification('info', `Redo: ${label}`, 2000);
      return true;
    }
    if (canRedoRequest()) {
      const label = redoRequest();
      if (label) showNotification('info', `Redo: ${label}`, 2000);
      return true;
    }
    if (canRedoCollection()) {
      const label = redoCollection();
      if (label) showNotification('info', `Redo: ${label}`, 2000);
      return true;
    }
    return false;
  }

  function handleAppKeydown(e: KeyboardEvent) {
    // Don't fire shortcuts when a modal is open
    if (pendingInput()) return;

    const shortcuts = resolvedShortcuts();

    // Undo (Ctrl+Z)
    const undoBinding = shortcuts.get('undo');
    if (undoBinding && matchesBinding(e, undoBinding)) {
      if (!isCodeMirrorFocused()) {
        e.preventDefault();
        handleAppUndo();
        return;
      }
      return; // Let CodeMirror handle it
    }

    // Redo (Ctrl+Shift+Z)
    const redoBinding = shortcuts.get('redo');
    if (redoBinding && matchesBinding(e, redoBinding)) {
      if (!isCodeMirrorFocused()) {
        e.preventDefault();
        handleAppRedo();
        return;
      }
      return; // Let CodeMirror handle it
    }

    const newReqBinding = shortcuts.get('newRequest');
    if (newReqBinding && matchesBinding(e, newReqBinding)) {
      e.preventDefault();
      handleNewRequestKind('http');
      return;
    }

    const paletteBinding = shortcuts.get('openCommandPalette');
    if (paletteBinding && matchesBinding(e, paletteBinding)) {
      e.preventDefault();
      showPalette = true;
      return;
    }

    const dupBinding = shortcuts.get('duplicateRequest');
    if (dupBinding && matchesBinding(e, dupBinding)) {
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

    // Ctrl+P: open tab search / quick switch
    if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
      e.preventDefault();
      if (tabSearchOpen()) {
        closeTabSearch();
      } else {
        openTabSearch();
      }
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

    // Capture current singleton state, merge into a new tab
    const snap = saveCurrentSnapshot();
    const newTab = createRequestTab(
      currentTab.label + ' (copy)',
      null, // no requestId for duplicated unsaved request
      currentTab.collectionId,
      currentTab.collectionName,
    );
    newTab.icon = currentTab.icon;
    Object.assign(newTab, snap);
    // Clear identity so it's treated as unsaved
    newTab.requestId = null;
    newTab.context = { panelId: '', requestId: null, collectionId: null, collectionName: null };
    newTab.originalSnapshot = null;
    openTab(newTab);
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

{#if tabSearchOpen()}
  <TabSwitcher />
{/if}

<NotificationStack />

{#if showPalette}
  <CommandPaletteApp
    collections={collections}
    environments={environmentsList()}
    isModal={true}
    onclose={() => { showPalette = false; }}
    onselect={(msg) => {
      showPalette = false;
      const d = msg?.data || msg;
      if (d?.requestId && d?.collectionId) {
        selectRequest(d.collectionId, d.requestId);
        handleOpenCollectionRequest({ requestId: d.requestId, collectionId: d.collectionId });
      }
    }}
  />
{/if}

{#if showConflictBanner}
  <div class="draft-recovery-banner conflict-banner">
    <span>{conflictMessage}</span>
    <button class="draft-recovery-btn recover" onclick={() => handleConflictReload()}>Reload</button>
    <button class="draft-recovery-btn dismiss" onclick={() => handleConflictKeepMine()}>Keep Mine</button>
  </div>
{/if}

{#if showDraftRecovery}
  <div class="draft-recovery-banner">
    <span>Unsaved work from a previous session was found.</span>
    <button class="draft-recovery-btn recover" onclick={() => recoverDrafts()}>Recover</button>
    <button class="draft-recovery-btn dismiss" onclick={() => dismissDraftRecovery()}>Dismiss</button>
  </div>
{/if}

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
            <button class="dropdown-item" onclick={() => handleNewRequestKind('graphql-subscription')}>
              <span class="codicon codicon-radio-tower"></span>
              New GraphQL Subscription
            </button>
            <button class="dropdown-item" onclick={() => handleNewRequestKind('websocket')}>
              <span class="codicon codicon-plug"></span>
              New WebSocket
            </button>
            <button class="dropdown-item" onclick={() => handleNewRequestKind('sse')}>
              <span class="codicon codicon-broadcast"></span>
              New SSE Connection
            </button>
            <button class="dropdown-item" onclick={() => handleNewRequestKind('grpc')}>
              <span class="codicon codicon-server"></span>
              New gRPC Call
            </button>
          </div>
        {/if}
      </div>
    </div>

    <!-- Sidebar Tabs -->
    <div class="sidebar-tabs">
      <Tooltip text="Collections" position="bottom">
        <button class="sidebar-tab-btn" class:active={sidebarView === 'collections'} onclick={() => sidebarView = 'collections'} aria-label="Collections">
          <span class="codicon codicon-folder-library"></span>
        </button>
      </Tooltip>
      <Tooltip text="History" position="bottom">
        <button class="sidebar-tab-btn" class:active={sidebarView === 'history'} onclick={() => sidebarView = 'history'} aria-label="History">
          <span class="codicon codicon-history"></span>
        </button>
      </Tooltip>
      <Tooltip text="Trash" position="bottom">
        <button class="sidebar-tab-btn" class:active={sidebarView === 'trash'} onclick={() => sidebarView = 'trash'} aria-label="Trash">
          <span class="codicon codicon-trash"></span>
          {#if trashCount() > 0}
            <span class="sidebar-trash-badge">{trashCount()}</span>
          {/if}
        </button>
      </Tooltip>
    </div>

    <!-- Sidebar Content -->
    <div class="sidebar-content">
      {#if sidebarView === 'collections'}
        <CollectionsTab
          {postMessage}
          {dataLoaded}
          onNewProject={handleNewProject}
          onOpenFolder={handleOpenFolder}
          onImportCollection={handleImportAuto}
          onLoadSampleCollection={handleLoadSampleCollection}
          {projectPath}
          onCloseProject={handleCloseProject}
          {recentProjects}
          onOpenRecentProject={handleOpenRecentProject}
          onClearRecentProjects={() => messageBus.send({ type: 'clearRecentProjectsCmd' } as any)}
        />
      {:else if sidebarView === 'history'}
        <HistoryTab {postMessage} />
      {:else if sidebarView === 'trash'}
        <TrashTab />
      {/if}
    </div>
  </aside>

  <!-- Sidebar Resizer -->
  <PanelSplitter orientation="horizontal" target="sidebar" />

  <!-- Main Content Area -->
  <main class="content">
    <UpdateBanner
      show={showUpdateBanner()}
      version={updateVersion()}
      isDownloading={downloading()}
      progress={downloadProgress()}
      preDownloaded={preDownloaded()}
      oninstall={installUpdate}
      ondismiss={dismissUpdate}
    />
    <ActionBar collectionId={collectionId} {collections} {postMessage} />
    {#if currentView === 'main'}
      <TabBar />
      {#if tabsList().length === 0}
        <WelcomeScreen
          {recentProjects}
          isFirstRun={isFirstRun()}
          iconSrc={noutoIconUrl}
          onNewProject={handleNewProject}
          onOpenFolder={handleOpenFolder}
          onImportCollection={handleImportAuto}
          onLoadSampleCollection={handleLoadSampleCollection}
          onStartFromScratch={handleStartFromScratch}
          onOpenRecentProject={handleOpenRecentProject}
          onRemoveRecentProject={handleRemoveRecentProject}
        />
      {/if}
      {#if activeTabFn()?.type === 'settings'}
        <SettingsPage standalone onclose={() => closeTab(activeTabIdFn()!)} />
      {:else if activeTabFn()?.type === 'environments'}
        <EnvironmentsPanel />
      {:else if activeTabFn()?.type === 'collection-settings'}
        <CollectionSettingsPanel {postMessage} />
      {:else}
        <div style:display={tabsList().length === 0 ? 'none' : 'contents'}>
          <MainPanel
            collectionId={activeTabFn()?.collectionId ?? collectionId}
            collectionName={activeTabFn()?.collectionName ?? collectionName}
            {collections}
            {showSaveNudge}
            {postMessage}
            hideActionBar
            onDismissNudge={() => { showSaveNudge = false; nudgeDismissed = true; }}
            onSaveToCollection={() => { messageBus.send({ type: 'getCollections' }); }}
          />
        </div>
      {/if}
    {:else if currentView === 'runner'}
      <CollectionRunnerPanel {postMessage} />
    {:else if currentView === 'mock'}
      <MockServerPanel {postMessage} />
    {:else if currentView === 'benchmark'}
      <BenchmarkPanel {postMessage} />
    {:else if currentView === 'json-explorer'}
      <div class="json-explorer-view">
        <div class="json-explorer-header">
          <button class="json-explorer-back" onclick={handleCloseJsonExplorer}>
            <span class="codicon codicon-arrow-left"></span>
            Back to Requests
          </button>
        </div>
        {#if jsonExplorerReady}
          <div class="json-explorer-content">
            <JsonExplorerPanel />
          </div>
        {/if}
      </div>
    {/if}
  </main>
</div>

{#if projectPath}
  <div class="status-bar">
    <button class="status-bar-item" onclick={handleOpenFolder} title={projectPath}>
      <span class="codicon codicon-folder"></span>
      {projectPath.replace(/\\/g, '/').split('/').pop() || projectPath}
    </button>
  </div>
{/if}

<style>
  .draft-recovery-banner {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px;
    background: var(--hf-notifications-background, #1e1e2e);
    border-bottom: 1px solid var(--hf-notifications-border, #444);
    color: var(--hf-notifications-foreground, #ccc);
    font-size: 13px;
  }
  .draft-recovery-btn {
    padding: 4px 12px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  }
  .draft-recovery-btn.recover {
    background: var(--hf-button-background, #007acc);
    color: var(--hf-button-foreground, #fff);
  }
  .draft-recovery-btn.dismiss {
    background: transparent;
    color: var(--hf-foreground, #ccc);
    border: 1px solid var(--hf-input-border, #555);
  }

  .app-container {
    display: grid;
    grid-template-rows: 1fr;
    width: 100%;
    flex: 1;
    min-height: 0;
    min-width: 0;
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
    min-width: 160px;
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--hf-sideBar-border);
  }

  .sidebar-tabs {
    display: flex;
    border-bottom: 1px solid var(--hf-panel-border);
    flex-shrink: 0;
  }

  .sidebar-tabs :global(.tooltip-wrapper) {
    flex: 1;
  }

  .sidebar-tab-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 8px 6px;
    border: none;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--hf-foreground);
    opacity: 0.6;
    font-size: 16px;
    cursor: pointer;
  }

  .sidebar-tab-btn:hover {
    opacity: 0.9;
    background: var(--hf-list-hoverBackground);
  }

  .sidebar-tab-btn.active {
    opacity: 1;
    border-bottom-color: var(--hf-focusBorder);
  }

  .sidebar-trash-badge {
    background: var(--hf-badge-background, #4d4d4d);
    color: var(--hf-badge-foreground, #fff);
    font-size: 9px;
    padding: 1px 4px;
    border-radius: 8px;
    font-weight: 600;
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
    min-width: 0;
  }

  /* codicons */
  .codicon {
    font-family: 'codicon', monospace;
    font-size: 16px;
  }

  .status-bar {
    display: flex;
    align-items: center;
    height: 22px;
    padding: 0 8px;
    background: var(--hf-statusBar-background, #007acc);
    color: var(--hf-statusBar-foreground, #fff);
    font-size: 12px;
    flex-shrink: 0;
  }

  .status-bar-item {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 6px;
    height: 100%;
    background: transparent;
    border: none;
    color: inherit;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .status-bar-item:hover {
    background: rgba(255, 255, 255, 0.12);
  }

  .status-bar-item .codicon {
    font-size: 14px;
  }

  /* JSON Explorer view */
  .json-explorer-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .json-explorer-header {
    display: flex;
    align-items: center;
    padding: 6px 12px;
    border-bottom: 1px solid var(--hf-panel-border);
    background: var(--hf-editor-background);
    flex-shrink: 0;
  }

  .json-explorer-back {
    display: flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: none;
    color: var(--hf-textLink-foreground);
    cursor: pointer;
    font-size: 13px;
    padding: 4px 8px;
    border-radius: 4px;
  }

  .json-explorer-back:hover {
    background: var(--hf-toolbar-hoverBackground);
  }

  .json-explorer-content {
    flex: 1;
    overflow: hidden;
  }

  .json-explorer-content :global(.json-explorer-panel) {
    height: 100%;
  }

</style>
