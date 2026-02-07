<script lang="ts">
  import { activeSchema, schemaSource, setSchema, clearSchema } from '../../stores/schema';

  interface Props {
    onClose: () => void;
  }
  let { onClose }: Props = $props();

  let schemaText = $state($schemaSource || '');
  let parseError = $state<string | null>(null);

  function handleApply() {
    try {
      JSON.parse(schemaText);
      parseError = null;
      setSchema(schemaText);
      onClose();
    } catch (err) {
      parseError = (err as Error).message;
    }
  }

  function handleClear() {
    clearSchema();
    schemaText = '';
    parseError = null;
    onClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="schema-overlay" role="dialog" aria-label="JSON Schema Editor" tabindex="-1" onkeydown={handleKeydown}>
  <div class="schema-modal">
    <div class="schema-header">
      <h3>JSON Schema</h3>
      <button class="close-btn" onclick={onClose}>&times;</button>
    </div>
    <div class="schema-body">
      <textarea
        class="schema-textarea"
        class:error={!!parseError}
        placeholder={'Paste JSON Schema here...\n{\n  "type": "object",\n  "properties": { ... }\n}'}
        bind:value={schemaText}
      ></textarea>
      {#if parseError}
        <div class="schema-error">{parseError}</div>
      {/if}
    </div>
    <div class="schema-footer">
      <button class="action-btn apply" onclick={handleApply}>Apply</button>
      <button class="action-btn clear" onclick={handleClear}>Clear</button>
      <button class="action-btn cancel" onclick={onClose}>Cancel</button>
    </div>
  </div>
</div>

<style>
  .schema-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .schema-modal {
    background: var(--vscode-editorWidget-background, #252526);
    border: 1px solid var(--vscode-editorWidget-border, #454545);
    border-radius: 6px;
    width: 90%;
    max-width: 600px;
    max-height: 80%;
    display: flex;
    flex-direction: column;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  }

  .schema-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--vscode-panel-border);
  }

  .schema-header h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--vscode-foreground);
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--vscode-foreground);
    font-size: 18px;
    cursor: pointer;
    padding: 0 4px;
    opacity: 0.6;
  }

  .close-btn:hover {
    opacity: 1;
  }

  .schema-body {
    flex: 1;
    padding: 12px 16px;
    overflow: auto;
  }

  .schema-textarea {
    width: 100%;
    min-height: 200px;
    padding: 8px;
    background: var(--vscode-input-background, #3c3c3c);
    color: var(--vscode-input-foreground, #d4d4d4);
    border: 1px solid var(--vscode-input-border, #3c3c3c);
    border-radius: 4px;
    font-family: var(--vscode-editor-font-family, Consolas, Monaco, monospace);
    font-size: 12px;
    resize: vertical;
    outline: none;
  }

  .schema-textarea:focus {
    border-color: var(--vscode-focusBorder);
  }

  .schema-textarea.error {
    border-color: var(--vscode-inputValidation-errorBorder, #f44336);
  }

  .schema-error {
    margin-top: 8px;
    font-size: 11px;
    color: var(--vscode-errorForeground, #f44336);
  }

  .schema-footer {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--vscode-panel-border);
    justify-content: flex-end;
  }

  .action-btn {
    padding: 4px 16px;
    border: none;
    border-radius: 3px;
    font-size: 12px;
    cursor: pointer;
  }

  .action-btn.apply {
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #fff);
  }

  .action-btn.apply:hover {
    background: var(--vscode-button-hoverBackground, #1177bb);
  }

  .action-btn.clear {
    background: var(--vscode-button-secondaryBackground, #3a3d41);
    color: var(--vscode-button-secondaryForeground, #d4d4d4);
  }

  .action-btn.cancel {
    background: transparent;
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
  }
</style>
