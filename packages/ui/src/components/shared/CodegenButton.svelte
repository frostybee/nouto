<script lang="ts">
  import { request as requestStore } from '../../stores';
  import type { CodegenRequest } from '@hivefetch/core';
  import CodegenPanel from './CodegenPanel.svelte';
  import Tooltip from './Tooltip.svelte';

  let showPanel = $state(false);

  const codegenRequest: CodegenRequest = $derived({
    method: $requestStore.method,
    url: $requestStore.url,
    headers: $requestStore.headers,
    params: $requestStore.params,
    auth: $requestStore.auth,
    body: $requestStore.body,
  });
</script>

<Tooltip text="Generate Code Snippet">
  <button
    class="codegen-button"
    onclick={() => showPanel = true}
    disabled={!$requestStore.url.trim()}
  >
    <i class="codicon codicon-code"></i>
    <span>Code</span>
  </button>
</Tooltip>

<CodegenPanel
  request={codegenRequest}
  visible={showPanel}
  onclose={() => showPanel = false}
/>

<style>
  .codegen-button {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 4px;
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: 1px solid var(--hf-button-border, transparent);
    cursor: pointer;
    font-weight: 500;
    font-size: 11px;
    transition: background 0.15s, border-color 0.15s;
  }

  .codegen-button:hover:not(:disabled) {
    background: var(--hf-button-secondaryHoverBackground);
    border-color: var(--hf-focusBorder);
  }

  .codegen-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
