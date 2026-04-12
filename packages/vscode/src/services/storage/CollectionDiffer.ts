import * as path from 'path';
import type { Collection, CollectionItem, SavedRequest, Folder } from '../types';
import { isFolder } from '../types';
import { sanitizeFilename, resolveCollision } from './filename-utils';

// ── Types ────────────────────────────────────────────────────────────

export type WriteOp =
  | { type: 'write'; path: string; content: string }
  | { type: 'mkdir'; path: string }
  | { type: 'rmFile'; path: string }
  | { type: 'rmDir'; path: string };

export interface CachedItem {
  type: 'request' | 'folder';
  id: string;
  fileName: string;       // sanitized name on disk (no .json extension for requests)
  contentJson: string;    // serialized JSON that was written to disk
  // Folders only:
  orderJson?: string;
  children?: Map<string, CachedItem>;
}

export interface CachedCollection {
  id: string;
  dirName: string;        // sanitized directory name on disk
  metaJson: string;       // serialized _collection.json content
  orderJson: string;      // serialized _order.json content
  items: Map<string, CachedItem>;  // keyed by item ID
}

export type CollectionCache = Map<string, CachedCollection>;

const COLLECTION_META = '_collection.json';
const FOLDER_META = '_folder.json';
const ORDER_FILE = '_order.json';

// ── Serialization helpers (must match PerRequestStorageStrategy output) ──

function serializeCollectionMeta(collection: Collection): string {
  const meta = {
    id: collection.id,
    name: collection.name,
    expanded: collection.expanded,
    auth: collection.auth,
    headers: collection.headers,
    variables: collection.variables,
    scripts: collection.scripts,
    description: collection.description,
    color: collection.color,
    icon: collection.icon,
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
  };
  return JSON.stringify(meta, null, 2);
}

function serializeFolderMeta(folder: Folder): string {
  const meta = {
    id: folder.id,
    name: folder.name,
    expanded: folder.expanded,
    auth: folder.auth,
    headers: folder.headers,
    variables: folder.variables,
    authInheritance: folder.authInheritance,
    scripts: folder.scripts,
    description: folder.description,
    color: folder.color,
    icon: folder.icon,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
  };
  return JSON.stringify(meta, null, 2);
}

function serializeRequest(request: SavedRequest): string {
  const { type, ...data } = request;
  return JSON.stringify(data, null, 2);
}

function serializeOrder(refs: string[]): string {
  return JSON.stringify(refs, null, 2);
}

// ── Cache building ──────────────────────────────────────────────────

function buildItemsCache(
  items: CollectionItem[],
  usedNames: Set<string>,
): { cache: Map<string, CachedItem>; orderRefs: string[] } {
  const cache = new Map<string, CachedItem>();
  const orderRefs: string[] = [];

  for (const item of items) {
    if (isFolder(item)) {
      const safeName = sanitizeFilename(item.name);
      const dirName = resolveCollision(safeName, usedNames);
      usedNames.add(dirName);
      orderRefs.push(dirName);

      const childUsedNames = new Set<string>();
      const childResult = buildItemsCache(item.children, childUsedNames);

      cache.set(item.id, {
        type: 'folder',
        id: item.id,
        fileName: dirName,
        contentJson: serializeFolderMeta(item),
        orderJson: serializeOrder(childResult.orderRefs),
        children: childResult.cache,
      });
    } else {
      const request = item as SavedRequest;
      const safeName = sanitizeFilename(request.name);
      const fileName = resolveCollision(safeName, usedNames);
      usedNames.add(fileName);
      orderRefs.push(fileName);

      cache.set(request.id, {
        type: 'request',
        id: request.id,
        fileName,
        contentJson: serializeRequest(request),
      });
    }
  }

  return { cache, orderRefs };
}

