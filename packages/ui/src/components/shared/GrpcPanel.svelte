<script lang="ts">
  import type { GrpcServiceDescriptor, GrpcMethodDescriptor } from '../../types';
  import { GRPC_STATUS_CODES } from '../../types';
  import { grpcProtoStatus, grpcProtoDescriptor, grpcProtoError } from '../../stores/grpc.svelte';
  import { request } from '../../stores';
  import { patchGrpc, setHeaders, setBody } from '../../stores/request.svelte';
  import KeyValueEditor from './KeyValueEditor.svelte';
  import GrpcProtoSelector from './GrpcProtoSelector.svelte';
  import Tooltip from './Tooltip.svelte';
  import CodeMirrorEditor from './CodeMirrorEditor.svelte';

  let showProtoSelector = $state(false);
  let activeTab = $state<'message' | 'metadata' | 'tls'>('message');

  const protoStatus = $derived(grpcProtoStatus());
  const descriptor = $derived(grpcProtoDescriptor());
  const protoError = $derived(grpcProtoError());
  const grpcConfig = $derived(request.grpc);

  // Build flat list of service/method options
  const methodOptions = $derived.by(() => {
    if (!descriptor?.services) return [];
    const options: Array<{ label: string; serviceName: string; methodName: string; method: GrpcMethodDescriptor }> = [];
    for (const svc of descriptor.services) {
      for (const method of svc.methods) {
        options.push({
          label: `${svc.name}/${method.name}`,
          serviceName: svc.name,
          methodName: method.name,
          method,
        });
      }
    }
    return options;
  });

  const selectedMethodKey = $derived(
    grpcConfig?.serviceName && grpcConfig?.methodName
      ? `${grpcConfig.serviceName}/${grpcConfig.methodName}`
      : ''
  );

  const selectedMethod = $derived(
    methodOptions.find(o => `${o.serviceName}/${o.methodName}` === selectedMethodKey)
  );

  function handleMethodChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value;
    const option = methodOptions.find(o => `${o.serviceName}/${o.methodName}` === value);
    if (option) {
      patchGrpc({ serviceName: option.serviceName, methodName: option.methodName });
    }
  }

  function handleTlsToggle(e: Event) {
    patchGrpc({ tls: (e.target as HTMLInputElement).checked });
  }

  // Auto-select first method if only one available
  $effect(() => {
    if (methodOptions.length === 1 && !selectedMethodKey) {
      patchGrpc({ serviceName: methodOptions[0].serviceName, methodName: methodOptions[0].methodName });
    }
  });
</script>

