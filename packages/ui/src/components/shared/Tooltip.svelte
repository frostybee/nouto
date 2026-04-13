<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    text: string;
    position?: 'top' | 'bottom' | 'right';
    delay?: number;
    offset?: number;
    children: Snippet;
  }
  let { text, position = 'bottom', delay = 150, offset = 7, children }: Props = $props();

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

        let left: number;
        let top: number;

        if (position === 'right') {
          // Position to the right of the wrapper, vertically centered
          left = wr.right + 6 + offset;
          top = wr.top + wr.height / 2 - tr.height / 2;
          if (top < pad) top = pad;
          if (top + tr.height > window.innerHeight - pad) {
            top = window.innerHeight - pad - tr.height;
          }
          // Arrow points at vertical center of wrapper
          arrowLeft = wr.top + wr.height / 2 - top;
        } else {
          // Center horizontally on the wrapper, clamp to viewport
          left = wr.left + wr.width / 2 - tr.width / 2;
          if (left < pad) left = pad;
          if (left + tr.width > window.innerWidth - pad) {
            left = window.innerWidth - pad - tr.width;
          }

          // Position above or below the wrapper
          if (position === 'bottom') {
            top = wr.bottom + 6 + offset;
          } else {
            top = wr.top - tr.height - 6 - offset;
          }

          // Arrow points at center of wrapper
          arrowLeft = wr.left + wr.width / 2 - left;
        }
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
      style="left: {pos.left}px; top: {pos.top}px; --arrow-left: {arrowLeft}px; --arrow-top: {arrowLeft}px;"
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
    border-radius: 3px;
    font-size: 11px;
    font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    line-height: 1.4;
    z-index: 10000 !important;
    pointer-events: none;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.36);
    opacity: 0;
    background: var(--hf-editorHoverWidget-background);
    color: var(--hf-editorHoverWidget-foreground);
    border: 1px solid var(--hf-editorHoverWidget-border);
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
    background: var(--hf-editorHoverWidget-background);
    border: 1px solid var(--hf-editorHoverWidget-border);
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

  .right .arrow {
    left: -4px;
    top: var(--arrow-top, 50%);
    transform: translateY(-50%) rotate(45deg);
    border-right: none;
    border-top: none;
  }

  @keyframes tooltip-fade-in {
    from { opacity: 0; transform: translateY(2px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
