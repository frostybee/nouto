import type { CollectionItem, SavedRequest, Folder, Collection } from '../../services/types';
import { isFolder, isRequest } from '../../services/types';
import { extractPathname } from '@nouto/core';

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

export function deriveNameFromUrl(url: string): string {
  try {
    const path = extractPathname(url);
    // Extract hostname without using new URL() to avoid encoding issues
    const protoEnd = url.indexOf('://');
    let hostname = '';
    if (protoEnd !== -1) {
      const hostStart = protoEnd + 3;
      const hostEnd = url.indexOf('/', hostStart);
      hostname = hostEnd !== -1 ? url.substring(hostStart, hostEnd) : url.substring(hostStart);
    }
    return path !== '/' ? `Request from ${hostname}${path}` : hostname ? `Request from ${hostname}` : 'New Request from URL';
  } catch {
    return 'New Request from URL';
  }
}
