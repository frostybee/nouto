<script lang="ts">
  import { setValidationSchema, clearValidationSchema, hasValidationSchema, schemaViolations, schemaError, navigateToBreadcrumb } from '../stores/jsonExplorer.svelte';

  interface Props {
    onClose: () => void;
  }
  let { onClose }: Props = $props();

  let schemaText = $state('');

  function handleValidate() {
    if (!schemaText.trim()) return;
    setValidationSchema(schemaText);
  }

  function handleClear() {
    clearValidationSchema();
    schemaText = '';
  }

  function handleViolationClick(path: string) {
    navigateToBreadcrumb(path);
  }
</script>

<div class="schema-panel">
  <div class="schema-header">
    <i class="codicon codicon-verified"></i>
    <span class="schema-title">Schema Validation</span>
    {#if hasValidationSchema()}
      {#if schemaViolations().length === 0}
        <span class="schema-badge valid">Valid</span>
      {:else}
        <span class="schema-badge invalid">{schemaViolations().length} {schemaViolations().length === 1 ? 'error' : 'errors'}</span>
      {/if}
    {/if}
    <span class="schema-spacer"></span>
    <button class="icon-btn" onclick={onClose} aria-label="Close schema panel">
      <i class="codicon codicon-close"></i>
    </button>
  </div>

  <textarea
    class="schema-input"
    bind:value={schemaText}
    placeholder={'Paste a JSON Schema, e.g. { "type": "object", "required": ["id"] }'}
    spellcheck="false"
    rows="6"
  ></textarea>

  {#if schemaError()}
    <div class="schema-error">
      <i class="codicon codicon-error"></i>
      <span>{schemaError()}</span>
    </div>
  {/if}

  <div class="schema-actions">
    <button class="schema-btn primary" onclick={handleValidate} disabled={!schemaText.trim()}>
      <i class="codicon codicon-check"></i>
      Validate
    </button>
    {#if hasValidationSchema()}
      <button class="schema-btn secondary" onclick={handleClear}>
        <i class="codicon codicon-clear-all"></i>
        Clear schema
      </button>
    {/if}
  </div>

  {#if hasValidationSchema() && schemaViolations().length > 0}
    <div class="violation-list">
      {#each schemaViolations() as violation}
        <button class="violation-item" onclick={() => handleViolationClick(violation.path)}>
          <i class="codicon codicon-error"></i>
          <span class="violation-path">{violation.path}</span>
          <span class="violation-message">{violation.message}</span>
        </button>
      {/each}
    </div>
  {:else if hasValidationSchema()}
    <div class="schema-valid-note">
      <i class="codicon codicon-pass"></i>
      <span>Document is valid against the schema.</span>
    </div>
  {/if}
</div>

<style>
  .schema-panel {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--hf-panel-border);
    flex-shrink: 0;
    max-height: 45vh;
    overflow-y: auto;
  }

  .schema-header {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .schema-title {
    font-size: 0.923rem;
    font-weight: 600;
  }

  .schema-badge {
    padding: 0 6px;
    border-radius: 4px;
    font-size: 0.769rem;
  }

  .schema-badge.valid {
    background: var(--hf-charts-green);
    color: #fff;
  }

  .schema-badge.invalid {
    background: var(--hf-errorForeground);
    color: #fff;
  }

  .schema-spacer {
    flex: 1;
  }

  .icon-btn {
    display: inline-flex;
    align-items: center;
    padding: 2px;
    background: transparent;
    color: var(--hf-foreground);
    border: none;
    border-radius: 3px;
    cursor: pointer;
  }

  .icon-btn:hover {
    background: var(--hf-toolbar-hoverBackground);
  }

  .schema-input {
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    min-height: 70px;
    padding: 6px 8px;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border);
    border-radius: 3px;
    font-family: var(--hf-editor-font-family);
    font-size: 0.923rem;
  }

  .schema-input:focus {
    outline: 1px solid var(--hf-focusBorder);
    outline-offset: -1px;
  }

  .schema-error {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    font-size: 0.846rem;
    color: var(--hf-errorForeground);
    word-break: break-word;
  }

  .schema-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .schema-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-size: 0.846rem;
  }

  .schema-btn.primary {
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
  }

  .schema-btn.primary:hover:not(:disabled) {
    background: var(--hf-button-hoverBackground);
  }

  .schema-btn.primary:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .schema-btn.secondary {
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
  }

  .schema-btn.secondary:hover {
    background: var(--hf-button-secondaryHoverBackground);
  }

  .violation-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .violation-item {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 3px 6px;
    background: none;
    color: var(--hf-foreground);
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-size: 0.846rem;
    text-align: left;
  }

  .violation-item:hover {
    background: var(--hf-list-hoverBackground);
  }

  .violation-item .codicon {
    color: var(--hf-errorForeground);
    font-size: 12px;
    flex-shrink: 0;
    align-self: center;
  }

  .violation-path {
    font-family: var(--hf-editor-font-family);
    color: var(--hf-textLink-foreground);
    flex-shrink: 0;
    word-break: break-all;
  }

  .violation-message {
    color: var(--hf-descriptionForeground);
    word-break: break-word;
  }

  .schema-valid-note {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.846rem;
    color: var(--hf-charts-green);
  }
</style>
