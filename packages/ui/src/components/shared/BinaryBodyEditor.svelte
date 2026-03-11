<script lang="ts">
  import type { BodyState } from '../../types';
  import { postMessage, onMessage } from '../../lib/vscode';
  import Tooltip from './Tooltip.svelte';

  interface Props {
    body: BodyState;
    onchange?: (body: BodyState) => void;
  }
  let { body, onchange }: Props = $props();

  function handleSelectFile() {
    postMessage({ type: 'selectFile', data: {} });
  }

  function handleClear() {
    onchange?.({ type: 'binary', content: '', fileName: undefined, fileSize: undefined, fileMimeType: undefined });
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // Listen for file selection response
  $effect(() => {
    const cleanup = onMessage((msg: any) => {
      if (msg.type === 'fileSelected' && !msg.data.fieldId) {
        onchange?.({
          type: 'binary',
          content: msg.data.filePath,
          fileName: msg.data.fileName,
          fileSize: msg.data.fileSize,
          fileMimeType: msg.data.fileMimeType,
        });
      }
    });
    return cleanup;
  });
</script>

<div class="binary-editor">
  {#if body.fileName}
    <div class="file-info">
      <div class="file-icon">
        <i class="codicon codicon-file"></i>
      </div>
      <div class="file-details">
        <span class="file-name">{body.fileName}</span>
        <span class="file-meta">
          {body.fileSize ? formatSize(body.fileSize) : 'Unknown size'}
          {#if body.fileMimeType}
            <svg width="4" height="4" viewBox="0 0 4 4" fill="currentColor"><circle cx="2" cy="2" r="2"/></svg> {body.fileMimeType}
          {/if}
        </span>
      </div>
      <div class="file-actions">
        <Tooltip text="Change file">
          <button class="action-btn" onclick={handleSelectFile} aria-label="Change file">
            <i class="codicon codicon-replace"></i>
          </button>
        </Tooltip>
        <Tooltip text="Remove file">
          <button class="action-btn delete" onclick={handleClear} aria-label="Remove file">
            <i class="codicon codicon-close"></i>
          </button>
        </Tooltip>
      </div>
    </div>
  {:else}
    <div class="drop-zone" role="button" tabindex="0" onclick={handleSelectFile} onkeydown={(e) => { if (e.key === 'Enter') handleSelectFile(); }}>
      <i class="codicon codicon-cloud-upload"></i>
      <p>Click to select a file</p>
      <span class="hint">The file will be sent as the raw request body</span>
    </div>
  {/if}
</div>

<style>
  .binary-editor {
    min-height: 100px;
  }

  .drop-zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 32px;
    border: 2px dashed var(--hf-panel-border);
    border-radius: 8px;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
    color: var(--hf-descriptionForeground);
  }

  .drop-zone:hover {
    border-color: var(--hf-focusBorder);
    background: var(--hf-list-hoverBackground);
  }

  .drop-zone i { font-size: 32px; }
  .drop-zone p { margin: 0; font-size: 13px; font-weight: 600; }
  .drop-zone .hint { font-size: 11px; opacity: 0.7; }

  .file-info {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    background: var(--hf-input-background);
    border: 1px solid var(--hf-panel-border);
    border-radius: 6px;
  }

  .file-icon {
    font-size: 24px;
    color: var(--hf-foreground);
    opacity: 0.7;
  }

  .file-details {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .file-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--hf-foreground);
  }

  .file-meta {
    font-size: 11px;
    color: var(--hf-descriptionForeground);
  }

  .file-actions {
    display: flex;
    gap: 4px;
  }

  .action-btn {
    padding: 6px 8px;
    background: transparent;
    border: 1px solid var(--hf-panel-border);
    border-radius: 4px;
    cursor: pointer;
    color: var(--hf-foreground);
    opacity: 0.7;
  }

  .action-btn:hover { opacity: 1; background: var(--hf-list-hoverBackground); }
  .action-btn.delete:hover { color: var(--hf-errorForeground); }
</style>
