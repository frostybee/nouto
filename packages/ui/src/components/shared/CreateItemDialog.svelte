<script lang="ts">
  import { untrack } from 'svelte';
  import { APPEARANCE_COLORS, FILLED_ICONS, OUTLINED_ICONS } from '../../lib/appearance-constants';
  import Tooltip from './Tooltip.svelte';

  interface Props {
    mode: 'collection' | 'folder';
    editMode?: boolean;
    initialName?: string;
    initialColor?: string;
    initialIcon?: string;
    oncreate: (data: { name: string; color?: string; icon?: string }) => void;
    oncancel: () => void;
  }

  const { mode, editMode, initialName, initialColor, initialIcon, oncreate, oncancel }: Props = $props();

  let name = $state(untrack(() => initialName ?? ''));
  let selectedColor = $state<string | undefined>(
    untrack(() => initialColor ?? (editMode ? undefined : APPEARANCE_COLORS[0].hex))
  );
  let selectedIcon = $state<string | undefined>(
    untrack(() => initialIcon ?? (editMode ? undefined : FILLED_ICONS[0].codicon))
  );

  const title = $derived(
    editMode
      ? (mode === 'collection' ? 'Edit collection' : 'Edit folder')
      : (mode === 'collection' ? 'Create collection' : 'Create folder')
  );
  const canCreate = $derived(name.trim().length > 0);

  function handleCreate() {
    if (!canCreate) return;
    oncreate({
      name: name.trim(),
      color: selectedColor,
      icon: selectedIcon,
    });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      oncancel();
    } else if (e.key === 'Enter' && canCreate) {
      handleCreate();
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      oncancel();
    }
  }

  function toggleColor(hex: string) {
    selectedColor = selectedColor === hex ? undefined : hex;
  }

  function toggleIcon(codicon: string) {
    selectedIcon = selectedIcon === codicon ? undefined : codicon;
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="dialog-backdrop" role="presentation" onclick={handleBackdropClick}>
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="create-dialog-title">
    <div class="dialog-header">
      <h3 id="create-dialog-title">{title}</h3>
      <button class="close-btn" onclick={oncancel} aria-label="Close">
        <span class="codicon codicon-close"></span>
      </button>
    </div>

    <div class="name-input-row">
      <span
        class="name-icon codicon {selectedIcon || 'codicon-folder'}"
        style={selectedColor ? `color: ${selectedColor}` : ''}
      ></span>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        type="text"
        class="name-input"
        placeholder="Name"
        bind:value={name}
        autofocus
      />
    </div>

    <div class="color-picker">
      {#each APPEARANCE_COLORS as color}
        <Tooltip text={color.name} position="top">
          <button
            class="color-swatch"
            class:active={selectedColor === color.hex}
            style="background: {color.hex}"
            onclick={() => toggleColor(color.hex)}
            aria-label={color.name}
          >
            {#if selectedColor === color.hex}
              <span class="codicon codicon-check"></span>
            {/if}
          </button>
        </Tooltip>
      {/each}
    </div>

    <div class="icon-section">
      <span class="icon-section-label">Filled</span>
      <div class="icon-grid">
        {#each FILLED_ICONS as icon}
          <Tooltip text={icon.name} position="top">
            <button
              class="icon-btn"
              class:active={selectedIcon === icon.codicon}
              onclick={() => toggleIcon(icon.codicon)}
              aria-label={icon.name}
            >
              <span class="codicon {icon.codicon}"></span>
            </button>
          </Tooltip>
        {/each}
      </div>
    </div>

    <div class="icon-section">
      <span class="icon-section-label">Outlined</span>
      <div class="icon-grid">
        {#each OUTLINED_ICONS as icon}
          <Tooltip text={icon.name} position="top">
            <button
              class="icon-btn"
              class:active={selectedIcon === icon.codicon}
              onclick={() => toggleIcon(icon.codicon)}
              aria-label={icon.name}
            >
              <span class="codicon {icon.codicon}"></span>
            </button>
          </Tooltip>
        {/each}
      </div>
    </div>

    <div class="dialog-actions">
      <button class="btn btn-secondary" onclick={oncancel}>Cancel</button>
      <button class="btn btn-primary" disabled={!canCreate} onclick={handleCreate}>{editMode ? 'Save' : 'Create'}</button>
    </div>
  </div>
</div>

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
    width: 320px;
    max-height: calc(100vh - 32px);
    overflow-y: auto;
    background: var(--hf-editorWidget-background, var(--hf-menu-background));
    border: 1px solid var(--hf-editorWidget-border, var(--hf-panel-border));
    border-radius: 8px;
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
    justify-content: space-between;
    margin-bottom: 14px;
  }

  .dialog-header h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--hf-foreground);
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--hf-foreground);
    opacity: 0.6;
    cursor: pointer;
  }

  .close-btn:hover {
    opacity: 1;
    background: var(--hf-toolbar-hoverBackground, rgba(90, 93, 94, 0.31));
  }

  .name-input-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 14px;
    padding: 6px 10px;
    background: var(--hf-input-background);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 5px;
  }

  .name-input-row:focus-within {
    border-color: var(--hf-focusBorder);
  }

  .name-icon {
    font-size: 16px;
    flex-shrink: 0;
  }

  .name-input {
    flex: 1;
    padding: 2px 0;
    font-size: 13px;
    background: transparent;
    color: var(--hf-input-foreground);
    border: none;
    outline: none;
  }

  .name-input::placeholder {
    color: var(--hf-input-placeholderForeground, var(--hf-descriptionForeground));
  }

  .color-picker {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 14px;
  }

  .color-swatch {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: transform 0.1s, border-color 0.1s;
  }

  .color-swatch:hover {
    transform: scale(1.15);
  }

  .color-swatch.active {
    border-color: var(--hf-foreground);
    transform: scale(1.1);
  }

  .color-swatch .codicon {
    font-size: 12px;
    color: #fff;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  }

  .icon-section {
    margin-bottom: 10px;
  }

  .icon-section:last-of-type {
    margin-bottom: 16px;
  }

  .icon-section-label {
    display: block;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--hf-descriptionForeground);
    margin-bottom: 6px;
  }

  .icon-grid {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 4px;
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    padding: 0;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 5px;
    color: var(--hf-foreground);
    opacity: 0.7;
    cursor: pointer;
    transition: opacity 0.1s, background 0.1s;
  }

  .icon-btn:hover {
    opacity: 1;
    background: var(--hf-toolbar-hoverBackground, rgba(90, 93, 94, 0.31));
  }

  .icon-btn.active {
    opacity: 1;
    background: var(--hf-list-activeSelectionBackground);
    border-color: var(--hf-focusBorder);
  }

  .icon-btn .codicon {
    font-size: 16px;
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
    font-weight: 600;
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
