<script lang="ts">
  // Desktop App - Single-window SPA merging sidebar + main/runner/mock/benchmark views
  import { onMount, tick } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { isLinux } from './lib/platform';
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
  import TopToolbar from './components/TopToolbar.svelte';
  import WorkspaceSettingsDialog from './components/WorkspaceSettingsDialog.svelte';
  import { loadOnboardingState, isFirstRun, completeOnboarding, markSampleLoaded, isSampleLoaded, trackRequest } from '@nouto/ui/stores/onboarding.svelte';
  import { checkForUpdates, showUpdateBanner, updateVersion, downloading, downloadProgress, installUpdate, dismissUpdate, preDownloaded } from './lib/updater.svelte';
  import { createSampleCollection, createSampleEnvironment } from '@nouto/core/data/sample-collection';

  // Import stores from @nouto/ui
  import { collections as collectionsStore, initCollections, addRequestToCollection, addCollection, setCollections, findItemRecursive, updateRequest, selectRequest, revealActiveRequest } from '@nouto/ui/stores/collections.svelte';
  import { loadEnvironments, loadEnvFileVariables, updateCollectionScopedVariables, environments as environmentsList, activeEnvironmentId, activeEnvironment, globalVariables, updateGlobalVariables, updateEnvironmentVariables, addEnvironment, setEnvironments, setActiveEnvironment, substituteVariables, setProjectPath } from '@nouto/ui/stores/environment.svelte';
  import { setResponse, setLoading, clearResponse, setMethod, setUrl, setParams, setHeaders, setAuth, setBody, setAssertions, setAuthInheritance, setScriptInheritance, setScripts, setDescription, setUrlAndParams, setDownloadProgress, setSsl, setProxy, setTimeout as setRequestTimeout, setRedirects, setPathParams, setGrpc, patchGrpc, request as requestStore, setOriginalSnapshot } from '@nouto/ui/stores';
  import { storeResponse } from '@nouto/ui/stores/responseContext.svelte';
  import { setAssertionResults, clearAssertionResults } from '@nouto/ui/stores/assertions.svelte';
  import { setScriptOutput, clearScriptOutput } from '@nouto/ui/stores/scripts.svelte';
  import { setWsStatus, addWsMessage } from '@nouto/ui/stores/websocket.svelte';
  import { setSSEStatus, addSSEEvent } from '@nouto/ui/stores/sse.svelte';
  import { setConnectionMode, ui } from '@nouto/ui/stores/ui.svelte';
  import { loadSettings, resolvedShortcuts, setAppVersion, setIconUrl } from '@nouto/ui/stores/settings.svelte';
  import { initTrash, autoPurgeTrash, trashCount } from '@nouto/ui/stores/trash.svelte';
  import { initHistory, setHistoryStats, setHistoryStatsLoading } from '@nouto/ui/stores/history.svelte';
  import { matchesBinding } from '@nouto/ui/lib/shortcuts';
  import { undoRequest, redoRequest, canUndoRequest, canRedoRequest, initRequestUndo, lastUndoScope, clearRequestUndoStack } from '@nouto/ui/stores/requestUndo.svelte';
  import { undoCollection, redoCollection, canUndoCollection, canRedoCollection, initCollectionUndo } from '@nouto/ui/stores/collectionUndo.svelte';
  import { setCookieJarData, loadCookieJars, activeCookieJar } from '@nouto/ui/stores/cookieJar.svelte';
  import { showNotification, setPendingInput, clearPendingInput, pendingInput } from '@nouto/ui/stores/notifications.svelte';
  import { initRunner } from '@nouto/ui/stores/collectionRunner.svelte';
  import TabBar from '@nouto/ui/components/shared/TabBar.svelte';
  import TabSwitcher from '@nouto/ui/components/shared/TabSwitcher.svelte';
  import SettingsPage from '@nouto/ui/components/shared/SettingsPage.svelte';
  import EnvironmentsPanel from '@nouto/ui/components/environments/EnvironmentsPanel.svelte';
  import CollectionSettingsDialog from '@nouto/ui/components/settings/CollectionSettingsDialog.svelte';
  import { type SettingsInitData } from '@nouto/ui/stores/collectionSettings.svelte';
  import {
    tabs as tabsList, activeTabId as activeTabIdFn, activeTab as activeTabFn,
    openTab, closeTab, switchTab as switchTabFn, updateTabLabel, setTabDirty, setTabIcon,
    setTabRequestId, findTabByRequestId, findSingletonTab,
    saveCurrentSnapshot,
    createRequestTab, createSingletonTab, loadFromStorage as loadTabsFromStorage,
    tabSearchOpen, openTabSearch, closeTabSearch,
  } from '@nouto/ui/stores/tabs.svelte';
  import { setMockStatus, addLog as addMockLog } from '@nouto/ui/stores/mockServer.svelte';
  import { benchmarkState, updateProgress as updateBenchmarkProgress, addIteration as addBenchmarkIteration, setCompleted as setBenchmarkCompleted, setCancelled as setBenchmarkCancelled } from '@nouto/ui/stores/benchmark.svelte';
  import { setGrpcProtoLoaded, setGrpcProtoError, setGrpcConnectionStart, addGrpcEvent, setGrpcConnectionEnd, setScannedDirFiles, grpcMethodType } from '@nouto/ui/stores/grpc.svelte';
  import { setGqlSubStatus, addGqlSubEvent } from '@nouto/ui/stores/graphqlSubscription.svelte';
  import { setCurrentSession, setSavedSessions, setRecordingState, setReplayProgress } from '@nouto/ui/stores/wsRecording.svelte';

  // Sidebar split ratio from ui store
  const sidebarSplitRatio = $derived(ui.sidebarSplitRatio || 0.2); // Default 20% width

  import { getDefaultsForRequestKind, isFolder, isRequest, generateId, deriveNameFromUrl, type SavedRequest, type Collection, type ConnectionMode } from '@nouto/core';
  import { DraftsCollectionService } from '@nouto/core/services/RecentCollectionService';
  import type { IncomingMessage } from '@nouto/transport';

  import { initTheme } from '@nouto/ui/stores/theme.svelte';
  import { open as shellOpen } from '@tauri-apps/plugin-shell';

  // Extracted modules
  import { showDraftRecovery, pendingDrafts, saveDraftDebounced, clearDraftForTab, initDraftRecovery, recoverDrafts, dismissDraftRecovery } from './lib/draft-store.svelte';
  import { resolveLocalConfirm, resolveLocalQuickPick, resolveLocalInputBox } from './lib/modal-store.svelte';
  import {
    initCollectionCrud, handleNewRequestKind, handleDeleteCollection, handleDeleteRequest,
    handleDeleteFolder, handleDuplicateCollection, handleDuplicateFolder, handleBulkDelete,
    handleBulkMovePickTarget, handleCreateRequest, handleOpenCollectionRequest,
    handleRunCollectionRequest, handleClearDrafts, handleRenameCollection, handleRenameFolder,
    handleCreateFolder, handleOpenCollectionSettings, handleOpenFolderSettings,
    handleSaveCollectionSettings, handleSaveCollectionRequest, handleRevertRequest,
    loadNewRequestIntoForm,
  } from './lib/collection-crud.svelte';
  import {
    initImportExport, handleExportNative, handleExportAllNative, handleExportFolder,
    handleExportPostman, handleExportHar, handleExportBackup, handleImportBackup,
    handleImportAuto, handleImportCurl, handleImportFromUrl, handleExportHistory,
    handleImportHistory, handleImportPostmanEnvironment, handleExportBenchmarkResults,
    handleImportCollectionAsMocks,
  } from './lib/import-export.svelte';

  // View routing
  type View = 'main' | 'runner' | 'mock' | 'benchmark' | 'json-explorer';
  let currentView = $state<View>('main');

  // App state
  let messageBus: ReturnType<typeof getMessageBus>;
  let appLoading = $state(true);
  let collections = $state<Collection[]>([]);
  let dataLoaded = $state(false);
  let loadGeneration = 0;
  type SidebarView = 'collections' | 'history' | 'trash';
  let sidebarView = $state<SidebarView>('collections');

  // Icon bar badge state
  const hasNoEnv = $derived(environmentsList().length > 0 && !activeEnvironment());
  const envTooltip = $derived(activeEnvironment() ? `Environment: ${activeEnvironment()!.name}` : 'Environments');

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
  let workspaceSettingsOpen = $state(false);
  let confirmClearHistoryOpen = $state(false);

  // Conflict banner state
  let showConflictBanner = $state(false);
  let conflictMessage = $state('');

  // Draft auto-save state is managed by ./lib/draft-store.svelte

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

  // Collection/folder settings dialog state (non-null = dialog open)
  let collectionSettingsDialogData = $state<SettingsInitData | null>(null);

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

    // Add 1px border on Linux to replace removed window decorations
    if (isLinux()) {
      document.getElementById('app')?.classList.add('linux-frame');
    }

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
              messageBus?.send({ type: 'oauthDeepLinkCallback', data: { code, state } });
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

    // Initialize extracted modules with dependency injection
    initCollectionCrud({
      messageBus,
      getCollections: () => collections,
      setCollections: (c) => { collections = c; },
      getCollectionId: () => collectionId,
      setCollectionId: (id) => { collectionId = id; },
      getCollectionName: () => collectionName,
      setCollectionName: (name) => { collectionName = name; },
      getRequestId: () => requestId,
      setRequestId: (id) => { requestId = id; },
      getPanelId: () => panelId,
      setCurrentView: (v) => { currentView = v as View; },
      setShowSaveNudge: (v) => { showSaveNudge = v; },
      setNudgeDismissed: (v) => { nudgeDismissed = v; },
      getCollectionSettingsDialogData: () => collectionSettingsDialogData,
      setCollectionSettingsDialogData: (v) => { collectionSettingsDialogData = v; },
    });
    initImportExport({
      messageBus,
      getCollections: () => collections,
      setCollections: (c) => { collections = c; },
    });

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
    initDraftRecovery();

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
        setProjectPath(projectPath);
        loadGeneration = message.data?.generation ?? 0;
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
        const { entries = [], total = 0, hasMore = false } = message.data || {};
        initHistory({ entries, total, hasMore });
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
        // Discard stale results from a previous load_data call
        if ((message.data?.generation ?? 0) !== loadGeneration) break;
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
          // Add to Drafts for unsaved requests or requests already in Drafts
          if (!collectionId || collectionId === DraftsCollectionService.DRAFTS_ID) {
            const tab = activeTabFn();
            const responseMeta = {
              status: message.data.status,
              duration: message.data.duration,
              size: message.data.size,
            };
            const currentCollections = $state.snapshot(collectionsStore());
            const alreadyInDrafts = DraftsCollectionService.updateDraftResponseMeta(
              currentCollections,
              requestStore.url,
              requestStore.method,
              requestStore.grpc,
              responseMeta,
            );
            if (alreadyInDrafts) {
              setCollections(currentCollections);
              syncCollections();
            } else {
              const updated = DraftsCollectionService.addToDrafts(
                currentCollections,
                {
                  method: requestStore.method,
                  url: requestStore.url,
                  params: requestStore.params,
                  headers: requestStore.headers,
                  auth: requestStore.auth,
                  body: requestStore.body,
                  connectionMode: tab?.connectionMode,
                  grpc: requestStore.grpc,
                },
                responseMeta,
              );
              setCollections(updated);
              messageBus.send({ type: 'saveCollections', data: $state.snapshot(collectionsStore()) } as any);
              syncCollections();
            }
          } else if (collectionId && requestId) {
            // Update saved collection request with response metadata
            updateRequest(requestId, {
              lastResponseStatus: message.data.status,
              lastResponseDuration: message.data.duration,
              lastResponseSize: message.data.size,
              lastResponseTime: new Date().toISOString(),
            });
          }
        }
        // Auto-refresh JSON Explorer if it's open for this request
        if (currentView === 'json-explorer' && jsonExplorerRequestId) {
          const tab = activeTabFn();
          if (tab?.requestId === jsonExplorerRequestId) {
            updateJsonData(message.data.data, new Date().toISOString(), {
              requestMethod: requestStore.method,
              requestUrl: requestStore.url,
              requestName: tab?.label || '',
            });
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
      case 'wsRecordingState':
        setRecordingState(message.data.state);
        break;
      case 'wsReplayProgress':
        if (message.data.state === 'complete') {
          setReplayProgress(null);
        } else {
          setReplayProgress({ index: message.data.index, total: message.data.total });
        }
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
        openSettingsTab(message.data?.section);
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
      case 'collectionRunWarning':
      case 'runnerHistoryList':
      case 'runnerHistoryDetail':
      case 'dataFileLoaded':
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

      case 'revealActiveRequest': {
        revealActiveRequest(message.data?.requestId);
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
        setProjectPath(projectPath);
        break;
      }

      case 'projectClosed': {
        projectPath = null;
        setProjectPath(null);
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

  function handleOpenDocs() {
    shellOpen('https://github.com/frostybee/nouto');
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

  function handleClearSendHistory() {
    confirmClearHistoryOpen = true;
  }

  function confirmClearSendHistory() {
    messageBus.send({ type: 'clearHistory' });
    confirmClearHistoryOpen = false;
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

  // Sync local collections state from store
  function syncCollections() {
    collections = collectionsStore();
  }

  // --- Export / Import handlers are in ./lib/import-export.svelte ---
  // --- CRUD handlers are in ./lib/collection-crud.svelte ---

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
      case 'closeSettingsPanel':
        collectionSettingsDialogData = null;
        break;
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
        handleRevertRequest(data, loadRequest);
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

    // Ctrl+F: suppress native WebView find bar (CodeMirror handles its own search)
    if ((e.ctrlKey || e.metaKey) && e.key === 'f' && !isCodeMirrorFocused()) {
      e.preventDefault();
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

  function openSettingsTab(section?: string) {
    const existing = findSingletonTab('settings');
    if (existing) {
      switchTabFn(existing.id);
    } else {
      openTab(createSingletonTab('settings', 'Settings'));
    }
    currentView = 'main';
    if (section) {
      tick().then(() => {
        window.dispatchEvent(new CustomEvent('nouto:focusSection', { detail: section }));
      });
    }
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

{#if showDraftRecovery()}
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

{#if collectionSettingsDialogData}
  {#key collectionSettingsDialogData.collectionId + (collectionSettingsDialogData.folderId ?? '')}
    <CollectionSettingsDialog
      initialData={collectionSettingsDialogData}
      onsave={(data) => handleSaveCollectionSettings(data)}
      onclose={() => { collectionSettingsDialogData = null; }}
    />
  {/key}
{/if}

<TopToolbar
  iconUrl={noutoIconUrl}
  onSearch={() => { showPalette = true; }}
  onSettings={() => openSettingsTab()}
  onOpenFolder={handleOpenFolder}
  onNewProject={handleNewProject}
  onOpenRecent={handleOpenRecentProject}
  onRemoveRecent={handleRemoveRecentProject}
  onCloseProject={handleCloseProject}
  onOpenWorkspaceSettings={() => { workspaceSettingsOpen = true; }}
  onClearHistory={handleClearSendHistory}
/>

<WorkspaceSettingsDialog
  open={workspaceSettingsOpen}
  onclose={() => { workspaceSettingsOpen = false; }}
/>

<ConfirmDialog
  open={confirmClearHistoryOpen}
  title="Clear send history?"
  message="This clears all request history. History is currently global across workspaces."
  confirmLabel="Clear"
  variant="danger"
  onconfirm={confirmClearSendHistory}
  oncancel={() => { confirmClearHistoryOpen = false; }}
/>

<div class="app-container" style="grid-template-columns: {sidebarSplitRatio}fr 4px {1 - sidebarSplitRatio}fr;">
  <!-- Sidebar -->
  <aside class="sidebar">
    <!-- Action Rail -->
    <div class="action-rail">
      <div class="rail-top">
        <Tooltip text="Requests" position="right">
          <button class="rail-btn" class:active={currentView === 'main'} onclick={() => switchView('main')} aria-label="Requests">
            <span class="codicon codicon-request"></span>
          </button>
        </Tooltip>
        <Tooltip text="Runner" position="right">
          <button class="rail-btn" class:active={currentView === 'runner'} onclick={() => switchView('runner')} aria-label="Runner">
            <span class="codicon codicon-play"></span>
          </button>
        </Tooltip>
        <Tooltip text="Mock Server" position="right">
          <button class="rail-btn" class:active={currentView === 'mock'} onclick={() => switchView('mock')} aria-label="Mock Server">
            <span class="codicon codicon-server"></span>
          </button>
        </Tooltip>
        <Tooltip text="Benchmark" position="right">
          <button class="rail-btn" class:active={currentView === 'benchmark'} onclick={() => switchView('benchmark')} aria-label="Benchmark">
            <span class="codicon codicon-pulse"></span>
          </button>
        </Tooltip>
        <div class="rail-divider"></div>
        <Tooltip text={envTooltip} position="right">
          <button class="rail-btn" onclick={openEnvironmentsTab} aria-label="Environments">
            <span class="codicon codicon-symbol-variable"></span>
            {#if hasNoEnv}
              <span class="rail-badge rail-badge-warning"></span>
            {/if}
          </button>
        </Tooltip>
        <Tooltip text="Open Project Folder" position="right">
          <button class="rail-btn" onclick={() => messageBus.send({ type: 'openProjectDir' } as any)} aria-label="Open Project Folder">
            <span class="codicon codicon-folder-opened"></span>
          </button>
        </Tooltip>
      </div>
      <div class="rail-bottom">
        <Tooltip text="Settings" position="right">
          <button class="rail-btn" onclick={() => openSettingsTab('appearance')} aria-label="Settings">
            <span class="codicon codicon-gear"></span>
          </button>
        </Tooltip>
        <Tooltip text="About" position="right">
          <button class="rail-btn" onclick={() => { openSettingsTab('about'); }} aria-label="About">
            <span class="codicon codicon-info"></span>
          </button>
        </Tooltip>
      </div>
    </div>

    <div class="sidebar-main">
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
    <div class="sidebar-tab-bar">
      <Tooltip text="Collections" position="bottom">
        <button class="sidebar-tab" class:active={sidebarView === 'collections'} onclick={() => sidebarView = 'collections'} aria-label="Collections">
          <span class="codicon codicon-folder-library"></span>
        </button>
      </Tooltip>
      <Tooltip text="History" position="bottom">
        <button class="sidebar-tab" class:active={sidebarView === 'history'} onclick={() => sidebarView = 'history'} aria-label="History">
          <span class="codicon codicon-history"></span>
        </button>
      </Tooltip>
      <Tooltip text="Trash" position="bottom">
        <button class="sidebar-tab" class:active={sidebarView === 'trash'} onclick={() => sidebarView = 'trash'} aria-label="Trash">
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
    </div><!-- /.sidebar-main -->
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
          {projectPath}
          collectionCount={collections.length}
          environmentCount={environmentsList().length}
          onNewProject={handleNewProject}
          onOpenFolder={handleOpenFolder}
          onImportCollection={handleImportAuto}
          onLoadSampleCollection={collections.some(c => c.name === 'Sample Collection (httpbin.org)') ? undefined : handleLoadSampleCollection}
          onStartFromScratch={handleStartFromScratch}
          onNewRequest={() => handleNewRequestKind('http')}
          onOpenDocs={handleOpenDocs}
          onOpenEnvironments={openEnvironmentsTab}
          onOpenRecentProject={handleOpenRecentProject}
          onRemoveRecentProject={handleRemoveRecentProject}
        />
      {/if}
      {#if activeTabFn()?.type === 'settings'}
        <SettingsPage standalone onclose={() => closeTab(activeTabIdFn()!)} />
      {:else if activeTabFn()?.type === 'environments'}
        <EnvironmentsPanel />
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

<style>
  .draft-recovery-banner {
    position: fixed;
    top: 36px;
    left: 0;
    right: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px;
    background: var(--hf-notifications-background, var(--hf-editor-background));
    border-bottom: 1px solid var(--hf-notifications-border, var(--hf-panel-border));
    color: var(--hf-notifications-foreground, var(--hf-editor-foreground));
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
    background: var(--hf-button-background);
    color: var(--hf-button-foreground, var(--hf-editor-foreground));
  }
  .draft-recovery-btn.dismiss {
    background: transparent;
    color: var(--hf-foreground, var(--hf-editor-foreground));
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
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
    flex-direction: row;
    overflow: hidden;
    min-width: 200px;
  }

  /* Action Rail */
  .action-rail {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px 6px;
    flex-shrink: 0;
    border-right: 1px solid var(--hf-panel-border);
  }

  .rail-top,
  .rail-bottom {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .rail-bottom {
    margin-top: auto;
    padding-top: 8px;
  }

  .action-rail :global(.tooltip-wrapper) {
    display: flex;
  }

  .rail-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: var(--hf-foreground);
    cursor: pointer;
    opacity: var(--hf-icon-opacity);
    transition: opacity 0.15s, background 0.15s;
    position: relative;
  }

  .rail-btn:hover {
    opacity: var(--hf-icon-opacity-hover);
    background: var(--hf-list-hoverBackground);
  }

  .rail-btn.active {
    opacity: var(--hf-icon-opacity-active);
    background: var(--hf-list-activeSelectionBackground, rgba(255, 255, 255, 0.08));
  }

  .rail-btn.active::before {
    content: '';
    position: absolute;
    left: -6px;
    top: 4px;
    bottom: 4px;
    width: 3px;
    border-radius: 2px;
    background: var(--hf-focusBorder, var(--hf-button-background));
  }

  .rail-badge {
    position: absolute;
    border: 1px solid var(--hf-sideBar-background, var(--hf-editor-background));
    pointer-events: none;
  }

  .rail-badge-warning {
    top: 2px;
    right: 2px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--hf-notificationsWarningIcon-foreground, #cca700);
  }

  .rail-btn .codicon {
    font-size: 18px;
  }

  .rail-divider {
    width: 24px;
    height: 1px;
    background: var(--hf-panel-border);
    margin: 6px 0;
  }

  /* Sidebar Main */
  .sidebar-main {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }

  /* Sidebar Tab Bar */
  .sidebar-tab-bar {
    display: flex;
    border-bottom: 1px solid var(--hf-panel-border);
    flex-shrink: 0;
  }

  .sidebar-tab-bar > :global(.tooltip-wrapper) {
    flex: 1;
    display: flex;
  }

  .sidebar-tab {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 8px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--hf-foreground);
    cursor: pointer;
    opacity: var(--hf-icon-opacity);
    transition: opacity 0.15s, border-color 0.15s;
    user-select: none;
  }

  .sidebar-tab .codicon {
    font-size: 15px;
  }

  .sidebar-tab:hover {
    opacity: var(--hf-icon-opacity-hover);
    background: var(--hf-list-hoverBackground);
  }

  .sidebar-tab.active {
    opacity: var(--hf-icon-opacity-active);
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

  .new-request-bar {
    padding: 8px 8px 4px;
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
