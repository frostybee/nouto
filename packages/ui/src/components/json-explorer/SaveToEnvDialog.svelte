<script lang="ts">
  import { onMount } from 'svelte';
  import type { FlatNode } from '../../stores/jsonExplorer.svelte';

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
    background: var(--vscode-editor-background, #1e1e1e);
    border: 1px solid var(--vscode-panel-border, #454545);
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
    overflow: hidden;
  }

  .dialog-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--vscode-panel-border, #2b2b2b);
    font-size: 13px;
    font-weight: 600;
    color: var(--vscode-editor-foreground, #d4d4d4);
  }

  .dialog-body {
    padding: 12px 16px;
  }

  .dialog-label {
    display: block;
    font-size: 11px;
    color: var(--vscode-descriptionForeground, #8b8b8b);
    margin-bottom: 4px;
  }

  .dialog-input {
    display: block;
    width: 100%;
    padding: 5px 8px;
    margin-top: 4px;
    background: var(--vscode-input-background, #3c3c3c);
    border: 1px solid var(--vscode-input-border, #3c3c3c);
    border-radius: 3px;
    color: var(--vscode-input-foreground, #ccc);
    font-family: var(--vscode-editor-font-family, Consolas, Monaco, monospace);
    font-size: 12px;
    outline: none;
    box-sizing: border-box;
  }

  .dialog-input:focus {
    border-color: var(--vscode-focusBorder, #007fd4);
  }

  .dialog-preview {
    margin-top: 10px;
    font-size: 11px;
    color: var(--vscode-descriptionForeground, #8b8b8b);
  }

  .preview-label {
    display: block;
    margin-bottom: 2px;
  }

  .preview-value {
    display: block;
    padding: 4px 6px;
    background: var(--vscode-textCodeBlock-background, #2a2a2a);
    border-radius: 3px;
    font-family: var(--vscode-editor-font-family, Consolas, Monaco, monospace);
    font-size: 11px;
    color: #ce9178;
    word-break: break-all;
    max-height: 60px;
    overflow: hidden;
  }

  .dialog-hint {
    margin-top: 8px;
    font-size: 10px;
    color: var(--vscode-descriptionForeground, #8b8b8b);
  }

  .dialog-hint code {
    font-family: var(--vscode-editor-font-family, Consolas, Monaco, monospace);
    color: var(--vscode-textLink-foreground, #3794ff);
  }

  .dialog-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 10px 16px;
    border-top: 1px solid var(--vscode-panel-border, #2b2b2b);
  }

  .dialog-btn {
    padding: 4px 14px;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
  }

  .dialog-btn.cancel {
    background: var(--vscode-button-secondaryBackground, #3a3d41);
    color: var(--vscode-button-secondaryForeground, #d4d4d4);
  }

  .dialog-btn.cancel:hover {
    background: var(--vscode-button-secondaryHoverBackground, #45494e);
  }

  .dialog-btn.save {
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #fff);
  }

  .dialog-btn.save:hover {
    background: var(--vscode-button-hoverBackground, #1177bb);
  }
</style>
