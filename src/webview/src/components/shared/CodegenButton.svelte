<script lang="ts">
  import { request as requestStore } from '../../stores';
  import type { CodegenRequest } from '../../lib/codegen/index';
  import CodegenPanel from './CodegenPanel.svelte';

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

<button
  class="codegen-button"
  onclick={() => showPanel = true}
  disabled={!$requestStore.url.trim()}
  title="Generate Code Snippet"
>
  <i class="codicon codicon-code"></i>
  <span>Code</span>
</button>

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
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: 1px solid var(--vscode-button-border, transparent);
    cursor: pointer;
    font-weight: 500;
    font-size: 11px;
    transition: background 0.15s, border-color 0.15s;
  }

  .codegen-button:hover:not(:disabled) {
    background: var(--vscode-button-secondaryHoverBackground);
    border-color: var(--vscode-focusBorder);
  }

  .codegen-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
