<script lang="ts">
  import { ui, setRequestTab, setResponseTab, response, isLoading, request, setParams, setHeaders, setAuth, setBody } from '../../stores';
  import type { AuthState, BodyState } from '../../stores/request';
  import type { Collection } from '../../types';
  import UrlBar from './UrlBar.svelte';
  import EnvironmentSelector from '../shared/EnvironmentSelector.svelte';
  import CodegenButton from '../shared/CodegenButton.svelte';
  import CollectionSaveButton from '../shared/CollectionSaveButton.svelte';
  import KeyValueEditor from '../shared/KeyValueEditor.svelte';
  import AuthEditor from '../shared/AuthEditor.svelte';
  import BodyEditor from '../shared/BodyEditor.svelte';
  import AssertionEditor from '../shared/AssertionEditor.svelte';
  import AssertionResults from '../shared/AssertionResults.svelte';
  import ScriptEditor from '../shared/ScriptEditor.svelte';
  import ScriptOutput from '../shared/ScriptOutput.svelte';
  import WebSocketPanel from '../shared/WebSocketPanel.svelte';
  import SSEPanel from '../shared/SSEPanel.svelte';
  import SaveNudgeBanner from '../shared/SaveNudgeBanner.svelte';
  import ResponseViewer from '../shared/ResponseViewer.svelte';
  import ResponseHeaders from '../shared/ResponseHeaders.svelte';
  import CookiesViewer from '../shared/CookiesViewer.svelte';
  import TimingBreakdown from '../shared/TimingBreakdown.svelte';
  import RequestTimeline from '../shared/RequestTimeline.svelte';
  import { formatSize } from '../../lib/formatters';
  import { getStatusClass, resolveRequestVariables } from '../../lib/http-helpers';
  import { postMessage } from '../../lib/vscode';
  import { assertionResults, assertionSummary } from '../../stores/assertions';
  import { scriptOutput } from '../../stores/scripts';

  interface Props {
    collectionId: string | null;
    collectionName: string | null;
    collections: Collection[];
    showSaveNudge: boolean;
    onDismissNudge: () => void;
    onSaveToCollection: () => void;
  }
  let { collectionId, collectionName, collections, showSaveNudge, onDismissNudge, onSaveToCollection }: Props = $props();

  type RequestTab = 'query' | 'headers' | 'auth' | 'body' | 'tests' | 'scripts';
  type ResponseTab = 'body' | 'headers' | 'cookies' | 'timing' | 'timeline' | 'tests' | 'scripts';

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

  function handleRetry() {
    if (loading || !$request.url.trim()) return;
    isLoading.set(true);

    const { url: resolvedUrl, body, auth } = resolveRequestVariables($request.url, $request.body, $request.auth);

    postMessage({
      type: 'sendRequest',
      data: {
        method: $request.method,
        url: resolvedUrl,
        headers: $request.headers,
        params: $request.params,
        body,
        auth,
        assertions: $request.assertions || [],
        authInheritance: $request.authInheritance,
        scripts: $request.scripts,
      },
    });
  }

  // Derive auto-set Content-Type from body type so students can see what will be sent
  const autoContentType = $derived.by(() => {
    const bodyType = body.type;
    switch (bodyType) {
      case 'json': return 'application/json';
      case 'text': return 'text/plain';
      case 'x-www-form-urlencoded': return 'application/x-www-form-urlencoded';
      case 'form-data': return 'multipart/form-data';
      case 'graphql': return 'application/json';
      case 'binary': return body.fileMimeType || 'application/octet-stream';
      default: return null;
    }
  });

  // Check if user has manually set a Content-Type header
  const hasManualContentType = $derived(
    headers.some(h => h.enabled && h.key.toLowerCase() === 'content-type')
  );

  const assertions = $derived($request.assertions || []);
  const scripts = $derived($request.scripts);
  const testResults = $derived($assertionResults);
  const testSummary = $derived($assertionSummary);
  const scriptResults = $derived($scriptOutput);
  const connectionMode = $derived($ui.connectionMode);

  const hasScripts = $derived(
    !!(scripts?.preRequest?.trim() || scripts?.postResponse?.trim())
  );

  const hasScriptResults = $derived(
    !!(scriptResults.preRequest || scriptResults.postResponse)
  );

  const requestTabs = $derived.by(() => {
    const tabs: { id: RequestTab; label: string }[] = [
      { id: 'query', label: 'Query' },
      { id: 'headers', label: 'Headers' },
      { id: 'auth', label: 'Auth' },
      { id: 'body', label: 'Body' },
      { id: 'tests', label: assertions.length > 0 ? `Tests (${assertions.length})` : 'Tests' },
      { id: 'scripts', label: hasScripts ? 'Scripts *' : 'Scripts' },
    ];
    return tabs;
  });

  const activeRequestTab = $derived($ui.requestTab);
  const activeResponseTab = $derived($ui.responseTab);
  const currentResponse = $derived($response);
  const loading = $derived($isLoading);

  // Detect network-level errors (no HTTP response received)
  const isNetworkError = $derived(currentResponse?.error === true && currentResponse?.status === 0);

  const errorCategoryIcons: Record<string, string> = {
    dns: 'codicon-search',
    timeout: 'codicon-watch',
    connection: 'codicon-plug',
    ssl: 'codicon-lock',
    network: 'codicon-globe',
    server: 'codicon-server',
    unknown: 'codicon-error',
    validation: 'codicon-warning',
  };

  const errorCategoryColors: Record<string, string> = {
    dns: '#f93e3e',
    timeout: '#fca130',
    connection: '#f93e3e',
    ssl: '#f93e3e',
    network: '#fca130',
    server: '#f93e3e',
    unknown: '#f93e3e',
    validation: '#fca130',
  };

  const responseTabs = $derived.by(() => {
    const timelineCount = currentResponse?.timeline?.length ?? 0;
    const hasTiming = !!(currentResponse?.timing);
    const tabs: { id: ResponseTab; label: string }[] = [];

    // Body tab is always shown
    tabs.push({ id: 'body', label: 'Body' });

    // Headers and Cookies hidden on network errors (no HTTP response)
    if (!isNetworkError) {
      tabs.push({ id: 'headers', label: 'Headers' });
      tabs.push({ id: 'cookies', label: 'Cookies' });
    }

    // Timing: show if data exists or not a network error
    if (!isNetworkError || hasTiming) {
      tabs.push({ id: 'timing', label: 'Timing' });
    }

    // Timeline always useful — shows where request failed
    tabs.push({ id: 'timeline', label: timelineCount > 0 ? `Timeline ${timelineCount}` : 'Timeline' });

    if (testResults.length > 0) {
      tabs.push({ id: 'tests', label: `Tests ${testSummary.passed}/${testSummary.total}` });
    }
    if (hasScriptResults) {
      tabs.push({ id: 'scripts', label: 'Scripts' });
    }
    return tabs;
  });

  // Auto-switch to 'body' tab if active tab gets hidden (e.g., on error)
  $effect(() => {
    const tabIds = responseTabs.map(t => t.id);
    if (currentResponse && !tabIds.includes(activeResponseTab)) {
      setResponseTab('body');
    }
  });
