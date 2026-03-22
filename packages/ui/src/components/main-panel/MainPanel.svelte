<script lang="ts">
  import { ui, setRequestTab, setResponseTab, response, isLoading, setLoading, request, setParams, setHeaders, setAuth, setBody, downloadProgress, formatBytes } from '../../stores';
  import { setPathParams } from '../../stores/request.svelte';
  import { togglePanelLayout, setPanelLayout, toggleHistoryDrawer, toggleResponseWordWrap } from '../../stores/ui.svelte';
  import type { AuthState, BodyState } from '../../stores/request.svelte';
  import { setDescription, setScripts, setSsl, setProxy, setTimeout as setRequestTimeout, setRedirects, isDirty, requestContext, setAuthInheritance, setScriptInheritance } from '../../stores/request.svelte';
  import RequestSettingsPanel from '../shared/RequestSettingsPanel.svelte';
  import type { Collection, CollectionItem, ResponseExample } from '../../types';
  import { isRequest, isFolder, generateId } from '../../types';
  import ExamplesTab from '../shared/ExamplesTab.svelte';
  import UrlBar from './UrlBar.svelte';
  import ActionBar from './ActionBar.svelte';
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
  import GrpcPanel from '../shared/GrpcPanel.svelte';
  import GrpcResponseViewer from '../shared/GrpcResponseViewer.svelte';
  import GraphQLSubscriptionPanel from '../shared/GraphQLSubscriptionPanel.svelte';
  import SaveNudgeBanner from '../shared/SaveNudgeBanner.svelte';
  import ConflictBanner from '../shared/ConflictBanner.svelte';
  import InheritedHeadersViewer from '../shared/InheritedHeadersViewer.svelte';
  import AuthInheritanceSelector from '../shared/AuthInheritanceSelector.svelte';
  import ScriptInheritanceSelector from '../shared/ScriptInheritanceSelector.svelte';
  import { collectionScopedHeaders, collectionScopedScripts } from '../../stores/environment.svelte';

  import ResponseViewer from '../shared/ResponseViewer.svelte';
  import ResponseHeaders from '../shared/ResponseHeaders.svelte';
  import CookiesViewer from '../shared/CookiesViewer.svelte';
  import { parseCookies, parseSentCookies } from '../../lib/cookie-parser';
  import TimingBreakdown from '../shared/TimingBreakdown.svelte';
  import RequestTimeline from '../shared/RequestTimeline.svelte';
  import SettingsPage from '../shared/SettingsPage.svelte';
  import NotesEditor from '../shared/NotesEditor.svelte';
  import Tooltip from '../shared/Tooltip.svelte';
  import SizeBreakdownPopup from '../shared/SizeBreakdownPopup.svelte';
  import CommandPaletteApp from '../palette/CommandPaletteApp.svelte';
  import Toast from '../shared/Toast.svelte';
  import { formatSize, substitutePathParams } from '@nouto/core';
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
  import type { OutgoingMessage } from '@nouto/transport/messages';

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

  // Editor zoom (local, per-session, not persisted)
  const ZOOM_STEP = 2;
  const ZOOM_MIN = -2;
  const ZOOM_MAX = 24;

  let requestZoom = $state(0);
  let responseZoom = $state(0);

  function requestZoomIn() { requestZoom = Math.min(requestZoom + ZOOM_STEP, ZOOM_MAX); }
  function requestZoomOut() { requestZoom = Math.max(requestZoom - ZOOM_STEP, ZOOM_MIN); }
  function requestZoomReset() { requestZoom = 0; }

  function responseZoomIn() { responseZoom = Math.min(responseZoom + ZOOM_STEP, ZOOM_MAX); }
  function responseZoomOut() { responseZoom = Math.max(responseZoom - ZOOM_STEP, ZOOM_MIN); }
  function responseZoomReset() { responseZoom = 0; }

  function computeZoomStyle(zoom: number): string {
    if (zoom === 0) return '';
    const base = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hf-editor-font-size') || '13');
    return `--hf-editor-font-size: ${base + zoom}px`;
  }

  const requestZoomStyle = $derived.by(() => computeZoomStyle(requestZoom));
  const responseZoomStyle = $derived.by(() => computeZoomStyle(responseZoom));

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
        scriptInheritance: request.scriptInheritance,
        scripts: request.scripts,
        ssl: request.ssl,
        proxy: request.proxy,
        timeout: request.timeout,
        followRedirects: request.followRedirects,
        maxRedirects: request.maxRedirects,
        requestId: requestContext()?.requestId,
        requestName: request.name,
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
      data: $state.snapshot({
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
          scriptInheritance: request.scriptInheritance,
          scripts: request.scripts,
          description: request.description || undefined,
          connectionMode: connectionMode,
          ssl: request.ssl,
          proxy: request.proxy,
          timeout: request.timeout,
          followRedirects: request.followRedirects,
          maxRedirects: request.maxRedirects,
          grpc: request.grpc,
          createdAt: '',
          updatedAt: new Date().toISOString(),
        },
      }),
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
    // Focus active request in sidebar
    const focusBinding = shortcuts.get('focusActiveRequest');
    if (focusBinding && matchesBinding(event, focusBinding)) {
      event.preventDefault();
      messageBus({ type: 'revealActiveRequest' } as any);
      return;
    }
    // Request tab switching shortcuts
    const tabMap: Record<string, RequestTab> = {
      switchTabQuery: 'query',
      switchTabHeaders: 'headers',
      switchTabAuth: 'auth',
      switchTabBody: 'body',
      switchTabTests: 'tests',
      switchTabScripts: 'scripts',
      switchTabNotes: 'notes',
    };
    for (const [action, tab] of Object.entries(tabMap)) {
      const binding = shortcuts.get(action as any);
      if (binding && matchesBinding(event, binding)) {
        event.preventDefault();
        setRequestTab(tab);
        return;
      }
    }
    // Response tab switching shortcuts
    const responseTabMap: Record<string, ResponseTab> = {
      switchResponseBody: 'body',
      switchResponseHeaders: 'headers',
      switchResponseCookies: 'cookies',
      switchResponseTiming: 'timing',
      switchResponseTimeline: 'timeline',
    };
    for (const [action, tab] of Object.entries(responseTabMap)) {
      const binding = shortcuts.get(action as any);
      if (binding && matchesBinding(event, binding)) {
        event.preventDefault();
        setResponseTab(tab);
        return;
      }
    }
    // Toggle word wrap in response viewer
    const wrapBinding = shortcuts.get('toggleWordWrap');
    if (wrapBinding && matchesBinding(event, wrapBinding)) {
      event.preventDefault();
      toggleResponseWordWrap();
      return;
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

  // --- Saved Examples ---

  const MAX_EXAMPLE_BODY_BYTES = 200 * 1024; // 200 KB

  let previewExample = $state<ResponseExample | null>(null);
  let savingExample = $state(false);
  let newExampleName = $state('');
  let saveExampleSizeError = $state<string | null>(null);

  function findRequestInItems(items: CollectionItem[], id: string): { examples?: ResponseExample[] } | null {
    for (const item of items) {
      if (isRequest(item) && item.id === id) return item;
      if (isFolder(item)) {
        const found = findRequestInItems(item.children, id);
        if (found) return found;
      }
    }
    return null;
  }

  const currentRequestExamples = $derived.by((): ResponseExample[] => {
    const ctx = requestContext();
    if (!ctx) return [];
    const coll = collections.find((c) => c.id === ctx.collectionId);
    if (!coll) return [];
    const req = findRequestInItems(coll.items, ctx.requestId);
    return req?.examples ?? [];
  });

  function parseExampleBody(example: ResponseExample): any {
    return example.body;
  }

  function estimateBodyBytes(data: any): number {
    if (data === null || data === undefined) return 0;
    if (typeof data === 'string') return data.length;
    try { return JSON.stringify(data).length; } catch { return 0; }
  }

  function handleSaveAsExample() {
    const res = currentResponse;
    if (!res) return;
    const bytes = estimateBodyBytes(res.data);
    if (bytes > MAX_EXAMPLE_BODY_BYTES) {
      saveExampleSizeError = `Response body is too large to save as an example (${formatSize(bytes)} — limit is ${formatSize(MAX_EXAMPLE_BODY_BYTES)}).`;
      savingExample = true;
      return;
    }
    saveExampleSizeError = null;
    newExampleName = `${res.status} ${res.statusText || 'Response'}`;
    savingExample = true;
  }

  function handleConfirmSaveExample() {
    const ctx = requestContext();
    const res = currentResponse;
    if (!ctx || !res || !newExampleName.trim()) return;

    const example: ResponseExample = {
      id: generateId(),
      name: newExampleName.trim(),
      status: res.status,
      statusText: res.statusText,
      headers: res.headers ?? {},
      body: res.data,
      contentCategory: res.contentCategory,
      size: res.size,
      duration: res.duration,
      createdAt: new Date().toISOString(),
    };

    messageBus({
      type: 'addResponseExample',
      data: {
        panelId: ctx.panelId,
        requestId: ctx.requestId,
        collectionId: ctx.collectionId,
        example: $state.snapshot(example) as ResponseExample,
      },
    });

    savingExample = false;
    newExampleName = '';
  }

  function handleDeleteExample(exampleId: string) {
    const ctx = requestContext();
    if (!ctx) return;
    messageBus({
      type: 'deleteResponseExample',
      data: {
        panelId: ctx.panelId,
        requestId: ctx.requestId,
        collectionId: ctx.collectionId,
        exampleId,
      },
    });
    if (previewExample?.id === exampleId) previewExample = null;
  }

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
    tabs.push({ id: 'settings', label: 'Settings' });
    if (requestContext()) {
      tabs.push({ id: 'examples', label: currentRequestExamples.length > 0 ? `Examples (${currentRequestExamples.length})` : 'Examples' });
    }
    tabs.push({ id: 'notes', label: description ? 'Notes *' : 'Notes' });
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
    // In example preview mode, only show body and headers
    if (previewExample) {
      const resHeaderCount = previewExample.headers ? Object.keys(previewExample.headers).length : 0;
      return [
        { id: 'body' as ResponseTab, label: 'Body' },
        { id: 'headers' as ResponseTab, label: 'Headers', badge: resHeaderCount > 0 ? `${resHeaderCount}` : undefined },
      ];
    }

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
  <ActionBar
    {collectionId}
    {collections}
    {postMessage}
  />
  <UrlBar
    {postMessage}
    {collectionId}
    {collectionName}
    {collections}
    {onSaveToCollection}
    onSaveRequest={handleSaveRequest}
    onRevertRequest={handleRevertRequest}
  />

  {#if settingsOpen()}
    <SettingsPage onclose={() => setSettingsOpen(false)} />
  {:else if connectionMode === 'graphql-ws'}
    <div class="protocol-panel">
      <GraphQLSubscriptionPanel />
    </div>
  {:else if connectionMode === 'websocket'}
    <div class="protocol-panel">
      <WebSocketPanel />
    </div>
  {:else if connectionMode === 'grpc'}
    <div class="panels" class:horizontal={panelLayout === 'horizontal'} style={panelGridStyle}>
      <section class="request-panel">
        <GrpcPanel />
      </section>
      <PanelSplitter orientation={panelLayout} />
      <section class="response-panel">
        <GrpcResponseViewer />
      </section>
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
    <section class="request-panel" style={requestZoomStyle}>
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
            showBulkEdit={true}
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
            zoom={requestZoom}
            zoomMin={ZOOM_MIN}
            zoomMax={ZOOM_MAX}
            onZoomIn={requestZoomIn}
            onZoomOut={requestZoomOut}
            onZoomReset={requestZoomReset}
          />
        {:else if activeRequestTab === 'tests'}
          <AssertionEditor />
        {:else if activeRequestTab === 'scripts'}
          {#if requestContext()?.collectionId}
            <ScriptInheritanceSelector
              mode={request.scriptInheritance}
              hasInheritedScripts={collectionScopedScripts().length > 0}
              onchange={setScriptInheritance}
            />
          {/if}
          <ScriptEditor
            scripts={request.scripts}
            inheritedScripts={request.scriptInheritance === 'own' ? [] : collectionScopedScripts()}
            onchange={setScripts}
          />
        {:else if activeRequestTab === 'notes'}
          <NotesEditor value={description} onchange={setDescription} />
        {:else if activeRequestTab === 'settings'}
          <RequestSettingsPanel ssl={request.ssl} proxy={request.proxy} timeout={request.timeout} followRedirects={request.followRedirects} maxRedirects={request.maxRedirects} onSslChange={setSsl} onProxyChange={setProxy} onTimeoutChange={setRequestTimeout} onRedirectsChange={setRedirects} />
        {:else if activeRequestTab === 'examples'}
          <ExamplesTab
            examples={currentRequestExamples}
            onpreview={(ex) => { previewExample = ex; setResponseTab('body'); }}
            ondelete={handleDeleteExample}
          />
        {/if}
      </div>
    </section>

    <PanelSplitter orientation={panelLayout} />

    <!-- Response Panel -->
    <section class="response-panel" style={responseZoomStyle}>
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
        {#if currentResponse && !isNetworkError && requestContext() && !previewExample}
          {#if savingExample}
            <div class="save-example-form">
              {#if saveExampleSizeError}
                <span class="example-size-error">
                  <i class="codicon codicon-warning"></i>
                  {saveExampleSizeError}
                </span>
              {:else}
                <input
                  class="example-name-input"
                  type="text"
                  placeholder="Example name"
                  bind:value={newExampleName}
                  onkeydown={(e) => { if (e.key === 'Enter') handleConfirmSaveExample(); if (e.key === 'Escape') { savingExample = false; newExampleName = ''; } }}
                />
                <Tooltip text="Save" position="bottom">
                  <button class="example-form-btn confirm" onclick={handleConfirmSaveExample} aria-label="Save example">
                    <i class="codicon codicon-check"></i>
                  </button>
                </Tooltip>
              {/if}
              <Tooltip text="Cancel" position="bottom">
                <button class="example-form-btn" onclick={() => { savingExample = false; newExampleName = ''; saveExampleSizeError = null; }} aria-label="Cancel">
                  <i class="codicon codicon-close"></i>
                </button>
              </Tooltip>
            </div>
          {:else}
            <Tooltip text="Save as Example">
              <button class="save-example-btn" onclick={handleSaveAsExample} aria-label="Save as Example">
                <i class="codicon codicon-save"></i>
              </button>
            </Tooltip>
          {/if}
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
      </div>

      {#if previewExample}
        <div class="example-preview-banner">
          <i class="codicon codicon-beaker"></i>
          <span>Viewing example: <strong>{previewExample.name}</strong></span>
          <button class="close-preview-btn" onclick={() => previewExample = null} aria-label="Close example preview">
            <i class="codicon codicon-close"></i>
          </button>
        </div>
      {/if}

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
        <div class="zoom-controls">
          <Tooltip text="Decrease font size (double-click to reset)" position="bottom">
            <button class="zoom-btn" onclick={responseZoomOut} ondblclick={responseZoomReset} disabled={responseZoom <= ZOOM_MIN} aria-label="Decrease font size">
              <i class="codicon codicon-zoom-out"></i>
            </button>
          </Tooltip>
          {#if responseZoom !== 0}
            <Tooltip text="Reset zoom" position="bottom">
              <button class="zoom-badge" onclick={responseZoomReset} aria-label="Reset zoom">
                {responseZoom > 0 ? '+' : ''}{responseZoom}
              </button>
            </Tooltip>
          {/if}
          <Tooltip text="Increase font size" position="bottom">
            <button class="zoom-btn" onclick={responseZoomIn} disabled={responseZoom >= ZOOM_MAX} aria-label="Increase font size">
              <i class="codicon codicon-zoom-in"></i>
            </button>
          </Tooltip>
        </div>
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
        {:else if previewExample}
          {#if activeResponseTab === 'body'}
            <ResponseViewer
              data={parseExampleBody(previewExample)}
              contentType={previewExample.headers['content-type'] || ''}
              contentCategory={previewExample.contentCategory}
              error={false}
              method={request.method}
              url={request.url}
            />
          {:else if activeResponseTab === 'headers'}
            <ResponseHeaders headers={previewExample.headers} />
          {/if}
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

  .save-example-btn {
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

  .save-example-btn:hover {
    opacity: 1;
    background: var(--hf-list-hoverBackground);
    border-color: var(--hf-panel-border);
  }

  .save-example-form {
    display: flex;
    align-items: center;
    gap: 3px;
    flex: 1;
    min-width: 0;
  }

  .example-name-input {
    flex: 1;
    min-width: 80px;
    max-width: 180px;
    padding: 2px 6px;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 3px;
    font-size: 12px;
    outline: none;
  }

  .example-name-input:focus {
    border-color: var(--hf-focusBorder);
  }

  .example-form-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 3px 5px;
    background: transparent;
    border: none;
    border-radius: 3px;
    color: var(--hf-foreground);
    cursor: pointer;
    font-size: 13px;
    opacity: 0.7;
    transition: opacity 0.1s, background 0.1s;
  }

  .example-form-btn:hover {
    opacity: 1;
    background: var(--hf-toolbar-hoverBackground, rgba(127, 127, 127, 0.1));
  }

  .example-form-btn.confirm {
    color: var(--hf-terminal-ansiGreen);
    opacity: 1;
  }

  .example-size-error {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: var(--hf-errorForeground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 260px;
  }

  .example-size-error .codicon {
    flex-shrink: 0;
  }

  .example-preview-banner {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    background: var(--hf-editorInfo-background);
    border-bottom: 1px solid var(--hf-editorInfo-border);
    font-size: 12px;
    color: var(--hf-foreground);
  }

  .example-preview-banner .codicon-beaker {
    color: var(--hf-editorInfo-foreground);
    flex-shrink: 0;
  }

  .example-preview-banner span {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .close-preview-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2px 4px;
    background: transparent;
    border: none;
    border-radius: 3px;
    color: var(--hf-foreground);
    cursor: pointer;
    opacity: 0.6;
    flex-shrink: 0;
    transition: opacity 0.1s;
  }

  .close-preview-btn:hover {
    opacity: 1;
  }

  .panel-tabs {
    display: flex;
    gap: 4px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--hf-panel-border);
    background: var(--hf-editor-background);
    overflow-x: auto;
  }

  .zoom-controls {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-left: auto;
    flex-shrink: 0;
  }

  .zoom-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 3px;
    color: var(--hf-descriptionForeground);
    cursor: pointer;
    opacity: 0.7;
    transition: opacity 0.15s, background 0.15s;
  }

  .zoom-btn:hover:not(:disabled) {
    opacity: 1;
    background: var(--hf-toolbar-hoverBackground);
  }

  .zoom-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .zoom-badge {
    font-size: 10px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    padding: 1px 4px;
    background: var(--hf-badge-background);
    color: var(--hf-badge-foreground);
    border: none;
    border-radius: 8px;
    cursor: pointer;
    line-height: 14px;
  }

  .zoom-badge:hover {
    opacity: 0.8;
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

</style>
