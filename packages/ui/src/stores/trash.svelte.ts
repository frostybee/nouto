import type { TrashItem, TrashItemKind, Collection, Folder, SavedRequest, CollectionItem } from '../types';
import { generateId, isFolder, isRequest } from '../types';
import { postMessage } from '../lib/vscode';
import { findFolderRecursive } from '@nouto/core/utils/collection-tree';

const TRASH_MAX_ITEMS = 100;
const TRASH_AUTO_PURGE_DAYS = 30;

// Lazy import to avoid circular dependency with collections store
let _getCollections: (() => Collection[]) | null = null;
let _setCollections: ((cols: Collection[]) => void) | null = null;
let _persistCollections: (() => void) | null = null;
let _notifyCollectionChange: ((label: string) => void) | null = null;
let _suppressUndo: ((fn: () => void) => void) | null = null;

export function setTrashCollectionAccessors(accessors: {
  getCollections: () => Collection[];
  setCollections: (cols: Collection[]) => void;
  persistCollections: () => void;
  notifyCollectionChange: (label: string) => void;
  suppressUndo: (fn: () => void) => void;
}): void {
  _getCollections = accessors.getCollections;
  _setCollections = accessors.setCollections;
  _persistCollections = accessors.persistCollections;
  _notifyCollectionChange = accessors.notifyCollectionChange;
  _suppressUndo = accessors.suppressUndo;
}

// --- State ---

const _trashItems = $state<{ value: TrashItem[] }>({ value: [] });

// --- Getters ---

export function trashItems(): TrashItem[] { return _trashItems.value; }
export function trashCount(): number { return _trashItems.value.length; }

export function trashItemsSorted(): TrashItem[] {
  return [..._trashItems.value].sort(
    (a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime(),
  );
}

// --- Init ---

export function initTrash(items: TrashItem[]): void {
  _trashItems.value = items || [];
}

// --- Actions ---

export function addToTrash(entry: {
  kind: TrashItemKind;
  originalLocation: TrashItem['originalLocation'];
  item: Collection | Folder | SavedRequest;
}): void {
  const trashItem: TrashItem = {
    id: generateId(),
    kind: entry.kind,
    deletedAt: new Date().toISOString(),
    originalLocation: entry.originalLocation,
    item: entry.item,
  };

  _trashItems.value = [trashItem, ..._trashItems.value];

  // Enforce max size
  if (_trashItems.value.length > TRASH_MAX_ITEMS) {
    _trashItems.value = _trashItems.value.slice(0, TRASH_MAX_ITEMS);
  }

  persistTrash();
}

export function removeFromTrash(trashItemId: string): void {
  _trashItems.value = _trashItems.value.filter(t => t.id !== trashItemId);
  persistTrash();
}

export function permanentlyDeleteFromTrash(trashItemId: string): void {
  removeFromTrash(trashItemId);
}

/**
 * Restore an item from trash back to its original location in collections.
 * Falls back to the Drafts collection if the original location no longer exists.
 */
export function restoreFromTrash(trashItemId: string): boolean {
  if (!_getCollections || !_setCollections || !_persistCollections || !_notifyCollectionChange || !_suppressUndo) {
    return false;
  }

  const trashItem = _trashItems.value.find(t => t.id === trashItemId);
  if (!trashItem) return false;

  const cols = _getCollections();
  const loc = trashItem.originalLocation;

  _notifyCollectionChange(`Restore "${trashItem.item.name}" from trash`);

  if (trashItem.kind === 'collection') {
    // Restore whole collection
    _suppressUndo(() => {
      _setCollections!([...cols, trashItem.item as Collection]);
    });
  } else {
    // Restore request or folder to original location
    let targetCol = cols.find(c => c.id === loc.collectionId);
    if (!targetCol) {
      // Original collection gone, restore to Drafts
      targetCol = cols.find(c => (c as any).builtin === 'drafts');
    }

    if (targetCol) {
      _suppressUndo(() => {
        if (loc.parentFolderId && targetCol) {
          const folder = findFolderRecursive(targetCol.items, loc.parentFolderId);
          if (folder) {
            const idx = Math.min(loc.index, folder.children.length);
            folder.children.splice(idx, 0, trashItem.item as CollectionItem);
          } else {
            targetCol.items.push(trashItem.item as CollectionItem);
          }
        } else if (targetCol) {
          const idx = Math.min(loc.index, targetCol.items.length);
          targetCol.items.splice(idx, 0, trashItem.item as CollectionItem);
        }
        _setCollections!(cols);
      });
    }
  }

  _persistCollections();

  // Remove from trash
  _trashItems.value = _trashItems.value.filter(t => t.id !== trashItemId);
  persistTrash();

  return true;
}

export function emptyTrash(): void {
  _trashItems.value = [];
  persistTrash();
}

/**
 * Auto-purge items older than 30 days. Returns the count of purged items.
 */
export function autoPurgeTrash(): number {
  const cutoff = Date.now() - TRASH_AUTO_PURGE_DAYS * 24 * 60 * 60 * 1000;
  const before = _trashItems.value.length;
  _trashItems.value = _trashItems.value.filter(
    item => new Date(item.deletedAt).getTime() > cutoff,
  );
  const purged = before - _trashItems.value.length;
  if (purged > 0) persistTrash();
  return purged;
}

/**
 * Remove trash entries whose original item ID now exists in collections
 * (e.g., after undo restores the item).
 */
export function reconcileTrash(collections: Collection[]): void {
  const existingIds = new Set<string>();
  function collectIds(items: CollectionItem[]) {
    for (const item of items) {
      existingIds.add(item.id);
      if (isFolder(item)) collectIds(item.children);
    }
  }
  for (const col of collections) {
    existingIds.add(col.id);
    collectIds(col.items);
  }

  const before = _trashItems.value.length;
  _trashItems.value = _trashItems.value.filter(t => !existingIds.has(t.item.id));
  if (_trashItems.value.length < before) persistTrash();
}

// --- Persistence ---

function persistTrash(): void {
  postMessage({
    type: 'saveTrash',
    data: $state.snapshot(_trashItems.value),
  } as any);
}
