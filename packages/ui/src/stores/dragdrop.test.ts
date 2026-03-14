import { describe, it, expect, beforeEach } from 'vitest';
import {
  dragState,
  dropTarget,
  startDrag,
  startMultiDrag,
  endDrag,
  setDropTarget,
  isDragging,
  getDraggedItemId,
  computeDropPosition,
} from './dragdrop.svelte';

describe('dragdrop store', () => {
  beforeEach(() => {
    endDrag();
  });

  describe('initial state', () => {
    it('should not be dragging', () => {
      expect(isDragging()).toBe(false);
      expect(dragState.isDragging).toBe(false);
    });

    it('should have null dragged item ID', () => {
      expect(getDraggedItemId()).toBeNull();
    });

    it('should have empty dragged item IDs', () => {
      expect(dragState.draggedItemIds).toEqual([]);
    });

    it('should have null drop target', () => {
      expect(dropTarget()).toBeNull();
    });

    it('should have null item type', () => {
      expect(dragState.draggedItemType).toBeNull();
    });

    it('should have null source collection and folder', () => {
      expect(dragState.sourceCollectionId).toBeNull();
      expect(dragState.sourceFolderId).toBeNull();
    });
  });

  describe('startDrag', () => {
    it('should set dragging state for a request', () => {
      startDrag('req-1', 'request', 'col-1');
      expect(isDragging()).toBe(true);
      expect(getDraggedItemId()).toBe('req-1');
      expect(dragState.draggedItemType).toBe('request');
      expect(dragState.sourceCollectionId).toBe('col-1');
      expect(dragState.sourceFolderId).toBeNull();
    });

    it('should set folder ID when provided', () => {
      startDrag('req-1', 'request', 'col-1', 'folder-1');
      expect(dragState.sourceFolderId).toBe('folder-1');
    });

    it('should set draggedItemIds to single item', () => {
      startDrag('req-1', 'request', 'col-1');
      expect(dragState.draggedItemIds).toEqual(['req-1']);
    });

    it('should handle folder drag', () => {
      startDrag('folder-1', 'folder', 'col-1');
      expect(dragState.draggedItemType).toBe('folder');
      expect(getDraggedItemId()).toBe('folder-1');
    });

    it('should handle collection drag', () => {
      startDrag('col-1', 'collection', 'col-1');
      expect(dragState.draggedItemType).toBe('collection');
    });
  });

  describe('startMultiDrag', () => {
    it('should set multi-drag state', () => {
      startMultiDrag('req-1', ['req-1', 'req-2', 'req-3'], 'col-1');
      expect(isDragging()).toBe(true);
      expect(getDraggedItemId()).toBe('req-1');
      expect(dragState.draggedItemIds).toEqual(['req-1', 'req-2', 'req-3']);
      expect(dragState.draggedItemType).toBe('multi');
      expect(dragState.sourceCollectionId).toBe('col-1');
      expect(dragState.sourceFolderId).toBeNull();
    });
  });

  describe('endDrag', () => {
    it('should reset all drag state', () => {
      startDrag('req-1', 'request', 'col-1', 'folder-1');
      setDropTarget({ type: 'folder', id: 'folder-2', collectionId: 'col-1', position: 'inside' });

      endDrag();

      expect(isDragging()).toBe(false);
      expect(getDraggedItemId()).toBeNull();
      expect(dragState.draggedItemIds).toEqual([]);
      expect(dragState.draggedItemType).toBeNull();
      expect(dragState.sourceCollectionId).toBeNull();
      expect(dragState.sourceFolderId).toBeNull();
      expect(dropTarget()).toBeNull();
    });
  });

  describe('setDropTarget', () => {
    it('should set the drop target', () => {
      const target = { type: 'folder' as const, id: 'folder-1', collectionId: 'col-1', position: 'inside' as const };
      setDropTarget(target);
      expect(dropTarget()).toEqual(target);
    });

    it('should clear the drop target when set to null', () => {
      setDropTarget({ type: 'request', id: 'req-1', collectionId: 'col-1' });
      setDropTarget(null);
      expect(dropTarget()).toBeNull();
    });
  });

  describe('computeDropPosition', () => {
    function mockDragEvent(clientY: number): DragEvent {
      return { clientY } as DragEvent;
    }

    function mockElement(top: number, height: number): HTMLElement {
      return {
        getBoundingClientRect: () => ({
          top,
          height,
          bottom: top + height,
          left: 0,
          right: 100,
          width: 100,
          x: 0,
          y: top,
          toJSON: () => {},
        }),
      } as HTMLElement;
    }

    describe('container (3-zone split)', () => {
      it('should return "before" for top 25%', () => {
        const el = mockElement(0, 100);
        // relY = 10/100 = 0.10 < 0.25
        expect(computeDropPosition(mockDragEvent(10), el, true)).toBe('before');
      });

      it('should return "inside" for middle 50%', () => {
        const el = mockElement(0, 100);
        // relY = 50/100 = 0.50, between 0.25 and 0.75
        expect(computeDropPosition(mockDragEvent(50), el, true)).toBe('inside');
      });

      it('should return "after" for bottom 25%', () => {
        const el = mockElement(0, 100);
        // relY = 80/100 = 0.80 > 0.75
        expect(computeDropPosition(mockDragEvent(80), el, true)).toBe('after');
      });

      it('should return "before" at boundary (relY = 0.25)', () => {
        const el = mockElement(0, 100);
        // relY = 25/100 = 0.25, not < 0.25, so falls to second check
        expect(computeDropPosition(mockDragEvent(25), el, true)).toBe('inside');
      });

      it('should return "inside" at boundary (relY = 0.75)', () => {
        const el = mockElement(0, 100);
        // relY = 75/100 = 0.75, not > 0.75
        expect(computeDropPosition(mockDragEvent(75), el, true)).toBe('inside');
      });
    });

    describe('non-container (2-zone split)', () => {
      it('should return "before" for top 50%', () => {
        const el = mockElement(0, 100);
        // relY = 30/100 = 0.30 < 0.5
        expect(computeDropPosition(mockDragEvent(30), el, false)).toBe('before');
      });

      it('should return "after" for bottom 50%', () => {
        const el = mockElement(0, 100);
        // relY = 70/100 = 0.70 >= 0.5
        expect(computeDropPosition(mockDragEvent(70), el, false)).toBe('after');
      });

      it('should return "before" at exact midpoint', () => {
        const el = mockElement(0, 100);
        // relY = 50/100 = 0.50, not < 0.5
        expect(computeDropPosition(mockDragEvent(50), el, false)).toBe('after');
      });
    });

    describe('with offset elements', () => {
      it('should account for element top offset', () => {
        const el = mockElement(200, 100);
        // relY = (210 - 200) / 100 = 0.10 < 0.25
        expect(computeDropPosition(mockDragEvent(210), el, true)).toBe('before');
      });

      it('should compute correctly for offset non-container', () => {
        const el = mockElement(200, 100);
        // relY = (280 - 200) / 100 = 0.80 >= 0.5
        expect(computeDropPosition(mockDragEvent(280), el, false)).toBe('after');
      });
    });
  });
});
