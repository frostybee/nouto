<script lang="ts">
  import { ui, setRequestTab, setResponseTab, response, isLoading, request, setParams, setHeaders, setAuth, setBody } from '../../stores';
  import type { AuthState, BodyState } from '../../stores/request';
  import UrlBar from './UrlBar.svelte';
  import KeyValueEditor from '../shared/KeyValueEditor.svelte';
  import AuthEditor from '../shared/AuthEditor.svelte';
  import BodyEditor from '../shared/BodyEditor.svelte';

  type RequestTab = 'query' | 'headers' | 'auth' | 'body';
  type ResponseTab = 'body' | 'headers' | 'cookies';

  // Reactive bindings to request store
  $: params = $request.params;
  $: headers = $request.headers;
  $: auth = $request.auth;
  $: body = $request.body;

  function handleParamsChange(event: CustomEvent<Array<{ key: string; value: string; enabled: boolean }>>) {
    setParams(event.detail);
  }

  function handleHeadersChange(event: CustomEvent<Array<{ key: string; value: string; enabled: boolean }>>) {
    setHeaders(event.detail);
  }

  function handleAuthChange(event: CustomEvent<AuthState>) {
    setAuth(event.detail);
  }

  function handleBodyChange(event: CustomEvent<BodyState>) {
    setBody(event.detail);
  }

  const requestTabs: { id: RequestTab; label: string }[] = [
    { id: 'query', label: 'Query' },
    { id: 'headers', label: 'Headers' },
    { id: 'auth', label: 'Auth' },
    { id: 'body', label: 'Body' },
  ];

  const responseTabs: { id: ResponseTab; label: string }[] = [
    { id: 'body', label: 'Body' },
    { id: 'headers', label: 'Headers' },
    { id: 'cookies', label: 'Cookies' },
  ];

  $: activeRequestTab = $ui.requestTab;
  $: activeResponseTab = $ui.responseTab;
  $: currentResponse = $response;
  $: loading = $isLoading;

  function getStatusClass(status: number): string {
    if (status >= 200 && status < 300) return 'success';
    if (status >= 300 && status < 400) return 'redirect';
    if (status >= 400 && status < 500) return 'client-error';
    if (status >= 500) return 'server-error';
    return 'unknown';
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatResponseData(data: any): string {
    if (typeof data === 'string') return data;
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }
</script>

<main class="main-panel">
  <UrlBar />

  <div class="panels">
    <!-- Request Panel -->
    <section class="request-panel">
      <div class="panel-tabs">
        {#each requestTabs as tab}
          <button
            class="panel-tab"
            class:active={activeRequestTab === tab.id}
            on:click={() => setRequestTab(tab.id)}
          >
            {tab.label}
          </button>
        {/each}
      </div>

      <div class="panel-content">
        {#if activeRequestTab === 'query'}
          <KeyValueEditor
            items={params}
            keyPlaceholder="Parameter"
            valuePlaceholder="Value"
            on:change={handleParamsChange}
          />
        {:else if activeRequestTab === 'headers'}
          <KeyValueEditor
            items={headers}
            keyPlaceholder="Header"
            valuePlaceholder="Value"
            on:change={handleHeadersChange}
          />
        {:else if activeRequestTab === 'auth'}
          <AuthEditor
            {auth}
            on:change={handleAuthChange}
          />
        {:else if activeRequestTab === 'body'}
          <BodyEditor
            {body}
            on:change={handleBodyChange}
          />
        {/if}
      </div>
    </section>

    <!-- Response Panel -->
    <section class="response-panel">
      <div class="response-header">
        {#if loading}
          <span class="status loading">Sending request...</span>
        {:else if currentResponse}
          <span class="status {getStatusClass(currentResponse.status)}">
            {currentResponse.status} {currentResponse.statusText}
          </span>
          <span class="meta">{currentResponse.duration} ms</span>
          <span class="meta">{formatSize(currentResponse.size)}</span>
        {:else}
          <span class="status idle">Ready</span>
        {/if}
      </div>

      <div class="panel-tabs">
        {#each responseTabs as tab}
          <button
            class="panel-tab"
            class:active={activeResponseTab === tab.id}
            on:click={() => setResponseTab(tab.id)}
          >
            {tab.label}
          </button>
        {/each}
      </div>

      <div class="panel-content response-content">
        {#if loading}
          <div class="loading-indicator">
            <div class="spinner"></div>
            <p>Sending request...</p>
          </div>
        {:else if currentResponse}
          {#if activeResponseTab === 'body'}
            <pre class="response-body">{formatResponseData(currentResponse.data)}</pre>
          {:else if activeResponseTab === 'headers'}
            <div class="headers-list">
              {#each Object.entries(currentResponse.headers) as [key, value]}
                <div class="header-row">
                  <span class="header-key">{key}:</span>
                  <span class="header-value">{value}</span>
                </div>
              {/each}
            </div>
          {:else if activeResponseTab === 'cookies'}
            <p class="placeholder">Cookies view (Phase 7)</p>
          {/if}
        {:else}
          <p class="placeholder">Send a request to see the response</p>
        {/if}
      </div>
    </section>
  </div>
</main>

<style>
  .main-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
  }

  .panels {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .request-panel,
  .response-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 150px;
  }

  .response-panel {
    border-top: 1px solid var(--vscode-panel-border);
  }

  .response-header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 8px 12px;
    background: var(--vscode-editor-background);
    border-bottom: 1px solid var(--vscode-panel-border);
  }

  .status {
    font-weight: 600;
    font-size: 13px;
  }

  .status.idle {
    color: var(--vscode-descriptionForeground);
  }

  .status.loading {
    color: var(--vscode-charts-blue);
  }

  .status.success {
    color: #49cc90;
  }

  .status.redirect {
    color: #fca130;
  }

  .status.client-error {
    color: #f93e3e;
  }

  .status.server-error {
    color: #f93e3e;
  }

  .meta {
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
  }

  .panel-tabs {
    display: flex;
    gap: 4px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--vscode-panel-border);
    background: var(--vscode-editor-background);
  }

  .panel-tab {
    padding: 6px 12px;
    background: transparent;
    border: none;
    color: var(--vscode-foreground);
    cursor: pointer;
    font-size: 12px;
    border-radius: 4px;
    opacity: 0.6;
    transition: opacity 0.15s, background 0.15s;
  }

  .panel-tab:hover {
    opacity: 0.9;
    background: var(--vscode-list-hoverBackground);
  }

  .panel-tab.active {
    opacity: 1;
    background: var(--vscode-button-secondaryBackground);
  }

  .panel-content {
    flex: 1;
    overflow: auto;
    padding: 12px;
  }

  .placeholder {
    color: var(--vscode-descriptionForeground);
    font-style: italic;
    font-size: 13px;
  }

  .response-content {
    background: var(--vscode-editor-background);
  }

  .response-body {
    margin: 0;
    padding: 12px;
    background: var(--vscode-textCodeBlock-background);
    border-radius: 4px;
    font-family: var(--vscode-editor-font-family), monospace;
    font-size: 12px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    overflow-x: auto;
  }

  .headers-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .header-row {
    display: flex;
    gap: 8px;
    padding: 4px 8px;
    background: var(--vscode-textCodeBlock-background);
    border-radius: 4px;
    font-size: 12px;
    font-family: var(--vscode-editor-font-family), monospace;
  }

  .header-key {
    color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe);
    flex-shrink: 0;
  }

  .header-value {
    color: var(--vscode-foreground);
    word-break: break-all;
  }

  .loading-indicator {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 12px;
    color: var(--vscode-descriptionForeground);
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--vscode-panel-border);
    border-top-color: var(--vscode-focusBorder);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
