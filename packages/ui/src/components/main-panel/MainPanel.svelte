<script lang="ts">
  import { ui, setRequestTab, setResponseTab, response, isLoading, setLoading, request, setParams, setHeaders, setAuth, setBody, downloadProgress, formatBytes } from '../../stores';
  import { setPathParams } from '../../stores/request.svelte';
  import { togglePanelLayout, setPanelLayout, toggleHistoryDrawer } from '../../stores/ui.svelte';
  import type { AuthState, BodyState } from '../../stores/request.svelte';
  import { setDescription, setScripts, setSsl, setProxy, setTimeout, setRedirects, isDirty, requestContext, setAuthInheritance } from '../../stores/request.svelte';
  import RequestSettingsPanel from '../shared/RequestSettingsPanel.svelte';
  import type { Collection } from '../../types';
  import UrlBar from './UrlBar.svelte';
  import CodegenButton from '../shared/CodegenButton.svelte';
  import CollectionSaveButton from '../shared/CollectionSaveButton.svelte';
  import PanelSplitter from '../shared/PanelSplitter.svelte';
  import HistoryDrawer from '../shared/HistoryDrawer.svelte';
  import KeyValueEditor from '../shared/KeyValueEditor.svelte';
  import PathParamsEditor from '../shared/PathParamsEditor.svelte';
  import AuthEditor from '../shared/AuthEditor.svelte';
  import BodyEditor from '../shared/BodyEditor.svelte';
  import AssertionEditor from '../shared/AssertionEditor.svelte';
  import AssertionResults from '../shared/AssertionResults.svelte';
  import ScriptEditor from '../shared/ScriptEditor.svelte';
  import ScriptOutput from '../shared/ScriptOutput.svelte';
  import WebSocketPanel from '../shared/WebSocketPanel.svelte';
  import SSEPanel from '../shared/SSEPanel.svelte';
  import SaveNudgeBanner from '../shared/SaveNudgeBanner.svelte';
  import ConflictBanner from '../shared/ConflictBanner.svelte';
  import InheritedHeadersViewer from '../shared/InheritedHeadersViewer.svelte';
  import AuthInheritanceSelector from '../shared/AuthInheritanceSelector.svelte';
  import { collectionScopedHeaders, collectionScopedScripts } from '../../stores/environment.svelte';

  import ResponseViewer from '../shared/ResponseViewer.svelte';
  import ResponseHeaders from '../shared/ResponseHeaders.svelte';
  import CookiesViewer from '../shared/CookiesViewer.svelte';
  import CookieJarPanel from '../shared/CookieJarPanel.svelte';
  import { parseCookies, parseSentCookies } from '../../lib/cookie-parser';
  import TimingBreakdown from '../shared/TimingBreakdown.svelte';
  import RequestTimeline from '../shared/RequestTimeline.svelte';
  import SettingsPage from '../shared/SettingsPage.svelte';
  import NotesEditor from '../shared/NotesEditor.svelte';
  import Tooltip from '../shared/Tooltip.svelte';
  import SizeBreakdownPopup from '../shared/SizeBreakdownPopup.svelte';
  import CommandPaletteApp from '../palette/CommandPaletteApp.svelte';
  import Toast from '../shared/Toast.svelte';
  import { formatSize, substitutePathParams } from '@hivefetch/core';
  import { getStatusClass, resolveRequestVariables } from '../../lib/http-helpers';
  import { postMessage as vsCodePostMessage } from '../../lib/vscode';
  import { conflictState, clearConflict } from '../../stores/conflict.svelte';
  import { assertionResults, assertionSummary } from '../../stores/assertions.svelte';
  import { scriptOutput, clearScriptOutput } from '../../stores/scripts.svelte';
  import { resolvedShortcuts, settings, settingsOpen, setSettingsOpen } from '../../stores/settings.svelte';
  import { matchesBinding, bindingToDisplayString } from '../../lib/shortcuts';
  import { COMMON_HTTP_HEADERS } from '../../lib/http-headers';
  import { HTTP_HEADER_VALUES } from '../../lib/http-header-values';
  import { HTTP_HEADER_DESCRIPTIONS } from '../../lib/http-header-descriptions';
  import type { OutgoingMessage } from '@hivefetch/transport/messages';

  interface Props {
    requestId: string | null;
    collectionId: string | null;
    collectionName: string | null;
    collections: Collection[];
    showSaveNudge: boolean;
    showSaveToast?: boolean;
    showPalette?: boolean;
    paletteCollections?: Collection[];
    paletteEnvironments?: any;
    onDismissNudge: () => void;
    onSaveToCollection: () => void;
    onDismissSaveToast?: () => void;
    onPaletteClose?: () => void;
    onPaletteSelect?: (data: any) => void;
    onConflictReload?: () => void;
    onConflictKeep?: () => void;
    postMessage?: (message: OutgoingMessage) => void;
  }
  let {
    requestId,
    collectionId,
    collectionName,
    collections,
    showSaveNudge,
    showSaveToast = false,
    showPalette = false,
    paletteCollections = [],
    paletteEnvironments = null,
    onDismissNudge,
    onSaveToCollection,
    onDismissSaveToast,
    onPaletteClose,
    onPaletteSelect,
    onConflictReload,
    onConflictKeep,
    postMessage
  }: Props = $props();

  // Use provided postMessage or fallback to VSCode postMessage (for VSCode extension)
  const messageBus = $derived(postMessage || vsCodePostMessage);

  type RequestTab = 'query' | 'path' | 'headers' | 'auth' | 'body' | 'tests' | 'scripts' | 'notes' | 'settings';
  type ResponseTab = 'body' | 'headers' | 'cookies' | 'timing' | 'timeline' | 'tests' | 'scripts';

  // Reactive bindings to request store
  const params = $derived(request.params);
  const pathParams = $derived(request.pathParams);
  const headers = $derived(request.headers);
  const auth = $derived(request.auth);
  const body = $derived(request.body);

  function handleParamsChange(items: Array<{ key: string; value: string; enabled: boolean }>) {
    setParams(items);
  }

  function handlePathParamsChange(items: Array<{ key: string; value: string; description: string; enabled: boolean }>) {
    setPathParams(items);
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
    if (loading || !request.url.trim()) return;
    setLoading(true);
    clearScriptOutput();

    const { url: resolvedUrl, body, auth, params: resolvedParams, headers: resolvedHeaders, pathParams: resolvedPathParams } = resolveRequestVariables(request.url, request.body, request.auth, request.pathParams, request.params, request.headers);

    messageBus({
      type: 'sendRequest',
      data: JSON.parse(JSON.stringify({
        method: request.method,
        url: resolvedUrl,
        templateUrl: resolvedPathParams?.length ? substitutePathParams(request.url, resolvedPathParams) : request.url,
        headers: resolvedHeaders,
        params: resolvedParams,
        pathParams: resolvedPathParams,
        body,
        auth,
        assertions: request.assertions || [],
        authInheritance: request.authInheritance,
        scripts: request.scripts,
        ssl: request.ssl,
        proxy: request.proxy,
        timeout: request.timeout,
        followRedirects: request.followRedirects,
        maxRedirects: request.maxRedirects,
      })),
    });
  }

  // Derive auto-set Content-Type from body type so students can see what will be sent
  const autoContentType = $derived.by(() => {
    const bodyType = body.type;
    switch (bodyType) {
      case 'json': return 'application/json';
      case 'text': return 'text/plain';
      case 'xml': return 'application/xml';
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

  let cookieJarOpen = $state(false);

  // Responsive layout: auto-switch between horizontal and vertical based on viewport width
  const RESPONSIVE_BREAKPOINT = 1024; // Switch to vertical layout below this width
  let resizeObserver: ResizeObserver | null = null;
  let manualLayoutOverride = $state(false);
  let mainPanelEl = $state<HTMLElement>(undefined!);
  const currentLayout = $derived(ui.panelLayout);

  $effect(() => {
    if (!mainPanelEl) return;

    resizeObserver = new ResizeObserver((entries) => {
      if (manualLayoutOverride) return;

      const width = entries[0].contentRect.width;

      if (width < RESPONSIVE_BREAKPOINT && currentLayout === 'horizontal') {
        setPanelLayout('vertical');
      } else if (width >= RESPONSIVE_BREAKPOINT && currentLayout === 'vertical') {
        setPanelLayout('horizontal');
      }
    });

    resizeObserver.observe(mainPanelEl);

    return () => {
      resizeObserver?.disconnect();
    };
  });

  // Override the toggle function to set manual override flag
  function handleToggleLayout() {
    manualLayoutOverride = true;
    togglePanelLayout();

    // Reset manual override after 5 seconds to re-enable responsive behavior
    setTimeout(() => {
      manualLayoutOverride = false;
    }, 5000);
  }

  const shortcuts = $derived(resolvedShortcuts());

  const sendShortcutDisplay = $derived.by(() => {
    const binding = shortcuts.get('sendRequest');
    return binding ? bindingToDisplayString(binding) : 'Ctrl+Enter';
  });

  const toggleLayoutDisplay = $derived.by(() => {
    const binding = shortcuts.get('toggleLayout');
    return binding ? bindingToDisplayString(binding) : 'Alt+L';
  });

  function handleSaveRequest() {
    const ctx = requestContext();
    if (!isDirty() || !ctx?.collectionId) return;

    messageBus({
      type: 'saveCollectionRequest',
      data: {
        panelId: ctx.panelId,
        requestId: ctx.requestId,
        collectionId: ctx.collectionId,
        request: {
          id: ctx.requestId,
          name: '',
          method: request.method,
          url: request.url,
          params: request.params,
          pathParams: request.pathParams,
          headers: request.headers,
          auth: request.auth,
          body: request.body,
          assertions: request.assertions,
          authInheritance: request.authInheritance,
          scripts: request.scripts,
          description: request.description || undefined,
          createdAt: '',
          updatedAt: new Date().toISOString(),
        },
      },
    });
  }

  function handleRevertRequest() {
    const ctx = requestContext();
    if (!ctx?.collectionId) return;

    messageBus({
      type: 'revertRequest',
      data: {
        panelId: ctx.panelId,
        requestId: ctx.requestId,
        collectionId: ctx.collectionId,
      },
    });
  }

  function handleMainKeydown(event: KeyboardEvent) {
    // Don't handle shortcuts when settings is open (recorder handles its own)
    if (settingsOpen()) return;

    // Save shortcut (Ctrl+S)
    const saveBinding = shortcuts.get('saveRequest');
    if (saveBinding && matchesBinding(event, saveBinding)) {
      event.preventDefault();
      handleSaveRequest();
      return;
    }

    const toggleBinding = shortcuts.get('toggleLayout');
    if (toggleBinding && matchesBinding(event, toggleBinding)) {
      event.preventDefault();
      handleToggleLayout();
      return;
    }
    // Toggle history drawer (disabled - history is in sidebar tab now)
    // const historyBinding = shortcuts.get('toggleHistoryDrawer');
    // if (historyBinding && matchesBinding(event, historyBinding)) {
    //   event.preventDefault();
    //   toggleHistoryDrawer();
    //   return;
    // }
    // New request
    const newBinding = shortcuts.get('newRequest');
    if (newBinding && matchesBinding(event, newBinding)) {
      event.preventDefault();
      messageBus({ type: 'newRequest' } as any);
      return;
    }
    // Duplicate request
    const dupBinding = shortcuts.get('duplicateRequest');
    if (dupBinding && matchesBinding(event, dupBinding)) {
      event.preventDefault();
      messageBus({ type: 'duplicateRequest' });
      return;
    }
    // Close panel
    const closeBinding = shortcuts.get('closePanel');
    if (closeBinding && matchesBinding(event, closeBinding)) {
      event.preventDefault();
      messageBus({ type: 'closeCurrentPanel' } as any);
      return;
    }
    // Tab switching shortcuts
    const tabMap: Record<string, RequestTab> = {
      switchTabQuery: 'query',
      switchTabHeaders: 'headers',
      switchTabAuth: 'auth',
      switchTabBody: 'body',
      switchTabTests: 'tests',
      switchTabScripts: 'scripts',
    };
    for (const [action, tab] of Object.entries(tabMap)) {
      const binding = shortcuts.get(action as any);
      if (binding && matchesBinding(event, binding)) {
        event.preventDefault();
        setRequestTab(tab);
        return;
      }
    }
  }

  const assertions = $derived(request.assertions || []);
  const description = $derived(request.description || '');
  const scripts = $derived(request.scripts);
  const testResults = $derived(assertionResults());
  const testSummary = $derived(assertionSummary());
  const scriptResults = $derived(scriptOutput);
  const connectionMode = $derived(ui.connectionMode);
  const panelLayout = $derived(ui.panelLayout);
  const panelSplitRatio = $derived(ui.panelSplitRatio);

  const panelGridStyle = $derived(
    panelLayout === 'horizontal'
      ? `grid-template-columns: ${panelSplitRatio}fr 4px ${1 - panelSplitRatio}fr; grid-template-rows: 1fr`
      : `grid-template-rows: ${panelSplitRatio}fr 4px ${1 - panelSplitRatio}fr; grid-template-columns: 1fr`
  );

  const hasScripts = $derived(
    !!(scripts?.preRequest?.trim() || scripts?.postResponse?.trim())
  );

  const hasScriptResults = $derived(
    !!(scriptResults.preRequest || scriptResults.postResponse)
  );

  const requestTabs = $derived.by(() => {
    const tabs: { id: RequestTab; label: string; badge?: string }[] = [];
    // Hide Query (params) tab for GraphQL - GraphQL doesn't use URL params
    if (body.type !== 'graphql') {
      tabs.push({ id: 'query', label: 'Query' });
    }
    tabs.push({ id: 'path', label: 'Path', badge: pathParams.length > 0 ? `${pathParams.length}` : undefined });
    tabs.push({ id: 'headers', label: 'Headers' });
    tabs.push({ id: 'body', label: 'Body' });
    tabs.push({ id: 'auth', label: 'Auth' });
    tabs.push({ id: 'tests', label: assertions.length > 0 ? `Tests (${assertions.length})` : 'Tests' });
    tabs.push({ id: 'scripts', label: hasScripts ? 'Scripts *' : 'Scripts' });
    tabs.push({ id: 'notes', label: description ? 'Notes *' : 'Notes' });
    tabs.push({ id: 'settings', label: 'Settings' });
    return tabs;
  });

  const activeRequestTab = $derived(ui.requestTab);
  const activeResponseTab = $derived(ui.responseTab);
  const currentResponse = $derived(response());
  const loading = $derived(isLoading());

  // Effective config values for Timing tab (request-level > global > undefined)
  const effectiveTimeout = $derived((request.timeout != null ? request.timeout : settings.defaultTimeout) ?? undefined);
  const effectiveFollowRedirects = $derived((request.followRedirects != null ? request.followRedirects : settings.defaultFollowRedirects) ?? undefined);
  const effectiveMaxRedirects = $derived((request.maxRedirects != null ? request.maxRedirects : settings.defaultMaxRedirects) ?? undefined);

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
    const tabs: { id: ResponseTab; label: string; badge?: string }[] = [];

    // Body tab is always shown
    tabs.push({ id: 'body', label: 'Body' });

    // Headers and Cookies hidden on network errors (no HTTP response)
    if (!isNetworkError) {
      const reqHeaderCount = currentResponse?.requestHeaders ? Object.keys(currentResponse.requestHeaders).length : 0;
      const resHeaderCount = currentResponse?.headers ? Object.keys(currentResponse.headers).length : 0;
      const headerBadge = (reqHeaderCount > 0 || resHeaderCount > 0) ? `${reqHeaderCount}/${resHeaderCount}` : undefined;
      tabs.push({ id: 'headers', label: 'Headers', badge: headerBadge });
      const sentCookieCount = currentResponse?.requestHeaders ? parseSentCookies(currentResponse.requestHeaders).length : 0;
      const resCookieCount = currentResponse?.headers ? parseCookies(currentResponse.headers).length : 0;
      const cookieBadge = (sentCookieCount > 0 || resCookieCount > 0) ? `${sentCookieCount}/${resCookieCount}` : undefined;
      tabs.push({ id: 'cookies', label: 'Cookies', badge: cookieBadge });
    }

    // Timing: always show (displays request config even on errors)
    tabs.push({ id: 'timing', label: 'Timing' });

    // Timeline always useful - shows where request failed
    tabs.push({ id: 'timeline', label: 'Timeline', badge: timelineCount > 0 ? `${timelineCount}` : undefined });

    if (testResults.length > 0) {
      tabs.push({ id: 'tests', label: `Tests ${testSummary.passed}/${testSummary.total}` });
    }
    if (hasScriptResults) {
      tabs.push({ id: 'scripts', label: 'Scripts' });
    }
    return tabs;
  });

  // Auto-switch to 'body' tab if active request tab gets hidden (e.g., Query tab hidden for GraphQL)
  $effect(() => {
    const tabIds = requestTabs.map(t => t.id);
    if (!tabIds.includes(activeRequestTab)) {
      setRequestTab('body');
    }
  });

  // Auto-switch to 'body' tab if active response tab gets hidden (e.g., on error)
  $effect(() => {
    const tabIds = responseTabs.map(t => t.id);
    if (currentResponse && !tabIds.includes(activeResponseTab)) {
      setResponseTab('body');
    }
  });
</script>

<svelte:window onkeydown={handleMainKeydown} />

<main class="main-panel" bind:this={mainPanelEl}>
  <UrlBar {postMessage} />

  {#if settingsOpen()}
    <SettingsPage onclose={() => setSettingsOpen(false)} />
  {:else if connectionMode === 'websocket'}
    <div class="protocol-panel">
      <WebSocketPanel />
    </div>
  {:else if connectionMode === 'sse'}
    <div class="protocol-panel">
      <SSEPanel />
    </div>
  {:else}
  <ConflictBanner
    onReload={() => onConflictReload?.()}
    onKeep={() => onConflictKeep?.()}
  />
  {#if showSaveNudge}
    <SaveNudgeBanner
      {collectionId}
      {collectionName}
      {collections}
      {onSaveToCollection}
      onDismiss={onDismissNudge}
    />
  {/if}
  <div class="panels" class:horizontal={panelLayout === 'horizontal'} style={panelGridStyle}>
    <!-- Request Panel -->
    <section class="request-panel">
      <div class="panel-tabs">
        {#each requestTabs as tab}
          <button
            class="panel-tab"
            class:active={activeRequestTab === tab.id}
            onclick={() => setRequestTab(tab.id)}
          >
            {tab.label}{#if tab.badge}<span class="tab-badge">{tab.badge}</span>{/if}
          </button>
        {/each}
        <div class="tab-bar-actions">
          <CodegenButton />
          <CollectionSaveButton {collectionId} {collectionName} {collections} {onSaveToCollection} onSaveRequest={handleSaveRequest} onRevertRequest={handleRevertRequest} />
        </div>
      </div>

      <div class="panel-content">
        {#if activeRequestTab === 'query'}
          <KeyValueEditor
            items={params}
            keyPlaceholder="Parameter"
            valuePlaceholder="Value"
            emptyText="No params added yet"
            showDescription={true}
            onchange={handleParamsChange}
          />
        {:else if activeRequestTab === 'path'}
          <PathParamsEditor
            items={pathParams}
            onchange={handlePathParamsChange}
          />
        {:else if activeRequestTab === 'headers'}
          <InheritedHeadersViewer inheritedHeaders={collectionScopedHeaders()} />
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
            emptyText="No request headers added yet"
            onchange={handleHeadersChange}
            keySuggestions={COMMON_HTTP_HEADERS}
            keyDescriptions={HTTP_HEADER_DESCRIPTIONS}
            valueSuggestions={HTTP_HEADER_VALUES}
          />
        {:else if activeRequestTab === 'auth'}
          {#if requestContext()?.collectionId}
            <AuthInheritanceSelector
              mode={request.authInheritance}
              inheritedFromName={requestContext().collectionName}
              onchange={setAuthInheritance}
            />
          {/if}
          {#if !request.authInheritance || request.authInheritance === 'own'}
            <AuthEditor
              {auth}
              onchange={handleAuthChange}
            />
          {/if}
        {:else if activeRequestTab === 'body'}
          <BodyEditor
            {body}
            onchange={handleBodyChange}
            url={request.url}
            headers={request.headers}
            auth={request.auth}
          />
        {:else if activeRequestTab === 'tests'}
          <AssertionEditor />
        {:else if activeRequestTab === 'scripts'}
          <ScriptEditor scripts={request.scripts} inheritedScripts={collectionScopedScripts()} onchange={setScripts} />
        {:else if activeRequestTab === 'notes'}
          <NotesEditor value={description} onchange={setDescription} />
        {:else if activeRequestTab === 'settings'}
          <RequestSettingsPanel ssl={request.ssl} proxy={request.proxy} timeout={request.timeout} followRedirects={request.followRedirects} maxRedirects={request.maxRedirects} onSslChange={setSsl} onProxyChange={setProxy} onTimeoutChange={setTimeout} onRedirectsChange={setRedirects} />
        {/if}
      </div>
    </section>

    <PanelSplitter orientation={panelLayout} />

    <!-- Response Panel -->
    <section class="response-panel">
      <div class="response-header">
        {#if loading}
          <span class="status loading">{downloadProgress() ? `Downloading... ${formatBytes(downloadProgress()!.loaded)}` : 'Sending request...'}</span>
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
          <span class="meta"><SizeBreakdownPopup totalSize={currentResponse.size} breakdown={currentResponse.sizeBreakdown} /></span>
        {:else}
          <span class="status idle">Ready</span>
        {/if}
        <!-- History toggle disabled - history is in sidebar tab now -->
        <Tooltip text={panelLayout === 'vertical' ? `Switch to horizontal layout (${toggleLayoutDisplay})` : `Switch to vertical layout (${toggleLayoutDisplay})`}>
          <button
            class="layout-toggle-btn"
            onclick={handleToggleLayout}
            aria-label={panelLayout === 'vertical' ? 'Switch to horizontal layout' : 'Switch to vertical layout'}
          >
            <i class="codicon {panelLayout === 'vertical' ? 'codicon-split-horizontal' : 'codicon-split-vertical'}"></i>
          </button>
        </Tooltip>
        <Tooltip text="Cookie Jar">
          <button
            class="cookie-jar-btn"
            onclick={() => cookieJarOpen = !cookieJarOpen}
            aria-label="Cookie Jar"
          >
            <svg class="cookie-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M13.5 5C13.5 4.4 13 4 12.5 4H11.7C11.9 3.4 12 2.7 12 2c0-.6-.4-1-1-1H5c-.6 0-1 .4-1 1 0 .7.1 1.4.3 2H3.5C3 4 2.5 4.4 2.5 5v8.5c0 .8.7 1.5 1.5 1.5h8c.8 0 1.5-.7 1.5-1.5V5zM5 2h6c0 .5-.1 1-.2 1.4-.1.2-.1.4-.2.6H5.4c-.1-.2-.2-.4-.2-.6C5.1 3 5 2.5 5 2zm6.5 11.5c0 .3-.2.5-.5.5H5c-.3 0-.5-.2-.5-.5V5h7v8.5z"/>
              <circle cx="6" cy="8" r="0.8"/>
              <circle cx="8.5" cy="10" r="0.8"/>
              <circle cx="10" cy="7.5" r="0.8"/>
            </svg>
          </button>
        </Tooltip>
      </div>

      <div class="panel-tabs">
        {#each responseTabs as tab}
          <button
            class="panel-tab"
            class:active={activeResponseTab === tab.id}
            onclick={() => setResponseTab(tab.id)}
          >
            {tab.label}
            {#if tab.badge}
              <span class="tab-badge">{tab.badge}</span>
            {/if}
          </button>
        {/each}
      </div>

      <div class="panel-content response-content">
        {#if loading}
          <div class="loading-indicator">
            <div class="spinner"></div>
            {#if downloadProgress()}
              {@const dp = downloadProgress()!}
              <p>Downloading... {formatBytes(dp.loaded)}{dp.total ? ` / ${formatBytes(dp.total)}` : ''}</p>
              <div class="progress-bar-container">
                {#if dp.total}
                  <div class="progress-bar-fill" style="width: {Math.min(100, (dp.loaded / dp.total) * 100)}%"></div>
                {:else}
                  <div class="progress-bar-fill indeterminate"></div>
                {/if}
              </div>
            {:else}
              <p>Sending request...</p>
            {/if}
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
              method={request.method}
              url={request.url}
            />
          {:else if activeResponseTab === 'headers'}
            <ResponseHeaders
              headers={currentResponse.headers}
              httpVersion={currentResponse.httpVersion}
              remoteAddress={currentResponse.remoteAddress}
              requestHeaders={currentResponse.requestHeaders}
              requestUrl={currentResponse.requestUrl}
            />
          {:else if activeResponseTab === 'cookies'}
            <CookiesViewer headers={currentResponse.headers} requestHeaders={currentResponse.requestHeaders} />
          {:else if activeResponseTab === 'timing'}
            <TimingBreakdown timing={currentResponse.timing ?? null} timeout={effectiveTimeout} followRedirects={effectiveFollowRedirects} maxRedirects={effectiveMaxRedirects} />
          {:else if activeResponseTab === 'timeline'}
            <RequestTimeline events={currentResponse.timeline ?? []} />
          {:else if activeResponseTab === 'tests'}
            <AssertionResults results={testResults} />
          {:else if activeResponseTab === 'scripts'}
            <ScriptOutput />
          {/if}
        {:else}
          <div class="shortcuts-hint">
            <span class="shortcuts-title">Shortcuts</span>
            <div class="shortcut-row">
              <span class="shortcut-label">Send Request</span>
              <span class="shortcut-keys">{#each sendShortcutDisplay.split('+') as part, i}{#if i > 0}<span class="key-sep">+</span>{/if}<kbd>{part}</kbd>{/each}</span>
            </div>
            <div class="shortcut-row">
              <span class="shortcut-label">Toggle Layout</span>
              <span class="shortcut-keys">{#each toggleLayoutDisplay.split('+') as part, i}{#if i > 0}<span class="key-sep">+</span>{/if}<kbd>{part}</kbd>{/each}</span>
            </div>
            <div class="shortcut-row">
              <span class="shortcut-label">New Request</span>
              <span class="shortcut-keys"><kbd>Ctrl</kbd><span class="key-sep">+</span><kbd>N</kbd></span>
            </div>
            <div class="shortcut-row">
              <span class="shortcut-label">Focus URL</span>
              <span class="shortcut-keys"><kbd>Ctrl</kbd><span class="key-sep">+</span><kbd>L</kbd></span>
            </div>
            <div class="shortcut-row">
              <span class="shortcut-label">Import cURL</span>
              <span class="shortcut-keys"><kbd>Ctrl</kbd><span class="key-sep">+</span><kbd>U</kbd></span>
            </div>
            <div class="shortcut-row">
              <span class="shortcut-label">Toggle History</span>
              <span class="shortcut-keys"><kbd>Ctrl</kbd><span class="key-sep">+</span><kbd>Shift</kbd><span class="key-sep">+</span><kbd>H</kbd></span>
            </div>
          </div>
        {/if}
      </div>
    </section>
  </div>

  <!-- History Drawer (disabled - history is in sidebar tab now) -->
  <!-- <HistoryDrawer postMessage={messageBus} {requestId} /> -->
  {/if}

  <!-- Cookie Jar floating panel -->
  {#if cookieJarOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="cookie-jar-overlay" onclick={() => cookieJarOpen = false}>
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="cookie-jar-modal" onclick={(e) => e.stopPropagation()}>
        <div class="cookie-jar-modal-header">
          <svg class="cookie-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.5 5C13.5 4.4 13 4 12.5 4H11.7C11.9 3.4 12 2.7 12 2c0-.6-.4-1-1-1H5c-.6 0-1 .4-1 1 0 .7.1 1.4.3 2H3.5C3 4 2.5 4.4 2.5 5v8.5c0 .8.7 1.5 1.5 1.5h8c.8 0 1.5-.7 1.5-1.5V5zM5 2h6c0 .5-.1 1-.2 1.4-.1.2-.1.4-.2.6H5.4c-.1-.2-.2-.4-.2-.6C5.1 3 5 2.5 5 2zm6.5 11.5c0 .3-.2.5-.5.5H5c-.3 0-.5-.2-.5-.5V5h7v8.5z"/>
            <circle cx="6" cy="8" r="0.8"/>
            <circle cx="8.5" cy="10" r="0.8"/>
            <circle cx="10" cy="7.5" r="0.8"/>
          </svg>
          <span>Cookie Jar</span>
          <button class="cookie-jar-close" onclick={() => cookieJarOpen = false} aria-label="Close">
            <i class="codicon codicon-close"></i>
          </button>
        </div>
        <div class="cookie-jar-modal-body">
          <CookieJarPanel />
        </div>
      </div>
    </div>
  {/if}

  <!-- Command palette modal overlay -->
  {#if showPalette}
    <CommandPaletteApp
      collections={paletteCollections}
      environments={paletteEnvironments}
      isModal={true}
      onclose={onPaletteClose}
      onselect={onPaletteSelect}
    />
  {/if}

  <!-- Save toast feedback -->
  {#if showSaveToast}
    <Toast message="Saved to collection" onDismiss={() => onDismissSaveToast?.()} />
  {/if}
</main>

<style>
  .main-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
    height: 100%;
  }

  .protocol-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .panels {
    flex: 1;
    display: grid;
    overflow: hidden;
    height: 100%;
  }

  .request-panel,
  .response-panel {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
    min-width: 0;
    height: 100%;
  }

  .response-header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 8px 12px;
    background: var(--hf-editor-background);
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .status {
    font-weight: 600;
    font-size: 13px;
  }

  .status.idle {
    color: var(--hf-descriptionForeground);
  }

  .status.loading {
    color: var(--hf-charts-blue);
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
    color: var(--hf-descriptionForeground);
  }

  .history-toggle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 3px;
    color: var(--hf-foreground);
    cursor: pointer;
    opacity: 0.6;
    transition: opacity 0.15s, background 0.15s, border-color 0.15s;
    margin-left: auto;
  }

  .history-toggle-btn:hover {
    opacity: 1;
    background: var(--hf-list-hoverBackground);
    border-color: var(--hf-panel-border);
  }


  .layout-toggle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 3px;
    color: var(--hf-foreground);
    cursor: pointer;
    opacity: 0.6;
    transition: opacity 0.15s, background 0.15s, border-color 0.15s;
  }

  .layout-toggle-btn:hover {
    opacity: 1;
    background: var(--hf-list-hoverBackground);
    border-color: var(--hf-panel-border);
  }

  .layout-toggle-btn .codicon {
    font-size: 14px;
  }

  .cookie-jar-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 3px;
    color: var(--hf-foreground);
    cursor: pointer;
    opacity: 0.6;
    transition: opacity 0.15s, background 0.15s, border-color 0.15s;
  }

  .cookie-jar-btn:hover {
    opacity: 1;
    background: var(--hf-list-hoverBackground);
    border-color: var(--hf-panel-border);
  }



  .panel-tabs {
    display: flex;
    gap: 4px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--hf-panel-border);
    background: var(--hf-editor-background);
    overflow-x: auto;
  }

  .tab-bar-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
  }

  .panel-tab {
    position: relative;
    padding: 6px 12px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--hf-foreground);
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
    border-bottom-color: var(--hf-focusBorder);
  }

  .tab-badge {
    position: absolute;
    top: -2px;
    right: -4px;
    font-size: 9px;
    line-height: 1;
    min-width: 14px;
    padding: 2px 5px;
    border-radius: 3px;
    background: var(--hf-badge-background);
    color: var(--hf-badge-foreground);
    text-align: center;
    font-weight: 600;
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
    background: var(--hf-textCodeBlock-background, rgba(128, 128, 128, 0.08));
    border: 1px solid var(--hf-panel-border);
    border-radius: 4px;
    font-size: 12px;
    font-family: var(--hf-editor-font-family, monospace);
  }

  .auto-badge {
    padding: 1px 5px;
    background: var(--hf-badge-background);
    color: var(--hf-badge-foreground);
    border-radius: 3px;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.5px;
  }

  .auto-key {
    color: var(--hf-symbolIcon-propertyForeground, #9cdcfe);
    font-weight: 600;
  }

  .auto-value {
    color: var(--hf-descriptionForeground);
  }

  .placeholder {
    color: var(--hf-descriptionForeground);
    font-style: italic;
    font-size: 13px;
  }

  .shortcuts-hint {
    display: flex;
    flex-direction: column;
    gap: 14px;
    justify-content: center;
    align-items: center;
    height: 100%;
    padding: 24px;
  }

  .shortcuts-title {
    color: var(--hf-descriptionForeground);
    font-size: 14px;
    font-style: italic;
    margin-bottom: 4px;
  }

  .shortcut-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    width: 300px;
  }

  .shortcut-label {
    color: var(--hf-descriptionForeground);
    font-size: 13px;
    white-space: nowrap;
  }

  .shortcut-keys {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 4px;
    width: 130px;
  }

  .key-sep {
    color: var(--hf-keybindingLabel-foreground, var(--hf-foreground));
    font-size: 10px;
  }

  .shortcuts-hint kbd {
    font-family: var(--hf-editor-font-family, monospace);
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 4px;
    border: 1px solid var(--hf-widget-border, #454545);
    background: var(--hf-keybindingLabel-background, rgba(128, 128, 128, 0.17));
    color: var(--hf-keybindingLabel-foreground, var(--hf-foreground));
    box-shadow: inset 0 -1px 0 var(--hf-widget-shadow, rgba(0, 0, 0, 0.16));
    white-space: nowrap;
    min-width: 24px;
    text-align: center;
  }

  .response-content {
    background: var(--hf-editor-background);
  }

  .loading-indicator {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 12px;
    color: var(--hf-descriptionForeground);
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--hf-panel-border);
    border-top-color: var(--hf-focusBorder);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .progress-bar-container {
    width: 200px;
    height: 4px;
    background: var(--hf-panel-border);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-bar-fill {
    height: 100%;
    background: var(--hf-focusBorder);
    border-radius: 2px;
    transition: width 0.15s ease;
  }

  .progress-bar-fill.indeterminate {
    width: 40%;
    animation: indeterminate 1.2s ease-in-out infinite;
  }

  @keyframes indeterminate {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(350%); }
  }

  /* Cookie Jar Modal */
  .cookie-jar-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .cookie-jar-modal {
    width: 520px;
    max-width: 90%;
    max-height: 70vh;
    background: var(--hf-editor-background);
    border: 1px solid var(--hf-panel-border);
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .cookie-jar-modal-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--hf-panel-border);
    font-size: 13px;
    font-weight: 600;
  }

  .cookie-jar-modal-header .cookie-icon {
    color: var(--hf-descriptionForeground);
    flex-shrink: 0;
  }

  .cookie-jar-close {
    margin-left: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    background: transparent;
    border: none;
    border-radius: 3px;
    color: var(--hf-foreground);
    cursor: pointer;
    opacity: 0.6;
  }

  .cookie-jar-close:hover {
    opacity: 1;
    background: var(--hf-list-hoverBackground);
  }

  .cookie-jar-modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 8px 14px 14px;
  }
</style>
