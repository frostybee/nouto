<script lang="ts">
  import { onDestroy } from 'svelte';
  import CodeMirrorViewer, { type EditorActions } from './CodeMirrorViewer.svelte';

  interface Props {
    htmlContent: string;
    onViewReady?: (actions: EditorActions) => void;
    onViewSourceToggle?: (active: boolean) => void;
  }
  let { htmlContent, onViewReady, onViewSourceToggle }: Props = $props();

  let viewSource = $state(false);
  let blobUrl = $state<string | null>(null);
  let prevUrl: string | null = null;

  // Use blob URL instead of srcdoc to avoid inheriting parent CSP
  // Track previous URL separately to avoid reading blobUrl inside the effect
  $effect(() => {
    // Only depend on htmlContent (not blobUrl)
    const _content = htmlContent;
    if (prevUrl) {
      URL.revokeObjectURL(prevUrl);
    }
    const blob = new Blob([_content], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    prevUrl = url;
    blobUrl = url;
  });

  onDestroy(() => {
    if (prevUrl) {
      URL.revokeObjectURL(prevUrl);
    }
  });


</script>

<div class="html-preview">
  <div class="html-toolbar">
    <button
      class="html-btn"
      class:active={!viewSource}
      onclick={() => { viewSource = false; onViewSourceToggle?.(false); }}
    >Preview</button>
    <button
      class="html-btn"
      class:active={viewSource}
      onclick={() => { viewSource = true; onViewSourceToggle?.(true); }}
    >View Source</button>
  </div>
  <div class="html-content">
    {#if viewSource}
      <CodeMirrorViewer content={htmlContent} language="html" {onViewReady} />
    {:else if blobUrl}
      <iframe
        src={blobUrl}
        sandbox="allow-same-origin allow-scripts"
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
    border-bottom: 1px solid var(--hf-panel-border);
    flex-shrink: 0;
  }

  .html-btn {
    padding: 2px 10px;
    background: transparent;
    color: var(--hf-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
  }

  .html-btn.active {
    background: var(--hf-button-secondaryBackground, #3a3d41);
    border-color: var(--hf-focusBorder);
  }

  .html-btn:hover {
    background: var(--hf-list-hoverBackground);
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
