<script lang="ts">
  import { postMessage } from '../../lib/vscode';

  interface Props {
    base64Data: string;
    contentType: string;
  }
  let { base64Data, contentType }: Props = $props();

  const fileSize = $derived.by(() => {
    const bytes = Math.ceil(base64Data.length * 0.75);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  });

  function handleSave() {
    postMessage({
      type: 'downloadBinaryResponse',
      data: { base64: base64Data, filename: 'response.pdf' },
    });
  }

  function handleOpenExternal() {
    postMessage({
      type: 'openBinaryResponse',
      data: { base64: base64Data, filename: 'response.pdf', contentType },
    });
  }
</script>

<div class="pdf-preview">
  <div class="pdf-card">
    <div class="pdf-icon">
      <i class="codicon codicon-file-pdf"></i>
    </div>
    <div class="pdf-details">
      <span class="pdf-type">PDF Document</span>
      <span class="pdf-size">{fileSize}</span>
    </div>
    <p class="pdf-hint">PDF preview is not available in the webview. Save or open the file externally to view it.</p>
    <div class="pdf-actions">
      <button class="action-btn primary" onclick={handleOpenExternal}>
        <i class="codicon codicon-link-external"></i> Open Externally
      </button>
      <button class="action-btn secondary" onclick={handleSave}>
        <i class="codicon codicon-desktop-download"></i> Save As
      </button>
    </div>
  </div>
</div>

<style>
  .pdf-preview {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 1.846rem;
  }

  .pdf-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.923rem;
    padding: 2.462rem 3.692rem;
    border: 1px solid var(--hf-panel-border);
    border-radius: 0.615rem;
    background: var(--hf-editor-background, rgba(0, 0, 0, 0.1));
  }

  .pdf-icon {
    font-size: 3.077rem;
    color: #e5574f;
    opacity: 0.8;
  }

  .pdf-details {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.308rem;
  }

  .pdf-type {
    font-size: 1.077rem;
    font-weight: 600;
    color: var(--hf-foreground);
  }

  .pdf-size {
    font-size: 0.923rem;
    color: var(--hf-descriptionForeground);
  }

  .pdf-hint {
    margin: 0;
    font-size: 0.923rem;
    color: var(--hf-descriptionForeground);
    text-align: center;
    max-width: 23.077rem;
  }

  .pdf-actions {
    display: flex;
    gap: 0.615rem;
    margin-top: 0.308rem;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 0.462rem;
    padding: 0.462rem 1.231rem;
    border: none;
    border-radius: 0.308rem;
    cursor: pointer;
    font-size: 0.923rem;
    font-weight: 600;
    transition: background 0.15s;
  }

  .action-btn.primary {
    background: var(--hf-button-background, #0e639c);
    color: var(--hf-button-foreground, #fff);
  }

  .action-btn.primary:hover {
    background: var(--hf-button-hoverBackground, #1177bb);
  }

  .action-btn.secondary {
    background: var(--hf-button-secondaryBackground, #3a3d41);
    color: var(--hf-button-secondaryForeground, #d4d4d4);
  }

  .action-btn.secondary:hover {
    background: var(--hf-button-secondaryHoverBackground, #45494e);
  }
</style>
