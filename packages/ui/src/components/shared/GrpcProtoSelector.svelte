<script lang="ts">
  import type { GrpcConfig } from '../../types';
  import { untrack } from 'svelte';
  import { grpcProtoStatus, grpcProtoError, setGrpcProtoLoading, scannedDirFiles } from '../../stores/grpc.svelte';
  import { request } from '../../stores';
  import { patchGrpc } from '../../stores/request.svelte';
  import { postMessage } from '../../lib/vscode';
  import Tooltip from './Tooltip.svelte';

  let { onclose }: { onclose: () => void } = $props();

  let useReflection = $state(request.grpc?.useReflection ?? true);
  // Keep local state in sync with store
  $effect(() => {
    useReflection = request.grpc?.useReflection ?? true;
  });
  const protoPaths = $derived(request.grpc?.protoPaths || []);
  const importDirs = $derived(request.grpc?.protoImportDirs || []);
  const dirFiles = $derived(scannedDirFiles());

  // Scan existing import dirs on mount so discovered files are visible
  // untrack(dirFiles) prevents re-triggering when scan results arrive
  $effect(() => {
    const currentDirFiles = untrack(() => dirFiles);
    for (const dir of importDirs) {
      if (!(dir in currentDirFiles)) {
        postMessage({ type: 'scanProtoDir', data: { dir } } as any);
      }
    }
  });

  function handleLoadSchema() {
    setGrpcProtoLoading();
    patchGrpc({ useReflection, protoPaths, protoImportDirs: importDirs });

    if (useReflection) {
      const metadata: Record<string, string> = {};
      if (Array.isArray(request.headers)) {
        for (const h of request.headers) {
          if (h.enabled && h.key) metadata[h.key] = h.value || '';
        }
      }
      postMessage({ type: 'grpcReflect', data: {
        address: request.url,
        metadata,
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
    patchGrpc({ protoPaths: protoPaths.filter((_, i) => i !== index) });
  }

  function removeImportDir(index: number) {
    patchGrpc({ protoImportDirs: importDirs.filter((_, i) => i !== index) });
  }

  function addDiscoveredFile(filePath: string) {
    if (!protoPaths.includes(filePath)) {
      patchGrpc({ protoPaths: [...protoPaths, filePath] });
    }
  }

  function addAllDiscoveredFiles(dir: string) {
    const files = dirFiles[dir] || [];
    const toAdd = files.filter(f => !protoPaths.includes(f));
    if (toAdd.length > 0) {
      patchGrpc({ protoPaths: [...protoPaths, ...toAdd] });
    }
  }

  const status = $derived(grpcProtoStatus());
  const error = $derived(grpcProtoError());
  const isLoadingProto = $derived(status === 'loading');

  // Load schema is enabled when: reflection mode, or there are explicit proto paths,
  // or import dirs have discovered files
  const hasLoadableProtos = $derived(
    protoPaths.length > 0 ||
    importDirs.some(d => (dirFiles[d] || []).length > 0)
  );
</script>

<div class="grpc-proto-selector">
  <div class="proto-source-section">
    <span class="proto-source-label">Proto Source</span>
    <p class="section-hint">Choose how to load the service definition. This tells HiveFetch which methods are available and what messages they expect.</p>
    <div class="radio-group">
      <label class="radio-option">
        <input type="radio" bind:group={useReflection} value={true} />
        <span>Server Reflection</span>
        <span class="radio-description">Auto-discover from server</span>
      </label>
      <p class="option-hint">The server exposes its schema at runtime. No files needed, but the server must have reflection enabled.</p>
      <label class="radio-option">
        <input type="radio" bind:group={useReflection} value={false} />
        <span>Proto Files</span>
        <span class="radio-description">Load from .proto files</span>
      </label>
      <p class="option-hint">Manually provide .proto definition files. Use this when the server does not support reflection.</p>
    </div>
  </div>

  {#if !useReflection}
    <div class="file-section">
      <span class="section-label">Proto Files</span>
      <p class="section-hint">Add .proto files that define your gRPC services and messages.</p>
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
      <p class="section-hint">If your .proto files import other protos (e.g. google/protobuf/timestamp.proto), add the parent directories here so dependencies can be resolved.</p>
      {#each importDirs as dir, i}
        <div class="dir-group">
          <div class="file-item">
            <span class="codicon codicon-folder"></span>
            <span class="file-path" title={dir}>{dir.split(/[/\\]/).pop()}</span>
            <button class="remove-btn" onclick={() => removeImportDir(i)} aria-label="Remove import directory">
              <span class="codicon codicon-close"></span>
            </button>
          </div>
          {#if dirFiles[dir]}
            {#if dirFiles[dir].length === 0}
              <p class="no-files">No .proto files found</p>
            {:else}
              <div class="discovered-files">
                <div class="discovered-header">
                  <span class="discovered-label">{dirFiles[dir].length} .proto file{dirFiles[dir].length !== 1 ? 's' : ''} found</span>
                  <button class="add-all-btn" onclick={() => addAllDiscoveredFiles(dir)}>Add all</button>
                </div>
                {#each dirFiles[dir] as filePath}
                  {@const fileName = filePath.split(/[/\\]/).pop() ?? filePath}
                  {@const alreadyAdded = protoPaths.includes(filePath)}
                  <div class="discovered-item" class:already-added={alreadyAdded}>
                    <span class="codicon codicon-file-code"></span>
                    <span class="file-path" title={filePath}>{fileName}</span>
                    {#if alreadyAdded}
                      <span class="added-badge">Added</span>
                    {:else}
                      <button class="add-file-btn" onclick={() => addDiscoveredFile(filePath)} aria-label="Add file">
                        <span class="codicon codicon-add"></span>
                      </button>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          {:else}
            <p class="scanning">Scanning...</p>
          {/if}
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
    <button class="load-btn" onclick={handleLoadSchema} disabled={isLoadingProto || (!useReflection && !hasLoadableProtos)}>
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
  .section-hint {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    margin: 0 0 4px 0;
    line-height: 1.4;
  }
  .option-hint {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    margin: 0 0 2px 22px;
    line-height: 1.3;
    opacity: 0.85;
  }
  .file-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .dir-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
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
  .discovered-files {
    margin-left: 12px;
    display: flex;
    flex-direction: column;
    gap: 1px;
    border-left: 2px solid var(--vscode-widget-border, var(--vscode-panel-border));
    padding-left: 8px;
  }
  .discovered-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2px 0;
  }
  .discovered-label {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
  }
  .add-all-btn {
    background: none;
    border: none;
    color: var(--vscode-textLink-foreground);
    cursor: pointer;
    font-size: 11px;
    padding: 1px 4px;
  }
  .add-all-btn:hover { text-decoration: underline; }
  .discovered-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 6px;
    border-radius: 2px;
    font-size: 11px;
    color: var(--vscode-foreground);
  }
  .discovered-item:hover { background: var(--vscode-list-hoverBackground); }
  .discovered-item.already-added { opacity: 0.6; }
  .add-file-btn {
    background: none;
    border: none;
    color: var(--vscode-textLink-foreground);
    cursor: pointer;
    padding: 1px 3px;
    opacity: 0;
    flex-shrink: 0;
  }
  .discovered-item:hover .add-file-btn { opacity: 1; }
  .added-badge {
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
    flex-shrink: 0;
  }
  .no-files, .scanning {
    margin: 2px 0 2px 12px;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    font-style: italic;
  }
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
