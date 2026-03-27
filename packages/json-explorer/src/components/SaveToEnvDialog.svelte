<script lang="ts">
  import { onMount } from 'svelte';
  import type { FlatNode } from '../stores/jsonExplorer.svelte';

  interface Props {
    node: FlatNode;
    onSave: (key: string, value: string) => void;
    onCancel: () => void;
  }
  let { node, onSave, onCancel }: Props = $props();

  let inputEl = $state<HTMLInputElement>(undefined!);

  // Auto-suggest variable name from the key
  let varName = $state('variable');
  $effect(() => { varName = typeof node.key === 'string' ? node.key : 'variable'; });
  const displayValue = $derived(
    node.isExpandable
      ? JSON.stringify(node.value)
      : String(node.value)
  );

  onMount(() => {
    inputEl?.focus();
    inputEl?.select();
  });

  function handleSubmit() {
    if (varName.trim()) {
      onSave(varName.trim(), displayValue);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  }
</script>

<div class="dialog-overlay" onclick={onCancel} role="presentation">
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_interactive_supports_focus -->
  <div class="dialog" onclick={(e) => e.stopPropagation()} role="dialog" aria-label="Save as environment variable" tabindex={-1}>
    <div class="dialog-header">
      <i class="codicon codicon-variable"></i>
      <span>Save as Environment Variable</span>
    </div>
    <div class="dialog-body">
      <label class="dialog-label">
        Variable name
        <input
          bind:this={inputEl}
          bind:value={varName}
          onkeydown={handleKeydown}
          class="dialog-input"
          type="text"
          placeholder="variableName"
          spellcheck={false}
        />
      </label>
      <div class="dialog-preview">
        <span class="preview-label">Value:</span>
        <code class="preview-value">{displayValue.length > 100 ? displayValue.slice(0, 97) + '...' : displayValue}</code>
      </div>
      <div class="dialog-hint">
        Use as <code>{`{{${varName}}}`}</code> in requests
      </div>
    </div>
    <div class="dialog-footer">
      <button class="dialog-btn cancel" onclick={onCancel}>Cancel</button>
      <button class="dialog-btn save" onclick={handleSubmit}>Save</button>
    </div>
  </div>
</div>

<style>
  .dialog-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
  }

  .dialog {
    width: 360px;
    background: var(--hf-editor-background);
    border: 1px solid var(--hf-panel-border);
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
    overflow: hidden;
  }

  .dialog-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--hf-panel-border);
    font-size: 13px;
    font-weight: 600;
    color: var(--hf-editor-foreground);
  }

  .dialog-body {
    padding: 12px 16px;
  }

  .dialog-label {
    display: block;
    font-size: 11px;
    color: var(--hf-descriptionForeground);
    margin-bottom: 4px;
  }

  .dialog-input {
    display: block;
    width: 100%;
    padding: 5px 8px;
    margin-top: 4px;
    background: var(--hf-input-background);
    border: 1px solid var(--hf-input-border);
    border-radius: 3px;
    color: var(--hf-input-foreground);
    font-family: var(--hf-editor-font-family);
    font-size: 12px;
    outline: none;
    box-sizing: border-box;
  }

  .dialog-input:focus {
    border-color: var(--hf-focusBorder);
  }

  .dialog-preview {
    margin-top: 10px;
    font-size: 11px;
    color: var(--hf-descriptionForeground);
  }

  .preview-label {
    display: block;
    margin-bottom: 2px;
  }

  .preview-value {
    display: block;
    padding: 4px 6px;
    background: var(--hf-textCodeBlock-background);
    border-radius: 3px;
    font-family: var(--hf-editor-font-family);
    font-size: 11px;
    color: var(--hf-debugTokenExpression-string);
    word-break: break-all;
    max-height: 60px;
    overflow: hidden;
  }

  .dialog-hint {
    margin-top: 8px;
    font-size: 10px;
    color: var(--hf-descriptionForeground);
  }

  .dialog-hint code {
    font-family: var(--hf-editor-font-family);
    color: var(--hf-textLink-foreground);
  }

  .dialog-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 10px 16px;
    border-top: 1px solid var(--hf-panel-border);
  }

  .dialog-btn {
    padding: 4px 14px;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
  }

  .dialog-btn.cancel {
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
  }

  .dialog-btn.cancel:hover {
    background: var(--hf-button-secondaryHoverBackground);
  }

  .dialog-btn.save {
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
  }

  .dialog-btn.save:hover {
    background: var(--hf-button-hoverBackground);
  }
</style>
