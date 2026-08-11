import { describe, it, expect } from 'vitest';
import { calculateVisibleRange, clampScrollTarget, computeScrollToIndex } from './virtual-scroll';

describe('calculateVisibleRange', () => {
  it('returns empty range for zero items', () => {
    const r = calculateVisibleRange({ itemCount: 0, itemHeight: 22, containerHeight: 400, scrollTop: 0 });
    expect(r).toEqual({ visibleStart: 0, visibleEnd: 0, totalHeight: 0, offsetY: 0 });
  });

  it('returns empty range for zero item height', () => {
    const r = calculateVisibleRange({ itemCount: 100, itemHeight: 0, containerHeight: 400, scrollTop: 0 });
    expect(r).toEqual({ visibleStart: 0, visibleEnd: 0, totalHeight: 0, offsetY: 0 });
  });

  it('starts at index 0 with no negative overscan at the top', () => {
    const r = calculateVisibleRange({ itemCount: 100, itemHeight: 22, containerHeight: 220, scrollTop: 0 });
    expect(r.visibleStart).toBe(0);
    expect(r.visibleEnd).toBe(15); // 10 visible + 5 overscan
    expect(r.offsetY).toBe(0);
    expect(r.totalHeight).toBe(2200);
  });

  it('clamps visibleEnd to itemCount at the bottom', () => {
    const r = calculateVisibleRange({ itemCount: 20, itemHeight: 22, containerHeight: 220, scrollTop: 22 * 15 });
    expect(r.visibleEnd).toBe(20);
  });

  it('applies overscan above the viewport mid-list', () => {
    const r = calculateVisibleRange({ itemCount: 100, itemHeight: 22, containerHeight: 220, scrollTop: 22 * 50 });
    expect(r.visibleStart).toBe(45);
    expect(r.offsetY).toBe(45 * 22);
  });
});

describe('clampScrollTarget', () => {
  it('clamps negative targets to 0', () => {
    expect(clampScrollTarget(-50, 1000, 400)).toBe(0);
  });

  it('clamps targets beyond the max scroll', () => {
    expect(clampScrollTarget(5000, 1000, 400)).toBe(600);
  });

  it('returns 0 when content is shorter than the container', () => {
    expect(clampScrollTarget(100, 200, 400)).toBe(0);
  });

  it('passes through in-range targets', () => {
    expect(clampScrollTarget(300, 1000, 400)).toBe(300);
  });
});

describe('computeScrollToIndex', () => {
  const itemHeight = 22;
  const containerHeight = 220; // 10 rows
  const totalHeight = 100 * itemHeight;

  describe('center alignment', () => {
    it('centers a mid-list item', () => {
      // item 50: top = 1100; centered -> 1100 - (220 - 22) / 2 = 1001
      expect(computeScrollToIndex(50, itemHeight, containerHeight, 0, totalHeight, 'center')).toBe(1001);
    });

    it('clamps to 0 for items near the top', () => {
      expect(computeScrollToIndex(1, itemHeight, containerHeight, 500, totalHeight, 'center')).toBe(0);
    });

    it('clamps to max scroll for items near the bottom', () => {
      expect(computeScrollToIndex(99, itemHeight, containerHeight, 0, totalHeight, 'center')).toBe(totalHeight - containerHeight);
    });

    it('handles containers shorter than one row without NaN', () => {
      const result = computeScrollToIndex(50, itemHeight, 10, 0, totalHeight, 'center');
      expect(result).toBe(1100 - (10 - 22) / 2);
    });

    it('re-centers even when the item is already visible', () => {
      // item 10 top = 220, visible at scrollTop 200; centering still returns a target
      expect(computeScrollToIndex(10, itemHeight, containerHeight, 200, totalHeight, 'center')).toBe(220 - 99);
    });
  });

  describe('nearest alignment', () => {
    it('returns null when the item is fully visible', () => {
      expect(computeScrollToIndex(10, itemHeight, containerHeight, 200, totalHeight, 'nearest')).toBeNull();
    });

    it('top-aligns when the item is above the viewport', () => {
      expect(computeScrollToIndex(5, itemHeight, containerHeight, 500, totalHeight, 'nearest')).toBe(110);
    });

    it('bottom-aligns when the item is below the viewport', () => {
      // item 50: bottom = 1122 -> scrollTop = 1122 - 220 = 902
      expect(computeScrollToIndex(50, itemHeight, containerHeight, 0, totalHeight, 'nearest')).toBe(902);
    });

    it('returns null for a partially assumed-visible boundary item at the exact bottom edge', () => {
      // item bottom exactly at viewport bottom: 50 * 22 + 22 = 1122 = 902 + 220
      expect(computeScrollToIndex(50, itemHeight, containerHeight, 902, totalHeight, 'nearest')).toBeNull();
    });
  });
});
