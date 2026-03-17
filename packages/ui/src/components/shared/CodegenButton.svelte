<script lang="ts">
  import { request as requestStore } from '../../stores';
  import type { CodegenRequest } from '@nouto/core';
  import { substituteVariables } from '../../stores/environment.svelte';
  import CodegenPanel from './CodegenPanel.svelte';
  import Tooltip from './Tooltip.svelte';

  let showPanel = $state(false);

  const sub = substituteVariables;
  const codegenRequest: CodegenRequest = $derived({
    method: requestStore.method,
    url: sub(requestStore.url),
    headers: requestStore.headers.map(h => ({ ...h, key: sub(h.key), value: sub(h.value) })),
    params: requestStore.params.map(p => ({ ...p, key: sub(p.key), value: sub(p.value) })),
    auth: {
      ...requestStore.auth,
      username: requestStore.auth.username ? sub(requestStore.auth.username) : undefined,
      password: requestStore.auth.password ? sub(requestStore.auth.password) : undefined,
      token: requestStore.auth.token ? sub(requestStore.auth.token) : undefined,
      apiKeyName: requestStore.auth.apiKeyName ? sub(requestStore.auth.apiKeyName) : undefined,
      apiKeyValue: requestStore.auth.apiKeyValue ? sub(requestStore.auth.apiKeyValue) : undefined,
    },
    body: {
      ...requestStore.body,
      content: requestStore.body.content ? sub(requestStore.body.content) : requestStore.body.content,
    },
  });
</script>

<Tooltip text="Generate Code Snippet">
  <button
    class="codegen-button"
    onclick={() => showPanel = true}
    disabled={!requestStore.url.trim()}
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
    font-weight: 600;
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
