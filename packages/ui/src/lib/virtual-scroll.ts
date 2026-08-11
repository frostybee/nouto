/**
 * Lightweight virtual scroll calculation utility.
 * Computes which items are visible given container dimensions and scroll position.
 */

export interface VirtualScrollOptions {
  /** Total number of items in the list */
  itemCount: number;
  /** Height of each item in pixels (fixed-height rows) */
  itemHeight: number;
  /** Height of the visible container in pixels */
  containerHeight: number;
  /** Current scroll offset from the top */
  scrollTop: number;
  /** Extra items to render above/below visible area (default: 5) */
  overscan?: number;
}

export interface VirtualScrollResult {
  /** Index of the first item to render */
  visibleStart: number;
  /** Index past the last item to render (exclusive) */
  visibleEnd: number;
  /** Total height of the scrollable content in pixels */
  totalHeight: number;
  /** Y offset to apply via transform:translateY for the rendered slice */
  offsetY: number;
}

/** Clamp a desired scrollTop to the valid range for the given content and container heights. */
export function clampScrollTarget(target: number, totalHeight: number, containerHeight: number): number {
  const maxScroll = Math.max(0, totalHeight - containerHeight);
  return Math.max(0, Math.min(target, maxScroll));
}

/**
 * Compute the scrollTop needed to bring an item into view.
 *
 * - 'center': positions the item at the vertical center of the container.
 * - 'nearest': scrolls the minimum distance to make the item fully visible;
 *   returns null when the item is already fully visible.
 */
export function computeScrollToIndex(
  index: number,
  itemHeight: number,
  containerHeight: number,
  scrollTop: number,
  totalHeight: number,
  align: 'nearest' | 'center',
): number | null {
  const itemTop = index * itemHeight;
  const itemBottom = itemTop + itemHeight;

  if (align === 'center') {
    return clampScrollTarget(itemTop - (containerHeight - itemHeight) / 2, totalHeight, containerHeight);
  }

  if (itemTop < scrollTop) {
    return clampScrollTarget(itemTop, totalHeight, containerHeight);
  }
  if (itemBottom > scrollTop + containerHeight) {
    return clampScrollTarget(itemBottom - containerHeight, totalHeight, containerHeight);
  }
  return null;
}

export function calculateVisibleRange(options: VirtualScrollOptions): VirtualScrollResult {
  const { itemCount, itemHeight, containerHeight, scrollTop, overscan = 5 } = options;

  if (itemCount === 0 || itemHeight === 0) {
    return { visibleStart: 0, visibleEnd: 0, totalHeight: 0, offsetY: 0 };
  }

  const totalHeight = itemCount * itemHeight;

  // Which item is at the top of the visible area?
  const startIndex = Math.floor(scrollTop / itemHeight);
  // How many items fit in the container?
  const visibleCount = Math.ceil(containerHeight / itemHeight);

  // Apply overscan buffer
  const visibleStart = Math.max(0, startIndex - overscan);
  const visibleEnd = Math.min(itemCount, startIndex + visibleCount + overscan);

  // Offset for the rendered slice
  const offsetY = visibleStart * itemHeight;

  return { visibleStart, visibleEnd, totalHeight, offsetY };
}
