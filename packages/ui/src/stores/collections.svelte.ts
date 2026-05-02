import type { Collection, SavedRequest, CollectionItem, Folder, HttpMethod, KeyValue, AuthState, BodyState, GrpcConfig, ConnectionMode, PathParam, Assertion, AuthInheritance, ScriptInheritance, ScriptConfig, SslConfig, ProxyConfig } from '../types';
import { generateId, createCollection, createFolder, isFolder, isRequest } from '../types';
import { postMessage } from '../lib/vscode';
import { addToTrash, setTrashCollectionAccessors } from './trash.svelte';
import { showNotification } from './notifications.svelte';
import { recentRequests } from './frecency.svelte';

// =====================
// Undo/Redo Change Tracking
// =====================

export type CollectionChangeCallback = (before: Collection[], label: string) => void;

let _onBeforeCollectionChange: CollectionChangeCallback | null = null;
let _suppressCollectionUndoTracking = false;

/** Register a listener called before each collection mutation. */
export function setCollectionChangeListener(cb: CollectionChangeCallback | null) {
  _onBeforeCollectionChange = cb;
}

/** Run a function with collection undo tracking suppressed. */
export function suppressCollectionUndoTracking(fn: () => void) {
  _suppressCollectionUndoTracking = true;
  try { fn(); } finally { _suppressCollectionUndoTracking = false; }
}

function notifyCollectionChange(label: string) {
  if (_suppressCollectionUndoTracking || !_onBeforeCollectionChange) return;
  _onBeforeCollectionChange(
    JSON.parse(JSON.stringify($state.snapshot(_collections.value))),
    label
  );
}

// Private state
const _collections = $state<{ value: Collection[] }>({ value: [] });
const _selectedCollectionId = $state<{ value: string | null }>({ value: null });
const _selectedRequestId = $state<{ value: string | null }>({ value: null });
const _selectedFolderId = $state<{ value: string | null }>({ value: null });

// Getter functions
export function collections() { return _collections.value; }
export function selectedCollectionId() { return _selectedCollectionId.value; }
export function selectedRequestId() { return _selectedRequestId.value; }
export function selectedFolderId() { return _selectedFolderId.value; }

// Direct setters (for tests and internal use)
export function setCollections(cols: Collection[]) { _collections.value = cols; }
export function setSelectedCollectionId(id: string | null) { _selectedCollectionId.value = id; }
export function setSelectedRequestId(id: string | null) { _selectedRequestId.value = id; }
export function setSelectedFolderId(id: string | null) { _selectedFolderId.value = id; }

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
  const cols = _collections.value;
  for (const col of cols) {
    const item = findItemRecursive(col.items, id);
    if (item) {
      return { collection: col, item };
    }
  }
  return null;
}

/**
 * Resolve recent request IDs to full request objects with collection metadata.
 * Skips IDs that no longer exist or belong to the Drafts collection.
 */
export function resolveRecentRequests(limit = 8): Array<{
  request: SavedRequest;
  collectionId: string;
  collectionName: string;
}> {
  return recentRequests()
    .slice(0, limit * 2) // Fetch extra to account for filtered-out items
    .map(id => findItemById(id))
    .filter((result): result is NonNullable<typeof result> =>
      result !== null && result.item.type === 'request' && result.collection.id !== '__drafts__'
    )
    .slice(0, limit)
    .map(({ collection, item }) => ({
      request: item as SavedRequest,
      collectionId: collection.id,
      collectionName: collection.name,
    }));
}

/**
 * Find parent folder or collection of an item
 */
