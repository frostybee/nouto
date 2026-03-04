<script lang="ts">
  interface Props {
    base64Data: string;
    contentType: string;
  }
  let { base64Data, contentType }: Props = $props();

  let blobUrl = $state<string | null>(null);

  $effect(() => {
    let url: string | null = null;
    try {
      const binaryStr = atob(base64Data);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: contentType || 'application/pdf' });
      url = URL.createObjectURL(blob);
      blobUrl = url;
    } catch {
      blobUrl = null;
    }
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  });

  const fileSize = $derived.by(() => {
    const bytes = Math.ceil(base64Data.length * 0.75);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  });

  function handleDownload() {
    if (!blobUrl) return;
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `response.pdf`;
    a.click();
  }
</script>

<div class="pdf-preview">
  <div class="pdf-toolbar">
    <span class="pdf-info">
      <i class="codicon codicon-file-pdf"></i>
      PDF Document &middot; {fileSize}
    </span>
    <button class="pdf-btn" onclick={handleDownload} title="Download PDF">
      <i class="codicon codicon-desktop-download"></i> Download
    </button>
  </div>
  <div class="pdf-container">
    {#if blobUrl}
      <iframe
        src={blobUrl}
        title="PDF Preview"
        class="pdf-iframe"
      ></iframe>
    {:else}
      <p class="error-msg">Failed to decode PDF data</p>
    {/if}
  </div>
</div>

<style>
  .pdf-preview {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .pdf-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--hf-panel-border);
    flex-shrink: 0;
  }

  .pdf-info {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--hf-descriptionForeground);
  }

  .pdf-btn {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    background: var(--hf-button-secondaryBackground, #3a3d41);
    color: var(--hf-button-secondaryForeground, #d4d4d4);
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
  }

  .pdf-btn:hover {
    background: var(--hf-button-secondaryHoverBackground, #45494e);
  }

  .pdf-container {
    flex: 1;
    overflow: hidden;
  }

  .pdf-iframe {
    width: 100%;
    height: 100%;
    border: none;
    background: #525659;
  }

  .error-msg {
    color: var(--hf-errorForeground, #f44336);
    font-style: italic;
    font-size: 13px;
    padding: 24px;
    text-align: center;
  }
</style>