export function buildCache(collections: Collection[]): CollectionCache {
  const cache: CollectionCache = new Map();
  const usedCollectionNames = new Set<string>();

  for (const collection of collections) {
    const safeName = sanitizeFilename(collection.name);
    const dirName = resolveCollision(safeName, usedCollectionNames);
    usedCollectionNames.add(dirName);

    const usedNames = new Set<string>();
    const { cache: itemsCache, orderRefs } = buildItemsCache(collection.items, usedNames);

    cache.set(collection.id, {
      id: collection.id,
      dirName,
      metaJson: serializeCollectionMeta(collection),
      orderJson: serializeOrder(orderRefs),
      items: itemsCache,
    });
  }

  return cache;
}

// ── Diff algorithm ──────────────────────────────────────────────────

function diffItems(
  oldItems: Map<string, CachedItem>,
  newItems: CollectionItem[],
  dirPath: string,
  usedNames: Set<string>,
  ops: WriteOp[],
): { orderRefs: string[]; orderChanged: boolean; newItemsCache: Map<string, CachedItem> } {
  const newItemsCache = new Map<string, CachedItem>();
  const orderRefs: string[] = [];
  let orderChanged = false;

  // Build old order for comparison
  const oldOrderRefs: string[] = [];
  for (const oldItem of oldItems.values()) {
    oldOrderRefs.push(oldItem.fileName);
  }

  // Track which old items are still present (for deletion detection)
  const remainingOldIds = new Set(oldItems.keys());

  for (const item of newItems) {
    if (isFolder(item)) {
      const safeName = sanitizeFilename(item.name);
      const dirName = resolveCollision(safeName, usedNames);
      usedNames.add(dirName);
      orderRefs.push(dirName);

      const oldItem = oldItems.get(item.id);
      remainingOldIds.delete(item.id);
      const folderPath = path.join(dirPath, dirName);

      if (!oldItem) {
        // New folder: full write
        ops.push({ type: 'mkdir', path: folderPath });
        ops.push({ type: 'write', path: path.join(folderPath, FOLDER_META), content: serializeFolderMeta(item) });
        const childUsedNames = new Set<string>();
        const childResult = diffNewItems(item.children, folderPath, childUsedNames, ops);
        ops.push({ type: 'write', path: path.join(folderPath, ORDER_FILE), content: serializeOrder(childResult.orderRefs) });
        orderChanged = true;

        newItemsCache.set(item.id, {
          type: 'folder',
          id: item.id,
          fileName: dirName,
          contentJson: serializeFolderMeta(item),
          orderJson: serializeOrder(childResult.orderRefs),
          children: childResult.cache,
        });
      } else {
        // Existing folder
        const renamed = oldItem.fileName !== dirName;
        if (renamed) {
          // Delete old directory, write new one
          ops.push({ type: 'rmDir', path: path.join(dirPath, oldItem.fileName) });
          ops.push({ type: 'mkdir', path: folderPath });
          ops.push({ type: 'write', path: path.join(folderPath, FOLDER_META), content: serializeFolderMeta(item) });
          const childUsedNames = new Set<string>();
          const childResult = diffNewItems(item.children, folderPath, childUsedNames, ops);
          ops.push({ type: 'write', path: path.join(folderPath, ORDER_FILE), content: serializeOrder(childResult.orderRefs) });
          orderChanged = true;

          newItemsCache.set(item.id, {
            type: 'folder',
            id: item.id,
            fileName: dirName,
            contentJson: serializeFolderMeta(item),
            orderJson: serializeOrder(childResult.orderRefs),
            children: childResult.cache,
          });
        } else {
          // Same directory name: diff contents
          const newMetaJson = serializeFolderMeta(item);
          if (newMetaJson !== oldItem.contentJson) {
            ops.push({ type: 'write', path: path.join(folderPath, FOLDER_META), content: newMetaJson });
          }

          // Recurse into children
          const childUsedNames = new Set<string>();
          const childResult = diffItems(
            oldItem.children || new Map(),
            item.children,
            folderPath,
            childUsedNames,
            ops,
          );

          const newOrderJson = serializeOrder(childResult.orderRefs);
          if (childResult.orderChanged || newOrderJson !== (oldItem.orderJson || '[]')) {
            ops.push({ type: 'write', path: path.join(folderPath, ORDER_FILE), content: newOrderJson });
          }

          newItemsCache.set(item.id, {
            type: 'folder',
            id: item.id,
            fileName: dirName,
            contentJson: newMetaJson,
            orderJson: newOrderJson,
            children: childResult.newItemsCache,
          });
        }
      }
    } else {
      // Request
      const request = item as SavedRequest;
      const safeName = sanitizeFilename(request.name);
      const fileName = resolveCollision(safeName, usedNames);
      usedNames.add(fileName);
      orderRefs.push(fileName);

      const oldItem = oldItems.get(request.id);
      remainingOldIds.delete(request.id);

      const newContentJson = serializeRequest(request);

      if (!oldItem) {
        // New request
        ops.push({ type: 'write', path: path.join(dirPath, `${fileName}.json`), content: newContentJson });
        orderChanged = true;
      } else {
        const renamed = oldItem.fileName !== fileName;
        if (renamed) {
          // Delete old file, write new
          ops.push({ type: 'rmFile', path: path.join(dirPath, `${oldItem.fileName}.json`) });
          ops.push({ type: 'write', path: path.join(dirPath, `${fileName}.json`), content: newContentJson });
          orderChanged = true;
        } else if (newContentJson !== oldItem.contentJson) {
          // Content changed
          ops.push({ type: 'write', path: path.join(dirPath, `${fileName}.json`), content: newContentJson });
        }
      }

      newItemsCache.set(request.id, {
        type: 'request',
        id: request.id,
        fileName,
        contentJson: newContentJson,
      });
    }
  }

  // Delete removed items
  for (const removedId of remainingOldIds) {
    const oldItem = oldItems.get(removedId)!;
    if (oldItem.type === 'folder') {
      ops.push({ type: 'rmDir', path: path.join(dirPath, oldItem.fileName) });
    } else {
      ops.push({ type: 'rmFile', path: path.join(dirPath, `${oldItem.fileName}.json`) });
    }
    orderChanged = true;
  }

  // Check if order changed (even if no adds/deletes, items may have been reordered)
  if (!orderChanged) {
    const oldOrderStr = oldOrderRefs.join('\0');
    const newOrderStr = orderRefs.join('\0');
    if (oldOrderStr !== newOrderStr) {
      orderChanged = true;
    }
  }

  return { orderRefs, orderChanged, newItemsCache };
}

