<script lang="ts">
  import { onMount, tick } from 'svelte';
  import MainPanel from './components/main-panel/MainPanel.svelte';
  import { setResponse, setMethod, setUrl, setParams, setHeaders, setAuth, setBody, isLoading, loadEnvironments, clearResponse, loadEnvFileVariables, setAssertions, setAuthInheritance } from './stores';
  import { environments, activeEnvironmentId, globalVariables, updateEnvironmentVariables, updateGlobalVariables } from './stores/environment';
  import { setScripts, setDescription, setUrlAndParams, setSsl, setPathParams, isDirty, originalRequest, setOriginalSnapshot, clearOriginalSnapshot, setRequestContext, clearRequestContext } from './stores/request';
  import type { RequestState } from './stores/request';
  import { loadSettings, settingsOpen } from './stores/settings';
  import { request } from './stores/request';
  import { onMessage, postMessage, getState, setState } from './lib/vscode';
  import { resolveRequestVariables } from './lib/http-helpers';
  import { storeResponse } from './stores/responseContext';
  import { setAssertionResults, clearAssertionResults } from './stores/assertions';
  import { setScriptOutput, clearScriptOutput } from './stores/scripts';
  import { setWsStatus, addWsMessage } from './stores/websocket';
  import { setSSEStatus, addSSEEvent } from './stores/sse';
  import { setCookieJarData } from './stores/cookieJar';
  import { setConflict, clearConflict, conflictState } from './stores/conflict';

  import { initHistory, historyStats, historyStatsLoading } from './stores/history';
  import { ui, setConnectionMode, setPanelLayout, setPanelSplitRatio, setHistoryDrawerOpen, setHistoryDrawerHeight } from './stores/ui';
  import type { PanelLayout } from './stores/ui';
  import type { SavedRequest, ConnectionMode } from './types';
  import { get } from 'svelte/store';

  import type { Collection } from './types';

  // Panel identity - set when the extension sends loadRequest
  let panelId: string | null = null;
  let requestId: string | null = null;
  let collectionId: string | null = $state<string | null>(null);
  let collectionName: string | null = $state<string | null>(null);
  let collections: Collection[] = $state([]);
  let draftDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Nudge banner state
  let showSaveNudge = $state(false);
  let nudgeDismissed = $state(false);

  // Save toast feedback
  let showSaveToast = $state(false);

  // Command palette modal state
  let showPalette = $state(false);
  let paletteCollections: Collection[] = $state([]);
  let paletteEnvironments = $state<any>(null);

  onMount(() => {
    // Restore webview state on revival (VS Code reload)
    const savedState = getState<{
      panelId: string;
      requestId: string | null;
      collectionId: string | null;
      collectionName?: string | null;
      request: SavedRequest;
      originalRequest?: RequestState | null;
      connectionMode?: string;
      panelLayout?: PanelLayout;
      panelSplitRatio?: number;
      historyDrawerOpen?: boolean;
      historyDrawerHeight?: number;
    }>();
    if (savedState?.request) {
      panelId = savedState.panelId;
      requestId = savedState.requestId;
      collectionId = savedState.collectionId;
      collectionName = savedState.collectionName ?? null;
      loadRequest(savedState.request);
      if (savedState.connectionMode) {
        setConnectionMode(savedState.connectionMode as ConnectionMode);
      }
      if (savedState.panelLayout) {
        setPanelLayout(savedState.panelLayout);
      }
      if (savedState.panelSplitRatio !== undefined) {
        setPanelSplitRatio(savedState.panelSplitRatio);
      }
      if (savedState.historyDrawerOpen !== undefined) {
        setHistoryDrawerOpen(savedState.historyDrawerOpen);
      }
      if (savedState.historyDrawerHeight !== undefined) {
        setHistoryDrawerHeight(savedState.historyDrawerHeight);
      }
      // Restore dirty state tracking
      if (savedState.originalRequest) {
        setOriginalSnapshot(savedState.originalRequest);
      }
      if (savedState.collectionId && savedState.requestId && panelId) {
        setRequestContext({
          panelId,
          requestId: savedState.requestId,
          collectionId: savedState.collectionId,
          collectionName: savedState.collectionName || '',
        });
      }
    }

    // Subscribe to request store changes and persist as draft
    const unsubscribe = request.subscribe((currentRequest) => {
      if (!panelId) return;

      // Debounce setState and draftUpdated messages (1.5s)
      if (draftDebounceTimer) clearTimeout(draftDebounceTimer);
      draftDebounceTimer = setTimeout(() => {
        const requestData: SavedRequest = {
          id: requestId || '',
          name: '',
          method: currentRequest.method,
          url: currentRequest.url,
          params: currentRequest.params,
          pathParams: currentRequest.pathParams,
          headers: currentRequest.headers,
          auth: currentRequest.auth,
          body: currentRequest.body,
          assertions: currentRequest.assertions,
          authInheritance: currentRequest.authInheritance,
          scripts: currentRequest.scripts,
          description: currentRequest.description || undefined,
          createdAt: '',
          updatedAt: new Date().toISOString(),
        };

        // Persist in webview state (survives reload)
        setState({ panelId, requestId, collectionId, collectionName, connectionMode: get(ui).connectionMode, request: requestData, originalRequest: get(originalRequest) });

        // Notify extension for draft/collection persistence
        postMessage({
          type: 'draftUpdated',
          data: { panelId: panelId!, requestId, collectionId, request: requestData },
        });
      }, 1500);
    });

    // Subscribe to dirty state changes and notify extension
    const dirtyUnsub = isDirty.subscribe((dirty) => {
      if (!panelId) return;
      postMessage({
        type: 'dirtyStateChanged',
        data: { panelId: panelId!, isDirty: dirty },
      });
    });

    // Listen for messages from the extension
    const unsubscribeMessages = onMessage(async (message) => {
      switch (message.type) {
        case 'loadRequest': {
          // Extract panel identity metadata if present
          if ((message.data as any)._panelId) {
            panelId = (message.data as any)._panelId;
            requestId = (message.data as any)._requestId ?? null;
            collectionId = (message.data as any)._collectionId ?? null;
            collectionName = (message.data as any)._collectionName ?? null;
          }
          loadRequest(message.data);
          // Take snapshot for dirty tracking if this is a collection request
          if (collectionId && requestId && panelId) {
            await tick();
            setOriginalSnapshot(get(request));
            setRequestContext({ panelId, requestId, collectionId, collectionName: collectionName || '' });
          } else {
            clearOriginalSnapshot();
            clearRequestContext();
          }
          // Fetch collections for the save picker
          postMessage({ type: 'getCollections' });
          break;
        }
        case 'updateRequestIdentity':
          requestId = message.data.requestId;
          collectionId = message.data.collectionId;
          collectionName = message.data.collectionName ?? null;
          showSaveNudge = false;
          // Take snapshot after identity change
          if (collectionId && requestId && panelId) {
            await tick();
            setOriginalSnapshot(get(request));
            setRequestContext({ panelId, requestId, collectionId, collectionName: collectionName || '' });
          }
          break;
        case 'requestResponse':
          setResponse(message.data);
          // Update assertion results if present
          if (message.data.assertionResults) {
            setAssertionResults(message.data.assertionResults);
          }
          // Show save nudge for unsaved requests on first successful response
          if (!collectionId && !nudgeDismissed && !message.data.error) {
            showSaveNudge = true;
          }
          break;
        case 'requestCancelled':
          isLoading.set(false);
          break;
        case 'loadEnvironments':
          loadEnvironments(message.data);
          break;
        case 'collections':
          // Update collections for save picker
          collections = message.data || [];
          break;
        case 'requestLinkedToCollection':
          // Panel has been linked to a collection
          requestId = message.data.requestId;
          collectionId = message.data.collectionId;
          collectionName = message.data.collectionName;
          showSaveNudge = false;
          // Take snapshot after linking
          if (panelId && requestId && collectionId) {
            await tick();
            setOriginalSnapshot(get(request));
            setRequestContext({ panelId, requestId, collectionId, collectionName: collectionName || '' });
          }
          break;
        case 'collectionRequestSaved':
          // Save succeeded: re-snapshot current state as new original (clears dirty)
          setOriginalSnapshot(get(request));
          showSaveToast = true;
          break;
        case 'originalRequestLoaded':
          // Revert: load original request data and re-snapshot
          loadRequest(message.data);
          await tick();
          setOriginalSnapshot(get(request));
          break;
        case 'requestUnlinked':
          // Request was unlinked from collection
          collectionId = null;
          collectionName = null;
          requestId = null;
          clearOriginalSnapshot();
          clearRequestContext();
          break;
        case 'storeResponseContext':
          // Store response for request chaining ({{$response.body.xxx}})
          storeResponse(message.data.requestId, message.data.response, message.data.requestName);
          break;
        case 'loadSettings':
          loadSettings(message.data);
          break;
        case 'openSettings':
          settingsOpen.set(true);
          break;
        case 'securityWarning':
          console.warn('[HiveFetch]', message.data.message);
          break;
        case 'envFileVariablesUpdated':
          loadEnvFileVariables(message.data);
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
        case 'setVariables': {
          const vars = message.data as { key: string; value: string; scope: 'environment' | 'global' }[];
          const activeId = get(activeEnvironmentId);
          const envs = get(environments);
          const activeEnv = activeId ? envs.find(e => e.id === activeId) : null;

          for (const v of vars) {
            if (v.scope === 'global') {
              const current = get(globalVariables);
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
        case 'cookieJarData':
          setCookieJarData(message.data);
          break;
        case 'showCommandPalette':
          // Show command palette modal with collections and environments
          paletteCollections = message.data.collections || [];
          paletteEnvironments = message.data.environments || null;
          showPalette = true;
          break;
        case 'historyLoaded':
        case 'historyUpdated':
          initHistory(message.data);
          break;
        case 'historyStatsLoaded':
          historyStats.set(message.data);
          historyStatsLoading.set(false);
          break;
        case 'externalFileChanged':
          // Show conflict banner - user decides whether to reload or keep changes
          setConflict(message.data.updatedRequest);
          break;
      }
    });

    // Persist layout preferences immediately on change
    const uiUnsub = ui.subscribe((uiState) => {
      const current = getState<Record<string, unknown>>() || {};
      setState({
        ...current,
        panelLayout: uiState.panelLayout,
        panelSplitRatio: uiState.panelSplitRatio,
        historyDrawerOpen: uiState.historyDrawerOpen,
        historyDrawerHeight: uiState.historyDrawerHeight,
      });
    });

    // Notify extension that webview is ready
    postMessage({ type: 'ready' });

    return () => {
      unsubscribe();
      dirtyUnsub();
      uiUnsub();
      unsubscribeMessages();
      if (draftDebounceTimer) clearTimeout(draftDebounceTimer);
    };
  });

  async function loadRequest(data: SavedRequest & { autoRun?: boolean }) {
    // Clear previous response, assertion results, and script output when loading a new request
    clearResponse();
    clearAssertionResults();
    clearScriptOutput();
    setMethod(data.method || 'GET');
    // Ensure params and headers are arrays (defensive coding)
    const params = Array.isArray(data.params) ? data.params : [];
    const headers = Array.isArray(data.headers) ? data.headers : [];
    // Atomic update of URL + params so the URL bar shows the full URL immediately
    setUrlAndParams(data.url || '', params);
    setHeaders(headers);
    setAuth(data.auth || { type: 'none' });
    setBody(data.body || { type: 'none', content: '' });
    setAssertions(data.assertions || []);
    setAuthInheritance(data.authInheritance);
    setScripts(data.scripts || { preRequest: '', postResponse: '' });
    setDescription(data.description || '');
    setPathParams(data.pathParams || []);
    setSsl(data.ssl);

    // Set connection mode if provided (for typed request creation)
    const connMode = (data as any)._connectionMode;
    if (connMode) {
      setConnectionMode(connMode as ConnectionMode);
    }

    // Auto-run the request if flag is set
    if (data.autoRun && data.url) {
      // Wait for stores to update
      await tick();

      const currentRequest = get(request);
      isLoading.set(true);
      const { url: resolvedUrl, body, auth } = resolveRequestVariables(currentRequest.url, currentRequest.body, currentRequest.auth, currentRequest.pathParams);
      postMessage({
        type: 'sendRequest',
        data: {
          method: currentRequest.method,
          url: resolvedUrl,
          templateUrl: currentRequest.url,
          headers: currentRequest.headers,
          params: currentRequest.params,
          pathParams: currentRequest.pathParams,
          body,
          auth,
        },
      });
    }
  }
</script>

<div class="app">
  <MainPanel
    {requestId}
    {collectionId}
    {collectionName}
    {collections}
    {showSaveNudge}
    {showSaveToast}
    {showPalette}
    {paletteCollections}
    {paletteEnvironments}
    onDismissNudge={() => { showSaveNudge = false; nudgeDismissed = true; }}
    onSaveToCollection={() => { postMessage({ type: 'getCollections' }); }}
    onDismissSaveToast={() => { showSaveToast = false; }}
    onPaletteClose={() => { showPalette = false; }}
    onPaletteSelect={(data) => {
      postMessage(data);
      showPalette = false;
    }}
    onConflictReload={async () => {
      const conflict = get(conflictState);
      if (conflict?.updatedRequest) {
        loadRequest(conflict.updatedRequest);
        clearConflict();
        await tick();
        setOriginalSnapshot(get(request));
      }
    }}
    onConflictKeep={() => {
      clearConflict();
      postMessage({ type: 'resolveConflict', data: { action: 'keep' } } as any);
    }}
  />
</div>

<style>
  .app {
    display: flex;
    height: 100vh;
    overflow: hidden;
  }
</style>
