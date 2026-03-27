<script lang="ts">
  import { onMount } from 'svelte';
  import { flatNodes } from '../stores/jsonExplorer.svelte';

  interface Props {
    /** Current scroll position (0-1 ratio) */
    scrollRatio?: number;
    /** Visible height ratio (0-1) */
    viewportRatio?: number;
    /** Callback when user clicks on the minimap to scroll */
    onScrollTo?: (ratio: number) => void;
  }
  let { scrollRatio = 0, viewportRatio = 0.1, onScrollTo }: Props = $props();

  let canvasEl = $state<HTMLCanvasElement>(undefined!);
  let containerEl = $state<HTMLDivElement>(undefined!);
  let canvasWidth = $state(60);
  let canvasHeight = $state(200);

  const typeColors: Record<string, string> = {
    object: '#dcdcaa',
    array: '#c586c0',
    string: '#ce9178',
    number: '#b5cea8',
    boolean: '#569cd6',
    null: '#808080',
  };

  onMount(() => {
    if (containerEl) {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          canvasHeight = entry.contentRect.height;
        }
      });
      observer.observe(containerEl);
      return () => observer.disconnect();
    }
  });

  // Redraw when flatNodes or scroll position changes
  $effect(() => {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    const nodes = flatNodes();
    const w = canvasWidth;
    const h = canvasHeight;
    const dpr = window.devicePixelRatio || 1;

    canvasEl.width = w * dpr;
    canvasEl.height = h * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, w, h);

    if (nodes.length === 0) return;

    // Draw node bars
    const rowHeight = Math.max(1, h / nodes.length);
    const maxDepth = Math.max(1, ...nodes.map(n => n.depth));

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.isShowMore) continue;

      const y = i * rowHeight;
      const barWidth = Math.max(4, (w - 4) * (1 - node.depth / (maxDepth + 2)));
      const x = 2 + (node.depth / (maxDepth + 2)) * (w - 4);

      ctx.fillStyle = typeColors[node.type] || '#808080';
      ctx.globalAlpha = node.isExpandable ? 0.6 : 0.35;
      ctx.fillRect(x, y, barWidth, Math.max(1, rowHeight - 0.5));
    }

    // Draw viewport indicator
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#ffffff';
    const vpY = scrollRatio * h;
    const vpH = Math.max(8, viewportRatio * h);
    ctx.fillRect(0, vpY, w, vpH);

    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, vpY + 0.5, w - 1, vpH - 1);

    ctx.globalAlpha = 1;
  });

  function handleClick(e: MouseEvent) {
    if (!containerEl) return;
    const rect = containerEl.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;
    onScrollTo?.(Math.max(0, Math.min(1, ratio)));
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="minimap"
  bind:this={containerEl}
  onclick={handleClick}
  role="none"
  tabindex={-1}
>
  <canvas
    bind:this={canvasEl}
    width={canvasWidth}
    height={canvasHeight}
    class="minimap-canvas"
  ></canvas>
</div>

<style>
  .minimap {
    width: 60px;
    flex-shrink: 0;
    border-left: 1px solid var(--hf-panel-border);
    cursor: pointer;
    overflow: hidden;
  }

  .minimap-canvas {
    width: 100%;
    height: 100%;
    display: block;
  }
</style>
