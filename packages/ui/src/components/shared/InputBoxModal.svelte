<script lang="ts">
  interface Props {
    open: boolean;
    prompt: string;
    placeholder?: string;
    value?: string;
    validateNotEmpty?: boolean;
    onsubmit: (value: string) => void;
    oncancel: () => void;
  }

  let {
    open,
    prompt,
    placeholder = '',
    value = '',
    validateNotEmpty = false,
    onsubmit,
    oncancel,
  }: Props = $props();

  let inputValue = $state(value);
  let inputEl = $state<HTMLInputElement>(undefined!);

  // Reset input value when modal opens with a new value
  $effect(() => {
    if (open) {
      inputValue = value;
    }
  });

  // Focus input when modal opens
  $effect(() => {
    if (open && inputEl) {
      requestAnimationFrame(() => {
        inputEl.focus();
        inputEl.select();
      });
    }
  });

  let isValid = $derived(!validateNotEmpty || inputValue.trim().length > 0);

  function handleKeydown(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') {
      oncancel();
    } else if (e.key === 'Enter' && isValid) {
      onsubmit(inputValue.trim());
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      oncancel();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div class="modal-backdrop" role="presentation" onclick={handleBackdropClick}>
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="input-prompt">
      <label id="input-prompt" class="modal-prompt" for="input-field">{prompt}</label>
      <input
        id="input-field"
        class="modal-input"
        type="text"
        bind:value={inputValue}
        bind:this={inputEl}
        {placeholder}
        class:invalid={validateNotEmpty && inputValue.trim().length === 0}
      />
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick={oncancel}>Cancel</button>
        <button class="btn btn-primary" disabled={!isValid} onclick={() => onsubmit(inputValue.trim())}>OK</button>
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
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .modal-prompt {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--hf-foreground);
    margin-bottom: 10px;
  }

  .modal-input {
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

  .modal-input:focus {
    border-color: var(--hf-focusBorder);
  }

  .modal-input.invalid {
    border-color: var(--hf-inputValidation-errorBorder, var(--hf-errorForeground));
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
    font-weight: 500;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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
