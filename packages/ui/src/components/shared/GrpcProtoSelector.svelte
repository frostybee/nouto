<script lang="ts">
  import type { GrpcConfig } from '../../types';
  import { grpcProtoStatus, grpcProtoError, setGrpcProtoLoading } from '../../stores/grpc.svelte';
  import { request } from '../../stores';
  import { patchGrpc } from '../../stores/request.svelte';
  import { postMessage } from '../../lib/vscode';
  import Tooltip from './Tooltip.svelte';

  let { onclose }: { onclose: () => void } = $props();

  let useReflection = $state(request.grpc?.useReflection ?? true);
  let protoPaths = $state<string[]>(request.grpc?.protoPaths || []);
  let importDirs = $state<string[]>(request.grpc?.protoImportDirs || []);

  function handleLoadSchema() {
    setGrpcProtoLoading();
    patchGrpc({ useReflection, protoPaths, protoImportDirs: importDirs });

    if (useReflection) {
      postMessage({ type: 'grpcReflect', data: {
        address: request.url,
        tls: request.grpc?.tls,
        tlsCertPath: request.grpc?.tlsCertPath,
        tlsKeyPath: request.grpc?.tlsKeyPath,
        tlsCaCertPath: request.grpc?.tlsCaCertPath,
      } } as any);
    } else {
      postMessage({ type: 'grpcLoadProto', data: { protoPaths, importDirs } } as any);
    }
  }

  function handleAddProtoFiles() {
    postMessage({ type: 'pickProtoFile' } as any);
  }

  function handleAddImportDir() {
    postMessage({ type: 'pickProtoImportDir' } as any);
  }

  function removeProtoPath(index: number) {
    protoPaths = protoPaths.filter((_, i) => i !== index);
    patchGrpc({ protoPaths });
  }

  function removeImportDir(index: number) {
    importDirs = importDirs.filter((_, i) => i !== index);
    patchGrpc({ protoImportDirs: importDirs });
  }

  const status = $derived(grpcProtoStatus());
  const error = $derived(grpcProtoError());
  const isLoadingProto = $derived(status === 'loading');
</script>

<div class="grpc-proto-selector">
  <div class="proto-source-section">
    <span class="proto-source-label">Proto Source</span>
    <div class="radio-group">
      <label class="radio-option">
        <input type="radio" bind:group={useReflection} value={true} />
        <span>Server Reflection</span>
        <span class="radio-description">Auto-discover from server</span>
      </label>
      <label class="radio-option">
        <input type="radio" bind:group={useReflection} value={false} />
        <span>Proto Files</span>
        <span class="radio-description">Load from .proto files</span>
      </label>
    </div>
  </div>

  {#if !useReflection}
    <div class="file-section">
      <span class="section-label">Proto Files</span>
      {#each protoPaths as path, i}
        <div class="file-item">
          <span class="codicon codicon-file"></span>
          <span class="file-path" title={path}>{path.split(/[/\\]/).pop()}</span>
          <button class="remove-btn" onclick={() => removeProtoPath(i)} aria-label="Remove proto file">
            <span class="codicon codicon-close"></span>
          </button>
        </div>
      {/each}
      <button class="add-btn" onclick={handleAddProtoFiles}>
        <span class="codicon codicon-add"></span> Add Proto Files
      </button>
    </div>

    <div class="file-section">
      <span class="section-label">Import Directories</span>
      {#each importDirs as dir, i}
        <div class="file-item">
          <span class="codicon codicon-folder"></span>
          <span class="file-path" title={dir}>{dir.split(/[/\\]/).pop()}</span>
          <button class="remove-btn" onclick={() => removeImportDir(i)} aria-label="Remove import directory">
            <span class="codicon codicon-close"></span>
          </button>
        </div>
      {/each}
      <button class="add-btn" onclick={handleAddImportDir}>
        <span class="codicon codicon-add"></span> Add Import Directory
      </button>
    </div>
  {/if}

  {#if error}
    <div class="error-message">{error}</div>
  {/if}

  <div class="button-row">
    <button class="load-btn" onclick={handleLoadSchema} disabled={isLoadingProto || (!useReflection && protoPaths.length === 0)}>
      {isLoadingProto ? 'Loading...' : 'Load Schema'}
    </button>
    <button class="cancel-btn" onclick={onclose}>Cancel</button>
  </div>
</div>

<style>
  .grpc-proto-selector {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
    border-radius: 4px;
  }
  .proto-source-label, .section-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--vscode-foreground);
    margin-bottom: 4px;
  }
  .radio-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .radio-option {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    font-size: 13px;
    color: var(--vscode-foreground);
  }
  .radio-description {
    color: var(--vscode-descriptionForeground);
    font-size: 11px;
    margin-left: auto;
  }
  .file-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .file-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    background: var(--vscode-input-background);
    border-radius: 3px;
    font-size: 12px;
    color: var(--vscode-foreground);
  }
  .file-path {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .remove-btn {
    background: none;
    border: none;
    color: var(--vscode-foreground);
    cursor: pointer;
    padding: 2px;
    opacity: 0.6;
  }
  .remove-btn:hover { opacity: 1; }
  .add-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: 1px dashed var(--vscode-widget-border, var(--vscode-panel-border));
    color: var(--vscode-textLink-foreground);
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 3px;
    font-size: 12px;
  }
  .add-btn:hover { background: var(--vscode-list-hoverBackground); }
  .error-message {
    color: var(--vscode-errorForeground);
    font-size: 12px;
    padding: 6px 8px;
    background: var(--vscode-inputValidation-errorBackground, rgba(255,0,0,0.1));
    border-radius: 3px;
  }
  .button-row {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }
  .load-btn, .cancel-btn {
    padding: 4px 12px;
    border-radius: 3px;
    border: none;
    cursor: pointer;
    font-size: 12px;
  }
  .load-btn {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
  .load-btn:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
  .load-btn:disabled { opacity: 0.5; cursor: default; }
  .cancel-btn {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  .cancel-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
</style>
