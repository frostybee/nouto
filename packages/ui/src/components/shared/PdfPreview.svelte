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
    padding: 24px;
  }

  .pdf-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 32px 48px;
    border: 1px solid var(--hf-panel-border);
    border-radius: 8px;
    background: var(--hf-editor-background, rgba(0, 0, 0, 0.1));
  }

  .pdf-icon {
    font-size: 40px;
    color: #e5574f;
    opacity: 0.8;
  }

  .pdf-details {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .pdf-type {
    font-size: 14px;
    font-weight: 600;
    color: var(--hf-foreground);
  }

  .pdf-size {
    font-size: 12px;
    color: var(--hf-descriptionForeground);
  }

  .pdf-hint {
    margin: 0;
    font-size: 12px;
    color: var(--hf-descriptionForeground);
    text-align: center;
    max-width: 300px;
  }

  .pdf-actions {
    display: flex;
    gap: 8px;
    margin-top: 4px;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 16px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
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
