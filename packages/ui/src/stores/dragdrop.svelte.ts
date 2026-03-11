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

export const dragState = $state<DragState>({ ...initialDragState });

// Current drop target (what we're hovering over)
let _dropTarget = $state<{ value: DropTarget | null }>({ value: null });
export function dropTarget() { return _dropTarget.value; }

// Derived value to check if we can drop on a specific target
export function canDropOn(): boolean {
  if (!dragState.isDragging || !_dropTarget.value) return false;

  // Can't drop on itself
  if (dragState.draggedItemId === _dropTarget.value.id) return false;

  // Can't drop a folder into itself (prevent circular reference)
  // For now, we'll allow and validate in moveItem

  return true;
}

// Start dragging a single item
export function startDrag(
  itemId: string,
  itemType: 'request' | 'folder',
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
