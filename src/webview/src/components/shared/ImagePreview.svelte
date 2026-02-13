<script lang="ts">
  interface Props {
    base64Data: string;
    contentType: string;
  }
  let { base64Data, contentType }: Props = $props();

  let zoom = $state(100);
  let naturalWidth = $state(0);
  let naturalHeight = $state(0);
  let blobUrl = $state<string | null>(null);

  $effect(() => {
    let url: string | null = null;
    try {
      const binaryStr = atob(base64Data);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: contentType });
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

  function handleLoad(e: Event) {
    const img = e.target as HTMLImageElement;
    naturalWidth = img.naturalWidth;
    naturalHeight = img.naturalHeight;
  }

  function fitToView() { zoom = 100; }
  function actualSize() { zoom = 100; }
  function zoomIn() { zoom = Math.min(zoom + 25, 500); }
  function zoomOut() { zoom = Math.max(zoom - 25, 25); }
</script>

<div class="image-preview">
  <div class="image-toolbar">
    <button class="img-btn" onclick={fitToView}>Fit</button>
    <button class="img-btn" onclick={actualSize}>100%</button>
    <button class="img-btn" onclick={zoomOut}>-</button>
    <span class="zoom-label">{zoom}%</span>
    <button class="img-btn" onclick={zoomIn}>+</button>
    <span class="image-info">
      {#if naturalWidth > 0}
        {naturalWidth} x {naturalHeight}
      {/if}
      &middot; {fileSize}
    </span>
  </div>
  <div class="image-container">
    {#if blobUrl}
      <img
        src={blobUrl}
        alt="Response"
        style="max-width: {zoom}%; height: auto;"
        onload={handleLoad}
      />
    {:else}
      <p class="error-msg">Failed to decode image data</p>
    {/if}
  </div>
</div>

<style>
  .image-preview {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .image-toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--vscode-panel-border);
    flex-shrink: 0;
  }

  .img-btn {
    padding: 2px 8px;
    background: var(--vscode-button-secondaryBackground, #3a3d41);
    color: var(--vscode-button-secondaryForeground, #d4d4d4);
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
  }

  .img-btn:hover {
    background: var(--vscode-button-secondaryHoverBackground, #45494e);
  }

  .zoom-label {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    min-width: 36px;
    text-align: center;
  }

  .image-info {
    margin-left: auto;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
  }

  .image-container {
    flex: 1;
    overflow: auto;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 16px;
    background: repeating-conic-gradient(
      rgba(128, 128, 128, 0.1) 0% 25%, transparent 0% 50%
    ) 50% / 16px 16px;
  }

  .image-container img {
    object-fit: contain;
  }

  .error-msg {
    color: var(--vscode-errorForeground, #f44336);
    font-style: italic;
    font-size: 13px;
  }
</style>
