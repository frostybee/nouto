<script lang="ts">
  import { formatData, isJsonContent, highlightJson } from '../../lib/json-formatter';

  export let data: any = null;
  export let contentType: string = '';
  export let error: boolean = false;
  export let errorInfo: { category: string; message: string; suggestion: string } | null = null;

  const categoryIcons: Record<string, string> = {
    network: '🌐',
    timeout: '⏱️',
    dns: '🔍',
    ssl: '🔒',
    connection: '🔌',
    server: '🖥️',
    unknown: '❓',
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

  let copied = false;
  let copyTimeout: ReturnType<typeof setTimeout>;

  $: formattedData = formatData(data);
  $: isJson = isJsonContent(contentType, data);
  $: highlightedHtml = isJson ? highlightJson(formattedData) : null;

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
    <button class="toolbar-btn" on:click={handleCopy} title="Copy to clipboard">
      {#if copied}
        <span class="icon">✓</span> Copied
      {:else}
        <span class="icon">📋</span> Copy
      {/if}
    </button>
    <button class="toolbar-btn" on:click={handleDownload} title="Download response">
      <span class="icon">💾</span> Download
    </button>
    {#if isJson}
      <span class="content-type-badge">JSON</span>
    {/if}
  </div>

  <div class="viewer-content">
    {#if !formattedData}
      <p class="empty-message">No response data</p>
    {:else if isJson && highlightedHtml}
      <pre class="code-block json">{@html highlightedHtml}</pre>
    {:else}
      <pre class="code-block">{formattedData}</pre>
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
    overflow: auto;
    min-height: 0;
  }

  .empty-message {
    color: var(--vscode-descriptionForeground);
    font-style: italic;
    font-size: 13px;
    margin: 0;
  }

  .code-block {
    margin: 0;
    padding: 12px;
    background: var(--vscode-textCodeBlock-background);
    border-radius: 4px;
    font-family: var(--vscode-editor-font-family), 'Consolas', 'Monaco', monospace;
    font-size: 12px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    overflow-x: auto;
  }

  /* JSON Syntax Highlighting */
  .code-block.json :global(.json-string) {
    color: var(--vscode-debugTokenExpression-string, #ce9178);
  }

  .code-block.json :global(.json-number) {
    color: var(--vscode-debugTokenExpression-number, #b5cea8);
  }

  .code-block.json :global(.json-keyword) {
    color: var(--vscode-debugTokenExpression-boolean, #569cd6);
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
