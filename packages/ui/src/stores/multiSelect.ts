import { writable, derived, get } from 'svelte/store';
import { collections, findItemRecursive, getAllRequests } from './collections';
import { isFolder, isRequest } from '../types';
import type { Collection, CollectionItem } from '../types';

export interface MultiSelectState {
  selectedIds: Set<string>;
  collectionId: string | null;
  anchorId: string | null;
}

const initialState: MultiSelectState = {
  selectedIds: new Set(),
  collectionId: null,
  anchorId: null,
};

export const multiSelect = writable<MultiSelectState>({ ...initialState });

/** True when 2+ items are selected */
export const isMultiSelectActive = derived(multiSelect, ($ms) => $ms.selectedIds.size > 1);

/** Number of selected items */
export const selectedCount = derived(multiSelect, ($ms) => $ms.selectedIds.size);

/** Toggle a single item in/out of the selection (Ctrl+Click) */
export function toggleItemSelection(itemId: string, collectionId: string) {
  multiSelect.update(state => {
    // If different collection, start fresh
    if (state.collectionId && state.collectionId !== collectionId) {
      return {
        selectedIds: new Set([itemId]),
        collectionId,
        anchorId: itemId,
      };
    }

    const newIds = new Set(state.selectedIds);
    if (newIds.has(itemId)) {
      newIds.delete(itemId);
    } else {
      newIds.add(itemId);
    }

    return {
      selectedIds: newIds,
      collectionId: newIds.size > 0 ? collectionId : null,
      anchorId: itemId,
    };
  });
}

/** Range select from anchor to target (Shift+Click) */
export function rangeSelectTo(itemId: string, collectionId: string) {
  const state = get(multiSelect);

  // If no anchor or different collection, just select this item
  if (!state.anchorId || (state.collectionId && state.collectionId !== collectionId)) {
    multiSelect.set({
      selectedIds: new Set([itemId]),
      collectionId,
      anchorId: itemId,
    });
    return;
  }

  const flatIds = getFlattenedVisibleItems(collectionId);
  const anchorIdx = flatIds.indexOf(state.anchorId);
  const targetIdx = flatIds.indexOf(itemId);

  if (anchorIdx === -1 || targetIdx === -1) {
    // Fallback: just select the target
    multiSelect.set({
      selectedIds: new Set([itemId]),
      collectionId,
      anchorId: itemId,
    });
    return;
  }

  const start = Math.min(anchorIdx, targetIdx);
  const end = Math.max(anchorIdx, targetIdx);
  const rangeIds = flatIds.slice(start, end + 1);

  multiSelect.set({
    selectedIds: new Set(rangeIds),
    collectionId,
    anchorId: state.anchorId, // keep original anchor
  });
}

/** Clear all multi-selection */
export function clearMultiSelect() {
  multiSelect.set({ ...initialState, selectedIds: new Set() });
}

/**
 * Get a flattened list of visible item IDs in tree render order.
 * Only traverses expanded folders.
 */
export function getFlattenedVisibleItems(collectionId: string): string[] {
  const cols = get(collections);
  const col = cols.find((c: Collection) => c.id === collectionId);
  if (!col) return [];

  const result: string[] = [];
  flattenItems(col.items, result);
  return result;
}

function flattenItems(items: CollectionItem[], result: string[]) {
  for (const item of items) {
    result.push(item.id);
    if (isFolder(item) && item.expanded && item.children.length > 0) {
      flattenItems(item.children, result);
    }
  }
}

/**
 * Filter out items that are descendants of other selected items.
 * When a folder and its child are both selected, only keep the folder.
 */
export function getTopLevelSelectedIds(): string[] {
  const state = get(multiSelect);
  if (state.selectedIds.size === 0 || !state.collectionId) return [];

  const cols = get(collections);
  const col = cols.find((c: Collection) => c.id === state.collectionId);
  if (!col) return [];

  const selectedArray = Array.from(state.selectedIds);

  return selectedArray.filter(id => {
    // Check if any other selected item is an ancestor of this one
    for (const otherId of selectedArray) {
      if (otherId === id) continue;
      const otherItem = findItemRecursive(col.items, otherId);
      if (otherItem && isFolder(otherItem)) {
        // If this id is a descendant of otherItem, exclude it
        if (findItemRecursive(otherItem.children, id)) {
          return false;
        }
      }
    }
    return true;
  });
}

/**
 * Get all request IDs that would be affected by deleting/moving the selected items.
 * Includes children of selected folders.
 */
export function getAffectedRequestIds(): string[] {
  const state = get(multiSelect);
  if (state.selectedIds.size === 0 || !state.collectionId) return [];

  const cols = get(collections);
  const col = cols.find((c: Collection) => c.id === state.collectionId);
  if (!col) return [];

  const topLevel = getTopLevelSelectedIds();
  const requestIds: string[] = [];

  for (const id of topLevel) {
    const item = findItemRecursive(col.items, id);
    if (!item) continue;

    if (isRequest(item)) {
      requestIds.push(item.id);
    } else if (isFolder(item)) {
      requestIds.push(...getAllRequests(item.children).map(r => r.id));
    }
  }

  return requestIds;
}