/**
 * Write all items as new (used when a folder/collection is being created fresh).
 */
function diffNewItems(
  items: CollectionItem[],
  dirPath: string,
  usedNames: Set<string>,
  ops: WriteOp[],
): { orderRefs: string[]; cache: Map<string, CachedItem> } {
  const cache = new Map<string, CachedItem>();
  const orderRefs: string[] = [];

  for (const item of items) {
    if (isFolder(item)) {
      const safeName = sanitizeFilename(item.name);
      const dirName = resolveCollision(safeName, usedNames);
      usedNames.add(dirName);
      orderRefs.push(dirName);

      const folderPath = path.join(dirPath, dirName);
      ops.push({ type: 'mkdir', path: folderPath });
      ops.push({ type: 'write', path: path.join(folderPath, FOLDER_META), content: serializeFolderMeta(item) });

      const childUsedNames = new Set<string>();
      const childResult = diffNewItems(item.children, folderPath, childUsedNames, ops);
      ops.push({ type: 'write', path: path.join(folderPath, ORDER_FILE), content: serializeOrder(childResult.orderRefs) });

      cache.set(item.id, {
        type: 'folder',
        id: item.id,
        fileName: dirName,
        contentJson: serializeFolderMeta(item),
        orderJson: serializeOrder(childResult.orderRefs),
        children: childResult.cache,
      });
    } else {
      const request = item as SavedRequest;
      const safeName = sanitizeFilename(request.name);
      const fileName = resolveCollision(safeName, usedNames);
      usedNames.add(fileName);
      orderRefs.push(fileName);

      const contentJson = serializeRequest(request);
      ops.push({ type: 'write', path: path.join(dirPath, `${fileName}.json`), content: contentJson });

      cache.set(request.id, {
        type: 'request',
        id: request.id,
        fileName,
        contentJson,
      });
    }
  }

  return { orderRefs, cache };
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Compute the minimal set of file operations to bring the disk from the
 * cached state to the incoming state.
 */
export function diffCollections(
  cached: CollectionCache,
  incoming: Collection[],
  collectionsDir: string,
): { ops: WriteOp[]; newCache: CollectionCache } {
  const ops: WriteOp[] = [];
  const newCache: CollectionCache = new Map();

  const usedCollectionNames = new Set<string>();
  const remainingOldIds = new Set(cached.keys());

  for (const collection of incoming) {
    const safeName = sanitizeFilename(collection.name);
    const dirName = resolveCollision(safeName, usedCollectionNames);
    usedCollectionNames.add(dirName);

    const oldCol = cached.get(collection.id);
    remainingOldIds.delete(collection.id);
    const colPath = path.join(collectionsDir, dirName);

    if (!oldCol) {
      // New collection: full write
      ops.push({ type: 'mkdir', path: colPath });
      ops.push({ type: 'write', path: path.join(colPath, COLLECTION_META), content: serializeCollectionMeta(collection) });

      const usedNames = new Set<string>();
      const result = diffNewItems(collection.items, colPath, usedNames, ops);
      ops.push({ type: 'write', path: path.join(colPath, ORDER_FILE), content: serializeOrder(result.orderRefs) });

      newCache.set(collection.id, {
        id: collection.id,
        dirName,
        metaJson: serializeCollectionMeta(collection),
        orderJson: serializeOrder(result.orderRefs),
        items: result.cache,
      });
    } else {
      // Existing collection
      const renamed = oldCol.dirName !== dirName;

      if (renamed) {
        // Directory name changed: delete old, write everything fresh
        ops.push({ type: 'rmDir', path: path.join(collectionsDir, oldCol.dirName) });
        ops.push({ type: 'mkdir', path: colPath });
        ops.push({ type: 'write', path: path.join(colPath, COLLECTION_META), content: serializeCollectionMeta(collection) });

        const usedNames = new Set<string>();
        const result = diffNewItems(collection.items, colPath, usedNames, ops);
        ops.push({ type: 'write', path: path.join(colPath, ORDER_FILE), content: serializeOrder(result.orderRefs) });

        newCache.set(collection.id, {
          id: collection.id,
          dirName,
          metaJson: serializeCollectionMeta(collection),
          orderJson: serializeOrder(result.orderRefs),
          items: result.cache,
        });
      } else {
        // Same directory: diff contents
        const newMetaJson = serializeCollectionMeta(collection);
        if (newMetaJson !== oldCol.metaJson) {
          ops.push({ type: 'write', path: path.join(colPath, COLLECTION_META), content: newMetaJson });
        }

        const usedNames = new Set<string>();
        const itemsResult = diffItems(oldCol.items, collection.items, colPath, usedNames, ops);

        const newOrderJson = serializeOrder(itemsResult.orderRefs);
        if (itemsResult.orderChanged || newOrderJson !== oldCol.orderJson) {
          ops.push({ type: 'write', path: path.join(colPath, ORDER_FILE), content: newOrderJson });
        }

        newCache.set(collection.id, {
          id: collection.id,
          dirName,
          metaJson: newMetaJson,
          orderJson: newOrderJson,
          items: itemsResult.newItemsCache,
        });
      }
    }
  }

  // Delete removed collections
  for (const removedId of remainingOldIds) {
    const oldCol = cached.get(removedId)!;
    ops.push({ type: 'rmDir', path: path.join(collectionsDir, oldCol.dirName) });
  }

  return { ops, newCache };
}
