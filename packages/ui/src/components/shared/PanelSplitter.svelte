<script lang="ts">
  import { setPanelSplitRatio, setSidebarSplitRatio, toggleSidebar, ui } from '../../stores/ui.svelte';

  interface Props {
    orientation: 'vertical' | 'horizontal';
    /**
     * 'panel'/'sidebar' write into the shared ui store (the two app-level
     * splits). 'controlled' reports the ratio to the parent instead — for
     * local splits owned by a view (e.g. the OpenAPI editor/outline split).
     */
    target?: 'panel' | 'sidebar' | 'controlled';
    minPixelWidth?: number;
    /** controlled only: receives the drag ratio, clamped to [minRatio, maxRatio]. */
    onRatioChange?: (ratio: number) => void;
    minRatio?: number;
    maxRatio?: number;
    /** controlled only: double-click reset value. */
    defaultRatio?: number;
  }
  let {
    orientation,
    target = 'panel',
    minPixelWidth = 180,
    onRatioChange,
    minRatio = 0.1,
    maxRatio = 0.9,
    defaultRatio = 0.5,
  }: Props = $props();

  let isDragging = $state(false);
  let splitterEl = $state<HTMLDivElement>(undefined!);

  function handleMouseDown(e: MouseEvent) {
    e.preventDefault();
    isDragging = true;
    document.body.classList.add('splitter-dragging');
    document.body.style.cursor = orientation === 'vertical' ? 'row-resize' : 'col-resize';

    const parentEl = splitterEl.parentElement!;
    const parentRect = parentEl.getBoundingClientRect();

    function handleMouseMove(e: MouseEvent) {
      let ratio: number;
      if (orientation === 'vertical') {
        ratio = (e.clientY - parentRect.top) / parentRect.height;
      } else {
        ratio = (e.clientX - parentRect.left) / parentRect.width;
      }
      if (target === 'controlled') {
        onRatioChange?.(Math.min(Math.max(ratio, minRatio), maxRatio));
      } else if (target === 'sidebar') {
        const sidebarPx = ratio * parentRect.width;
        if (sidebarPx < minPixelWidth) {
          if (!ui.sidebarCollapsed) toggleSidebar();
          return;
        }
        if (ui.sidebarCollapsed) toggleSidebar();
        setSidebarSplitRatio(ratio);
      } else {
        setPanelSplitRatio(ratio);
      }
    }

    function handleMouseUp() {
      isDragging = false;
      document.body.classList.remove('splitter-dragging');
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }

  function handleDoubleClick() {
    if (target === 'controlled') {
      onRatioChange?.(defaultRatio);
    } else if (target === 'sidebar') {
      setSidebarSplitRatio(0.2); // Reset to default 20%
    } else {
      setPanelSplitRatio(0.5);   // Reset to default 50%
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="splitter {orientation}"
  class:dragging={isDragging}
  bind:this={splitterEl}
  onmousedown={handleMouseDown}
  ondblclick={handleDoubleClick}
  role="separator"
  tabindex="0"
  aria-orientation={orientation === 'vertical' ? 'horizontal' : 'vertical'}
>
  <div class="handle"></div>
</div>

<style>
  .splitter {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
    background: var(--hf-panel-border);
    transition: background 0.15s;
  }

  .splitter.vertical {
    height: 0.231rem;
    cursor: row-resize;
  }

  .splitter.horizontal {
    width: 3px;
    cursor: col-resize;
  }

  .splitter:hover,
  .splitter.dragging {
    background: var(--hf-focusBorder);
  }

  .handle {
    border-radius: 0.308rem;
    background: var(--hf-scrollbarSlider-background);
  }

  .splitter.vertical .handle {
    width: 3.077rem;
    height: 0.538rem;
  }

  .splitter.horizontal .handle {
    width: 7px;
    height: 3.077rem;
  }

  .splitter:hover .handle,
  .splitter.dragging .handle {
    background: var(--hf-scrollbarSlider-hoverBackground);
  }

  :global(body.splitter-dragging) {
    user-select: none !important;
  }

  :global(body.splitter-dragging iframe),
  :global(body.splitter-dragging webview) {
    pointer-events: none !important;
  }
</style>
