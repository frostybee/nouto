<script lang="ts">
  import { getTargets, generateCode, type CodegenRequest } from '@nouto/core';
  import CopyButton from './CopyButton.svelte';
  import Tooltip from './Tooltip.svelte';
  import { postMessage } from '../../lib/vscode';

  interface Props {
    request: CodegenRequest;
    visible: boolean;
    onclose?: () => void;
  }
  let { request, visible, onclose }: Props = $props();

  const targets = getTargets();
  const STORAGE_KEY = 'nouto-codegen-language';

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
        <Tooltip text="Close (Esc)" position="bottom">
          <button class="close-btn" onclick={onclose} aria-label="Close">
            <i class="codicon codicon-close"></i>
          </button>
        </Tooltip>
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
    border-radius: 0.615rem;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.923rem 1.231rem;
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .panel-header h3 {
    margin: 0;
    font-size: 1.077rem;
    font-weight: 600;
    color: var(--hf-foreground);
  }

  .close-btn {
    padding: 0.308rem;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--hf-foreground);
    opacity: 0.7;
  }

  .close-btn:hover { opacity: 1; }

  .language-selector {
    display: flex;
    gap: 0.308rem;
    padding: 0.615rem 1.231rem;
    flex-wrap: wrap;
    border-bottom: 1px solid var(--hf-panel-border);
    overflow-x: auto;
  }

  .lang-btn {
    padding: 0.308rem 0.769rem;
    background: transparent;
    color: var(--hf-foreground);
    border: 1px solid var(--hf-panel-border);
    border-radius: 0.231rem;
    cursor: pointer;
    font-size: 0.846rem;
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
    min-height: 15.385rem;
    max-height: 30.769rem;
  }

  .code-output {
    margin: 0;
    padding: 1.231rem;
    font-family: var(--hf-editor-font-family), 'Consolas', monospace;
    font-size: 1rem;
    line-height: 1.5;
    color: var(--hf-editor-foreground);
    white-space: pre;
    tab-size: 2;
  }

  .panel-footer {
    display: flex;
    gap: 0.615rem;
    padding: 0.923rem 1.231rem;
    border-top: 1px solid var(--hf-panel-border);
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 0.462rem;
    padding: 0.615rem 1.231rem;
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: none;
    border-radius: 0.308rem;
    cursor: pointer;
    font-size: 0.923rem;
    transition: background 0.15s;
  }

  .action-btn:hover { background: var(--hf-button-secondaryHoverBackground); }

  :global(.action-btn.primary) {
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
  }

  :global(.action-btn.primary:hover) { background: var(--hf-button-hoverBackground); }
</style>
