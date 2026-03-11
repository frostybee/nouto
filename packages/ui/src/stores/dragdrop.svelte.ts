export interface DragState {
  isDragging: boolean;
  draggedItemId: string | null;
  draggedItemIds: string[];  // All items being dragged (multi-select)
  draggedItemType: 'request' | 'folder' | 'collection' | 'multi' | null;
  sourceCollectionId: string | null;
  sourceFolderId: string | null;
}

export type DropPosition = 'before' | 'after' | 'inside';

export interface DropTarget {
  type: 'collection' | 'folder' | 'request';
  id: string;
  collectionId: string;
  position?: DropPosition;
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

export const dragState = $state<DragState>({ ...initialDragState });

// Current drop target (what we're hovering over)
let _dropTarget = $state<{ value: DropTarget | null }>({ value: null });
export function dropTarget() { return _dropTarget.value; }

// Start dragging a single item
export function startDrag(
  itemId: string,
  itemType: 'request' | 'folder' | 'collection',
  collectionId: string,
  folderId?: string
) {
  dragState.isDragging = true;
  dragState.draggedItemId = itemId;
  dragState.draggedItemIds = [itemId];
  dragState.draggedItemType = itemType;
  dragState.sourceCollectionId = collectionId;
  dragState.sourceFolderId = folderId || null;
}

// Start dragging multiple items (multi-select)
export function startMultiDrag(
  primaryItemId: string,
  itemIds: string[],
  collectionId: string
) {
  dragState.isDragging = true;
  dragState.draggedItemId = primaryItemId;
  dragState.draggedItemIds = itemIds;
  dragState.draggedItemType = 'multi';
  dragState.sourceCollectionId = collectionId;
  dragState.sourceFolderId = null;
}

// End drag operation
export function endDrag() {
  dragState.isDragging = false;
  dragState.draggedItemId = null;
  dragState.draggedItemIds = [];
  dragState.draggedItemType = null;
  dragState.sourceCollectionId = null;
  dragState.sourceFolderId = null;
  _dropTarget.value = null;
}

// Set the current drop target
export function setDropTarget(target: DropTarget | null) {
  _dropTarget.value = target;
}

// Check if an item is being dragged
export function isDragging(): boolean {
  return dragState.isDragging;
}

// Get the dragged item ID
export function getDraggedItemId(): string | null {
  return dragState.draggedItemId;
}

/**
 * Compute drop position from mouse Y relative to an element's bounding box.
 * Folders: top 25% = before, middle 50% = inside, bottom 25% = after
 * Requests: top 50% = before, bottom 50% = after
 */
export function computeDropPosition(e: DragEvent, element: HTMLElement, isContainer: boolean): DropPosition {
  const rect = element.getBoundingClientRect();
  const relY = (e.clientY - rect.top) / rect.height;

  if (isContainer) {
    // Folder/collection: 3-zone split
    if (relY < 0.25) return 'before';
    if (relY > 0.75) return 'after';
    return 'inside';
  }
  // Request: 2-zone split
  return relY < 0.5 ? 'before' : 'after';
}