</script>

<main class="main-panel">
  <UrlBar />

  {#if connectionMode === 'websocket'}
    <div class="protocol-panel">
      <WebSocketPanel />
    </div>
  {:else if connectionMode === 'sse'}
    <div class="protocol-panel">
      <SSEPanel />
    </div>
  {:else}
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
        <div class="tab-bar-actions">
          <EnvironmentSelector />
          <CodegenButton />
          <CollectionSaveButton {collectionId} {collectionName} {collections} {onSaveToCollection} />
        </div>
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
          {#if autoContentType && !hasManualContentType}
            <div class="auto-header-hint">
              <span class="auto-badge">AUTO</span>
              <span class="auto-key">Content-Type:</span>
              <span class="auto-value">{autoContentType}</span>
            </div>
          {/if}
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
            url={$request.url}
            headers={$request.headers}
            auth={$request.auth}
          />
        {:else if activeRequestTab === 'tests'}
          <AssertionEditor />
        {:else if activeRequestTab === 'scripts'}
          <ScriptEditor />
        {/if}
      </div>
    </section>

    {#if showSaveNudge}
      <SaveNudgeBanner
        {collectionId}
        {collectionName}
        {collections}
        {onSaveToCollection}
        onDismiss={onDismissNudge}
      />
    {/if}

    <!-- Response Panel -->
    <section class="response-panel">
      <div class="response-header">
        {#if loading}
          <span class="status loading">Sending request...</span>
        {:else if currentResponse}
          {#if isNetworkError && currentResponse.errorInfo}
            <span class="status network-error" style="color: {errorCategoryColors[currentResponse.errorInfo.category] || '#f93e3e'}">
              <i class="codicon {errorCategoryIcons[currentResponse.errorInfo.category] || 'codicon-error'}"></i>
              {currentResponse.errorInfo.message}
            </span>
          {:else}
            <span class="status {getStatusClass(currentResponse.status)}">
              {currentResponse.status} {currentResponse.statusText}
            </span>
          {/if}
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
              contentCategory={currentResponse.contentCategory}
              error={currentResponse.error}
              errorInfo={currentResponse.errorInfo}
              onRetry={handleRetry}
            />
          {:else if activeResponseTab === 'headers'}
            <ResponseHeaders headers={currentResponse.headers} />
          {:else if activeResponseTab === 'cookies'}
            <CookiesViewer headers={currentResponse.headers} />
          {:else if activeResponseTab === 'timing'}
            <TimingBreakdown timing={currentResponse.timing ?? null} />
          {:else if activeResponseTab === 'timeline'}
            <RequestTimeline events={currentResponse.timeline ?? []} />
          {:else if activeResponseTab === 'tests'}
            <AssertionResults results={testResults} />
          {:else if activeResponseTab === 'scripts'}
            <ScriptOutput />
          {/if}
        {:else}
          <p class="placeholder">Send a request to see the response</p>
        {/if}
      </div>
    </section>
  </div>
  {/if}
</main>

<style>
  .main-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
  }

  .protocol-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
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

  .status.network-error {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .status.network-error .codicon {
    font-size: 14px;
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

  .tab-bar-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
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

  .auto-header-hint {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    margin-bottom: 8px;
    background: var(--vscode-textCodeBlock-background, rgba(128, 128, 128, 0.08));
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    font-size: 12px;
    font-family: var(--vscode-editor-font-family, monospace);
  }

  .auto-badge {
    padding: 1px 5px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    border-radius: 3px;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.5px;
  }

  .auto-key {
    color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe);
    font-weight: 500;
  }

  .auto-value {
    color: var(--vscode-descriptionForeground);
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
