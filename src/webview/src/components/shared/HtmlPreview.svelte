<script lang="ts">
  import CodeMirrorViewer from './CodeMirrorViewer.svelte';

  interface Props {
    htmlContent: string;
  }
  let { htmlContent }: Props = $props();

  let viewSource = $state(false);

  const iframeSrc = $derived.by(() => {
    try {
      const blob = new Blob([htmlContent], { type: 'text/html' });
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  });
</script>

<div class="html-preview">
  <div class="html-toolbar">
    <button
      class="html-btn"
      class:active={!viewSource}
      onclick={() => { viewSource = false; }}
    >Preview</button>
    <button
      class="html-btn"
      class:active={viewSource}
      onclick={() => { viewSource = true; }}
    >View Source</button>
  </div>
  <div class="html-content">
    {#if viewSource}
      <CodeMirrorViewer content={htmlContent} language="text" />
    {:else if iframeSrc}
      <iframe
        src={iframeSrc}
        sandbox=""
        title="HTML Preview"
        class="preview-iframe"
      ></iframe>
    {:else}
      <p class="error-msg">Failed to render HTML</p>
    {/if}
  </div>
</div>

<style>
  .html-preview {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .html-toolbar {
    display: flex;
    gap: 4px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--vscode-panel-border);
    flex-shrink: 0;
  }

  .html-btn {
    padding: 2px 10px;
    background: transparent;
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
  }

  .html-btn.active {
    background: var(--vscode-button-secondaryBackground, #3a3d41);
    border-color: var(--vscode-focusBorder);
  }

  .html-btn:hover {
    background: var(--vscode-list-hoverBackground);
  }

  .html-content {
    flex: 1;
    overflow: hidden;
  }

  .preview-iframe {
    width: 100%;
    height: 100%;
    border: none;
    background: white;
  }

  .error-msg {
    color: var(--vscode-errorForeground, #f44336);
    font-style: italic;
    font-size: 13px;
    padding: 16px;
  }
</style>
