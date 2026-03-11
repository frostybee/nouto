<script lang="ts">
  import { APPEARANCE_COLORS, FILLED_ICONS, OUTLINED_ICONS } from '../../lib/appearance-constants';
  import Tooltip from './Tooltip.svelte';

  interface Props {
    currentColor?: string;
    currentIcon?: string;
    x: number;
    y: number;
    onchange: (update: { color?: string; icon?: string }) => void;
    onclose: () => void;
  }

  let { currentColor, currentIcon, x, y, onchange, onclose }: Props = $props();

  // Position-aware: adjust if near viewport edge
  const popoverWidth = 290;
  const popoverHeight = 340;
  const adjustedX = $derived(Math.min(x, window.innerWidth - popoverWidth - 8));
  const adjustedY = $derived(
    y + popoverHeight > window.innerHeight
      ? Math.max(8, y - popoverHeight)
      : y
  );

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onclose();
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onclose();
    }
  }

  function pickColor(hex: string) {
    const newColor = currentColor === hex ? undefined : hex;
    onchange({ color: newColor, icon: currentIcon });
  }

  function pickIcon(codicon: string) {
    const newIcon = currentIcon === codicon ? undefined : codicon;
    onchange({ color: currentColor, icon: newIcon });
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="picker-backdrop" role="presentation" onclick={handleBackdropClick}></div>
<div
  class="picker-popover"
  style="left: {adjustedX}px; top: {adjustedY}px"
  role="dialog"
  aria-label="Appearance picker"
>
  <div class="section-label">Color</div>
  <div class="color-picker">
    <Tooltip text="No color" position="top">
      <button
        class="color-swatch no-color"
        class:active={!currentColor}
        onclick={() => onchange({ color: undefined, icon: currentIcon })}
        aria-label="No color"
      >
        <span class="codicon codicon-close"></span>
      </button>
    </Tooltip>
    {#each APPEARANCE_COLORS as c}
      <Tooltip text={c.name} position="top">
        <button
          class="color-swatch"
          class:active={currentColor === c.hex}
          style="background: {c.hex}"
          onclick={() => pickColor(c.hex)}
          aria-label={c.name}
        >
          {#if currentColor === c.hex}
            <span class="codicon codicon-check"></span>
          {/if}
        </button>
      </Tooltip>
    {/each}
  </div>

  <div class="section-label">Filled</div>
  <div class="icon-grid">
    <Tooltip text="Default" position="top">
      <button
        class="icon-btn"
        class:active={!currentIcon}
        onclick={() => onchange({ color: currentColor, icon: undefined })}
        aria-label="Default icon"
      >
        <span class="codicon codicon-folder"></span>
      </button>
    </Tooltip>
    {#each FILLED_ICONS as ic}
      <Tooltip text={ic.name} position="top">
        <button
          class="icon-btn"
          class:active={currentIcon === ic.codicon}
          onclick={() => pickIcon(ic.codicon)}
          aria-label={ic.name}
        >
          <span class="codicon {ic.codicon}"></span>
        </button>
      </Tooltip>
    {/each}
  </div>

  <div class="section-label" style="margin-top: 8px">Outlined</div>
  <div class="icon-grid">
    {#each OUTLINED_ICONS as ic}
      <Tooltip text={ic.name} position="top">
        <button
          class="icon-btn"
          class:active={currentIcon === ic.codicon}
          onclick={() => pickIcon(ic.codicon)}
          aria-label={ic.name}
        >
          <span class="codicon {ic.codicon}"></span>
        </button>
      </Tooltip>
    {/each}
  </div>
</div>

<style>
  .picker-backdrop {
    position: fixed;
    inset: 0;
    z-index: 999;
    background: transparent;
  }

  .picker-popover {
    position: fixed;
    z-index: 1000;
    width: 290px;
    background: var(--hf-editorWidget-background, var(--hf-menu-background));
    border: 1px solid var(--hf-editorWidget-border, var(--hf-panel-border));
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    padding: 12px;
    animation: pickerIn 0.1s ease-out;
  }

  @keyframes pickerIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .section-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--hf-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
  }

  .color-picker {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-bottom: 12px;
  }

  .color-swatch {
    width: 22px;
    height: 22px;
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
    font-size: 10px;
    color: #fff;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  }

  .color-swatch.no-color {
    background: var(--hf-input-background);
    border-color: var(--hf-panel-border);
  }

  .color-swatch.no-color .codicon {
    font-size: 10px;
    color: var(--hf-foreground);
    opacity: 0.5;
    text-shadow: none;
  }

  .color-swatch.no-color.active {
    border-color: var(--hf-foreground);
  }

  .icon-grid {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 3px;
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
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
    font-size: 14px;
  }
</style>
