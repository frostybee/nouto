<script lang="ts">
  interface Props {
    open: boolean;
    keys: string[];
    onsubmit: (values: Map<string, string>) => void;
    oncancel: () => void;
  }

  let { open, keys, onsubmit, oncancel }: Props = $props();

  let values = $state<Record<string, string>>({});
  let firstInput = $state<HTMLInputElement>(undefined!);

  $effect(() => {
    if (open) {
      values = Object.fromEntries(keys.map(k => [k, '']));
    }
  });

  $effect(() => {
    if (open && firstInput) {
      requestAnimationFrame(() => firstInput.focus());
    }
  });

  function handleSubmit() {
    onsubmit(new Map(Object.entries(values)));
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') oncancel();
    if (e.key === 'Enter' && !e.shiftKey) handleSubmit();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) oncancel();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div class="modal-backdrop" role="presentation" onclick={handleBackdropClick}>
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="prompt-title">
      <div id="prompt-title" class="modal-title">Enter values</div>
      <div class="modal-description">These values are used once for this request and not saved.</div>
      <div class="prompt-fields">
        {#each keys as key, i}
          <div class="prompt-field">
            <label class="field-label" for="prompt-{key}">{key}</label>
            {#if i === 0}
              <input
                id="prompt-{key}"
                class="field-input"
                type="text"
                bind:value={values[key]}
                bind:this={firstInput}
                placeholder="Enter {key}"
              />
            {:else}
              <input
                id="prompt-{key}"
                class="field-input"
                type="text"
                bind:value={values[key]}
                placeholder="Enter {key}"
              />
            {/if}
          </div>
        {/each}
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick={oncancel}>Cancel</button>
        <button class="btn btn-primary" onclick={handleSubmit}>Send</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 20vh;
    background: rgba(0, 0, 0, 0.5);
  }

  .modal {
    min-width: 360px;
    max-width: 480px;
    width: 100%;
    background: var(--hf-editorWidget-background, var(--hf-menu-background));
    border: 1px solid var(--hf-editorWidget-border, var(--hf-panel-border));
    border-radius: 6px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    padding: 16px 20px;
    animation: modalIn 0.15s ease-out;
  }

  @keyframes modalIn {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .modal-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--hf-foreground);
    margin-bottom: 4px;
  }

  .modal-description {
    font-size: 12px;
    color: var(--hf-descriptionForeground, var(--hf-foreground));
    opacity: 0.7;
    margin-bottom: 14px;
  }

  .prompt-fields {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .prompt-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .field-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--hf-foreground);
    font-family: var(--hf-editor-font-family, monospace);
  }

  .field-input {
    width: 100%;
    padding: 6px 10px;
    font-size: 13px;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 4px;
    outline: none;
    box-sizing: border-box;
  }

  .field-input:focus {
    border-color: var(--hf-focusBorder);
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 14px;
  }

  .btn {
    padding: 6px 14px;
    font-size: 13px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    font-weight: 600;
  }

  .btn-secondary {
    background: transparent;
    color: var(--hf-foreground);
    border: 1px solid var(--hf-button-secondaryBackground, var(--hf-panel-border));
  }

  .btn-secondary:hover {
    background: var(--hf-button-secondaryHoverBackground, rgba(90, 93, 94, 0.31));
  }

  .btn-primary {
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--hf-button-hoverBackground);
  }
</style>
