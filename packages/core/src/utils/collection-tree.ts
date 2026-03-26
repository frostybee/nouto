import type { CollectionItem, SavedRequest, Folder, Collection, EnvironmentVariable } from '../types';
import { isFolder, isRequest } from '../types';

/**
 * Recursively find a request by ID within a collection item tree.
 */
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

/**
 * Find a request by ID within a single collection.
 */
export function findRequestInCollection(collection: Collection, requestId: string): SavedRequest | null {
  return findRequestRecursive(collection.items, requestId);
}

/**
 * Find a request by ID across multiple collections.
 */
export function findRequestAcrossCollections(
  collections: Collection[],
  requestId: string,
): { collection: Collection; request: SavedRequest } | null {
  for (const collection of collections) {
    const request = findRequestInCollection(collection, requestId);
    if (request) {
      return { collection, request };
    }
  }
  return null;
}

/**
 * Recursively find a folder by ID within a collection item tree.
 */
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

/**
 * Recursively find a folder by name within a collection item tree.
 */
export function findFolderByName(items: CollectionItem[], name: string): Folder | null {
  for (const item of items) {
    if (isFolder(item)) {
      if (item.name === name) {
        return item;
      }
      const found = findFolderByName(item.children, name);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Recursively extract all requests from a collection item tree.
 */
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

/**
 * Count all request items in a collection item tree.
 */
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

  if (collection.variables) {
    for (const v of collection.variables) {
      if (v.enabled && v.key) varMap.set(v.key, v);
    }
  }

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