export function findParentContainer(
  collectionId: string,
  itemId: string
): { type: 'collection'; collection: Collection } | { type: 'folder'; folder: Folder; path: string[] } | null {
  const cols = _collections.value;
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

// =====================
// Sorting Helpers
// =====================

const METHOD_ORDER: Record<string, number> = {
  GET: 0, POST: 1, PUT: 2, PATCH: 3, DELETE: 4,
  HEAD: 5, OPTIONS: 6, TRACE: 7,
};

/**
 * Sort collection items (requests and folders) by the given sort order.
 * Folders are always placed before requests. Returns items unchanged for 'manual'.
 */
export function sortItems(items: CollectionItem[], sortOrder: string): CollectionItem[] {
  if (sortOrder === 'manual' || !items.length) return items;

  const folders = items.filter(isFolder);
  const requests = items.filter(isRequest);

  const compareFn = getSortCompareFn(sortOrder);
  folders.sort(compareFn);
  requests.sort(compareFn);

  return [...folders, ...requests];
}

/**
 * Sort top-level collections. Keeps builtin ('drafts') pinned at index 0.
 */
export function sortCollections(cols: Collection[], sortOrder: string): Collection[] {
  if (sortOrder === 'manual' || !cols.length) return cols;

  const pinned = cols.filter(c => c.builtin);
  const sortable = cols.filter(c => !c.builtin);

  const compareFn = getSortCompareFn(sortOrder);
  sortable.sort(compareFn);

  return [...pinned, ...sortable];
}

function getSortCompareFn(sortOrder: string): (a: any, b: any) => number {
  switch (sortOrder) {
    case 'name-asc':
      return (a, b) => (a.name || '').localeCompare(b.name || '');
    case 'name-desc':
      return (a, b) => (b.name || '').localeCompare(a.name || '');
    case 'method':
      return (a, b) => {
        const ma = METHOD_ORDER[a.method?.toUpperCase()] ?? 99;
        const mb = METHOD_ORDER[b.method?.toUpperCase()] ?? 99;
        return ma - mb || (a.name || '').localeCompare(b.name || '');
      };
    case 'created-desc':
      return (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '');
    case 'created-asc':
      return (a, b) => (a.createdAt || '').localeCompare(b.createdAt || '');
    case 'modified-desc':
      return (a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '');
    case 'modified-asc':
      return (a, b) => (a.updatedAt || '').localeCompare(b.updatedAt || '');
    default:
      return () => 0;
  }
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
 * Insert a new item immediately after a target item in the tree (same parent container)
 */
function insertAfterItem(items: CollectionItem[], targetId: string, newItem: CollectionItem): CollectionItem[] {
  // Check if target is at this level
  const idx = items.findIndex(item => item.id === targetId);
  if (idx !== -1) {
    const result = [...items];
    result.splice(idx + 1, 0, newItem);
    return result;
  }

  // Search recursively in folders
  return items.map(item => {
    if (isFolder(item)) {
      return {
        ...item,
        children: insertAfterItem(item.children, targetId, newItem),
      };
    }
    return item;
  });
}

/**
 * Insert a new item immediately before a target item in the tree (same parent container)
 */
function insertBeforeItem(items: CollectionItem[], targetId: string, newItem: CollectionItem): CollectionItem[] {
  const idx = items.findIndex(item => item.id === targetId);
  if (idx !== -1) {
    const result = [...items];
    result.splice(idx, 0, newItem);
    return result;
  }

  return items.map(item => {
    if (isFolder(item)) {
      return {
        ...item,
        children: insertBeforeItem(item.children, targetId, newItem),
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

/** Get all pinned requests across all collections */
export function pinnedRequests(): Array<{ request: SavedRequest; collectionId: string; collectionName: string }> {
  const result: Array<{ request: SavedRequest; collectionId: string; collectionName: string }> = [];
  for (const col of _collections.value) {
    for (const req of getAllRequests(col.items)) {
      if (req.pinned) {
        result.push({ request: req, collectionId: col.id, collectionName: col.name });
      }
    }
  }
  return result;
}

/** Toggle pin state on a request */
export function togglePinRequest(requestId: string) {
  const found = findItemById(requestId);
  if (found && isRequest(found.item)) {
    updateRequest(requestId, { pinned: !found.item.pinned || undefined });
  }
}

// =====================
// Derived Getters
// =====================

// Derived getter for selected collection
export function selectedCollection(): Collection | null {
  const id = _selectedCollectionId.value;
  if (!id) return null;
  return _collections.value.find(c => c.id === id) || null;
}

// Derived getter for selected request
export function selectedRequest(): SavedRequest | null {
  const id = _selectedRequestId.value;
  if (!id) return null;
  for (const collection of _collections.value) {
    const item = findItemRecursive(collection.items, id);
    if (item && isRequest(item)) return item;
  }
  return null;
}

// Derived getter for selected folder
export function selectedFolder(): Folder | null {
  const id = _selectedFolderId.value;
  if (!id) return null;
  for (const collection of _collections.value) {
    const item = findItemRecursive(collection.items, id);
    if (item && isFolder(item)) return item;
  }
  return null;
}

// Derived getter for the Drafts collection
export function draftsCollection(): Collection | null {
  return _collections.value.find(c => c.builtin === 'drafts') || null;
}

// =====================
// Helper: persist collections
// =====================

function persistCollections() {
  postMessage({
    type: 'saveCollections',
    data: $state.snapshot(_collections.value),
  });
}

// =====================
// Store Actions
// =====================

// Initialize collections from extension
export function initCollections(data: Collection[]) {
  // Deduplicate by ID to prevent Svelte keyed {#each} crashes
  const seenIds = new Set<string>();
  for (const col of data) {
    if (seenIds.has(col.id)) {
      col.id = generateId();
      console.warn(`[Nouto] Duplicate collection ID reassigned for "${col.name}"`);
    }
    seenIds.add(col.id);
  }
  _collections.value = data;

  // Wire trash restore accessors (avoids circular import)
  setTrashCollectionAccessors({
    getCollections: () => _collections.value,
    setCollections: (cols) => { _collections.value = cols; },
    persistCollections,
    notifyCollectionChange,
    suppressUndo: suppressCollectionUndoTracking,
  });
}

// Add a new collection
export function addCollection(name: string, color?: string, icon?: string): Collection | null {
  const existing = _collections.value;
  if (existing.some(c => c.name.toLowerCase() === name.toLowerCase() && !c.builtin)) {
    postMessage({
      type: 'showWarning',
      data: { message: `A collection named "${name}" already exists.` },
    });
    return null;
  }
  notifyCollectionChange(`Add collection "${name}"`);
  const newCollection = createCollection(name, color, icon);
  _collections.value = [..._collections.value, newCollection];

  persistCollections();

  return newCollection;
}

// Update collection name
export function renameCollection(id: string, name: string) {
  notifyCollectionChange('Rename collection');
  _collections.value = _collections.value.map(col => {
    if (col.id === id) {
      return { ...col, name, updatedAt: new Date().toISOString() };
    }
    return col;
  });

  persistCollections();
}

// Delete a collection
export function deleteCollection(id: string) {
  const cols = _collections.value;
  const collection = cols.find(c => c.id === id);
  if (!collection) return;
  const colName = collection.name ?? id;
  notifyCollectionChange(`Move collection "${colName}" to trash`);

  // Move to trash before removing
  const colIndex = cols.indexOf(collection);
  addToTrash({
    kind: 'collection',
    originalLocation: {
      collectionId: id,
      collectionName: colName,
      index: colIndex,
    },
    item: JSON.parse(JSON.stringify($state.snapshot(collection))),
  });

  // Collect request IDs from the collection before removing it
  const deletedRequestIds = getAllRequests(collection.items).map(r => r.id);

  _collections.value = _collections.value.filter(col => col.id !== id);

  // Clear selection if deleted collection was selected
  if (_selectedCollectionId.value === id) {
    _selectedCollectionId.value = null;
    _selectedRequestId.value = null;
    _selectedFolderId.value = null;
  }

  persistCollections();

  // Close any open tabs for requests that were in this collection
  if (deletedRequestIds.length > 0) {
    postMessage({
      type: 'closePanelsForRequests',
      data: { requestIds: deletedRequestIds },
    });
  }

  showNotification('info', `Moved "${colName}" to trash. Press Ctrl+Z to undo.`);
}

// Toggle collection expanded state
export function toggleCollectionExpanded(id: string) {
  _collections.value = _collections.value.map(col => {
    if (col.id === id) {
      return { ...col, expanded: !col.expanded };
    }
    return col;
  });
}

// Toggle folder expanded state
export function toggleFolderExpanded(folderId: string) {
  _collections.value = _collections.value.map(col => ({
    ...col,
    items: toggleFolderExpandedInTree(col.items, folderId),
  }));
}

// Set expanded state on all folders recursively
function setAllFoldersExpanded(items: CollectionItem[], expanded: boolean): CollectionItem[] {
  return items.map(item => {
    if (isFolder(item)) {
      return { ...item, expanded, children: setAllFoldersExpanded(item.children, expanded) };
    }
    return item;
  });
}

// Expand all collections and folders
export function expandAllFolders() {
  _collections.value = _collections.value.map(col => ({
    ...col,
    expanded: true,
    items: setAllFoldersExpanded(col.items, true),
  }));
}

// Collapse all collections and folders
export function collapseAllFolders() {
  _collections.value = _collections.value.map(col => ({
    ...col,
    expanded: false,
    items: setAllFoldersExpanded(col.items, false),
  }));
}

// Find ancestor folder IDs for an item within a collection's items
function findAncestorPath(items: CollectionItem[], targetId: string, path: string[] = []): string[] | null {
  for (const item of items) {
    if (item.id === targetId) return path;
    if (isFolder(item)) {
      const found = findAncestorPath(item.children, targetId, [...path, item.id]);
      if (found) return found;
    }
  }
  return null;
}

// Expand only the ancestor folders along the path to the target item
function expandAncestors(items: CollectionItem[], ancestorIds: Set<string>): CollectionItem[] {
  return items.map(item => {
    if (isFolder(item) && ancestorIds.has(item.id)) {
      return { ...item, expanded: true, children: expandAncestors(item.children, ancestorIds) };
    }
    if (isFolder(item)) {
      return { ...item, children: expandAncestors(item.children, ancestorIds) };
    }
    return item;
  });
}

// Reveal the active request in the sidebar by expanding ancestors and scrolling into view
export function revealActiveRequest(overrideRequestId?: string) {
  const requestId = overrideRequestId || _selectedRequestId.value;
  if (!requestId) return;
  // Keep selectedRequestId in sync so future calls without override work
  if (overrideRequestId) _selectedRequestId.value = overrideRequestId;

  const cols = _collections.value;
  for (const col of cols) {
    const ancestorPath = findAncestorPath(col.items, requestId);
    if (ancestorPath !== null) {
      const ancestorIds = new Set(ancestorPath);
      _collections.value = cols.map(c => {
        if (c.id !== col.id) return c;
        return {
          ...c,
          expanded: true,
          items: expandAncestors(c.items, ancestorIds),
        };
      });
      // Scroll into view after DOM updates
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-request-id="${requestId}"]`);
        if (el) {
          el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      });
      return;
    }
  }
}

// Edit collection (name + appearance in one update)
export function editCollection(id: string, name: string, color?: string, icon?: string) {
  notifyCollectionChange('Edit collection');
  _collections.value = _collections.value.map(col => {
    if (col.id === id) {
      const updated = { ...col, name, updatedAt: new Date().toISOString() } as Collection;
      if (color) updated.color = color;
      else delete updated.color;
      if (icon) updated.icon = icon;
      else delete updated.icon;
      return updated;
    }
    return col;
  });

  persistCollections();
}

// Edit folder (name + appearance in one update)
export function editFolder(folderId: string, name: string, color?: string, icon?: string) {
  notifyCollectionChange('Edit folder');
  _collections.value = _collections.value.map(col => ({
    ...col,
    items: updateItemInTree<Folder>(col.items, folderId, folder => {
      const updated = { ...folder, name, updatedAt: new Date().toISOString() } as Folder;
      if (color) updated.color = color;
      else delete updated.color;
      if (icon) updated.icon = icon;
      else delete updated.icon;
      return updated;
    }),
    updatedAt: new Date().toISOString(),
  }));

  persistCollections();
}

// Update collection appearance (color/icon)
export function updateCollectionAppearance(id: string, color?: string, icon?: string) {
  notifyCollectionChange('Update collection appearance');
  _collections.value = _collections.value.map(col => {
    if (col.id === id) {
      const updated = { ...col, updatedAt: new Date().toISOString() } as Collection;
      if (color !== undefined) updated.color = color || undefined;
      else delete updated.color;
      if (icon !== undefined) updated.icon = icon || undefined;
      else delete updated.icon;
      return updated;
    }
    return col;
  });

  persistCollections();
}

// Update folder appearance (color/icon)
export function updateFolderAppearance(folderId: string, color?: string, icon?: string) {
  notifyCollectionChange('Update folder appearance');
  _collections.value = _collections.value.map(col => ({
    ...col,
    items: updateItemInTree<Folder>(col.items, folderId, folder => {
      const updated = { ...folder, updatedAt: new Date().toISOString() } as Folder;
      if (color) updated.color = color;
      else delete updated.color;
      if (icon) updated.icon = icon;
      else delete updated.icon;
      return updated;
    }),
  }));

  persistCollections();
}

// Add folder to collection or parent folder
export function addFolder(collectionId: string, name: string, parentFolderId?: string, color?: string, icon?: string): Folder {
  notifyCollectionChange(`Add folder "${name}"`);
  const newFolder = createFolder(name, color, icon);

  _collections.value = _collections.value.map(col => {
    if (col.id === collectionId) {
      return {
        ...col,
        items: addItemToContainer(col.items, newFolder, parentFolderId),
        updatedAt: new Date().toISOString(),
      };
    }
    return col;
  });

  persistCollections();

  return newFolder;
}

// Rename a folder
export function renameFolder(folderId: string, name: string) {
  notifyCollectionChange('Rename folder');
  _collections.value = _collections.value.map(col => ({
    ...col,
    items: updateItemInTree<Folder>(col.items, folderId, folder => ({
      ...folder,
      name,
      updatedAt: new Date().toISOString(),
    })),
    updatedAt: new Date().toISOString(),
  }));

  persistCollections();
}

// Delete a folder (and all its contents) -- moves to trash
export function deleteFolder(folderId: string) {
  const found = findItemById(folderId);
  if (!found || !isFolder(found.item)) return;
  const folderName = found.item.name;
  notifyCollectionChange(`Move folder "${folderName}" to trash`);

  // Find parent to record original location
  const parent = findParentContainer(found.collection.id, folderId);
  const parentItems = parent?.type === 'folder' ? parent.folder.children : found.collection.items;
  const index = parentItems.findIndex(item => item.id === folderId);

  addToTrash({
    kind: 'folder',
    originalLocation: {
      collectionId: found.collection.id,
      collectionName: found.collection.name,
      parentFolderId: parent?.type === 'folder' ? parent.folder.id : undefined,
      parentFolderName: parent?.type === 'folder' ? parent.folder.name : undefined,
      index: Math.max(0, index),
    },
    item: JSON.parse(JSON.stringify($state.snapshot(found.item))),
  });

  // Collect request IDs from the folder before removing it
  const deletedRequestIds = getAllRequests(found.item.children).map(r => r.id);

  _collections.value = _collections.value.map(col => ({
    ...col,
    items: removeItemFromTree(col.items, folderId),
    updatedAt: new Date().toISOString(),
  }));

  // Clear selection if deleted folder was selected
  if (_selectedFolderId.value === folderId) {
    _selectedFolderId.value = null;
  }

  persistCollections();

  // Close any open tabs for requests that were in this folder
  if (deletedRequestIds.length > 0) {
    postMessage({
      type: 'closePanelsForRequests',
      data: { requestIds: deletedRequestIds },
    });
  }

  showNotification('info', `Moved "${folderName}" to trash. Press Ctrl+Z to undo.`);
}

// Add request to collection (optionally to a folder)
export function addRequestToCollection(
  collectionId: string,
  request: Omit<SavedRequest, 'id' | 'type' | 'createdAt' | 'updatedAt'>,
  parentFolderId?: string
): SavedRequest {
  notifyCollectionChange(`Add request "${request.name}"`);
  const now = new Date().toISOString();
  const newRequest: SavedRequest = {
    type: 'request',
    id: generateId(),
    ...request,
    createdAt: now,
    updatedAt: now,
  };

  _collections.value = _collections.value.map(col => {
    if (col.id === collectionId) {
      return {
        ...col,
        items: addItemToContainer(col.items, newRequest, parentFolderId),
        updatedAt: now,
      };
    }
    return col;
  });

  persistCollections();

  return newRequest;
}

// Update an existing request
export function updateRequest(
  requestId: string,
  updates: Partial<Omit<SavedRequest, 'id' | 'createdAt' | 'type'>>
) {
  notifyCollectionChange('Update request');
  _collections.value = _collections.value.map(col => ({
    ...col,
    items: updateItemInTree<SavedRequest>(col.items, requestId, request => ({
      ...request,
      ...updates,
      updatedAt: new Date().toISOString(),
    })),
    updatedAt: new Date().toISOString(),
  }));

  persistCollections();
}

// Delete a request from collection
export function deleteRequest(requestId: string) {
  const found = findItemById(requestId);
  if (!found) return;
  const reqName = isRequest(found.item) ? found.item.name : requestId;
  notifyCollectionChange(`Move request "${reqName}" to trash`);

  // Find parent to record original location
  const parent = findParentContainer(found.collection.id, requestId);
  const parentItems = parent?.type === 'folder' ? parent.folder.children : found.collection.items;
  const index = parentItems.findIndex(item => item.id === requestId);

  addToTrash({
    kind: 'request',
    originalLocation: {
      collectionId: found.collection.id,
      collectionName: found.collection.name,
      parentFolderId: parent?.type === 'folder' ? parent.folder.id : undefined,
      parentFolderName: parent?.type === 'folder' ? parent.folder.name : undefined,
      index: Math.max(0, index),
    },
    item: JSON.parse(JSON.stringify($state.snapshot(found.item))),
  });

  _collections.value = _collections.value.map(col => ({
    ...col,
    items: removeItemFromTree(col.items, requestId),
    updatedAt: new Date().toISOString(),
  }));

  // Clear selection if deleted request was selected
  if (_selectedRequestId.value === requestId) {
    _selectedRequestId.value = null;
  }

  persistCollections();

  // Close any open tab for the deleted request
  postMessage({
    type: 'closePanelsForRequests',
    data: { requestIds: [requestId] },
  });

  showNotification('info', `Moved "${reqName}" to trash. Press Ctrl+Z to undo.`);
}

// Bulk delete items (requests and/or folders) from a collection -- moves each to trash
export function bulkDelete(itemIds: string[], collectionId: string) {
  const col = _collections.value.find(c => c.id === collectionId);
  if (!col || itemIds.length === 0) return;
  notifyCollectionChange(`Bulk delete ${itemIds.length} item(s)`);

  const allDeletedRequestIds: string[] = [];

  for (const itemId of itemIds) {
    const item = findItemRecursive(col.items, itemId);
    if (!item) continue;

    // Record parent location for trash
    const parent = findParentContainer(collectionId, itemId);
    const parentItems = parent?.type === 'folder' ? parent.folder.children : col.items;
    const index = parentItems.findIndex(i => i.id === itemId);

    addToTrash({
      kind: isFolder(item) ? 'folder' : 'request',
      originalLocation: {
        collectionId: col.id,
        collectionName: col.name,
        parentFolderId: parent?.type === 'folder' ? parent.folder.id : undefined,
        parentFolderName: parent?.type === 'folder' ? parent.folder.name : undefined,
        index: Math.max(0, index),
      },
      item: JSON.parse(JSON.stringify($state.snapshot(item))),
    });

    // Collect request IDs for panel closing
    if (isRequest(item)) {
      allDeletedRequestIds.push(item.id);
    } else if (isFolder(item)) {
      allDeletedRequestIds.push(...getAllRequests(item.children).map(r => r.id));
    }
  }

  // Remove all items from the tree
  _collections.value = _collections.value.map(c => {
    if (c.id !== collectionId) return c;
    let items = c.items;
    for (const itemId of itemIds) {
      items = removeItemFromTree(items, itemId);
    }
    return { ...c, items, updatedAt: new Date().toISOString() };
  });

  persistCollections();

  if (allDeletedRequestIds.length > 0) {
    postMessage({
      type: 'closePanelsForRequests',
      data: { requestIds: allDeletedRequestIds },
    });
  }

  showNotification('info', `Moved ${itemIds.length} item(s) to trash. Press Ctrl+Z to undo.`);
}

// Duplicate a request (placed next to the original in the same folder)
export function duplicateRequest(requestId: string) {
  notifyCollectionChange('Duplicate request');
  const cols = _collections.value;

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

  // Insert duplicate next to the original (same parent container)
  _collections.value = _collections.value.map(col => {
    if (col.id === foundCollection!.id) {
      return {
        ...col,
        items: insertAfterItem(col.items, requestId, duplicate),
        updatedAt: now,
      };
    }
    return col;
  });

  persistCollections();
}

// Move an item to a new location
export function moveItem(
  itemId: string,
  targetCollectionId: string,
  targetFolderId?: string
) {
  notifyCollectionChange('Move item');
  const cols = _collections.value;

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

  // Prevent moving a folder into itself or its own descendants
  if (targetFolderId && isFolder(itemToMove)) {
    if (itemId === targetFolderId) return; // Can't move into self
    // Check if targetFolderId is a descendant of the item being moved
    if (findItemRecursive(itemToMove.children, targetFolderId)) return;
  }

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

  _collections.value = updatedCols;

  persistCollections();
}

/**
 * Move an item to a specific position relative to a target item.
 * position: 'before' inserts before target, 'after' inserts after target,
 * 'inside' adds to the end of the target (folder/collection).
 */
export function moveItemToPosition(
  itemId: string,
  targetId: string,
  targetCollectionId: string,
  position: 'before' | 'after' | 'inside'
) {
  notifyCollectionChange('Move item');
  const cols = _collections.value;

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

  // Prevent moving a folder into itself or its descendants
  if (isFolder(itemToMove)) {
    if (itemId === targetId) return;
    if (position === 'inside' && findItemRecursive(itemToMove.children, targetId)) return;
  }

  // Remove item from current location
  let updatedCols = cols.map(col => ({
    ...col,
    items: removeItemFromTree(col.items, itemId),
    updatedAt: new Date().toISOString(),
  }));

  // Insert at new position
  updatedCols = updatedCols.map(col => {
    if (col.id !== targetCollectionId) return col;

    let newItems: CollectionItem[];
    if (position === 'inside') {
      // Drop inside a folder or collection root; verify target is a folder before using its ID
      const targetItem = targetId !== col.id ? findItemRecursive(col.items, targetId) : null;
      newItems = addItemToContainer(col.items, itemToMove!, targetItem && isFolder(targetItem) ? targetId : undefined);
    } else if (position === 'before') {
      newItems = insertBeforeItem(col.items, targetId, itemToMove!);
    } else {
      newItems = insertAfterItem(col.items, targetId, itemToMove!);
    }

    return {
      ...col,
      items: newItems,
      updatedAt: new Date().toISOString(),
    };
  });

  _collections.value = updatedCols;
  persistCollections();
}

/**
 * Reorder collections in the sidebar.
 * Moves draggedId before or after targetId. Keeps builtin 'drafts' pinned at index 0.
 */
export function reorderCollections(draggedId: string, targetId: string, position: 'before' | 'after') {
  notifyCollectionChange('Reorder collections');
  const cols = _collections.value;
  const draggedIdx = cols.findIndex(c => c.id === draggedId);
  const targetIdx = cols.findIndex(c => c.id === targetId);
  if (draggedIdx === -1 || targetIdx === -1) return;

  // Don't reorder the drafts collection
  if (cols[draggedIdx].builtin === 'drafts') return;

  const updated = [...cols];
  const [moved] = updated.splice(draggedIdx, 1);

  // Find the target index after removal
  const newTargetIdx = updated.findIndex(c => c.id === targetId);
  const insertIdx = position === 'before' ? newTargetIdx : newTargetIdx + 1;

  // Don't insert before drafts (index 0)
  const finalIdx = updated[0]?.builtin === 'drafts' && insertIdx === 0 ? 1 : insertIdx;
  updated.splice(finalIdx, 0, moved);

  _collections.value = updated;
  persistCollections();
}

// Select a request (and its parent collection)
export function selectRequest(collectionId: string, requestId: string) {
  _selectedCollectionId.value = collectionId;
  _selectedRequestId.value = requestId;
  _selectedFolderId.value = null;
}

// Select a folder
export function selectFolder(collectionId: string, folderId: string) {
  _selectedCollectionId.value = collectionId;
  _selectedFolderId.value = folderId;
  _selectedRequestId.value = null;
}

// Find collection containing a request
export function findCollectionForRequest(requestId: string): Collection | null {
  const cols = _collections.value;
  for (const col of cols) {
    const item = findItemRecursive(col.items, requestId);
    if (item && isRequest(item)) {
      return col;
    }
  }
  return null;
}

// Check if a collection is the built-in Drafts collection
export function isDraftsCollection(collection: Collection): boolean {
  return collection.builtin === 'drafts';
}

// Find collection containing an item (request or folder)
export function findCollectionForItem(itemId: string): Collection | null {
  const cols = _collections.value;
  for (const col of cols) {
    const item = findItemRecursive(col.items, itemId);
    if (item) {
      return col;
    }
  }
  return null;
}
