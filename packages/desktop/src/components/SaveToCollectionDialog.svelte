<script lang="ts">
  import type { Collection } from '@nouto/core';

  interface Props {
    open: boolean;
    collections: Collection[];
    requestName: string;
    onconfirm: (collectionId: string, name: string) => void;
    oncancel: () => void;
  }

  let { open, collections, requestName, onconfirm, oncancel }: Props = $props();

  let selectedCollectionId = $state('');
  let name = $state('');

  $effect(() => {
    if (open) {
      name = requestName;
      selectedCollectionId = collections[0]?.id ?? '';
    }
  });

  function handleConfirm() {
    if (!selectedCollectionId || !name.trim()) return;
    onconfirm(selectedCollectionId, name.trim());
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') oncancel();
    if (e.key === 'Enter') handleConfirm();
  }

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) oncancel();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div class="dialog-backdrop" role="presentation" onclick={handleBackdrop}>
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="save-col-title">
      <div class="dialog-header">
        <span class="dialog-icon codicon codicon-save"></span>
        <h3 id="save-col-title">Save to Collection</h3>
      </div>

      <div class="dialog-body">
        <label>
          <span class="label">Request Name</span>
          <!-- svelte-ignore a11y_autofocus -->
          <input type="text" bind:value={name} placeholder="Request name" spellcheck="false" autofocus />
        </label>

        <label>
          <span class="label">Collection</span>
          <select bind:value={selectedCollectionId}>
            {#each collections as col (col.id)}
              <option value={col.id}>{col.name}</option>
            {/each}
          </select>
        </label>
      </div>

      <div class="dialog-actions">
        <button class="btn btn-secondary" onclick={oncancel}>Cancel</button>
        <button class="btn btn-primary" disabled={!selectedCollectionId || !name.trim()} onclick={handleConfirm}>Save</button>
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
    width: 400px;
    max-width: 90vw;
    background: var(--hf-editorWidget-background, var(--hf-menu-background));
    border: 1px solid var(--hf-editorWidget-border, var(--hf-panel-border));
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    animation: dialogIn 0.15s ease-out;
  }

  @keyframes dialogIn {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
  }

  .dialog-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .dialog-header h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--hf-foreground);
  }

  .dialog-icon {
    font-size: 18px;
    color: var(--hf-editorInfo-foreground, #3794ff);
  }

  .dialog-body {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .dialog-body label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .label {
    font-size: 11px;
    font-weight: 500;
    color: var(--hf-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .dialog-body input,
  .dialog-body select {
    width: 100%;
    padding: 6px 8px;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground, var(--hf-foreground));
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 4px;
    font-size: 12px;
    font-family: inherit;
    box-sizing: border-box;
  }

  .dialog-body input:focus,
  .dialog-body select:focus {
    outline: none;
    border-color: var(--hf-focusBorder);
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--hf-panel-border);
  }

  .btn {
    padding: 5px 12px;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    border: 1px solid transparent;
    font-weight: 600;
  }

  .btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .btn-primary {
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
  }
  .btn-primary:hover:not(:disabled) { background: var(--hf-button-hoverBackground); }

  .btn-secondary {
    background: var(--hf-button-secondaryBackground, transparent);
    color: var(--hf-button-secondaryForeground, var(--hf-foreground));
    border-color: var(--hf-panel-border);
  }
  .btn-secondary:hover:not(:disabled) { background: var(--hf-toolbar-hoverBackground, rgba(127, 127, 127, 0.18)); }
</style>
