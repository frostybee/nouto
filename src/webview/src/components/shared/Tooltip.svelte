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
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let wrapperEl = $state<HTMLDivElement>(undefined!);
  let tooltipEl = $state<HTMLDivElement>(undefined!);
  let nudgeX = $state(0);

  function show() {
    timeoutId = setTimeout(() => {
      visible = true;
      // After showing, check if tooltip overflows viewport and nudge horizontally
      requestAnimationFrame(() => {
        if (!tooltipEl || !wrapperEl) return;
        const tipRect = tooltipEl.getBoundingClientRect();
        const pad = 6;
        let nx = 0;
        if (tipRect.left < pad) {
          nx = pad - tipRect.left;
        } else if (tipRect.right > window.innerWidth - pad) {
          nx = window.innerWidth - pad - tipRect.right;
        }
        nudgeX = nx;
      });
    }, delay);
  }

  function hide() {
    clearTimeout(timeoutId);
    visible = false;
    nudgeX = 0;
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
      bind:this={tooltipEl}
      style:transform="translateX(calc(-50% + {nudgeX}px))"
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
    position: absolute;
    left: 50%;
    white-space: nowrap;
    padding: 4px 8px;
    background: var(--vscode-editorHoverWidget-background, #2d2d30);
    color: var(--vscode-editorHoverWidget-foreground, #cccccc);
    border: 1px solid var(--vscode-editorHoverWidget-border, #454545);
    border-radius: 3px;
    font-size: 11px;
    font-family: var(--vscode-font-family, system-ui, sans-serif);
    line-height: 1.4;
    z-index: 1000;
    pointer-events: none;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.36);
    animation: tooltip-fade-in 0.1s ease-out;
  }

  .tooltip.bottom {
    top: calc(100% + 6px);
  }

  .tooltip.top {
    bottom: calc(100% + 6px);
  }

  .arrow {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    width: 6px;
    height: 6px;
    background: var(--vscode-editorHoverWidget-background, #2d2d30);
    border: 1px solid var(--vscode-editorHoverWidget-border, #454545);
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
    from { opacity: 0; transform: translateX(-50%) translateY(2px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
</style>
