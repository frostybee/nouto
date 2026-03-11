import { describe, it, expect, beforeEach } from 'vitest';
import {
  multiSelect,
  isMultiSelectActive,
  selectedCount,
  toggleItemSelection,
  rangeSelectTo,
  clearMultiSelect,
  getFlattenedVisibleItems,
  getTopLevelSelectedIds,
  getAffectedRequestIds,
} from './multiSelect.svelte';
import { setCollections } from './collections.svelte';
import type { Collection, SavedRequest, Folder, CollectionItem } from '../types';

const createRequest = (id: string, name: string): SavedRequest => ({
  type: 'request',
  id,
  name,
  method: 'GET',
  url: 'https://api.example.com',
  params: [],
  headers: [],
  auth: { type: 'none' },
  body: { type: 'none', content: '' },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const createFolder = (id: string, name: string, children: CollectionItem[] = [], expanded = true): Folder => ({
  type: 'folder',
  id,
  name,
  children,
  expanded,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const createCollection = (id: string, name: string, items: CollectionItem[] = []): Collection => ({
  id,
  name,
  items,
  expanded: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

describe('multiSelect store', () => {
  beforeEach(() => {
    clearMultiSelect();
    setCollections([]);
  });

  describe('toggleItemSelection', () => {
    it('should add an item to selection', () => {
      toggleItemSelection('req-1', 'col-1');
      const state = multiSelect();
      expect(state.selectedIds.has('req-1')).toBe(true);
      expect(state.collectionId).toBe('col-1');
      expect(state.anchorId).toBe('req-1');
    });

    it('should remove an item from selection when toggled again', () => {
      toggleItemSelection('req-1', 'col-1');
      toggleItemSelection('req-1', 'col-1');
      const state = multiSelect();
      expect(state.selectedIds.has('req-1')).toBe(false);
      expect(state.selectedIds.size).toBe(0);
    });

    it('should add multiple items to selection', () => {
      toggleItemSelection('req-1', 'col-1');
      toggleItemSelection('req-2', 'col-1');
      const state = multiSelect();
      expect(state.selectedIds.size).toBe(2);
      expect(state.selectedIds.has('req-1')).toBe(true);
      expect(state.selectedIds.has('req-2')).toBe(true);
    });

    it('should clear selection when switching to different collection', () => {
      toggleItemSelection('req-1', 'col-1');
      toggleItemSelection('req-2', 'col-1');
      toggleItemSelection('req-3', 'col-2');
      const state = multiSelect();
      expect(state.selectedIds.size).toBe(1);
      expect(state.selectedIds.has('req-3')).toBe(true);
      expect(state.collectionId).toBe('col-2');
    });

    it('should update anchor on each toggle', () => {
      toggleItemSelection('req-1', 'col-1');
      expect(multiSelect().anchorId).toBe('req-1');
      toggleItemSelection('req-2', 'col-1');
      expect(multiSelect().anchorId).toBe('req-2');
    });
  });

  describe('isMultiSelectActive', () => {
    it('should be false with 0 items', () => {
      expect(isMultiSelectActive()).toBe(false);
    });

    it('should be false with 1 item', () => {
      toggleItemSelection('req-1', 'col-1');
      expect(isMultiSelectActive()).toBe(false);
    });

    it('should be true with 2+ items', () => {
      toggleItemSelection('req-1', 'col-1');
      toggleItemSelection('req-2', 'col-1');
      expect(isMultiSelectActive()).toBe(true);
    });
  });

  describe('selectedCount', () => {
    it('should track count correctly', () => {
      expect(selectedCount()).toBe(0);
      toggleItemSelection('req-1', 'col-1');
      expect(selectedCount()).toBe(1);
      toggleItemSelection('req-2', 'col-1');
      expect(selectedCount()).toBe(2);
      toggleItemSelection('req-1', 'col-1');
      expect(selectedCount()).toBe(1);
    });
  });

  describe('clearMultiSelect', () => {
    it('should reset all state', () => {
      toggleItemSelection('req-1', 'col-1');
      toggleItemSelection('req-2', 'col-1');
      clearMultiSelect();
      const state = multiSelect();
      expect(state.selectedIds.size).toBe(0);
      expect(state.collectionId).toBeNull();
      expect(state.anchorId).toBeNull();
    });
  });

  describe('rangeSelectTo', () => {
    it('should select a range between anchor and target', () => {
      setCollections([
        createCollection('col-1', 'Test', [
          createRequest('r1', 'Request 1'),
          createRequest('r2', 'Request 2'),
          createRequest('r3', 'Request 3'),
          createRequest('r4', 'Request 4'),
          createRequest('r5', 'Request 5'),
        ]),
      ]);

      // Set anchor via toggle
      toggleItemSelection('r2', 'col-1');
      // Shift+Click to r4
      rangeSelectTo('r4', 'col-1');

      const state = multiSelect();
      expect(state.selectedIds.size).toBe(3);
      expect(state.selectedIds.has('r2')).toBe(true);
      expect(state.selectedIds.has('r3')).toBe(true);
      expect(state.selectedIds.has('r4')).toBe(true);
    });

    it('should work with reverse range (target before anchor)', () => {
      setCollections([
        createCollection('col-1', 'Test', [
          createRequest('r1', 'Request 1'),
          createRequest('r2', 'Request 2'),
          createRequest('r3', 'Request 3'),
          createRequest('r4', 'Request 4'),
        ]),
      ]);

      toggleItemSelection('r3', 'col-1');
      rangeSelectTo('r1', 'col-1');

      const state = multiSelect();
      expect(state.selectedIds.size).toBe(3);
      expect(state.selectedIds.has('r1')).toBe(true);
      expect(state.selectedIds.has('r2')).toBe(true);
      expect(state.selectedIds.has('r3')).toBe(true);
    });

    it('should include items inside expanded folders', () => {
      setCollections([
        createCollection('col-1', 'Test', [
          createRequest('r1', 'Request 1'),
          createFolder('f1', 'Folder', [
            createRequest('r2', 'Nested Request'),
          ], true),
          createRequest('r3', 'Request 3'),
        ]),
      ]);

      toggleItemSelection('r1', 'col-1');
      rangeSelectTo('r3', 'col-1');

      const state = multiSelect();
      // r1, f1, r2, r3
      expect(state.selectedIds.size).toBe(4);
      expect(state.selectedIds.has('r1')).toBe(true);
      expect(state.selectedIds.has('f1')).toBe(true);
      expect(state.selectedIds.has('r2')).toBe(true);
      expect(state.selectedIds.has('r3')).toBe(true);
    });

    it('should NOT include items inside collapsed folders', () => {
      setCollections([
        createCollection('col-1', 'Test', [
          createRequest('r1', 'Request 1'),
          createFolder('f1', 'Folder', [
            createRequest('r2', 'Nested Request'),
          ], false), // collapsed
          createRequest('r3', 'Request 3'),
        ]),
      ]);

      toggleItemSelection('r1', 'col-1');
      rangeSelectTo('r3', 'col-1');

      const state = multiSelect();
      // r1, f1, r3 (r2 is hidden because f1 is collapsed)
      expect(state.selectedIds.size).toBe(3);
      expect(state.selectedIds.has('r1')).toBe(true);
      expect(state.selectedIds.has('f1')).toBe(true);
      expect(state.selectedIds.has('r3')).toBe(true);
      expect(state.selectedIds.has('r2')).toBe(false);
    });

    it('should start fresh when no anchor exists', () => {
      setCollections([
        createCollection('col-1', 'Test', [
          createRequest('r1', 'Request 1'),
          createRequest('r2', 'Request 2'),
        ]),
      ]);

      rangeSelectTo('r2', 'col-1');
      const state = multiSelect();
      expect(state.selectedIds.size).toBe(1);
      expect(state.selectedIds.has('r2')).toBe(true);
    });

    it('should start fresh when switching collection', () => {
      setCollections([
        createCollection('col-1', 'Test 1', [createRequest('r1', 'R1')]),
        createCollection('col-2', 'Test 2', [createRequest('r2', 'R2')]),
      ]);

      toggleItemSelection('r1', 'col-1');
      rangeSelectTo('r2', 'col-2');

      const state = multiSelect();
      expect(state.selectedIds.size).toBe(1);
      expect(state.selectedIds.has('r2')).toBe(true);
      expect(state.collectionId).toBe('col-2');
    });
  });

  describe('getFlattenedVisibleItems', () => {
    it('should return empty for unknown collection', () => {
      expect(getFlattenedVisibleItems('unknown')).toEqual([]);
    });

    it('should flatten expanded folders', () => {
      setCollections([
        createCollection('col-1', 'Test', [
          createRequest('r1', 'R1'),
          createFolder('f1', 'F1', [
            createRequest('r2', 'R2'),
            createRequest('r3', 'R3'),
          ], true),
          createRequest('r4', 'R4'),
        ]),
      ]);

      expect(getFlattenedVisibleItems('col-1')).toEqual(['r1', 'f1', 'r2', 'r3', 'r4']);
    });

    it('should skip children of collapsed folders', () => {
      setCollections([
        createCollection('col-1', 'Test', [
          createRequest('r1', 'R1'),
          createFolder('f1', 'F1', [
            createRequest('r2', 'R2'),
          ], false),
          createRequest('r3', 'R3'),
        ]),
      ]);

      expect(getFlattenedVisibleItems('col-1')).toEqual(['r1', 'f1', 'r3']);
    });

    it('should handle nested expanded folders', () => {
      setCollections([
        createCollection('col-1', 'Test', [
          createFolder('f1', 'F1', [
            createFolder('f2', 'F2', [
              createRequest('r1', 'R1'),
            ], true),
          ], true),
        ]),
      ]);

      expect(getFlattenedVisibleItems('col-1')).toEqual(['f1', 'f2', 'r1']);
    });
  });

  describe('getTopLevelSelectedIds', () => {
    it('should return all when no nesting', () => {
      setCollections([
        createCollection('col-1', 'Test', [
          createRequest('r1', 'R1'),
          createRequest('r2', 'R2'),
        ]),
      ]);

      toggleItemSelection('r1', 'col-1');
      toggleItemSelection('r2', 'col-1');

      const topLevel = getTopLevelSelectedIds();
      expect(topLevel.sort()).toEqual(['r1', 'r2']);
    });

    it('should filter out children of selected folders', () => {
      setCollections([
        createCollection('col-1', 'Test', [
          createFolder('f1', 'Folder', [
            createRequest('r1', 'Nested Request'),
          ]),
        ]),
      ]);

      toggleItemSelection('f1', 'col-1');
      toggleItemSelection('r1', 'col-1');

      const topLevel = getTopLevelSelectedIds();
      expect(topLevel).toEqual(['f1']);
    });

    it('should keep items from different branches', () => {
      setCollections([
        createCollection('col-1', 'Test', [
          createFolder('f1', 'Folder 1', [
            createRequest('r1', 'R1'),
          ]),
          createFolder('f2', 'Folder 2', [
            createRequest('r2', 'R2'),
          ]),
        ]),
      ]);

      toggleItemSelection('r1', 'col-1');
      toggleItemSelection('r2', 'col-1');

      const topLevel = getTopLevelSelectedIds();
      expect(topLevel.sort()).toEqual(['r1', 'r2']);
    });

    it('should return empty when nothing selected', () => {
      expect(getTopLevelSelectedIds()).toEqual([]);
    });
  });

  describe('getAffectedRequestIds', () => {
    it('should return request IDs for selected requests', () => {
      setCollections([
        createCollection('col-1', 'Test', [
          createRequest('r1', 'R1'),
          createRequest('r2', 'R2'),
        ]),
      ]);

      toggleItemSelection('r1', 'col-1');
      toggleItemSelection('r2', 'col-1');

      expect(getAffectedRequestIds().sort()).toEqual(['r1', 'r2']);
    });

    it('should include children of selected folders', () => {
      setCollections([
        createCollection('col-1', 'Test', [
          createFolder('f1', 'Folder', [
            createRequest('r1', 'R1'),
            createRequest('r2', 'R2'),
          ]),
        ]),
      ]);

      toggleItemSelection('f1', 'col-1');

      expect(getAffectedRequestIds().sort()).toEqual(['r1', 'r2']);
    });

    it('should not duplicate when folder and child both selected', () => {
      setCollections([
        createCollection('col-1', 'Test', [
          createFolder('f1', 'Folder', [
            createRequest('r1', 'R1'),
          ]),
        ]),
      ]);

      toggleItemSelection('f1', 'col-1');
      toggleItemSelection('r1', 'col-1');

      // getTopLevelSelectedIds filters out r1, so only folder's children are counted
      expect(getAffectedRequestIds()).toEqual(['r1']);
    });

    it('should return empty when nothing selected', () => {
      expect(getAffectedRequestIds()).toEqual([]);
    });
  });
});
