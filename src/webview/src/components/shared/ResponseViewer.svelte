<script lang="ts">
  import { formatData, formatDataRaw, isJsonContent, filterByJsonPath } from '../../lib/json';
  import { categorizeContentType, type ContentCategory } from '../../lib/content-type';
  import { postMessage } from '../../lib/vscode';
  import CodeMirrorViewer, { type EditorActions } from './CodeMirrorViewer.svelte';
  import FoldDepthDropdown from './FoldDepthDropdown.svelte';
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
  const isJson = $derived(isJsonContent(contentType, data));
  const formattedData = $derived(
    isJson
      ? (prettyMode ? formatData(data) : formatDataRaw(data))
      : formatData(data)
  );

  const displayData = $derived.by(() => {
    if (!filterActive || !filterQuery || !isJson) return formattedData;
    const result = filterByJsonPath(data, filterQuery);
    // Update side-effect state via $effect below
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
  }

  function handleToggleFilter() {
    filterActive = !filterActive;
    if (!filterActive) {
      filterQuery = '';
      filterMatchCount = 0;
      filterError = null;
    }
  }

  function handleFilter(query: string) {
    filterQuery = query;
  }

  function handleToggleDiff() {
    showDiff = !showDiff;
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
      {#if viewMode === 'text'}
        <button class="toolbar-btn" onclick={handleTogglePretty} title={prettyMode ? 'Show raw JSON' : 'Show pretty JSON'}>
          <span class="icon">{prettyMode ? '{ }' : '{}'}</span> {prettyMode ? 'Raw' : 'Pretty'}
        </button>
        {#if prettyMode}
          <FoldDepthDropdown
            onExpandAll={() => editorActions?.unfoldAll()}
            onCollapseAll={() => editorActions?.foldAll()}
            onFoldToDepth={(depth) => editorActions?.foldToDepth(depth)}
          />
        {/if}
        <button
          class="toolbar-btn"
          class:active={filterActive}
          onclick={handleToggleFilter}
          title="JSONPath filter"
        >
          Filter
        </button>
      {/if}
      <div class="view-mode-group">
        <button
          class="mode-btn"
          class:active={viewMode === 'text'}
          onclick={() => { viewMode = 'text'; showDiff = false; }}
        >Text</button>
        <button
          class="mode-btn"
          class:active={viewMode === 'tree'}
          onclick={() => { viewMode = 'tree'; showDiff = false; }}
        >Tree</button>
      </div>
      {#if hasPreviousResponse && viewMode === 'text'}
        <button
          class="toolbar-btn"
          class:active={showDiff}
          onclick={handleToggleDiff}
          title="Compare with previous response"
        >
          Compare
        </button>
      {/if}
      <span class="content-type-badge">JSON</span>
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
    gap: 8px;
    padding: 8px 0;
    align-items: center;
    flex-shrink: 0;
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
