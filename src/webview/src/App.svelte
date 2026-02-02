<script lang="ts">
  import { onMount, tick } from 'svelte';
  import MainPanel from './components/main-panel/MainPanel.svelte';
  import { setResponse, setMethod, setUrl, setParams, setHeaders, setAuth, setBody, isLoading, loadEnvironments, clearResponse } from './stores';
  import { request } from './stores/request';
  import { onMessage, postMessage } from './lib/vscode';
  import { storeResponse } from './stores/responseContext';
  import type { SavedRequest } from './types';
  import { get } from 'svelte/store';

  onMount(() => {
    // Listen for messages from the extension
    onMessage((message) => {
      switch (message.type) {
        case 'loadRequest':
          loadRequest(message.data);
          break;
        case 'requestResponse':
          setResponse(message.data);
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
      }
    });

    // Notify extension that webview is ready
    postMessage({ type: 'ready' });
  });

  async function loadRequest(data: SavedRequest & { autoRun?: boolean }) {
    console.log('[HiveFetch WebView] loadRequest received:', JSON.stringify(data, null, 2));
    // Clear previous response when loading a new request
    clearResponse();
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
