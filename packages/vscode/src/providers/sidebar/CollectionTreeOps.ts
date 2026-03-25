import type { CollectionItem, SavedRequest, Folder, Collection, EnvironmentVariable } from '../../services/types';
import { isFolder, isRequest } from '../../services/types';
import { extractPathname } from '@nouto/core';
export { deriveNameFromUrl } from '@nouto/core';

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function findRequestRecursive(items: CollectionItem[], requestId: string): SavedRequest | null {
  for (const item of items) {
    if (isRequest(item) && item.id === requestId) {
      return item;
    }
    if (isFolder(item)) {
      const found = findRequestRecursive(item.children, requestId);
      if (found) return found;
    }
  }
  return null;
}

export function findRequestInCollection(collection: Collection, requestId: string): SavedRequest | null {
  return findRequestRecursive(collection.items, requestId);
}

export function findRequestAcrossCollections(
  collections: Collection[],
  requestId: string
): { collection: Collection; request: SavedRequest } | null {
  for (const collection of collections) {
    const request = findRequestInCollection(collection, requestId);
    if (request) {
      return { collection, request };
    }
  }
  return null;
}

export function addItemToContainer(
  items: CollectionItem[],
  newItem: CollectionItem,
  targetFolderId?: string
): CollectionItem[] {
  if (!targetFolderId) {
    return [...items, newItem];
  }

  return items.map(item => {
    if (isFolder(item) && item.id === targetFolderId) {
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

export function insertAfterItem(items: CollectionItem[], targetId: string, newItem: CollectionItem): CollectionItem[] {
  const idx = items.findIndex(item => item.id === targetId);
  if (idx !== -1) {
    const result = [...items];
    result.splice(idx + 1, 0, newItem);
    return result;
  }

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

export function removeItemFromTree(items: CollectionItem[], itemId: string): CollectionItem[] {
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

export function duplicateItemsRecursive(items: CollectionItem[]): CollectionItem[] {
  return items.map(item => {
    if (isFolder(item)) {
      return {
        ...item,
        id: generateId(),
        children: duplicateItemsRecursive(item.children),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as Folder;
    } else {
      return {
        ...item,
        id: generateId(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as SavedRequest;
    }
  });
}

export function updateItemInTree<T extends CollectionItem>(
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

export function findFolderRecursive(items: CollectionItem[], folderId: string): Folder | null {
  for (const item of items) {
    if (isFolder(item)) {
      if (item.id === folderId) {
        return item;
      }
      const found = findFolderRecursive(item.children, folderId);
      if (found) return found;
    }
  }
  return null;
}

export function getAllRequestsFromItems(items: CollectionItem[]): SavedRequest[] {
  const requests: SavedRequest[] = [];
  for (const item of items) {
    if (isRequest(item)) {
      requests.push(item);
    } else if (isFolder(item)) {
      requests.push(...getAllRequestsFromItems(item.children));
    }
  }
  return requests;
}

export function countAllItems(items: CollectionItem[]): number {
  let count = 0;
  for (const item of items) {
    if (isFolder(item)) {
      count += countAllItems(item.children);
    } else {
      count++;
    }
  }
  return count;
}

/**
 * Collect all scoped variables for a request by walking the collection/folder hierarchy.
 * Collection variables have lowest priority, then folders top-to-bottom (child overrides parent).
 */
export function collectScopedVariables(collection: Collection, requestId: string): EnvironmentVariable[] {
  const varMap = new Map<string, EnvironmentVariable>();

  // Start with collection-level variables
  if (collection.variables) {
    for (const v of collection.variables) {
      if (v.enabled && v.key) varMap.set(v.key, v);
    }
  }

  // Walk folder hierarchy to find the request and merge folder variables
  const folderPath = findFolderPath(collection.items, requestId);
  if (folderPath) {
    for (const folder of folderPath) {
      if (folder.variables) {
        for (const v of folder.variables) {
          if (v.enabled && v.key) varMap.set(v.key, v);
        }
      }
    }
  }

  return Array.from(varMap.values());
}

function findFolderPath(items: CollectionItem[], targetId: string, path: Folder[] = []): Folder[] | null {
  for (const item of items) {
    if (isRequest(item) && item.id === targetId) return path;
    if (isFolder(item)) {
      const found = findFolderPath(item.children, targetId, [...path, item]);
      if (found) return found;
    }
  }
  return null;
}

