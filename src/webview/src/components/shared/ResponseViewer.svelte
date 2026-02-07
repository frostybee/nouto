<script lang="ts">
  import { formatData, formatDataRaw, isJsonContent, filterByJsonPath } from '../../lib/json';
  import { categorizeContentType, type ContentCategory } from '../../lib/content-type';
  import { postMessage } from '../../lib/vscode';
  import CodeMirrorViewer, { type EditorActions } from './CodeMirrorViewer.svelte';
  import JsonPathBar from './JsonPathBar.svelte';
  import JsonPathFilter from './JsonPathFilter.svelte';
  import JsonTreeView from './JsonTreeView.svelte';
  import ResponseDiffView from './ResponseDiffView.svelte';
  import ImagePreview from './ImagePreview.svelte';
  import HtmlPreview from './HtmlPreview.svelte';
  import { previousResponseBody } from '../../stores/responseDiff';

  interface Props {
    data?: any;
    contentType?: string;
    contentCategory?: ContentCategory;
    error?: boolean;
    errorInfo?: { category: string; message: string; suggestion: string } | null;
  }
  let { data = null, contentType = '', contentCategory, error = false, errorInfo = null }: Props = $props();

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

  let copied = $state(false);
  let copyTimeout: ReturnType<typeof setTimeout>;
  let editorActions = $state<EditorActions | null>(null);
  let prettyMode = $state(true);
  let jsonPath = $state('');
  let filterActive = $state(false);
  let filterQuery = $state('');
  let filterMatchCount = $state(0);
  let filterError = $state<string | null>(null);
  let viewMode = $state<'text' | 'tree'>('text');
  let showDiff = $state(false);
  let overflowOpen = $state(false);
  let overflowRef = $state<HTMLDivElement>(undefined!);

  const isJson = $derived(isJsonContent(contentType, data));
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

  // Raw parsed data for tree view — avoids stringify+reparse roundtrip
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

  const language = $derived<'json' | 'text'>(isJson ? 'json' : 'text');
  const hasPreviousResponse = $derived(!!$previousResponseBody);

  function handleTogglePretty() {
    prettyMode = !prettyMode;
    jsonPath = '';
    overflowOpen = false;
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

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(formattedData);
      copied = true;
      clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => {
        copied = false;
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }

  function handleDownload() {
    const blob = new Blob([formattedData], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `response-${Date.now()}.${isJson ? 'json' : 'txt'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
</script>

<div class="response-viewer">
  {#if error && errorInfo}
    <div class="error-panel" style="--error-color: {categoryColors[errorInfo.category] || categoryColors.unknown}">
      <div class="error-header">
        <i class="error-icon codicon {categoryIcons[errorInfo.category] || categoryIcons.unknown}"></i>
        <span class="error-title">{errorInfo.message}</span>
        <span class="error-category">{errorInfo.category.toUpperCase()}</span>
      </div>
      <div class="error-suggestion">
        <span class="suggestion-label">Suggestion:</span>
        <p class="suggestion-text">{errorInfo.suggestion}</p>
      </div>
    </div>
  {/if}

  <div class="viewer-toolbar">
    <button class="toolbar-btn" onclick={handleCopy} title="Copy to clipboard">
      {#if copied}
        <span class="icon codicon codicon-check"></span> Copied
      {:else}
        <span class="icon codicon codicon-clippy"></span> Copy
      {/if}
    </button>
    <button class="toolbar-btn" onclick={handleDownload} title="Download response">
      <span class="icon codicon codicon-desktop-download"></span> Download
    </button>
    {#if isJson}
      <div class="view-mode-group">
        <button
          class="mode-btn"
          class:active={viewMode === 'text'}
          onclick={() => { viewMode = 'text'; showDiff = false; }}
        ><i class="codicon codicon-symbol-string"></i> Text</button>
        <button
          class="mode-btn"
          class:active={viewMode === 'tree'}
          onclick={() => { viewMode = 'tree'; showDiff = false; }}
        ><i class="codicon codicon-list-tree"></i> Tree</button>
      </div>
      <span class="content-type-badge">JSON</span>
      {#if viewMode === 'text'}
        <div class="overflow-container" bind:this={overflowRef}>
          <button
            class="toolbar-btn overflow-btn"
            onclick={() => { overflowOpen = !overflowOpen; }}
            title="More actions"
          >
            <i class="codicon codicon-ellipsis"></i>
          </button>
          {#if overflowOpen}
            <div class="overflow-menu">
              <button class="overflow-menu-item" onclick={handleTogglePretty}>
                <i class="codicon {prettyMode ? 'codicon-json' : 'codicon-bracket'}"></i>
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
              <button class="overflow-menu-item" onclick={() => { editorActions?.gotoLine(); overflowOpen = false; }}>
                <i class="codicon codicon-arrow-swap"></i> Go to Line
                <span class="overflow-shortcut">Ctrl+G</span>
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
    {/if}
  </div>

  {#if filterActive && isJson && viewMode === 'text'}
    <JsonPathFilter onFilter={handleFilter} matchCount={filterMatchCount} error={filterError} />
  {/if}

  <div class="viewer-content">
    {#if !formattedData && effectiveCategory !== 'image'}
      <p class="empty-message">No response data</p>
    {:else if effectiveCategory === 'image' && data}
      <ImagePreview base64Data={data} {contentType} />
    {:else if effectiveCategory === 'html' && data}
      <HtmlPreview htmlContent={typeof data === 'string' ? data : String(data)} />
    {:else if effectiveCategory === 'pdf'}
      <div class="pdf-notice">
        <p>PDF preview is not supported in the webview.</p>
        <p>Use the Download button to save and open externally.</p>
      </div>
    {:else if showDiff && $previousResponseBody && viewMode === 'text'}
      <ResponseDiffView original={$previousResponseBody} modified={displayData} />
    {:else if viewMode === 'tree' && isJson}
      <JsonTreeView data={treeData} />
    {:else}
      <CodeMirrorViewer
        content={displayData}
        {language}
        onViewReady={(actions) => { editorActions = actions; }}
        onPathChange={isJson ? (path) => { jsonPath = path; } : undefined}
        onOpenUrl={isJson ? handleOpenUrl : undefined}
      />
    {/if}
  </div>

  {#if isJson && formattedData && viewMode === 'text' && !showDiff}
    <JsonPathBar path={jsonPath} />
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
    gap: 4px;
    padding: 4px 10px;
    background: transparent;
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    white-space: nowrap;
    flex-shrink: 0;
    transition: background 0.15s, border-color 0.15s;
  }

  .toolbar-btn:hover {
    background: var(--vscode-list-hoverBackground);
    border-color: var(--vscode-focusBorder);
  }

  .icon {
    font-size: 12px;
  }

  .toolbar-btn.active {
    background: var(--vscode-button-secondaryBackground, #3a3d41);
    border-color: var(--vscode-focusBorder);
  }

  .view-mode-group {
    display: flex;
    flex-shrink: 0;
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    border-radius: 4px;
    overflow: hidden;
  }

  .mode-btn {
    padding: 4px 10px;
    background: transparent;
    color: var(--vscode-foreground);
    border: none;
    cursor: pointer;
    font-size: 11px;
    white-space: nowrap;
    transition: background 0.15s;
  }

  .mode-btn:not(:last-child) {
    border-right: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
  }

  .mode-btn.active {
    background: var(--vscode-button-secondaryBackground, #3a3d41);
  }

  .mode-btn:hover {
    background: var(--vscode-list-hoverBackground);
  }

  .content-type-badge {
    margin-left: auto;
    padding: 2px 8px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
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
    min-width: 180px;
    background: var(--vscode-editorWidget-background, #252526);
    border: 1px solid var(--vscode-editorWidget-border, rgba(127, 127, 127, 0.3));
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
    color: var(--vscode-foreground);
    font-size: 12px;
    cursor: pointer;
    text-align: left;
    white-space: nowrap;
    transition: background 0.1s;
  }

  .overflow-menu-item:hover {
    background: var(--vscode-list-hoverBackground, rgba(128, 128, 128, 0.12));
  }

  .overflow-menu-item.active-item {
    color: var(--vscode-textLink-foreground, #3794ff);
  }

  .overflow-shortcut {
    margin-left: auto;
    font-size: 10px;
    color: var(--vscode-descriptionForeground, #888);
  }

  .overflow-check {
    margin-left: auto;
    font-size: 12px;
  }

  .overflow-separator {
    height: 1px;
    margin: 4px 0;
    background: var(--vscode-editorWidget-border, rgba(127, 127, 127, 0.3));
  }

  .viewer-content {
    flex: 1;
    overflow: hidden;
    min-height: 0;
  }

  .empty-message {
    color: var(--vscode-descriptionForeground);
    font-style: italic;
    font-size: 13px;
    margin: 0;
  }

  .pdf-notice {
    padding: 24px;
    text-align: center;
    color: var(--vscode-descriptionForeground);
    font-size: 13px;
  }

  .pdf-notice p {
    margin: 4px 0;
  }

  /* Error Panel Styles */
  .error-panel {
    background: var(--vscode-inputValidation-errorBackground, rgba(255, 0, 0, 0.1));
    border: 1px solid var(--error-color, var(--vscode-inputValidation-errorBorder, #f44336));
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
    border-bottom: 1px solid var(--error-color, var(--vscode-inputValidation-errorBorder));
  }

  .error-icon {
    font-size: 18px;
    line-height: 1;
  }

  .error-title {
    flex: 1;
    font-weight: 600;
    font-size: 13px;
    color: var(--vscode-foreground);
  }

  .error-category {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 8px;
    background: var(--error-color, var(--vscode-inputValidation-errorBorder));
    color: #fff;
    border-radius: 10px;
    letter-spacing: 0.5px;
  }

  .error-suggestion {
    padding: 12px 14px;
  }

  .suggestion-label {
    display: block;
    font-size: 11px;
    font-weight: 600;
    color: var(--vscode-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
  }

  .suggestion-text {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--vscode-foreground);
  }
</style>
