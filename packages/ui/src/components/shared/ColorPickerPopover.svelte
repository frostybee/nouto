<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    color?: string;
    x: number;
    y: number;
    onchange: (hex: string) => void;
    onclose: () => void;
  }

  let { color, x, y, onchange, onclose }: Props = $props();

  // --- HSV <-> Hex conversion ---
  function hexToHsv(hex: string): [number, number, number] {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d + 6) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    const s = max === 0 ? 0 : d / max;
    return [h, s, max];
  }

  function hsvToHex(h: number, s: number, v: number): string {
    const c = v * s;
    const x2 = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x2; }
    else if (h < 120) { r = x2; g = c; }
    else if (h < 180) { g = c; b = x2; }
    else if (h < 240) { g = x2; b = c; }
    else if (h < 300) { r = x2; b = c; }
    else { r = c; b = x2; }
    const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  // --- State ---
  // Seed from initial prop value
  function getInitialColor(): string {
    return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#ff0000';
  }
  const initialHex = getInitialColor();
  const [ih, is, iv] = hexToHsv(initialHex);
  let hue = $state(ih);
  let sat = $state(is);
  let val = $state(iv);
  let hexInput = $state(initialHex);
  let dragging = $state<'sv' | 'hue' | null>(null);

  let svAreaEl = $state<HTMLDivElement>(undefined!);
  let hueBarEl = $state<HTMLDivElement>(undefined!);

  const currentHex = $derived(hsvToHex(hue, sat, val));
  const hueColor = $derived(`hsl(${hue}, 100%, 50%)`);

  // Keep hex input in sync when picking
  $effect(() => {
    if (!dragging) {
      hexInput = currentHex;
    }
  });

  // Viewport-aware positioning
  const popoverWidth = 246;
  const popoverHeight = 260;
  const adjustedX = $derived(Math.min(x, window.innerWidth - popoverWidth - 8));
  const adjustedY = $derived(
    y + popoverHeight > window.innerHeight
      ? Math.max(8, y - popoverHeight)
      : y
  );

  // --- SV area interaction ---
  function handleSvDown(e: PointerEvent) {
    dragging = 'sv';
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    updateSv(e);
  }

  function handleSvMove(e: PointerEvent) {
    if (dragging === 'sv') updateSv(e);
  }

  function handleSvUp() {
    if (dragging === 'sv') {
      dragging = null;
      hexInput = currentHex;
      onchange(currentHex);
    }
  }

  function updateSv(e: PointerEvent) {
    if (!svAreaEl) return;
    const rect = svAreaEl.getBoundingClientRect();
    sat = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    val = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
  }

  // --- Hue bar interaction ---
  function handleHueDown(e: PointerEvent) {
    dragging = 'hue';
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    updateHue(e);
  }

  function handleHueMove(e: PointerEvent) {
    if (dragging === 'hue') updateHue(e);
  }

  function handleHueUp() {
    if (dragging === 'hue') {
      dragging = null;
      hexInput = currentHex;
      onchange(currentHex);
    }
  }

  function updateHue(e: PointerEvent) {
    if (!hueBarEl) return;
    const rect = hueBarEl.getBoundingClientRect();
    hue = Math.max(0, Math.min(360, ((e.clientX - rect.left) / rect.width) * 360));
  }

  // --- Hex input ---
  function handleHexInput(e: Event) {
    const v = (e.target as HTMLInputElement).value;
    hexInput = v;
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      const [h, s, b] = hexToHsv(v);
      hue = h; sat = s; val = b;
      onchange(v);
    }
  }

  function handleHexBlur() {
    if (!/^#[0-9a-fA-F]{6}$/.test(hexInput)) {
      hexInput = currentHex;
    }
  }

  // --- Keyboard ---
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onclose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="cp-backdrop" role="presentation" onclick={handleBackdropClick}></div>
<div
  class="cp-popover"
  style="left: {adjustedX}px; top: {adjustedY}px"
  role="dialog"
  aria-label="Color picker"
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={svAreaEl}
    class="cp-sv-area"
    style="background: {hueColor};"
    onpointerdown={handleSvDown}
    onpointermove={handleSvMove}
    onpointerup={handleSvUp}
  >
    <div class="cp-sv-white"></div>
    <div class="cp-sv-black"></div>
    <div
      class="cp-sv-cursor"
      style="left: {sat * 100}%; top: {(1 - val) * 100}%; background: {currentHex};"
    ></div>
  </div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={hueBarEl}
    class="cp-hue-bar"
    onpointerdown={handleHueDown}
    onpointermove={handleHueMove}
    onpointerup={handleHueUp}
  >
    <div
      class="cp-hue-cursor"
      style="left: {(hue / 360) * 100}%;"
    ></div>
  </div>

  <!-- Hex input + preview -->
  <div class="cp-footer">
    <div class="cp-preview" style="background: {currentHex};"></div>
    <input
      class="cp-hex-input"
      type="text"
      value={hexInput}
      oninput={handleHexInput}
      onblur={handleHexBlur}
      maxlength="7"
      spellcheck="false"
    />
    <button class="cp-ok-btn" onclick={onclose} aria-label="Done">
      <span class="codicon codicon-check"></span>
    </button>
  </div>
</div>

<style>
  .cp-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1001;
    background: transparent;
  }

  .cp-popover {
    position: fixed;
    z-index: 1002;
    width: 246px;
    background: var(--hf-editorWidget-background, var(--hf-menu-background));
    border: 1px solid var(--hf-editorWidget-border, var(--hf-panel-border));
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    padding: 10px;
    animation: cpIn 0.1s ease-out;
  }

  @keyframes cpIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .cp-sv-area {
    position: relative;
    width: 100%;
    height: 150px;
    border-radius: 4px;
    cursor: crosshair;
    touch-action: none;
    overflow: hidden;
  }

  .cp-sv-white {
    position: absolute;
    inset: 0;
    background: linear-gradient(to right, #fff, transparent);
  }

  .cp-sv-black {
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, #000, transparent);
  }

  .cp-sv-cursor {
    position: absolute;
    width: 12px;
    height: 12px;
    border: 2px solid #fff;
    border-radius: 50%;
    box-shadow: 0 0 2px rgba(0, 0, 0, 0.6);
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  .cp-hue-bar {
    position: relative;
    width: 100%;
    height: 14px;
    margin-top: 10px;
    border-radius: 7px;
    background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);
    cursor: pointer;
    touch-action: none;
  }

  .cp-hue-cursor {
    position: absolute;
    top: -1px;
    width: 8px;
    height: 16px;
    border: 2px solid #fff;
    border-radius: 3px;
    box-shadow: 0 0 2px rgba(0, 0, 0, 0.6);
    transform: translateX(-50%);
    pointer-events: none;
    background: transparent;
  }

  .cp-footer {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
  }

  .cp-preview {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px solid var(--hf-panel-border);
    flex-shrink: 0;
  }

  .cp-hex-input {
    flex: 1;
    padding: 4px 8px;
    background: var(--hf-input-background);
    color: var(--hf-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 4px;
    font-size: 12px;
    font-family: monospace;
    outline: none;
  }

  .cp-ok-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s;
  }

  .cp-ok-btn:hover {
    background: var(--hf-button-hoverBackground);
  }

  .cp-ok-btn .codicon {
    font-size: 14px;
  }

  .cp-hex-input:focus {
    border-color: var(--hf-focusBorder);
  }
</style>
