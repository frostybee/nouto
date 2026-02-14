import { writable, derived, get } from 'svelte/store';
import type { Collection, SavedRequest, CollectionItem, Folder, HttpMethod, KeyValue, AuthState, BodyState } from '../types';
import { generateId, createCollection, createFolder, isFolder, isRequest } from '../types';
import { postMessage } from '../lib/vscode';

// Collections store
export const collections = writable<Collection[]>([]);

// Currently selected collection ID
export const selectedCollectionId = writable<string | null>(null);

// Currently selected request ID
export const selectedRequestId = writable<string | null>(null);

// Currently selected folder ID
export const selectedFolderId = writable<string | null>(null);

// =====================
// Recursive Helpers
// =====================

/**
 * Find an item (request or folder) by ID within a collection's items recursively
 */
export function findItemRecursive(items: CollectionItem[], id: string): CollectionItem | null {
  for (const item of items) {
    if (item.id === id) {
      return item;
    }
    if (isFolder(item)) {
      const found = findItemRecursive(item.children, id);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Find an item by ID across all collections
 */
export function findItemById(id: string): { collection: Collection; item: CollectionItem } | null {
  const cols = get(collections);
  for (const col of cols) {
    const item = findItemRecursive(col.items, id);
    if (item) {
      return { collection: col, item };
    }
  }
  return null;
}

/**
 * Find parent folder or collection of an item
 */
export function findParentContainer(
  collectionId: string,
  itemId: string
): { type: 'collection'; collection: Collection } | { type: 'folder'; folder: Folder; path: string[] } | null {
  const cols = get(collections);
  const col = cols.find(c => c.id === collectionId);
  if (!col) return null;

  // Check if item is at root level
  if (col.items.some(item => item.id === itemId)) {
    return { type: 'collection', collection: col };
  }

  // Search recursively in folders
  function searchInFolder(items: CollectionItem[], path: string[]): { folder: Folder; path: string[] } | null {
    for (const item of items) {
      if (isFolder(item)) {
        if (item.children.some(child => child.id === itemId)) {
          return { folder: item, path: [...path, item.id] };
        }
        const found = searchInFolder(item.children, [...path, item.id]);
        if (found) return found;
      }
    }
    return null;
  }

  const result = searchInFolder(col.items, []);
  if (result) {
    return { type: 'folder', ...result };
  }
  return null;
}

/**
 * Add an item to a specific location (collection root or inside a folder)
 */
function addItemToContainer(
  items: CollectionItem[],
  newItem: CollectionItem,
  targetFolderId?: string
): CollectionItem[] {
  if (!targetFolderId) {
    // Add to root
    return [...items, newItem];
  }

  // Add to specific folder
  return items.map(item => {
    if (item.id === targetFolderId && isFolder(item)) {
      return {
        ...item,
        children: [...item.children, newItem],
        updatedAt: new Date().toISOString(),
      };
    }
    if (isFolder(item)) {
      return {
        ...item,
        children: addItemToContainer(item.children, newItem, targetFolderId),
      };
    }
    return item;
  });
}

/**
 * Remove an item from the tree recursively
 */
function removeItemFromTree(items: CollectionItem[], itemId: string): CollectionItem[] {
  return items
    .filter(item => item.id !== itemId)
    .map(item => {
      if (isFolder(item)) {
        return {
          ...item,
          children: removeItemFromTree(item.children, itemId),
        };
      }
      return item;
    });
}

/**
 * Update an item in the tree recursively
 */
function updateItemInTree<T extends CollectionItem>(
  items: CollectionItem[],
  itemId: string,
  updater: (item: T) => T
): CollectionItem[] {
  return items.map(item => {
    if (item.id === itemId) {
      return updater(item as T);
    }
    if (isFolder(item)) {
      return {
        ...item,
        children: updateItemInTree(item.children, itemId, updater),
      };
    }
    return item;
  });
}

/**
 * Toggle folder expanded state
 */
function toggleFolderExpandedInTree(items: CollectionItem[], folderId: string): CollectionItem[] {
  return items.map(item => {
    if (item.id === folderId && isFolder(item)) {
      return { ...item, expanded: !item.expanded };
    }
    if (isFolder(item)) {
      return {
        ...item,
        children: toggleFolderExpandedInTree(item.children, folderId),
      };
    }
    return item;
  });
}

/**
 * Get all requests from a collection (flattened, including nested)
 */
export function getAllRequests(items: CollectionItem[]): SavedRequest[] {
  const requests: SavedRequest[] = [];
  for (const item of items) {
    if (isRequest(item)) {
      requests.push(item);
    } else if (isFolder(item)) {
      requests.push(...getAllRequests(item.children));
    }
  }
  return requests;
}

// =====================
// Derived Stores
// =====================

// Derived store for selected collection
export const selectedCollection = derived(
  [collections, selectedCollectionId],
  ([$collections, $selectedCollectionId]) => {
    if (!$selectedCollectionId) return null;
    return $collections.find(c => c.id === $selectedCollectionId) || null;
  }
);

// Derived store for selected request
export const selectedRequest = derived(
  [collections, selectedRequestId],
  ([$collections, $selectedRequestId]) => {
    if (!$selectedRequestId) return null;
    for (const collection of $collections) {
      const item = findItemRecursive(collection.items, $selectedRequestId);
      if (item && isRequest(item)) return item;
    }
    return null;
  }
);

// Derived store for selected folder
export const selectedFolder = derived(
  [collections, selectedFolderId],
  ([$collections, $selectedFolderId]) => {
    if (!$selectedFolderId) return null;
    for (const collection of $collections) {
      const item = findItemRecursive(collection.items, $selectedFolderId);
      if (item && isFolder(item)) return item;
    }
    return null;
  }
);

// =====================
// Store Actions
// =====================

// Initialize collections from extension
export function initCollections(data: Collection[]) {
  collections.set(data);
}

// Add a new collection
export function addCollection(name: string): Collection | null {
  const existing = get(collections);
  if (existing.some(c => c.name.toLowerCase() === name.toLowerCase() && !c.builtin)) {
    return null;
  }
  const newCollection = createCollection(name);
  collections.update(cols => [...cols, newCollection]);

  // Notify extension to persist
  postMessage({
    type: 'saveCollections',
    data: get(collections),
  });

  return newCollection;
}

// Update collection name
export function renameCollection(id: string, name: string) {
  collections.update(cols => cols.map(col => {
    if (col.id === id) {
      return { ...col, name, updatedAt: new Date().toISOString() };
    }
    return col;
  }));

  postMessage({
    type: 'saveCollections',
    data: get(collections),
  });
}

// Delete a collection
export function deleteCollection(id: string) {
  collections.update(cols => cols.filter(col => col.id !== id));

  // Clear selection if deleted collection was selected
  if (get(selectedCollectionId) === id) {
    selectedCollectionId.set(null);
    selectedRequestId.set(null);
    selectedFolderId.set(null);
  }

  postMessage({
    type: 'saveCollections',
    data: get(collections),
  });
}

// Toggle collection expanded state
export function toggleCollectionExpanded(id: string) {
  collections.update(cols => cols.map(col => {
    if (col.id === id) {
      return { ...col, expanded: !col.expanded };
    }
    return col;
  }));
}

// Toggle folder expanded state
export function toggleFolderExpanded(folderId: string) {
  collections.update(cols => cols.map(col => ({
    ...col,
    items: toggleFolderExpandedInTree(col.items, folderId),
  })));
}

// Add folder to collection or parent folder
export function addFolder(collectionId: string, name: string, parentFolderId?: string): Folder {
  const newFolder = createFolder(name);

  collections.update(cols => cols.map(col => {
    if (col.id === collectionId) {
      return {
        ...col,
        items: addItemToContainer(col.items, newFolder, parentFolderId),
        updatedAt: new Date().toISOString(),
      };
    }
    return col;
  }));

  postMessage({
    type: 'saveCollections',
    data: get(collections),
  });

  return newFolder;
}

// Rename a folder
export function renameFolder(folderId: string, name: string) {
  collections.update(cols => cols.map(col => ({
    ...col,
    items: updateItemInTree<Folder>(col.items, folderId, folder => ({
      ...folder,
      name,
      updatedAt: new Date().toISOString(),
    })),
    updatedAt: new Date().toISOString(),
  })));

  postMessage({
    type: 'saveCollections',
    data: get(collections),
  });
}

// Delete a folder (and all its contents)
export function deleteFolder(folderId: string) {
  collections.update(cols => cols.map(col => ({
    ...col,
    items: removeItemFromTree(col.items, folderId),
    updatedAt: new Date().toISOString(),
  })));

  // Clear selection if deleted folder was selected
  if (get(selectedFolderId) === folderId) {
    selectedFolderId.set(null);
  }

  postMessage({
    type: 'saveCollections',
    data: get(collections),
  });
}

// Add request to collection (optionally to a folder)
export function addRequestToCollection(
  collectionId: string,
  request: {
    name: string;
    method: HttpMethod;
    url: string;
    params: KeyValue[];
    headers: KeyValue[];
    auth: AuthState;
    body: BodyState;
  },
  parentFolderId?: string
): SavedRequest {
  const now = new Date().toISOString();
  const newRequest: SavedRequest = {
    type: 'request',
    id: generateId(),
    ...request,
    createdAt: now,
    updatedAt: now,
  };

  collections.update(cols => cols.map(col => {
    if (col.id === collectionId) {
      return {
        ...col,
        items: addItemToContainer(col.items, newRequest, parentFolderId),
        updatedAt: now,
      };
    }
    return col;
  }));

  postMessage({
    type: 'saveCollections',
    data: get(collections),
  });

  return newRequest;
}

// Update an existing request
export function updateRequest(
  requestId: string,
  updates: Partial<Omit<SavedRequest, 'id' | 'createdAt' | 'type'>>
) {
  collections.update(cols => cols.map(col => ({
    ...col,
    items: updateItemInTree<SavedRequest>(col.items, requestId, request => ({
      ...request,
      ...updates,
      updatedAt: new Date().toISOString(),
    })),
    updatedAt: new Date().toISOString(),
  })));

  postMessage({
    type: 'saveCollections',
    data: get(collections),
  });
}

// Delete a request from collection
export function deleteRequest(requestId: string) {
  collections.update(cols => cols.map(col => ({
    ...col,
    items: removeItemFromTree(col.items, requestId),
    updatedAt: new Date().toISOString(),
  })));

  // Clear selection if deleted request was selected
  if (get(selectedRequestId) === requestId) {
    selectedRequestId.set(null);
  }

  postMessage({
    type: 'saveCollections',
    data: get(collections),
  });
}

// Duplicate a request
export function duplicateRequest(requestId: string) {
  const cols = get(collections);

  // Find the request and its collection
  let foundRequest: SavedRequest | null = null;
  let foundCollection: Collection | null = null;

  for (const col of cols) {
    const item = findItemRecursive(col.items, requestId);
    if (item && isRequest(item)) {
      foundRequest = item;
      foundCollection = col;
      break;
    }
  }

  if (!foundRequest || !foundCollection) return;

  const now = new Date().toISOString();
  const duplicate: SavedRequest = {
    ...foundRequest,
    id: generateId(),
    name: `${foundRequest.name} (copy)`,
    createdAt: now,
    updatedAt: now,
  };

  // Add duplicate to the collection root
  collections.update(cols => cols.map(col => {
    if (col.id === foundCollection!.id) {
      return {
        ...col,
        items: [...col.items, duplicate],
        updatedAt: now,
      };
    }
    return col;
  }));

  postMessage({
    type: 'saveCollections',
    data: get(collections),
  });
}

// Move an item to a new location
export function moveItem(
  itemId: string,
  targetCollectionId: string,
  targetFolderId?: string
) {
  const cols = get(collections);

  // Find the item to move
  let itemToMove: CollectionItem | null = null;
  for (const col of cols) {
    const found = findItemRecursive(col.items, itemId);
    if (found) {
      itemToMove = found;
      break;
    }
  }

  if (!itemToMove) return;

  collections.update(cols => {
    // First, remove the item from its current location
    let updatedCols = cols.map(col => ({
      ...col,
      items: removeItemFromTree(col.items, itemId),
      updatedAt: new Date().toISOString(),
    }));

    // Then add it to the new location
    updatedCols = updatedCols.map(col => {
      if (col.id === targetCollectionId) {
        return {
          ...col,
          items: addItemToContainer(col.items, itemToMove!, targetFolderId),
          updatedAt: new Date().toISOString(),
        };
      }
      return col;
    });

    return updatedCols;
  });

  postMessage({
    type: 'saveCollections',
    data: get(collections),
  });
}

// Select a request (and its parent collection)
export function selectRequest(collectionId: string, requestId: string) {
  selectedCollectionId.set(collectionId);
  selectedRequestId.set(requestId);
  selectedFolderId.set(null);
}

// Select a folder
export function selectFolder(collectionId: string, folderId: string) {
  selectedCollectionId.set(collectionId);
  selectedFolderId.set(folderId);
  selectedRequestId.set(null);
}

// Find collection containing a request
export function findCollectionForRequest(requestId: string): Collection | null {
  const cols = get(collections);
  for (const col of cols) {
    const item = findItemRecursive(col.items, requestId);
    if (item && isRequest(item)) {
      return col;
    }
  }
  return null;
}

// Check if a collection is the built-in Recent collection
export function isRecentCollection(collection: Collection): boolean {
  return collection.builtin === 'recent';
}

// Derived store for the Recent collection
export const recentCollection = derived(
  collections,
  ($collections) => $collections.find(c => c.builtin === 'recent') || null
);

// Find collection containing an item (request or folder)
export function findCollectionForItem(itemId: string): Collection | null {
  const cols = get(collections);
  for (const col of cols) {
    const item = findItemRecursive(col.items, itemId);
    if (item) {
      return col;
    }
  }
  return null;
}
