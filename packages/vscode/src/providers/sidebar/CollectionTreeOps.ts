import type { CollectionItem, SavedRequest, Folder, Collection, EnvironmentVariable } from '../../services/types';
import { isFolder, isRequest } from '../../services/types';
import { extractPathname, generateId } from '@nouto/core';
export { deriveNameFromUrl, generateId } from '@nouto/core';

// Re-export pure tree traversal functions from @nouto/core
export {
  findRequestRecursive,
  findRequestInCollection,
  findRequestAcrossCollections,
  findFolderRecursive,
  findFolderByName,
  getAllRequestsFromItems,
  countAllItems,
  collectScopedVariables,
} from '@nouto/core/services';


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



