<script lang="ts">
  import { onMount, tick } from 'svelte';
  import MainPanel from './components/main-panel/MainPanel.svelte';
  import { setResponse, setMethod, setUrl, setParams, setHeaders, setAuth, setBody, setLoading, loadEnvironments, clearResponse, loadEnvFileVariables, setAssertions, setAuthInheritance, setScriptInheritance, setDownloadProgress } from './stores';
  import { environments, activeEnvironmentId, globalVariables, updateEnvironmentVariables, updateGlobalVariables, updateCollectionScopedVariables } from './stores/environment.svelte';
  import { setScripts, setDescription, setUrlAndParams, setSsl, setPathParams, isDirty, originalRequest, setOriginalSnapshot, clearOriginalSnapshot, setRequestContext, clearRequestContext } from './stores/request.svelte';
  import type { RequestState } from './stores/request.svelte';
  import { loadSettings, settingsOpen, setSettingsOpen } from './stores/settings.svelte';
  import { request } from './stores/request.svelte';
  import { onMessage, postMessage, getState, setState } from './lib/vscode';
  import { resolveRequestVariables } from './lib/http-helpers';
  import { substitutePathParams } from '@hivefetch/core';
  import { storeResponse } from './stores/responseContext.svelte';
  import { setAssertionResults, clearAssertionResults } from './stores/assertions.svelte';
  import { setScriptOutput, clearScriptOutput } from './stores/scripts.svelte';
  import { setWsStatus, addWsMessage } from './stores/websocket.svelte';
  import { setSSEStatus, addSSEEvent } from './stores/sse.svelte';
  import { setGqlSubStatus, addGqlSubEvent } from './stores/graphqlSubscription.svelte';
  import { setCookieJarData, loadCookieJars } from './stores/cookieJar.svelte';
  import { setConflict, clearConflict, conflictState } from './stores/conflict.svelte';
  import { showNotification, setPendingInput, clearPendingInput, pendingInput } from './stores/notifications.svelte';

  import { initHistory, setHistoryStats, setHistoryStatsLoading } from './stores/history.svelte';
  import { ui, setConnectionMode, setPanelLayout, setPanelSplitRatio, setHistoryDrawerOpen, setHistoryDrawerHeight } from './stores/ui.svelte';
  import type { PanelLayout } from './stores/ui.svelte';
  import type { SavedRequest, ConnectionMode } from './types';
  import type { Collection } from './types';
  import NotificationStack from './components/shared/NotificationStack.svelte';
  import InputBoxModal from './components/shared/InputBoxModal.svelte';
  import QuickPickModal from './components/shared/QuickPickModal.svelte';
  import ConfirmDialog from './components/shared/ConfirmDialog.svelte';

  // Panel identity - set when the extension sends loadRequest
  let panelId: string | null = null;
  let requestId: string | null = $state(null);
  let collectionId: string | null = $state<string | null>(null);
  let collectionName: string | null = $state<string | null>(null);
  let collections: Collection[] = $state([]);
  let draftDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Keep collection/folder scoped variables in sync with the active request context
  $effect(() => {
    updateCollectionScopedVariables(collections, collectionId, requestId);
  });

  // Persist layout preferences immediately on change
  $effect(() => {
    const current = getState<Record<string, unknown>>() || {};
    setState({
      ...current,
      panelLayout: ui.panelLayout,
      panelSplitRatio: ui.panelSplitRatio,
      historyDrawerOpen: ui.historyDrawerOpen,
      historyDrawerHeight: ui.historyDrawerHeight,
    });
  });

  // Persist request drafts on change (replaces request.subscribe)
  $effect(() => {
    // Access reactive properties to track them
    const snapshot = $state.snapshot(request);
    if (!panelId) return;

    if (draftDebounceTimer) clearTimeout(draftDebounceTimer);
    draftDebounceTimer = setTimeout(() => {
      const requestData: SavedRequest = {
        id: requestId || '',
        name: '',
        method: snapshot.method,
        url: snapshot.url,
        params: snapshot.params,
        pathParams: snapshot.pathParams,
        headers: snapshot.headers,
        auth: snapshot.auth,
        body: snapshot.body,
        assertions: snapshot.assertions,
        authInheritance: snapshot.authInheritance,
        scriptInheritance: snapshot.scriptInheritance,
        scripts: snapshot.scripts,
        description: snapshot.description || undefined,
        connectionMode: ui.connectionMode,
        createdAt: '',
        updatedAt: new Date().toISOString(),
      };

      setState({ panelId, requestId, collectionId, collectionName, connectionMode: ui.connectionMode, request: requestData, originalRequest: originalRequest() });

      postMessage({
        type: 'draftUpdated',
        data: { panelId: panelId!, requestId, collectionId, request: requestData },
      });
    }, 1500);
  });

  // Notify extension of dirty state changes (replaces isDirty.subscribe)
  $effect(() => {
    const dirty = isDirty();
    if (!panelId) return;
    postMessage({
      type: 'dirtyStateChanged',
      data: { panelId: panelId!, isDirty: dirty },
    });
  });

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

    // No subscribe needed: $effect handles reactive tracking (see top-level effects below)

    // Listen for messages from the extension
    const unsubscribeMessages = onMessage(async (message) => {
      try {
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
            setOriginalSnapshot($state.snapshot(request));
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
            setOriginalSnapshot($state.snapshot(request));
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
        case 'downloadProgress':
          setDownloadProgress(message.data.loaded, message.data.total);
          break;
        case 'requestCancelled':
          setLoading(false);
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
            setOriginalSnapshot($state.snapshot(request));
            setRequestContext({ panelId, requestId, collectionId, collectionName: collectionName || '' });
          }
          break;
        case 'collectionRequestSaved':
          // Save succeeded: re-snapshot current state as new original (clears dirty)
          setOriginalSnapshot($state.snapshot(request));
          showSaveToast = true;
          break;
        case 'originalRequestLoaded':
          // Revert: load original request data and re-snapshot
          loadRequest(message.data);
          await tick();
          setOriginalSnapshot($state.snapshot(request));
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
          setSettingsOpen(true);
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
        case 'gqlSubStatus':
          setGqlSubStatus(message.data.status, message.data.error);
          break;
        case 'gqlSubEvent':
          addGqlSubEvent(message.data);
          break;
        case 'setVariables': {
          const vars = message.data as { key: string; value: string; scope: 'environment' | 'global' }[];
          const activeId = activeEnvironmentId();
          const envs = environments();
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
        case 'cookieJarData':
          setCookieJarData(message.data);
          break;
        case 'cookieJarsList':
          loadCookieJars(message.data || { jars: [], activeJarId: null });
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
          setHistoryStats(message.data);
          setHistoryStatsLoading(false);
          break;
        case 'externalFileChanged':
          // Show conflict banner - user decides whether to reload or keep changes
          setConflict(message.data.updatedRequest);
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
        console.error('[HiveFetch] Error handling message:', message?.type, err);
      }
    });

    // Notify extension that webview is ready
    postMessage({ type: 'ready' });

    return () => {
      unsubscribeMessages();
      if (draftDebounceTimer) clearTimeout(draftDebounceTimer);
    };
  });

  // UI Interaction response helpers
  function respondInputBox(value: string | null) {
    const pending = pendingInput();
    if (pending?.type === 'inputBox') {
      postMessage({ type: 'inputBoxResult', data: { requestId: pending.requestId, value } } as any);
      clearPendingInput();
    }
  }

  function respondQuickPick(value: string | string[] | null) {
    const pending = pendingInput();
    if (pending?.type === 'quickPick') {
      postMessage({ type: 'quickPickResult', data: { requestId: pending.requestId, value } } as any);
      clearPendingInput();
    }
  }

  function respondConfirm(confirmed: boolean) {
    const pending = pendingInput();
    if (pending?.type === 'confirm') {
      postMessage({ type: 'confirmResult', data: { requestId: pending.requestId, confirmed } } as any);
      clearPendingInput();
    }
  }

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
    setScriptInheritance(data.scriptInheritance);
    setScripts(data.scripts || { preRequest: '', postResponse: '' });
    setDescription(data.description || '');
    setPathParams(data.pathParams || []);
    setSsl(data.ssl);

    // Set connection mode: prefer explicit _connectionMode from extension, fall back to saved connectionMode, default to 'http'
    const connMode = (data as any)._connectionMode || data.connectionMode || 'http';
    setConnectionMode(connMode as ConnectionMode);

    // Auto-run the request if flag is set
    if (data.autoRun && data.url) {
      // Wait for stores to update
      await tick();

      setLoading(true);
      const { url: resolvedUrl, body, auth, params: resolvedParams, headers: resolvedHeaders, pathParams: resolvedPathParams } = resolveRequestVariables(request.url, request.body, request.auth, request.pathParams, request.params, request.headers);
      postMessage({
        type: 'sendRequest',
        data: {
          method: request.method,
          url: resolvedUrl,
          templateUrl: resolvedPathParams?.length ? substitutePathParams(request.url, resolvedPathParams) : request.url,
          headers: resolvedHeaders,
          params: resolvedParams,
          pathParams: resolvedPathParams,
          body,
          auth,
        },
      });
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
      if (conflictState()?.updatedRequest) {
        loadRequest(conflictState().updatedRequest);
        clearConflict();
        await tick();
        setOriginalSnapshot($state.snapshot(request));
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
