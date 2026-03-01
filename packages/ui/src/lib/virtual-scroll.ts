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
