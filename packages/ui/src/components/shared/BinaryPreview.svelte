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

  const extension = $derived.by(() => {
    const ct = contentType.toLowerCase();
    if (ct.includes('application/zip')) return 'zip';
    if (ct.includes('application/gzip')) return 'gz';
    if (ct.includes('audio/mpeg')) return 'mp3';
    if (ct.includes('audio/wav')) return 'wav';
    if (ct.includes('audio/ogg')) return 'ogg';
    if (ct.includes('video/mp4')) return 'mp4';
    if (ct.includes('video/webm')) return 'webm';
    return 'bin';
  });

  function handleSave() {
    postMessage({
      type: 'downloadBinaryResponse',
      data: { base64: base64Data, filename: `response.${extension}` },
    });
  }
</script>

<div class="binary-preview">
  <div class="binary-card">
    <div class="binary-icon">
      <i class="codicon codicon-file-binary"></i>
    </div>
    <div class="binary-details">
      <span class="binary-type">{contentType || 'application/octet-stream'}</span>
      <span class="binary-size">{fileSize}</span>
    </div>
    <p class="binary-hint">This response contains binary data that cannot be displayed as text.</p>
    <button class="download-btn" onclick={handleSave}>
      <i class="codicon codicon-desktop-download"></i> Save As
    </button>
  </div>
</div>

<style>
  .binary-preview {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 1.846rem;
  }

  .binary-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.923rem;
    padding: 2.462rem 3.692rem;
    border: 1px solid var(--hf-panel-border);
    border-radius: 0.615rem;
    background: var(--hf-editor-background, rgba(0, 0, 0, 0.1));
  }

  .binary-icon {
    font-size: 3.077rem;
    color: var(--hf-descriptionForeground);
    opacity: 0.6;
  }

  .binary-details {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.308rem;
  }

  .binary-type {
    font-family: var(--hf-editor-font-family, monospace);
    font-size: 0.923rem;
    color: var(--hf-foreground);
    padding: 0.154rem 0.615rem;
    background: rgba(128, 128, 128, 0.15);
    border-radius: 0.231rem;
  }

  .binary-size {
    font-size: 1rem;
    font-weight: 600;
    color: var(--hf-foreground);
  }

  .binary-hint {
    margin: 0;
    font-size: 0.923rem;
    color: var(--hf-descriptionForeground);
    text-align: center;
    max-width: 21.538rem;
  }

  .download-btn {
    display: flex;
    align-items: center;
    gap: 0.462rem;
    padding: 0.462rem 1.231rem;
    background: var(--hf-button-background, #0e639c);
    color: var(--hf-button-foreground, #fff);
    border: none;
    border-radius: 0.308rem;
    cursor: pointer;
    font-size: 0.923rem;
    font-weight: 600;
    transition: background 0.15s;
  }

  .download-btn:hover {
    background: var(--hf-button-hoverBackground, #1177bb);
  }
</style>
