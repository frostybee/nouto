<script lang="ts">
  interface Props {
    open: boolean;
    title?: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'danger' | 'warning' | 'info';
    onconfirm: () => void;
    oncancel: () => void;
  }

  let {
    open,
    title = 'Confirm',
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    variant = 'info',
    onconfirm,
    oncancel,
  }: Props = $props();

  function handleKeydown(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') {
      oncancel();
    } else if (e.key === 'Enter') {
      onconfirm();
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
  <div class="dialog-backdrop" role="presentation" onclick={handleBackdropClick}>
    <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-message">
      <div class="dialog-header">
        {#if variant === 'danger'}
          <span class="dialog-icon danger codicon codicon-warning"></span>
        {:else if variant === 'warning'}
          <span class="dialog-icon warning codicon codicon-warning"></span>
        {:else}
          <span class="dialog-icon info codicon codicon-info"></span>
        {/if}
        <h3 id="dialog-title">{title}</h3>
      </div>
      <p id="dialog-message" class="dialog-message">{message}</p>
      <div class="dialog-actions">
        <button class="btn btn-secondary" onclick={oncancel}>{cancelLabel}</button>
        <button class="btn btn-primary {variant}" onclick={onconfirm}>{confirmLabel}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .dialog-backdrop {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
  }

  .dialog {
    min-width: 300px;
    max-width: 420px;
    background: var(--hf-editorWidget-background, var(--hf-menu-background));
    border: 1px solid var(--hf-editorWidget-border, var(--hf-panel-border));
    border-radius: 6px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    padding: 16px 20px;
    animation: dialogIn 0.15s ease-out;
  }

  @keyframes dialogIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .dialog-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .dialog-header h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--hf-foreground);
  }

  .dialog-icon {
    font-size: 18px;
  }

  .dialog-icon.danger {
    color: var(--hf-errorForeground);
  }

  .dialog-icon.warning {
    color: var(--hf-editorWarning-foreground, #cca700);
  }

  .dialog-icon.info {
    color: var(--hf-editorInfo-foreground, #3794ff);
  }

  .dialog-message {
    margin: 0 0 16px;
    font-size: 13px;
    color: var(--hf-descriptionForeground);
    line-height: 1.5;
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .btn {
    padding: 6px 14px;
    font-size: 13px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    font-weight: 500;
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
    color: var(--hf-button-foreground);
  }

  .btn-primary.info {
    background: var(--hf-button-background);
  }

  .btn-primary.info:hover {
    background: var(--hf-button-hoverBackground);
  }

  .btn-primary.warning {
    background: var(--hf-button-background);
  }

  .btn-primary.warning:hover {
    background: var(--hf-button-hoverBackground);
  }

  .btn-primary.danger {
    background: var(--hf-errorForeground);
    transition: filter 0.15s, transform 0.1s;
  }

  .btn-primary.danger:hover {
    filter: brightness(1.2);
    transform: translateY(-1px);
  }

  .btn-primary.danger:active {
    filter: brightness(0.95);
    transform: translateY(0);
  }
</style>
