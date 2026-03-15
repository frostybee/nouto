<script lang="ts">
  import type { GrpcServiceDescriptor, GrpcMethodDescriptor } from '../../types';
  import { GRPC_STATUS_CODES } from '../../types';
  import { untrack } from 'svelte';
  import { grpcProtoStatus, grpcProtoDescriptor, grpcProtoError, grpcActiveMethodSchema } from '../../stores/grpc.svelte';
  import { request } from '../../stores';
  import { patchGrpc, setHeaders, setBody } from '../../stores/request.svelte';
  import KeyValueEditor from './KeyValueEditor.svelte';
  import GrpcProtoSelector from './GrpcProtoSelector.svelte';
  import Tooltip from './Tooltip.svelte';
  import CodeMirrorEditor from './CodeMirrorEditor.svelte';
  import AuthEditor from './AuthEditor.svelte';
  import CopyButton from './CopyButton.svelte';
  import { setAuth } from '../../stores/request.svelte';

  let showProtoSelector = $state(false);
  let activeTab = $state<'message' | 'metadata' | 'auth' | 'tls'>('message');
  let methodDropdownOpen = $state(false);
  let methodDropdownRef = $state<HTMLDivElement>(undefined!);

  const protoStatus = $derived(grpcProtoStatus());
  const descriptor = $derived(grpcProtoDescriptor());
  const protoError = $derived(grpcProtoError());
  const grpcConfig = $derived(request.grpc);

  // Group services with their methods
  const services = $derived(descriptor?.services || []);

  const selectedServiceName = $derived(grpcConfig?.serviceName || '');
  const selectedMethodName = $derived(grpcConfig?.methodName || '');

  const selectedService = $derived(
    services.find(s => s.name === selectedServiceName)
  );

  const selectedMethod = $derived(
    selectedService?.methods.find(m => m.name === selectedMethodName)
  );

  // Short display name: strip package prefix from service name
  function shortServiceName(fullName: string): string {
    const parts = fullName.split('.');
    return parts[parts.length - 1];
  }

  // Streaming badge text
  function streamingLabel(method: GrpcMethodDescriptor): string | null {
    if (method.clientStreaming && method.serverStreaming) return 'bidi';
    if (method.clientStreaming) return 'client stream';
    if (method.serverStreaming) return 'server stream';
    return null;
  }

  function scaffoldFromSchema(schema: any, defs?: Record<string, any>): any {
    if (!schema) return {};
    if (schema.$ref && defs) {
      const refName = schema.$ref.replace('#/$defs/', '');
      return defs[refName] ? scaffoldFromSchema(defs[refName], defs) : {};
    }
    if (schema.type === 'object' && schema.properties) {
      const merged = { ...defs, ...schema.$defs };
      const obj: Record<string, any> = {};
      for (const [key, prop] of Object.entries(schema.properties) as [string, any][]) {
        obj[key] = scaffoldFromSchema(prop, merged);
      }
      return obj;
    }
    if (schema.type === 'array') return [];
    if (schema.type === 'string') return '';
    if (schema.type === 'number' || schema.type === 'integer') return 0;
    if (schema.type === 'boolean') return false;
    if (schema.enum && schema.enum.length > 0) return schema.enum[0];
    return {};
  }

  function selectMethod(serviceName: string, method: GrpcMethodDescriptor) {
    patchGrpc({ serviceName, methodName: method.name });
    methodDropdownOpen = false;
    // Auto-scaffold body if empty or default
    const currentBody = (request.body.content || '').trim();
    if (!currentBody || currentBody === '{}') {
      const schemaStr = method.inputSchema;
      if (schemaStr) {
        try {
          const parsed = JSON.parse(schemaStr);
          const skeleton = scaffoldFromSchema(parsed, parsed.$defs);
          setBody({ ...request.body, content: JSON.stringify(skeleton, null, 2) });
        } catch { /* ignore parse errors */ }
      }
    }
  }

  function handleMethodDropdownClickOutside(e: MouseEvent) {
    if (methodDropdownRef && !methodDropdownRef.contains(e.target as Node)) {
      methodDropdownOpen = false;
    }
  }

  $effect(() => {
    if (methodDropdownOpen) {
      document.addEventListener('click', handleMethodDropdownClickOutside, true);
      return () => document.removeEventListener('click', handleMethodDropdownClickOutside, true);
    }
  });

  let wordWrap = $state(true);

  function formatJson() {
    const content = (request.body.content || '').trim();
    if (!content) return;
    try {
      const parsed = JSON.parse(content);
      setBody({ ...request.body, content: JSON.stringify(parsed, null, 2) });
    } catch { /* invalid JSON */ }
  }

  function minifyJson() {
    const content = (request.body.content || '').trim();
    if (!content) return;
    try {
      const parsed = JSON.parse(content);
      setBody({ ...request.body, content: JSON.stringify(parsed) });
    } catch { /* invalid JSON */ }
  }

  function handleTlsToggle(e: Event) {
    patchGrpc({ tls: (e.target as HTMLInputElement).checked });
  }

  // Auto-close proto selector when schema loads successfully
  $effect(() => {
    if (protoStatus === 'loaded') showProtoSelector = false;
  });

  // Auto-select first method if only one service with one method
  $effect(() => {
    if (services.length === 1 && services[0].methods.length === 1 && !untrack(() => selectedMethodName)) {
      patchGrpc({ serviceName: services[0].name, methodName: services[0].methods[0].name });
    }
  });
