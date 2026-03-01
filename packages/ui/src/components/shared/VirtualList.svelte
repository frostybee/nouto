<script lang="ts">
  import { onMount } from 'svelte';
  import { calculateVisibleRange } from '../../lib/virtual-scroll';
  import type { Snippet } from 'svelte';

  interface Props {
    /** All items in the list */
    items: any[];
    /** Fixed height per item in pixels */
    itemHeight: number;
    /** Whether more items can be loaded */
    hasMore?: boolean;
    /** Callback when user scrolls near the bottom */
    onLoadMore?: () => void;
    /** Child render snippet — receives (item, index) */
    children: Snippet<[any, number]>;
  }

  let { items, itemHeight, hasMore = false, onLoadMore, children }: Props = $props();

  let containerEl: HTMLDivElement | undefined = $state();
  let containerHeight = $state(0);
  let scrollTop = $state(0);

  const result = $derived(
    calculateVisibleRange({
      itemCount: items.length,
      itemHeight,
      containerHeight,
      scrollTop,
      overscan: 5,
    })
  );

  const visibleItems = $derived(items.slice(result.visibleStart, result.visibleEnd));

  function handleScroll() {
    if (!containerEl) return;
    scrollTop = containerEl.scrollTop;

    // Auto-load-more: trigger when within 3 items of the bottom
    if (hasMore && onLoadMore) {
      const scrollBottom = scrollTop + containerHeight;
      const threshold = result.totalHeight - itemHeight * 3;
      if (scrollBottom >= threshold) {
        onLoadMore();
      }
    }
  }

  onMount(() => {
    if (containerEl) {
      containerHeight = containerEl.clientHeight;
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          containerHeight = entry.contentRect.height;
        }
      });
      observer.observe(containerEl);
      return () => observer.disconnect();
    }
  });
</script>

<div
  class="virtual-container"
  bind:this={containerEl}
  onscroll={handleScroll}
>
  <div class="virtual-spacer" style="height: {result.totalHeight}px; position: relative;">
    <div class="virtual-content" style="position: absolute; top: 0; left: 0; right: 0; transform: translateY({result.offsetY}px);">
      {#each visibleItems as item, i (item.id ?? (result.visibleStart + i))}
        {@render children(item, result.visibleStart + i)}
      {/each}
    </div>
  </div>
</div>

<style>
  .virtual-container {
    overflow-y: auto;
    overflow-x: hidden;
    height: 100%;
  }
</style>