<div class="grpc-panel">
  <!-- Schema status bar -->
  <div class="schema-bar">
    <div class="schema-status">
      {#if protoStatus === 'loaded'}
        <span class="status-badge loaded">Schema Loaded</span>
        <span class="schema-info">
          {descriptor?.source === 'reflection' ? 'Reflection' : `${grpcConfig?.protoPaths?.length || 0} proto files`}
        </span>
      {:else if protoStatus === 'loading'}
        <span class="status-badge loading">Loading...</span>
      {:else if protoStatus === 'error'}
        <span class="status-badge error">Error</span>
        {#if protoError}
          <span class="error-hint">{protoError}</span>
        {/if}
      {:else}
        <span class="status-badge idle">No Schema</span>
      {/if}
    </div>
    <button class="configure-btn" onclick={() => showProtoSelector = !showProtoSelector}>
      Configure
    </button>
  </div>

  {#if showProtoSelector}
    <GrpcProtoSelector onclose={() => showProtoSelector = false} />
  {/if}

  <!-- Service/Method selector -->
  {#if protoStatus === 'loaded' && methodOptions.length > 0}
    <div class="method-selector">
      <label class="selector-label" for="grpc-method-select">Service / Method</label>
      <select id="grpc-method-select" class="method-select" value={selectedMethodKey} onchange={handleMethodChange}>
        <option value="">Select a method...</option>
        {#each methodOptions as option}
          <option value="{option.serviceName}/{option.methodName}">{option.label}</option>
        {/each}
      </select>
      {#if selectedMethod}
        <div class="method-info">
          <span class="type-label">Input: {selectedMethod.method.inputType}</span>
          <span class="type-label">Output: {selectedMethod.method.outputType}</span>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Tabs -->
  <div class="grpc-tabs">
    <button class="tab" class:active={activeTab === 'message'} onclick={() => activeTab = 'message'}>Message</button>
    <button class="tab" class:active={activeTab === 'metadata'} onclick={() => activeTab = 'metadata'}>Metadata</button>
    <button class="tab" class:active={activeTab === 'tls'} onclick={() => activeTab = 'tls'}>TLS</button>
  </div>

  <div class="tab-content">
    {#if activeTab === 'message'}
      <CodeMirrorEditor
        content={request.body.content || '{}'}
        language="json"
        placeholder={'{"field": "value"}'}
        onchange={(value) => setBody({ ...request.body, content: value })}
        enableLint={true}
      />
    {:else if activeTab === 'metadata'}
      <KeyValueEditor
        items={request.headers}
        onchange={(items) => setHeaders(items)}
        keyPlaceholder="Metadata key"
        valuePlaceholder="Value"
      />
    {:else if activeTab === 'tls'}
      <div class="tls-settings">
        <label class="tls-toggle">
          <input type="checkbox" checked={grpcConfig?.tls || false} onchange={handleTlsToggle} />
          <span>Use TLS</span>
        </label>
        {#if grpcConfig?.tls}
          <div class="tls-fields">
            <label class="field-label">
              CA Certificate
              <input type="text" value={grpcConfig?.tlsCaCertPath || ''} oninput={(e) => patchGrpc({ tlsCaCertPath: (e.target as HTMLInputElement).value })} placeholder="Path to CA cert" />
            </label>
            <label class="field-label">
              Client Certificate
              <input type="text" value={grpcConfig?.tlsCertPath || ''} oninput={(e) => patchGrpc({ tlsCertPath: (e.target as HTMLInputElement).value })} placeholder="Path to client cert" />
            </label>
            <label class="field-label">
              Client Key
              <input type="text" value={grpcConfig?.tlsKeyPath || ''} oninput={(e) => patchGrpc({ tlsKeyPath: (e.target as HTMLInputElement).value })} placeholder="Path to client key" />
            </label>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .grpc-panel { display: flex; flex-direction: column; gap: 8px; height: 100%; overflow: auto; }
  .schema-bar { display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; background: var(--vscode-editor-background); border-bottom: 1px solid var(--vscode-widget-border, var(--vscode-panel-border)); }
  .schema-status { display: flex; align-items: center; gap: 8px; font-size: 12px; }
  .status-badge { padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 500; }
  .status-badge.loaded { background: var(--vscode-testing-iconPassed, #388a34); color: white; }
  .status-badge.loading { background: var(--vscode-progressBar-background, #0078d4); color: white; }
  .status-badge.error { background: var(--vscode-testing-iconFailed, #f14c4c); color: white; }
  .status-badge.idle { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
  .schema-info { color: var(--vscode-descriptionForeground); font-size: 11px; }
  .error-hint { color: var(--vscode-errorForeground); font-size: 11px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .configure-btn { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; padding: 3px 10px; border-radius: 3px; cursor: pointer; font-size: 11px; }
  .configure-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .method-selector { padding: 6px 8px; }
  .selector-label { font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--vscode-foreground); margin-bottom: 4px; display: block; }
  .method-select { width: 100%; padding: 4px 8px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--vscode-widget-border)); border-radius: 3px; font-size: 12px; }
  .method-info { display: flex; gap: 12px; margin-top: 4px; }
  .type-label { font-size: 11px; color: var(--vscode-descriptionForeground); }
  .grpc-tabs { display: flex; border-bottom: 1px solid var(--vscode-widget-border, var(--vscode-panel-border)); }
  .tab { background: none; border: none; padding: 6px 12px; cursor: pointer; font-size: 12px; color: var(--vscode-foreground); border-bottom: 2px solid transparent; }
  .tab.active { border-bottom-color: var(--vscode-focusBorder); color: var(--vscode-foreground); }
  .tab:hover:not(.active) { background: var(--vscode-list-hoverBackground); }
  .tab-content { flex: 1; overflow: auto; padding: 8px; }
  .tls-settings { display: flex; flex-direction: column; gap: 8px; }
  .tls-toggle { display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 13px; color: var(--vscode-foreground); }
  .tls-fields { display: flex; flex-direction: column; gap: 6px; padding-left: 4px; }
  .field-label { font-size: 12px; color: var(--vscode-foreground); display: flex; flex-direction: column; gap: 2px; }
  .field-label input { padding: 4px 8px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--vscode-widget-border)); border-radius: 3px; font-size: 12px; }
</style>