</script>

<div class="grpc-panel">
  {#if protoStatus === 'loaded' && !showProtoSelector}
    <!-- Compact bar: schema badge + method selector on one row -->
    <div class="compact-header">
      <div class="compact-schema">
        <span class="status-badge loaded">Schema Loaded</span>
        <span class="schema-info">
          {descriptor?.source === 'reflection' ? 'Reflection' : `${grpcConfig?.protoPaths?.length || 0} proto files`}
        </span>
      </div>
      <button class="configure-btn" onclick={() => showProtoSelector = true}>
        Configure
      </button>
    </div>

    <!-- Service/Method selector -->
    {#if services.length > 0}
      <div class="method-selector" bind:this={methodDropdownRef}>
        <button class="method-trigger" onclick={() => methodDropdownOpen = !methodDropdownOpen}>
          {#if selectedMethod}
            <span class="method-trigger-service">{shortServiceName(selectedServiceName)}</span>
            <span class="method-trigger-separator">/</span>
            <span class="method-trigger-method">{selectedMethodName}</span>
            {#if streamingLabel(selectedMethod)}
              <span class="streaming-badge">{streamingLabel(selectedMethod)}</span>
            {/if}
          {:else}
            <span class="method-trigger-placeholder">Select a method...</span>
          {/if}
          <span class="codicon codicon-chevron-down method-chevron" class:open={methodDropdownOpen}></span>
        </button>
        {#if methodDropdownOpen}
          <div class="method-dropdown">
            {#each services as svc}
              <div class="method-group">
                <div class="method-group-header">
                  <span class="codicon codicon-symbol-interface"></span>
                  {shortServiceName(svc.name)}
                  <span class="method-count">{svc.methods.length}</span>
                </div>
                {#each svc.methods as method}
                  {@const isSelected = selectedServiceName === svc.name && selectedMethodName === method.name}
                  <button
                    class="method-option"
                    class:selected={isSelected}
                    onclick={() => selectMethod(svc.name, method)}
                  >
                    <span class="codicon codicon-symbol-method"></span>
                    <span class="method-option-name">{method.name}</span>
                    {#if streamingLabel(method)}
                      <span class="streaming-badge small">{streamingLabel(method)}</span>
                    {/if}
                    {#if isSelected}
                      <span class="codicon codicon-check method-check"></span>
                    {/if}
                  </button>
                {/each}
              </div>
            {/each}
          </div>
        {/if}

        {#if selectedMethod}
          <div class="method-info">
            <span class="type-label">Input: {selectedMethod.inputType}</span>
            <span class="type-label">Output: {selectedMethod.outputType}</span>
          </div>
        {:else}
          <p class="inline-hint">Choose a service method to invoke. The message body will be auto-populated from the schema.</p>
        {/if}
      </div>
    {/if}
  {:else}
    <!-- Full schema bar: shown when not loaded, loading, error, or configuring -->
    <div class="schema-bar">
      <div class="schema-status">
        {#if protoStatus === 'loading'}
          <span class="status-badge loading">Loading...</span>
        {:else if protoStatus === 'error'}
          <span class="status-badge error">Error</span>
          {#if protoError}
            <span class="error-hint">{protoError}</span>
          {/if}
        {:else if protoStatus === 'loaded'}
          <span class="status-badge loaded">Schema Loaded</span>
          <span class="schema-info">
            {descriptor?.source === 'reflection' ? 'Reflection' : `${grpcConfig?.protoPaths?.length || 0} proto files`}
          </span>
        {:else}
          <span class="status-badge idle">No Schema</span>
        {/if}
      </div>
      <button class="configure-btn" onclick={() => showProtoSelector = !showProtoSelector}>
        {showProtoSelector ? 'Close' : 'Configure'}
      </button>
    </div>

    {#if !showProtoSelector && protoStatus === 'idle'}
      <div class="onboarding-card">
        <div class="onboarding-title">
          <span class="codicon codicon-info"></span>
          Getting Started with gRPC
        </div>
        <ol class="onboarding-steps">
          <li><strong>Enter the server address</strong> above (e.g. localhost:50051)</li>
          <li><strong>Load a schema</strong> using server reflection or .proto files</li>
          <li><strong>Select a method</strong> from the discovered services</li>
          <li><strong>Compose your message</strong> and hit Invoke</li>
        </ol>
        <button class="onboarding-configure-btn" onclick={() => showProtoSelector = true}>
          <span class="codicon codicon-gear"></span> Configure Schema
        </button>
      </div>
    {/if}

    {#if showProtoSelector}
      <GrpcProtoSelector onclose={() => showProtoSelector = false} />
    {/if}
  {/if}

  <!-- Timeout -->
  <div class="timeout-row">
    <label class="timeout-label" for="grpc-timeout">Timeout (ms)</label>
    <input
      id="grpc-timeout"
      type="number"
      class="timeout-input"
      min="0"
      step="100"
      placeholder="No timeout"
      value={grpcConfig?.timeout || ''}
      oninput={(e) => {
        const val = parseInt((e.target as HTMLInputElement).value);
        patchGrpc({ timeout: isNaN(val) || val <= 0 ? undefined : val });
      }}
    />
    <span class="field-hint">Leave empty for no deadline</span>
  </div>

  <!-- Tabs -->
  <div class="grpc-tabs">
    <button class="tab" class:active={activeTab === 'message'} onclick={() => activeTab = 'message'}>Message</button>
    <button class="tab" class:active={activeTab === 'metadata'} onclick={() => activeTab = 'metadata'}>Metadata</button>
    <button class="tab" class:active={activeTab === 'auth'} onclick={() => activeTab = 'auth'}>Auth</button>
    <button class="tab" class:active={activeTab === 'tls'} onclick={() => activeTab = 'tls'}>TLS</button>
  </div>

  {#if activeTab === 'message'}
    <div class="editor-toolbar">
      <Tooltip text="Format JSON">
        <button class="toolbar-btn" onclick={formatJson}>
          <span class="codicon codicon-list-flat"></span> Format
        </button>
      </Tooltip>
      <Tooltip text="Minify JSON">
        <button class="toolbar-btn" onclick={minifyJson}>
          <span class="codicon codicon-fold"></span> Minify
        </button>
      </Tooltip>
      <CopyButton text={request.body.content ?? ''} />
      <Tooltip text="Toggle word wrap">
        <button class="toolbar-btn" class:active={wordWrap} onclick={() => wordWrap = !wordWrap}>
          <span class="codicon codicon-word-wrap"></span> Wrap
        </button>
      </Tooltip>
    </div>
  {/if}

  <div class="tab-content">
    {#if activeTab === 'message'}
      <p class="tab-hint">JSON representation of the protobuf request message. Select a method above to auto-populate fields from the schema.</p>
      <CodeMirrorEditor
        content={request.body.content || '{}'}
        language="json"
        placeholder={'{"field": "value"}'}
        onchange={(value) => setBody({ ...request.body, content: value })}
        enableLint={true}
        {wordWrap}
      />
    {:else if activeTab === 'auth'}
      <AuthEditor auth={request.auth} onchange={(auth) => setAuth(auth)} />
    {:else if activeTab === 'metadata'}
      <p class="tab-hint">Metadata is sent as key-value pairs with each gRPC call, similar to HTTP headers. Common uses include authorization tokens, request IDs, and tracing context.</p>
      <KeyValueEditor
        items={request.headers}
        onchange={(items) => setHeaders(items)}
        keyPlaceholder="Metadata key"
        valuePlaceholder="Value"
      />
    {:else if activeTab === 'tls'}
      <p class="tab-hint">Enable TLS for encrypted communication. Required when connecting to servers that use SSL/TLS. For mutual TLS (mTLS), provide both client certificate and key.</p>
      <div class="tls-settings">
        <label class="tls-toggle">
          <input type="checkbox" checked={grpcConfig?.tls || false} onchange={handleTlsToggle} />
          <span>Use TLS</span>
        </label>
        {#if grpcConfig?.tls}
          <div class="tls-fields">
            <label class="field-label">
              CA Certificate
              <span class="field-description">Custom CA to verify the server. Leave empty to use system defaults.</span>
              <input type="text" value={grpcConfig?.tlsCaCertPath || ''} oninput={(e) => patchGrpc({ tlsCaCertPath: (e.target as HTMLInputElement).value })} placeholder="Path to CA cert (.pem, .crt)" />
            </label>
            <label class="field-label">
              Client Certificate
              <span class="field-description">Required for mutual TLS (mTLS) authentication.</span>
              <input type="text" value={grpcConfig?.tlsCertPath || ''} oninput={(e) => patchGrpc({ tlsCertPath: (e.target as HTMLInputElement).value })} placeholder="Path to client cert (.pem, .crt)" />
            </label>
            <label class="field-label">
              Client Key
              <span class="field-description">Private key matching the client certificate.</span>
              <input type="text" value={grpcConfig?.tlsKeyPath || ''} oninput={(e) => patchGrpc({ tlsKeyPath: (e.target as HTMLInputElement).value })} placeholder="Path to client key (.pem, .key)" />
            </label>
            <label class="field-label">
              Key Passphrase
              <span class="field-description">Only needed if the private key is encrypted.</span>
              <input type="password" value={grpcConfig?.tlsPassphrase || ''} oninput={(e) => patchGrpc({ tlsPassphrase: (e.target as HTMLInputElement).value })} placeholder="Passphrase" />
            </label>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .grpc-panel { display: flex; flex-direction: column; gap: 8px; height: 100%; overflow: auto; padding: 12px; }
  .compact-header { display: flex; align-items: center; justify-content: space-between; padding: 4px 8px; }
  .compact-schema { display: flex; align-items: center; gap: 8px; font-size: 12px; }
  .schema-bar { display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; background: var(--hf-editor-background); border-bottom: 1px solid var(--hf-panel-border); }
  .schema-status { display: flex; align-items: center; gap: 8px; font-size: 12px; }
  .status-badge { padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 500; }
  .status-badge.loaded { background: var(--hf-testing-iconPassed, #388a34); color: white; }
  .status-badge.loading { background: var(--hf-progressBar-background, #0078d4); color: white; }
  .status-badge.error { background: var(--hf-testing-iconFailed, #f14c4c); color: white; }
  .status-badge.idle { background: var(--hf-badge-background); color: var(--hf-badge-foreground); }
  .schema-info { color: var(--hf-descriptionForeground); font-size: 11px; }
  .error-hint { color: var(--hf-errorForeground); font-size: 11px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .configure-btn { background: var(--hf-button-secondaryBackground); color: var(--hf-button-secondaryForeground); border: none; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; }
  .configure-btn:hover { background: var(--hf-button-secondaryHoverBackground); }
  .method-selector { padding: 6px 8px; position: relative; }
  .method-trigger {
    display: flex; align-items: center; gap: 4px; width: 100%;
    padding: 5px 10px; background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 4px; cursor: pointer; font-size: 13px; text-align: left;
    transition: border-color 0.15s;
  }
  .method-trigger:hover { border-color: var(--hf-focusBorder); }
  .method-trigger-service { color: var(--hf-descriptionForeground); }
  .method-trigger-separator { color: var(--hf-descriptionForeground); opacity: 0.5; }
  .method-trigger-method { font-weight: 500; color: var(--hf-foreground); }
  .method-trigger-placeholder { color: var(--hf-input-placeholderForeground, var(--hf-descriptionForeground)); }
  .method-chevron { margin-left: auto; font-size: 10px; transition: transform 0.15s; color: var(--hf-descriptionForeground); }
  .method-chevron.open { transform: rotate(180deg); }
  .method-dropdown {
    position: absolute; top: calc(100% + 2px); left: 8px; right: 8px;
    background: var(--hf-editorWidget-background, #252526);
    border: 1px solid var(--hf-editorWidget-border, #454545);
    border-radius: 6px; padding: 4px 0; z-index: 200;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
    max-height: 320px; overflow-y: auto;
  }
  .method-group { padding: 2px 0; }
  .method-group + .method-group { border-top: 1px solid var(--hf-editorWidget-border, #454545); }
  .method-group-header {
    display: flex; align-items: center; gap: 6px;
    padding: 6px 12px 4px; font-size: 11px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.03em;
    color: var(--hf-descriptionForeground);
  }
  .method-count {
    margin-left: auto; background: var(--hf-badge-background);
    color: var(--hf-badge-foreground); font-size: 10px;
    padding: 0 5px; border-radius: 8px; font-weight: 500; line-height: 16px;
  }
  .method-option {
    display: flex; align-items: center; gap: 6px; width: 100%;
    padding: 5px 12px 5px 24px; background: transparent; border: none;
    color: var(--hf-foreground); cursor: pointer; font-size: 13px; text-align: left;
    transition: background 0.1s;
  }
  .method-option:hover { background: var(--hf-list-hoverBackground, rgba(128, 128, 128, 0.12)); }
  .method-option.selected { background: var(--hf-list-activeSelectionBackground, rgba(4, 57, 94, 0.4)); }
  .method-option-name { flex: 1; }
  .method-check { margin-left: auto; font-size: 12px; color: var(--hf-notificationsInfoIcon-foreground, #3794ff); }
  .streaming-badge {
    font-size: 10px; padding: 1px 6px; border-radius: 8px; font-weight: 500;
    background: var(--hf-editorInfo-background, rgba(55, 148, 255, 0.15));
    color: var(--hf-notificationsInfoIcon-foreground, #3794ff);
    white-space: nowrap;
  }
  .streaming-badge.small { font-size: 9px; padding: 0 5px; }
  .method-info { display: flex; gap: 12px; margin-top: 6px; }
  .type-label { font-size: 11px; color: var(--hf-descriptionForeground); }
  .timeout-row { display: flex; align-items: center; gap: 8px; padding: 4px 8px; }
  .timeout-label { font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--hf-foreground); white-space: nowrap; }
  .timeout-input { width: 120px; padding: 4px 8px; background: var(--hf-input-background); color: var(--hf-input-foreground); border: 1px solid var(--hf-input-border, var(--hf-panel-border)); border-radius: 4px; font-size: 12px; }
  .grpc-tabs { display: flex; border-bottom: 1px solid var(--hf-panel-border); }
  .tab { background: none; border: none; padding: 6px 12px; cursor: pointer; font-size: 12px; color: var(--hf-foreground); border-bottom: 2px solid transparent; }
  .tab.active { border-bottom-color: var(--hf-focusBorder); color: var(--hf-foreground); }
  .tab:hover:not(.active) { background: var(--hf-list-hoverBackground); }
  .tab-content { flex: 1; overflow: auto; padding: 8px; }
  .editor-toolbar { display: flex; gap: 8px; padding: 4px 8px; align-items: center; }
  .toolbar-btn {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 4px 8px; background: transparent;
    color: var(--hf-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 3px; cursor: pointer; font-size: 11px;
    transition: background 0.15s, border-color 0.15s;
  }
  .toolbar-btn .codicon { font-size: 12px; }
  .toolbar-btn:hover { background: var(--hf-list-hoverBackground); border-color: var(--hf-focusBorder); }
  .toolbar-btn.active { background: var(--hf-list-activeSelectionBackground); color: var(--hf-list-activeSelectionForeground); border-color: var(--hf-focusBorder); }
  .tls-settings { display: flex; flex-direction: column; gap: 8px; }
  .tls-toggle { display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 13px; color: var(--hf-foreground); }
  .tls-fields { display: flex; flex-direction: column; gap: 10px; padding-left: 4px; }
  .field-label { font-size: 12px; color: var(--hf-foreground); display: flex; flex-direction: column; gap: 2px; }
  .field-label input { padding: 4px 8px; background: var(--hf-input-background); color: var(--hf-input-foreground); border: 1px solid var(--hf-input-border, var(--hf-panel-border)); border-radius: 4px; font-size: 12px; }
  .field-description { font-size: 11px; color: var(--hf-descriptionForeground); font-weight: normal; }

  /* Inline hints */
  .inline-hint, .tab-hint, .field-hint {
    font-size: 11px;
    color: var(--hf-descriptionForeground);
    margin: 0;
    line-height: 1.4;
  }
  .inline-hint { margin-top: 4px; padding: 0 2px; }
  .tab-hint { margin-bottom: 8px; }

  /* Onboarding card */
  .onboarding-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 16px;
    background: var(--hf-editorInfo-background, rgba(55, 148, 255, 0.08));
    border: 1px solid var(--hf-editorInfo-border, rgba(55, 148, 255, 0.25));
    border-radius: 6px;
  }
  .onboarding-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--hf-foreground);
  }
  .onboarding-title .codicon { font-size: 14px; color: var(--hf-notificationsInfoIcon-foreground, #3794ff); }
  .onboarding-steps {
    margin: 0;
    padding-left: 20px;
    font-size: 12px;
    color: var(--hf-foreground);
    line-height: 1.7;
  }
  .onboarding-steps li { padding-left: 2px; }
  .onboarding-steps strong { color: var(--hf-foreground); }
  .onboarding-configure-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    align-self: flex-start;
    padding: 5px 14px;
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
  }
  .onboarding-configure-btn:hover { background: var(--hf-button-hoverBackground); }
</style>
