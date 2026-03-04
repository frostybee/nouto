<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { formatData, formatDataRaw, isJsonContent, filterByJsonPath, computeJsonStats, categorizeContentType, type ContentCategory } from '@hivefetch/core';
  import { resolveLanguageFromContentType, languageFileExtensions, type LanguageId } from '../../lib/codemirror/language-support';
  import { postMessage } from '../../lib/vscode';
  import CopyButton from './CopyButton.svelte';
  import CodeMirrorViewer, { type EditorActions } from './CodeMirrorViewer.svelte';
  import FoldDepthDropdown from './FoldDepthDropdown.svelte';
  import JsonPathBar from './JsonPathBar.svelte';
  import JsonPathFilter from './JsonPathFilter.svelte';
  import JsonTreeView from './JsonTreeView.svelte';
  import ResponseDiffView from './ResponseDiffView.svelte';
  import ImagePreview from './ImagePreview.svelte';
  import HtmlPreview from './HtmlPreview.svelte';
  import PdfPreview from './PdfPreview.svelte';
  import BinaryPreview from './BinaryPreview.svelte';
  import JsonStatsPanel from './JsonStatsPanel.svelte';
  import XmlTreeView from './XmlTreeView.svelte';
  import { previousResponseBody } from '../../stores/responseDiff';
  import Tooltip from './Tooltip.svelte';

  interface Props {
    data?: any;
    contentType?: string;
    contentCategory?: ContentCategory;
    error?: boolean;
    errorInfo?: { category: string; message: string; suggestion: string } | null;
    onRetry?: () => void;
    method?: string;
    url?: string;
  }
  let { data = null, contentType = '', contentCategory, error = false, errorInfo = null, onRetry, method, url }: Props = $props();

  const effectiveCategory = $derived(contentCategory || categorizeContentType(contentType));

  const categoryIcons: Record<string, string> = {
    network: 'codicon-globe',
    timeout: 'codicon-watch',
    dns: 'codicon-search',
    ssl: 'codicon-lock',
    connection: 'codicon-plug',
    server: 'codicon-server',
    unknown: 'codicon-question',
  };

  const categoryColors: Record<string, string> = {
    network: '#f0ad4e',
    timeout: '#f0ad4e',
    dns: '#d9534f',
    ssl: '#d9534f',
    connection: '#d9534f',
    server: '#d9534f',
    unknown: '#777',
  };

  let editorActions = $state<EditorActions | null>(null);
  let prettyMode = $state(true);
  let jsonPath = $state('');
  let filterActive = $state(false);
  let filterQuery = $state('');
  let filterMatchCount = $state(0);
  let filterError = $state<string | null>(null);
  let viewMode = $state<'text' | 'tree'>('text');
  let showDiff = $state(false);
  let showStats = $state(false);
  const RESPONSE_WRAP_KEY = 'hivefetch-response-wordwrap';
  let wordWrap = $state(localStorage.getItem(RESPONSE_WRAP_KEY) === 'true');
  let overflowOpen = $state(false);
  let overflowRef = $state<HTMLDivElement>(undefined!);
  let compactMode = $state(false);
  let toolbarEl = $state<HTMLDivElement>(undefined!);
  let resizeObserver: ResizeObserver | undefined;

  const COMPACT_THRESHOLD = 500;

  const isJson = $derived(isJsonContent(contentType, data));
  const jsonStats = $derived(showStats && isJson && data ? computeJsonStats(data) : null);
  const formattedData = $derived(
    isJson
      ? (prettyMode ? formatData(data) : formatDataRaw(data))
      : formatData(data)
  );

  const displayData = $derived.by(() => {
    if (!filterActive || !filterQuery || !isJson) return formattedData;
    const result = filterByJsonPath(data, filterQuery);
    return result.data !== null ? formatData(result.data) : formattedData;
  });

  $effect(() => {
    if (filterActive && filterQuery && isJson) {
      const result = filterByJsonPath(data, filterQuery);
      filterMatchCount = result.matchCount;
      filterError = result.error;
    } else {
      filterMatchCount = 0;
      filterError = null;
    }
  });

  // Click-outside dismiss for overflow menu
  $effect(() => {
    if (overflowOpen) {
      const handleClickOutside = (e: MouseEvent) => {
        if (overflowRef && !overflowRef.contains(e.target as Node)) {
          overflowOpen = false;
        }
      };
      document.addEventListener('click', handleClickOutside, true);
      return () => document.removeEventListener('click', handleClickOutside, true);
    }
  });

  onMount(() => {
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        compactMode = entry.contentRect.width < COMPACT_THRESHOLD;
      }
    });
    if (toolbarEl) resizeObserver.observe(toolbarEl);
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
  });

  // Raw parsed data for tree view - avoids stringify+reparse roundtrip
  const treeData = $derived.by(() => {
    if (filterActive && filterQuery && isJson) {
      const result = filterByJsonPath(data, filterQuery);
      if (result.data !== null) return result.data;
    }
    if (typeof data === 'string') {
      try { return JSON.parse(data); } catch { return data; }
    }
    return data;
  });

  const isXml = $derived(effectiveCategory === 'xml');
  const language = $derived<LanguageId>(isJson ? 'json' : resolveLanguageFromContentType(contentType));
  const hasPreviousResponse = $derived(!!$previousResponseBody);

  function handleTogglePretty() {
    prettyMode = !prettyMode;
    jsonPath = '';
    overflowOpen = false;
  }

  function toggleWordWrap() {
    wordWrap = !wordWrap;
    localStorage.setItem(RESPONSE_WRAP_KEY, String(wordWrap));
  }

  function handleToggleFilter() {
    filterActive = !filterActive;
    if (!filterActive) {
      filterQuery = '';
      filterMatchCount = 0;
      filterError = null;
    }
    overflowOpen = false;
  }

  function handleFilter(query: string) {
    filterQuery = query;
  }

  function handleToggleDiff() {
    showDiff = !showDiff;
    overflowOpen = false;
  }

  function handleOpenUrl(url: string) {
    postMessage({ type: 'openExternal', url } as any);
  }

  function handleCreateRequestFromUrl(url: string) {
    postMessage({ type: 'createRequestFromUrl', data: { url } } as any);
  }

  // Extract failed hostname from raw error for contextual display
  const failedHost = $derived.by(() => {
    if (!error || !data || typeof data !== 'string') return null;
    const hostMatch = data.match(/(?:ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH)\s+(\S+)/i);
    return hostMatch ? hostMatch[1] : null;
  });

  async function getErrorText(): Promise<string | null> {
    if (!data) return null;
    return typeof data === 'string' ? data : JSON.stringify(data);
  }

  function generateFilename(): string {
    // Default fallback for timestamp
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // "2024-02-13"
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-').substring(0, 5); // "14-30"

    // Get file extension from language
    const ext = languageFileExtensions[language] || 'txt';

    // If no request context, use generic name
    if (!method || !url) {
      return `response-${dateStr}-${timeStr}.${ext}`;
    }

    // Extract path from URL
    let pathPart = 'unknown';
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      // Get last meaningful segment or hostname
      pathPart = path === '/'
        ? urlObj.hostname
        : path.split('/').filter(Boolean).pop() || urlObj.hostname;
    } catch {
      // If URL parsing fails, try to extract something useful
      pathPart = url.split('/').filter(Boolean).pop() || 'request';
    }

    // Sanitize path part (remove invalid filename characters)
    pathPart = pathPart.replace(/[<>:"/\\|?*]/g, '_').trim();

    // Build filename: METHOD-path-YYYY-MM-DD-HH-MM.ext
    const methodPart = method.toUpperCase();
    return `${methodPart}-${pathPart}-${dateStr}-${timeStr}.${ext}`;
  }

  function handleDownload() {
    const filename = generateFilename();
    postMessage({
      type: 'downloadResponse',
      data: {
        content: formattedData,
        filename: filename,
      },
    });
  }
</script>

<div class="response-viewer">
  {#if error && errorInfo}
    <div class="error-panel" style="--error-color: {categoryColors[errorInfo.category] || categoryColors.unknown}">
      <div class="error-header">
        <i class="error-icon codicon {categoryIcons[errorInfo.category] || categoryIcons.unknown}"></i>
        <span class="error-title">{errorInfo.message}</span>
        {#if failedHost}
          <span class="error-host">{failedHost}</span>
        {/if}
        <span class="error-category">{errorInfo.category.toUpperCase()}</span>
        <div class="error-actions">
          <CopyButton text={getErrorText} iconOnly title="Copy error details" duration={2000} class="error-action-btn" />
          {#if onRetry}
            <button
              class="error-action-btn retry-btn"
              onclick={onRetry}
              title="Retry request"
            >
              <i class="codicon codicon-refresh"></i> Retry
            </button>
          {/if}
        </div>
      </div>
      <p class="error-suggestion">{errorInfo.suggestion}</p>
    </div>
  {/if}

  {#if error}
    <!-- Simplified toolbar for errors -->
    <div class="viewer-toolbar error-toolbar" bind:this={toolbarEl}>
      <CopyButton text={getErrorText} iconOnly title="Copy error to clipboard" duration={2000} />
      <span class="content-type-badge error-badge">ERROR</span>
    </div>
    <div class="viewer-content">
      {#if data}
        <div class="raw-error-section">
          <span class="raw-error-label">Raw Error</span>
          <pre class="raw-error-body">{typeof data === 'string' ? data : JSON.stringify(data, null, 2)}</pre>
        </div>
      {:else}
        <p class="empty-message">No error details available</p>
      {/if}
    </div>
  {:else}
    <!-- Normal response toolbar + content -->
    {#if effectiveCategory !== 'image' && effectiveCategory !== 'pdf' && effectiveCategory !== 'binary'}
    <div class="viewer-toolbar" bind:this={toolbarEl}>
      {#if isJson}
        {#if !compactMode && viewMode === 'text'}
          <!-- View mode: Pretty/Raw -->
          <div class="view-mode-group">
            <Tooltip text="Formatted view">
              <button
                class="mode-btn"
                class:active={prettyMode}
                onclick={() => { prettyMode = true; }}
                aria-label="Pretty"
              ><i class="codicon codicon-list-flat"></i> Pretty</button>
            </Tooltip>
            <Tooltip text="Raw unformatted view">
              <button
                class="mode-btn"
                class:active={!prettyMode}
                onclick={() => { prettyMode = false; jsonPath = ''; }}
                aria-label="Raw"
              ><i class="codicon codicon-code"></i> Raw</button>
            </Tooltip>
          </div>
        {/if}
        <!-- View mode: Text/Tree -->
        <div class="view-mode-group">
          <Tooltip text="Text view">
            <button
              class="mode-btn"
              class:active={viewMode === 'text'}
              onclick={() => { viewMode = 'text'; showDiff = false; }}
              aria-label="Text view"
            ><i class="codicon codicon-symbol-string"></i></button>
          </Tooltip>
          <Tooltip text="Tree view">
            <button
              class="mode-btn"
              class:active={viewMode === 'tree'}
              onclick={() => { viewMode = 'tree'; showDiff = false; }}
              aria-label="Tree view"
            ><i class="codicon codicon-list-tree"></i></button>
          </Tooltip>
        </div>
        {#if !compactMode && viewMode === 'text'}
          <!-- Structure -->
          {#if prettyMode}
            <FoldDepthDropdown
              onExpandAll={() => editorActions?.unfoldAll()}
              onCollapseAll={() => editorActions?.foldAll()}
              onFoldToDepth={(depth) => editorActions?.foldToDepth(depth)}
            />
          {/if}
          <!-- Find -->
          <Tooltip text="Search (Ctrl+F)">
            <button
              class="toolbar-btn"
              onclick={() => editorActions?.search()}
              aria-label="Search"
            >
              <i class="codicon codicon-search"></i>
            </button>
          </Tooltip>
          <Tooltip text="Go to Line">
            <button
              class="toolbar-btn"
              onclick={() => editorActions?.gotoLine()}
              aria-label="Go to Line"
            >
              <i class="codicon codicon-arrow-swap"></i>
            </button>
          </Tooltip>
          <!-- Analyze -->
          <Tooltip text="JSONPath filter">
            <button
              class="toolbar-btn"
              class:active={filterActive}
              onclick={handleToggleFilter}
              aria-label="JSONPath filter"
            >
              <i class="codicon codicon-filter"></i>
            </button>
          </Tooltip>
          <Tooltip text="JSON statistics">
            <button
              class="toolbar-btn"
              class:active={showStats}
              onclick={() => { showStats = !showStats; }}
              aria-label="JSON statistics"
            >
              <i class="codicon codicon-graph"></i>
            </button>
          </Tooltip>
          {#if hasPreviousResponse}
            <Tooltip text="Compare with previous response">
              <button
                class="toolbar-btn"
                class:active={showDiff}
                onclick={handleToggleDiff}
                aria-label="Compare with previous response"
              >
                <i class="codicon codicon-diff"></i>
              </button>
            </Tooltip>
          {/if}
        {/if}
        {#if compactMode && viewMode === 'text'}
          <!-- Compact mode: overflow menu for JSON -->
          <div class="overflow-container" bind:this={overflowRef}>
            <Tooltip text="More actions">
              <button
                class="toolbar-btn overflow-btn"
                onclick={() => { overflowOpen = !overflowOpen; }}
                aria-label="More actions"
              >
                <i class="codicon codicon-ellipsis"></i>
              </button>
            </Tooltip>
            {#if overflowOpen}
              <div class="overflow-menu">
                <button class="overflow-menu-item" onclick={handleTogglePretty}>
                  <i class="codicon {prettyMode ? 'codicon-list-flat' : 'codicon-code'}"></i>
                  {prettyMode ? 'Raw' : 'Pretty'}
                </button>
                {#if prettyMode}
                  <div class="overflow-separator"></div>
                  <button class="overflow-menu-item" onclick={() => { editorActions?.unfoldAll(); overflowOpen = false; }}>
                    <i class="codicon codicon-unfold"></i> Expand All
                  </button>
                  <button class="overflow-menu-item" onclick={() => { editorActions?.foldAll(); overflowOpen = false; }}>
                    <i class="codicon codicon-fold"></i> Collapse All
                  </button>
                  <div class="overflow-separator"></div>
                  {#each [1, 2, 3, 4, 5] as level}
                    <button class="overflow-menu-item" onclick={() => { editorActions?.foldToDepth(level); overflowOpen = false; }}>
                      Fold Level {level}
                    </button>
                  {/each}
                {/if}
                <div class="overflow-separator"></div>
                <button class="overflow-menu-item" onclick={() => { editorActions?.search(); overflowOpen = false; }}>
                  <i class="codicon codicon-search"></i> Search
                </button>
                <button class="overflow-menu-item" onclick={() => { editorActions?.gotoLine(); overflowOpen = false; }}>
                  <i class="codicon codicon-arrow-swap"></i> Go to Line
                </button>
                <button class="overflow-menu-item" class:active-item={filterActive} onclick={handleToggleFilter}>
                  <i class="codicon codicon-filter"></i> Filter
                  {#if filterActive}<span class="overflow-check codicon codicon-check"></span>{/if}
                </button>
                {#if hasPreviousResponse}
                  <div class="overflow-separator"></div>
                  <button class="overflow-menu-item" class:active-item={showDiff} onclick={handleToggleDiff}>
                    <i class="codicon codicon-diff"></i> Compare
                    {#if showDiff}<span class="overflow-check codicon codicon-check"></span>{/if}
                  </button>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      {:else if language !== 'text'}
        <!-- Non-JSON code: Go to Line + Search buttons -->
        {#if isXml}
          <div class="view-mode-group">
            <Tooltip text="Text view">
              <button
                class="mode-btn"
                class:active={viewMode === 'text'}
                onclick={() => { viewMode = 'text'; }}
                aria-label="Text view"
              ><i class="codicon codicon-symbol-string"></i></button>
            </Tooltip>
            <Tooltip text="Tree view">
              <button
                class="mode-btn"
                class:active={viewMode === 'tree'}
                onclick={() => { viewMode = 'tree'; }}
                aria-label="Tree view"
              ><i class="codicon codicon-list-tree"></i></button>
            </Tooltip>
          </div>
        {/if}
        {#if !compactMode && viewMode === 'text'}
          <Tooltip text="Search (Ctrl+F)">
            <button
              class="toolbar-btn"
              onclick={() => editorActions?.search()}
              aria-label="Search"
            >
              <i class="codicon codicon-search"></i>
            </button>
          </Tooltip>
          <Tooltip text="Go to Line">
            <button
              class="toolbar-btn"
              onclick={() => editorActions?.gotoLine()}
              aria-label="Go to Line"
            >
              <i class="codicon codicon-arrow-swap"></i>
            </button>
          </Tooltip>
        {/if}
      {/if}
      <!-- Format -->
      {#if viewMode === 'text' || (!isJson && !isXml)}
        <Tooltip text="Toggle word wrap">
          <button class="toolbar-btn" class:active={wordWrap} onclick={toggleWordWrap} aria-label="Toggle word wrap">
            <i class="codicon codicon-word-wrap"></i>
          </button>
        </Tooltip>
      {/if}
      <!-- Export -->
      <CopyButton text={formattedData} iconOnly title="Copy to clipboard" duration={2000} />
      <Tooltip text="Save response to file">
        <button class="toolbar-btn" onclick={handleDownload} aria-label="Save response to file">
          <i class="codicon codicon-desktop-download"></i>
        </button>
      </Tooltip>
      <span class="content-type-badge">{language === 'text' ? 'TEXT' : language.toUpperCase()}</span>
    </div>
    {/if}

    {#if filterActive && isJson && viewMode === 'text'}
      <JsonPathFilter onFilter={handleFilter} matchCount={filterMatchCount} error={filterError} />
    {/if}

    {#if showStats && jsonStats && isJson}
      <JsonStatsPanel stats={jsonStats} />
    {/if}

    <div class="viewer-content">
      {#if !formattedData && effectiveCategory !== 'image' && effectiveCategory !== 'pdf' && effectiveCategory !== 'binary'}
        <p class="empty-message">No response data</p>
      {:else if effectiveCategory === 'image' && data}
        <ImagePreview base64Data={data} {contentType} />
      {:else if effectiveCategory === 'html' && data}
        <HtmlPreview
        htmlContent={typeof data === 'string' ? data : String(data)}
        onViewReady={(actions) => { editorActions = actions; }}
        onViewSourceToggle={(active) => { if (!active) editorActions = null; }}
      />
      {:else if effectiveCategory === 'pdf' && data}
        <PdfPreview base64Data={data} {contentType} />
      {:else if effectiveCategory === 'binary' && data}
        <BinaryPreview base64Data={data} {contentType} />
      {:else if showDiff && $previousResponseBody && viewMode === 'text'}
        <ResponseDiffView original={$previousResponseBody} modified={displayData} {language} />
      {:else if viewMode === 'tree' && isJson}
        <JsonTreeView data={treeData} />
      {:else if viewMode === 'tree' && isXml}
        <XmlTreeView data={typeof data === 'string' ? data : String(data)} />
      {:else}
        <CodeMirrorViewer
          content={displayData}
          {language}
          {wordWrap}
          onViewReady={(actions) => { editorActions = actions; }}
          onPathChange={isJson ? (path) => { jsonPath = path; } : undefined}
          onOpenUrl={isJson ? handleOpenUrl : undefined}
          onCreateRequest={isJson ? handleCreateRequestFromUrl : undefined}
        />
      {/if}
    </div>

    {#if isJson && formattedData && viewMode === 'text' && !showDiff}
      <JsonPathBar path={jsonPath} />
    {/if}
  {/if}
</div>

<style>
  .response-viewer {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .viewer-toolbar {
    display: flex;
    gap: 6px;
    padding: 8px 0;
    align-items: center;
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .toolbar-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px 6px;
    background: transparent;
    color: var(--hf-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    flex-shrink: 0;
    transition: background 0.15s, border-color 0.15s;
  }

  .toolbar-btn:hover {
    background: var(--hf-list-hoverBackground);
    border-color: var(--hf-focusBorder);
  }

  .toolbar-btn.active {
    background: var(--hf-button-secondaryBackground, #3a3d41);
    border-color: var(--hf-focusBorder);
  }

  .view-mode-group {
    display: flex;
    flex-shrink: 0;
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 4px;
    overflow: hidden;
  }

  .mode-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: transparent;
    color: var(--hf-foreground);
    border: none;
    cursor: pointer;
    font-size: 12px;
    white-space: nowrap;
    transition: background 0.15s;
  }

  .mode-btn:not(:last-child) {
    border-right: 1px solid var(--hf-input-border, var(--hf-panel-border));
  }

  .mode-btn.active {
    background: var(--hf-button-secondaryBackground, #3a3d41);
  }

  .mode-btn:hover {
    background: var(--hf-list-hoverBackground);
  }

  .content-type-badge {
    margin-left: auto;
    padding: 2px 8px;
    background: var(--hf-badge-background);
    color: var(--hf-badge-foreground);
    border-radius: 10px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* Overflow menu */
  .overflow-container {
    position: relative;
    flex-shrink: 0;
  }

  .overflow-btn {
    padding: 4px 8px;
  }

  .overflow-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    background: var(--hf-editorWidget-background, #252526);
    border: 1px solid var(--hf-editorWidget-border, rgba(127, 127, 127, 0.3));
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 100;
    padding: 4px 0;
  }

  .overflow-menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 12px;
    background: none;
    border: none;
    color: var(--hf-foreground);
    font-size: 12px;
    cursor: pointer;
    text-align: left;
    white-space: nowrap;
    transition: background 0.1s;
  }

  .overflow-menu-item:hover {
    background: var(--hf-list-hoverBackground, rgba(128, 128, 128, 0.12));
  }

  .overflow-menu-item.active-item {
    color: var(--hf-textLink-foreground, #3794ff);
  }

  .overflow-shortcut {
    margin-left: auto;
    font-size: 10px;
    color: var(--hf-descriptionForeground, #888);
  }

  .overflow-check {
    margin-left: auto;
    font-size: 12px;
  }

  .overflow-separator {
    height: 1px;
    margin: 4px 0;
    background: var(--hf-editorWidget-border, rgba(127, 127, 127, 0.3));
  }

  .viewer-content {
    flex: 1;
    overflow: hidden;
    min-height: 0;
  }

  .empty-message {
    color: var(--hf-descriptionForeground);
    font-style: italic;
    font-size: 13px;
    margin: 0;
  }

  /* Error Panel Styles */
  .error-panel {
    background: var(--hf-inputValidation-errorBackground, rgba(255, 0, 0, 0.1));
    border: 1px solid var(--error-color, var(--hf-inputValidation-errorBorder, #f44336));
    border-radius: 6px;
    margin-bottom: 12px;
    overflow: hidden;
  }

  .error-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background: rgba(0, 0, 0, 0.1);
  }

  .error-icon {
    font-size: 18px;
    line-height: 1;
  }

  .error-title {
    font-weight: 600;
    font-size: 13px;
    color: var(--hf-foreground);
  }

  .error-host {
    font-size: 11px;
    font-family: var(--hf-editor-font-family, monospace);
    color: var(--hf-descriptionForeground);
    padding: 1px 6px;
    background: rgba(128, 128, 128, 0.15);
    border-radius: 3px;
  }

  .error-category {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 8px;
    background: var(--error-color, var(--hf-inputValidation-errorBorder));
    color: #fff;
    border-radius: 10px;
    letter-spacing: 0.5px;
  }

  .error-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
  }

  .error-action-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 4px;
    color: var(--hf-foreground);
    font-size: 11px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .error-action-btn:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .retry-btn {
    font-weight: 600;
  }

  .error-suggestion {
    padding: 10px 14px;
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--hf-foreground);
    opacity: 0.85;
  }

  /* Error body styles */
  .error-toolbar {
    border-bottom: none;
  }

  .content-type-badge.error-badge {
    background: rgba(249, 62, 62, 0.2);
    color: #f93e3e;
  }

  .raw-error-section {
    padding: 4px 0;
  }

  .raw-error-label {
    display: inline-block;
    font-size: 10px;
    font-weight: 600;
    color: var(--hf-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
  }

  .raw-error-body {
    margin: 0;
    padding: 12px;
    background: rgba(0, 0, 0, 0.15);
    border-radius: 4px;
    font-family: var(--hf-editor-font-family, monospace);
    font-size: 12px;
    line-height: 1.6;
    color: var(--hf-descriptionForeground);
    white-space: pre-wrap;
    word-break: break-all;
  }
</style>
