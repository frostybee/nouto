<script lang="ts">
  import { onMount } from 'svelte';
  import MainPanel from './components/main-panel/MainPanel.svelte';
  import { setResponse, setMethod, setUrl, setParams, setHeaders, setAuth, setBody } from './stores';
  import { onMessage, postMessage } from './lib/vscode';
  import type { SavedRequest } from './types';

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
        case 'collections':
          // Handle collections list for save dialog
          break;
      }
    });

    // Notify extension that webview is ready
    postMessage({ type: 'ready' });
  });

  function loadRequest(data: SavedRequest) {
    setMethod(data.method || 'GET');
    setUrl(data.url || '');
    setParams(data.params || []);
    setHeaders(data.headers || []);
    setAuth(data.auth || { type: 'none' });
    setBody(data.body || { type: 'none', content: '' });
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
