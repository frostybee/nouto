<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    text: string;
    position?: 'top' | 'bottom';
    delay?: number;
    children: Snippet;
  }
  let { text, position = 'bottom', delay = 150, children }: Props = $props();

  let visible = $state(false);
  let ready = $state(false);
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let wrapperEl = $state<HTMLDivElement>(undefined!);
  let tooltipEl = $state<HTMLDivElement>(undefined!);
  let pos = $state({ top: 0, left: 0 });
  let arrowLeft = $state(0);

  function show() {
    timeoutId = setTimeout(() => {
      visible = true;
      ready = false;
      requestAnimationFrame(() => {
        if (!tooltipEl || !wrapperEl) return;
        const wr = wrapperEl.getBoundingClientRect();
        const tr = tooltipEl.getBoundingClientRect();
        const pad = 6;

        // Center horizontally on the wrapper, clamp to viewport
        let left = wr.left + wr.width / 2 - tr.width / 2;
        if (left < pad) left = pad;
        if (left + tr.width > window.innerWidth - pad) {
          left = window.innerWidth - pad - tr.width;
        }

        // Position above or below the wrapper
        let top: number;
        if (position === 'bottom') {
          top = wr.bottom + 6;
        } else {
          top = wr.top - tr.height - 6;
        }

        // Arrow points at center of wrapper
        arrowLeft = wr.left + wr.width / 2 - left;
        pos = { top, left };
        ready = true;
      });
    }, delay);
  }

  function hide() {
    clearTimeout(timeoutId);
    visible = false;
    ready = false;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="tooltip-wrapper"
  bind:this={wrapperEl}
  onmouseenter={show}
  onmouseleave={hide}
  onfocusin={show}
  onfocusout={hide}
>
  {@render children()}
  {#if visible && text}
    <div
      class="tooltip {position}"
      class:ready
      bind:this={tooltipEl}
      style="left: {pos.left}px; top: {pos.top}px; --arrow-left: {arrowLeft}px"
      role="tooltip"
    >
      {text}
      <span class="arrow"></span>
    </div>
  {/if}
</div>

<style>
  .tooltip-wrapper {
    position: relative;
    display: inline-flex;
  }

  .tooltip {
    position: fixed;
    white-space: nowrap;
    padding: 4px 8px;
    background: var(--hf-editorHoverWidget-background, #2d2d30);
    color: var(--hf-editorHoverWidget-foreground, #cccccc);
    border: 1px solid var(--hf-editorHoverWidget-border, #454545);
    border-radius: 3px;
    font-size: 11px;
    font-family: var(--hf-font-family, system-ui, sans-serif);
    line-height: 1.4;
    z-index: 1000;
    pointer-events: none;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.36);
    opacity: 0;
  }

  .tooltip.ready {
    opacity: 1;
    animation: tooltip-fade-in 0.1s ease-out;
  }

  .arrow {
    position: absolute;
    left: var(--arrow-left, 50%);
    transform: translateX(-50%);
    width: 6px;
    height: 6px;
    background: var(--hf-editorHoverWidget-background, #2d2d30);
    border: 1px solid var(--hf-editorHoverWidget-border, #454545);
  }

  .bottom .arrow {
    top: -4px;
    border-right: none;
    border-bottom: none;
    transform: translateX(-50%) rotate(45deg);
  }

  .top .arrow {
    bottom: -4px;
    border-left: none;
    border-top: none;
    transform: translateX(-50%) rotate(45deg);
  }

  @keyframes tooltip-fade-in {
    from { opacity: 0; transform: translateY(2px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
