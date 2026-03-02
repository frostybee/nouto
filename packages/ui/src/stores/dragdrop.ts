import { writable, derived, get } from 'svelte/store';

export interface DragState {
  isDragging: boolean;
  draggedItemId: string | null;
  draggedItemIds: string[];  // All items being dragged (multi-select)
  draggedItemType: 'request' | 'folder' | 'multi' | null;
  sourceCollectionId: string | null;
  sourceFolderId: string | null;
}

export interface DropTarget {
  type: 'collection' | 'folder';
  id: string;
  collectionId: string;
}

// Drag state store
const initialDragState: DragState = {
  isDragging: false,
  draggedItemId: null,
  draggedItemIds: [],
  draggedItemType: null,
  sourceCollectionId: null,
  sourceFolderId: null,
};

export const dragState = writable<DragState>(initialDragState);

// Current drop target (what we're hovering over)
export const dropTarget = writable<DropTarget | null>(null);

// Derived store to check if we can drop on a specific target
export const canDropOn = derived(
  [dragState, dropTarget],
  ([$dragState, $dropTarget]) => {
    if (!$dragState.isDragging || !$dropTarget) return false;

    // Can't drop on itself
    if ($dragState.draggedItemId === $dropTarget.id) return false;

    // Can't drop a folder into itself (prevent circular reference)
    if ($dragState.draggedItemType === 'folder' && $dropTarget.type === 'folder') {
      // This would require checking if target is a descendant of dragged
      // For now, we'll allow and validate in moveItem
    }

    return true;
  }
);

// Start dragging a single item
export function startDrag(
  itemId: string,
  itemType: 'request' | 'folder',
  collectionId: string,
  folderId?: string
) {
  dragState.set({
    isDragging: true,
    draggedItemId: itemId,
    draggedItemIds: [itemId],
    draggedItemType: itemType,
    sourceCollectionId: collectionId,
    sourceFolderId: folderId || null,
  });
}

// Start dragging multiple items (multi-select)
export function startMultiDrag(
  primaryItemId: string,
  itemIds: string[],
  collectionId: string
) {
  dragState.set({
    isDragging: true,
    draggedItemId: primaryItemId,
    draggedItemIds: itemIds,
    draggedItemType: 'multi',
    sourceCollectionId: collectionId,
    sourceFolderId: null,
  });
}

// End drag operation
export function endDrag() {
  dragState.set(initialDragState);
  dropTarget.set(null);
}

// Set the current drop target
export function setDropTarget(target: DropTarget | null) {
  dropTarget.set(target);
}

// Check if an item is being dragged
export function isDragging(): boolean {
  return get(dragState).isDragging;
}

// Get the dragged item ID
export function getDraggedItemId(): string | null {
  return get(dragState).draggedItemId;
}
