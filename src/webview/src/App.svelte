<script lang="ts">
  import { onMount, tick } from 'svelte';
  import MainPanel from './components/main-panel/MainPanel.svelte';
  import { setResponse, setMethod, setUrl, setParams, setHeaders, setAuth, setBody, isLoading, loadEnvironments, clearResponse, loadEnvFileVariables, setAssertions, setAuthInheritance } from './stores';
  import { setScripts } from './stores/request';
  import { loadSettings } from './stores/settings';
  import { request } from './stores/request';
  import { onMessage, postMessage, getState, setState } from './lib/vscode';
  import { storeResponse } from './stores/responseContext';
  import { setAssertionResults, clearAssertionResults } from './stores/assertions';
  import { setScriptOutput, clearScriptOutput } from './stores/scripts';
  import { setWsStatus, addWsMessage } from './stores/websocket';
  import { setSSEStatus, addSSEEvent } from './stores/sse';
  import type { SavedRequest } from './types';
  import { get } from 'svelte/store';

  // Panel identity — set when the extension sends loadRequest
  let panelId: string | null = null;
  let requestId: string | null = null;
  let collectionId: string | null = null;
  let draftDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  onMount(() => {
    // Restore webview state on revival (VS Code reload)
    const savedState = getState<{
      panelId: string;
      requestId: string | null;
      collectionId: string | null;
      request: SavedRequest;
    }>();
    if (savedState?.request) {
      panelId = savedState.panelId;
      requestId = savedState.requestId;
      collectionId = savedState.collectionId;
      loadRequest(savedState.request);
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
          headers: currentRequest.headers,
          auth: currentRequest.auth,
          body: currentRequest.body,
          assertions: currentRequest.assertions,
          authInheritance: currentRequest.authInheritance,
          scripts: currentRequest.scripts,
          createdAt: '',
          updatedAt: new Date().toISOString(),
        };

        // Persist in webview state (survives reload)
        setState({ panelId, requestId, collectionId, request: requestData });

        // Notify extension for draft/collection persistence
        postMessage({
          type: 'draftUpdated',
          data: { panelId: panelId!, requestId, collectionId, request: requestData },
        });
      }, 1500);
    });

    // Listen for messages from the extension
    const unsubscribeMessages = onMessage((message) => {
      switch (message.type) {
        case 'loadRequest':
          // Extract panel identity metadata if present
          if ((message.data as any)._panelId) {
            panelId = (message.data as any)._panelId;
            requestId = (message.data as any)._requestId ?? null;
            collectionId = (message.data as any)._collectionId ?? null;
          }
          loadRequest(message.data);
          break;
        case 'requestResponse':
          setResponse(message.data);
          // Update assertion results if present
          if (message.data.assertionResults) {
            setAssertionResults(message.data.assertionResults);
          }
          break;
        case 'requestCancelled':
          isLoading.set(false);
          break;
        case 'loadEnvironments':
          loadEnvironments(message.data);
          break;
        case 'collections':
          // Handle collections list for save dialog
          break;
        case 'storeResponseContext':
          // Store response for request chaining ({{$response.body.xxx}})
          storeResponse(message.data.requestId, message.data.response);
          break;
        case 'loadSettings':
          loadSettings(message.data);
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
      }
    });

    // Notify extension that webview is ready
    postMessage({ type: 'ready' });

    return () => {
      unsubscribe();
      unsubscribeMessages();
      if (draftDebounceTimer) clearTimeout(draftDebounceTimer);
    };
  });

  async function loadRequest(data: SavedRequest & { autoRun?: boolean }) {
    console.log('[HiveFetch WebView] loadRequest received:', JSON.stringify(data, null, 2));
    // Clear previous response, assertion results, and script output when loading a new request
    clearResponse();
    clearAssertionResults();
    clearScriptOutput();
    setMethod(data.method || 'GET');
    setUrl(data.url || '');
    // Ensure params and headers are arrays (defensive coding)
    const params = Array.isArray(data.params) ? data.params : [];
    const headers = Array.isArray(data.headers) ? data.headers : [];
    console.log('[HiveFetch WebView] Setting headers:', headers, 'isArray:', Array.isArray(headers));
    setParams(params);
    setHeaders(headers);
    setAuth(data.auth || { type: 'none' });
    setBody(data.body || { type: 'none', content: '' });
    setAssertions(data.assertions || []);
    setAuthInheritance(data.authInheritance);
    setScripts(data.scripts || { preRequest: '', postResponse: '' });

    // Auto-run the request if flag is set
    if (data.autoRun && data.url) {
      // Wait for stores to update
      await tick();

      const currentRequest = get(request);
      isLoading.set(true);
      postMessage({
        type: 'sendRequest',
        data: {
          method: currentRequest.method,
          url: currentRequest.url,
          headers: currentRequest.headers,
          params: currentRequest.params,
          body: currentRequest.body,
          auth: currentRequest.auth,
        },
      });
    }
  }
</script>

<div class="app">
  <MainPanel />
</div>

<style>
  .app {
    display: flex;
    height: 100vh;
    overflow: hidden;
  }
</style>
