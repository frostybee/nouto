import type { CollectionItem, SavedRequest } from '@nouto/core';
import { isFolder, isRequest } from '@nouto/core';

/** Flatten a collection tree into its requests, depth-first. */
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
