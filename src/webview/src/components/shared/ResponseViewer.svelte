<script lang="ts">
  import { formatData, isJsonContent } from '../../lib/json';
  import CodeMirrorViewer, { type EditorActions } from './CodeMirrorViewer.svelte';

  interface Props {
    data?: any;
    contentType?: string;
    error?: boolean;
    errorInfo?: { category: string; message: string; suggestion: string } | null;
  }
  let { data = null, contentType = '', error = false, errorInfo = null }: Props = $props();

  const categoryIcons: Record<string, string> = {
    network: '\u{1F310}',
    timeout: '\u{23F1}\u{FE0F}',
    dns: '\u{1F50D}',
    ssl: '\u{1F512}',
    connection: '\u{1F50C}',
    server: '\u{1F5A5}\u{FE0F}',
    unknown: '\u{2753}',
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
  let allFolded = $state(false);

  function handleToggleFold() {
    if (!editorActions) return;
    if (allFolded) {
      editorActions.unfoldAll();
    } else {
      editorActions.foldAll();
    }
    allFolded = !allFolded;
  }

  const formattedData = $derived(formatData(data));
  const isJson = $derived(isJsonContent(contentType, data));
  const language = $derived<'json' | 'text'>(isJson ? 'json' : 'text');

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
        <span class="error-icon">{categoryIcons[errorInfo.category] || categoryIcons.unknown}</span>
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
        <span class="icon">{'\u2713'}</span> Copied
      {:else}
        <span class="icon">{'\u{1F4CB}'}</span> Copy
      {/if}
    </button>
    <button class="toolbar-btn" onclick={handleDownload} title="Download response">
      <span class="icon">{'\u{1F4BE}'}</span> Download
    </button>
    {#if isJson}
      <button class="toolbar-btn" onclick={handleToggleFold} title={allFolded ? 'Unfold all' : 'Fold all'}>
        <span class="icon">{allFolded ? '\u{2795}' : '\u{2796}'}</span> {allFolded ? 'Expand' : 'Collapse'}
      </button>
      <span class="content-type-badge">JSON</span>
    {/if}
  </div>

  <div class="viewer-content">
    {#if !formattedData}
      <p class="empty-message">No response data</p>
    {:else}
      <CodeMirrorViewer content={formattedData} {language} onViewReady={(actions) => { editorActions = actions; allFolded = false; }} />
    {/if}
  </div>
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
