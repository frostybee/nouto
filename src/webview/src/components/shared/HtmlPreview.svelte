<script lang="ts">
  import CodeMirrorViewer from './CodeMirrorViewer.svelte';

  interface Props {
    htmlContent: string;
  }
  let { htmlContent }: Props = $props();

  let viewSource = $state(false);

  function openFull() {
    window.vscode.postMessage({ type: 'openHtmlViewer', data: { content: htmlContent } });
  }
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
    <button class="html-btn open-full" onclick={openFull} title="Open in full panel">
      <i class="codicon codicon-open-preview"></i> Open Full
    </button>
  </div>
  <div class="html-content">
    {#if viewSource}
      <CodeMirrorViewer content={htmlContent} language="html" />
    {:else}
      <iframe
        srcdoc={htmlContent}
        sandbox="allow-same-origin"
        title="HTML Preview"
        class="preview-iframe"
      ></iframe>
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

  .open-full {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 4px;
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

</style>
