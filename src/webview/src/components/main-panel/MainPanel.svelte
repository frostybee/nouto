<script lang="ts">
  import { ui, setRequestTab, setResponseTab, response, isLoading, request, setParams, setHeaders, setAuth, setBody } from '../../stores';
  import type { AuthState, BodyState } from '../../stores/request';
  import UrlBar from './UrlBar.svelte';
  import KeyValueEditor from '../shared/KeyValueEditor.svelte';
  import AuthEditor from '../shared/AuthEditor.svelte';
  import BodyEditor from '../shared/BodyEditor.svelte';
  import ResponseViewer from '../shared/ResponseViewer.svelte';
  import ResponseHeaders from '../shared/ResponseHeaders.svelte';
  import CookiesViewer from '../shared/CookiesViewer.svelte';
  import { formatSize } from '../../lib/formatters';
  import { getStatusClass } from '../../lib/http-helpers';

  type RequestTab = 'query' | 'headers' | 'auth' | 'body';
  type ResponseTab = 'body' | 'headers' | 'cookies';

  // Reactive bindings to request store
  const params = $derived($request.params);
  const headers = $derived($request.headers);
  const auth = $derived($request.auth);
  const body = $derived($request.body);

  function handleParamsChange(items: Array<{ key: string; value: string; enabled: boolean }>) {
    setParams(items);
  }

  function handleHeadersChange(items: Array<{ key: string; value: string; enabled: boolean }>) {
    setHeaders(items);
  }

  function handleAuthChange(auth: AuthState) {
    setAuth(auth);
  }

  function handleBodyChange(body: BodyState) {
    setBody(body);
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

  const activeRequestTab = $derived($ui.requestTab);
  const activeResponseTab = $derived($ui.responseTab);
  const currentResponse = $derived($response);
  const loading = $derived($isLoading);
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
            onclick={() => setRequestTab(tab.id)}
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
            onchange={handleParamsChange}
          />
        {:else if activeRequestTab === 'headers'}
          <KeyValueEditor
            items={headers}
            keyPlaceholder="Header"
            valuePlaceholder="Value"
            onchange={handleHeadersChange}
          />
        {:else if activeRequestTab === 'auth'}
          <AuthEditor
            {auth}
            onchange={handleAuthChange}
          />
        {:else if activeRequestTab === 'body'}
          <BodyEditor
            {body}
            onchange={handleBodyChange}
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
            onclick={() => setResponseTab(tab.id)}
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
            <ResponseViewer
              data={currentResponse.data}
              contentType={currentResponse.headers['content-type'] || ''}
              error={currentResponse.error}
              errorInfo={currentResponse.errorInfo}
            />
          {:else if activeResponseTab === 'headers'}
            <ResponseHeaders headers={currentResponse.headers} />
          {:else if activeResponseTab === 'cookies'}
            <CookiesViewer headers={currentResponse.headers} />
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
    border-bottom: 2px solid transparent;
    color: var(--vscode-foreground);
    cursor: pointer;
    font-size: 12px;
    opacity: 0.6;
    transition: opacity 0.15s, border-color 0.15s;
  }

  .panel-tab:hover {
    opacity: 0.9;
  }

  .panel-tab.active {
    opacity: 1;
    border-bottom-color: var(--vscode-focusBorder);
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
