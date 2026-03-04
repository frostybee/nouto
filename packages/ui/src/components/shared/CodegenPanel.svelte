<script lang="ts">
  import { getTargets, generateCode, type CodegenRequest } from '@hivefetch/core';
  import CopyButton from './CopyButton.svelte';
  import { postMessage } from '../../lib/vscode';

  interface Props {
    request: CodegenRequest;
    visible: boolean;
    onclose?: () => void;
  }
  let { request, visible, onclose }: Props = $props();

  const targets = getTargets();
  const STORAGE_KEY = 'hivefetch-codegen-language';

  let selectedId = $state(localStorage.getItem(STORAGE_KEY) || 'curl');
  const code = $derived(generateCode(selectedId, request));
  const selectedTarget = $derived(targets.find(t => t.id === selectedId) || targets[0]);

  function selectTarget(id: string) {
    selectedId = id;
    localStorage.setItem(STORAGE_KEY, id);
  }

  function handleOpenInTab() {
    postMessage({
      type: 'openInNewTab',
      data: { content: code, language: selectedTarget?.language || 'plaintext' },
    });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose?.();
  }
</script>

{#if visible}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <div class="codegen-overlay" role="dialog" aria-label="Code Generation" onkeydown={handleKeydown}>
    <div class="codegen-panel">
      <div class="panel-header">
        <h3>Generate Code</h3>
        <button class="close-btn" onclick={onclose} title="Close (Esc)">
          <i class="codicon codicon-close"></i>
        </button>
      </div>

      <div class="language-selector">
        {#each targets as target}
          <button
            class="lang-btn"
            class:active={selectedId === target.id}
            onclick={() => selectTarget(target.id)}
          >
            {target.label}
          </button>
        {/each}
      </div>

      <div class="code-container">
        <pre class="code-output"><code>{code}</code></pre>
      </div>

      <div class="panel-footer">
        <CopyButton text={code} label="Copy to Clipboard" duration={2000} class="action-btn primary" />
        <button class="action-btn" onclick={handleOpenInTab}>
          <i class="codicon codicon-go-to-file"></i> Open in New Tab
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .codegen-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .codegen-panel {
    width: 90%;
    max-width: 800px;
    max-height: 80vh;
    background: var(--hf-editor-background);
    border: 1px solid var(--hf-panel-border);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .panel-header h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--hf-foreground);
  }

  .close-btn {
    padding: 4px;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--hf-foreground);
    opacity: 0.7;
  }

  .close-btn:hover { opacity: 1; }

  .language-selector {
    display: flex;
    gap: 4px;
    padding: 8px 16px;
    flex-wrap: wrap;
    border-bottom: 1px solid var(--hf-panel-border);
    overflow-x: auto;
  }

  .lang-btn {
    padding: 4px 10px;
    background: transparent;
    color: var(--hf-foreground);
    border: 1px solid var(--hf-panel-border);
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
    white-space: nowrap;
    transition: all 0.15s;
    opacity: 0.7;
  }

  .lang-btn:hover { opacity: 1; background: var(--hf-list-hoverBackground); }

  .lang-btn.active {
    opacity: 1;
    background: var(--hf-list-activeSelectionBackground);
    color: var(--hf-list-activeSelectionForeground);
    border-color: var(--hf-focusBorder);
  }

  .code-container {
    flex: 1;
    overflow: auto;
    min-height: 200px;
    max-height: 400px;
  }

  .code-output {
    margin: 0;
    padding: 16px;
    font-family: var(--hf-editor-font-family), 'Consolas', monospace;
    font-size: 13px;
    line-height: 1.5;
    color: var(--hf-editor-foreground);
    white-space: pre;
    tab-size: 2;
  }

  .panel-footer {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--hf-panel-border);
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    transition: background 0.15s;
  }

  .action-btn:hover { background: var(--hf-button-secondaryHoverBackground); }

  :global(.action-btn.primary) {
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
  }

  :global(.action-btn.primary:hover) { background: var(--hf-button-hoverBackground); }
</style>
