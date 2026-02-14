<script lang="ts">
  import type { EnvironmentVariable } from '../../types';

  interface Props {
    variable: EnvironmentVariable;
    index: number;
    onchange: (index: number, field: string, value: any) => void;
    ondelete: (index: number) => void;
    ontoggleSecret: (index: number) => void;
  }
  let { variable, index, onchange, ondelete, ontoggleSecret }: Props = $props();

  let revealed = $state(false);

  function toggleReveal() {
    revealed = !revealed;
  }

  const displayValue = $derived(
    variable.isSecret && !revealed
      ? '\u2022'.repeat(Math.min(variable.value.length || 8, 20))
      : variable.value
  );
</script>

<div class="secret-row" class:disabled={!variable.enabled}>
  <button
    class="toggle-btn"
    onclick={() => onchange(index, 'enabled', !variable.enabled)}
    title={variable.enabled ? 'Disable' : 'Enable'}
  >
    <i class="codicon {variable.enabled ? 'codicon-check' : 'codicon-circle-outline'}"></i>
  </button>

  <input
    class="key-input"
    type="text"
    placeholder="Key"
    value={variable.key}
    oninput={(e) => onchange(index, 'key', e.currentTarget.value)}
  />

  <div class="value-wrapper">
    <input
      class="value-input"
      type={variable.isSecret && !revealed ? 'password' : 'text'}
      placeholder="Value"
      value={variable.value}
      oninput={(e) => onchange(index, 'value', e.currentTarget.value)}
    />
    {#if variable.isSecret}
      <button class="reveal-btn" onclick={toggleReveal} title={revealed ? 'Hide' : 'Reveal'}>
        <i class="codicon {revealed ? 'codicon-eye-closed' : 'codicon-eye'}"></i>
      </button>
    {/if}
  </div>

  <button
    class="secret-badge"
    class:active={variable.isSecret}
    onclick={() => ontoggleSecret(index)}
    title={variable.isSecret ? 'Remove secret protection' : 'Mark as secret'}
  >
    <i class="codicon {variable.isSecret ? 'codicon-lock' : 'codicon-unlock'}"></i>
  </button>

  <button class="delete-btn" onclick={() => ondelete(index)} title="Delete">
    <i class="codicon codicon-trash"></i>
  </button>
</div>

<style>
  .secret-row {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 0;
  }

  .secret-row.disabled {
    opacity: 0.5;
  }

  .toggle-btn {
    padding: 2px 4px;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--hf-foreground);
    font-size: 12px;
    flex-shrink: 0;
  }

  .key-input, .value-input {
    flex: 1;
    min-width: 0;
    padding: 4px 8px;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 3px;
    font-size: 12px;
    font-family: var(--hf-editor-font-family), monospace;
  }

  .key-input:focus, .value-input:focus {
    outline: none;
    border-color: var(--hf-focusBorder);
  }

  .value-wrapper {
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .value-wrapper .value-input {
    width: 100%;
    padding-right: 28px;
  }

  .reveal-btn {
    position: absolute;
    right: 2px;
    padding: 2px 4px;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--hf-descriptionForeground);
    font-size: 12px;
    opacity: 0.6;
  }

  .reveal-btn:hover {
    opacity: 1;
  }

  .secret-badge {
    padding: 2px 4px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 3px;
    cursor: pointer;
    color: var(--hf-descriptionForeground);
    font-size: 12px;
    flex-shrink: 0;
  }

  .secret-badge:hover {
    border-color: var(--hf-input-border, var(--hf-panel-border));
  }

  .secret-badge.active {
    color: var(--hf-charts-yellow, #e2c08d);
  }

  .delete-btn {
    padding: 2px 4px;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--hf-descriptionForeground);
    font-size: 12px;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .secret-row:hover .delete-btn {
    opacity: 1;
  }

  .delete-btn:hover {
    color: var(--hf-errorForeground, #f44336);
  }
</style>
