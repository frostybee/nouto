<script lang="ts">
  import { setPanelSplitRatio } from '../../stores/ui';

  interface Props {
    orientation: 'vertical' | 'horizontal';
  }
  let { orientation }: Props = $props();

  let isDragging = $state(false);
  let splitterEl: HTMLDivElement;

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
      setPanelSplitRatio(ratio);
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
    setPanelSplitRatio(0.5);
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
    height: 4px;
    cursor: row-resize;
  }

  .splitter.horizontal {
    width: 4px;
    cursor: col-resize;
  }

  .splitter:hover,
  .splitter.dragging {
    background: var(--hf-focusBorder);
  }

  .handle {
    border-radius: 2px;
    background: var(--hf-scrollbarSlider-background);
  }

  .splitter.vertical .handle {
    width: 40px;
    height: 2px;
  }

  .splitter.horizontal .handle {
    width: 2px;
    height: 40px;
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
