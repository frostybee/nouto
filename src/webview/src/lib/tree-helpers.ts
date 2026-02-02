/**
 * Tree traversal utilities for collections
 */

import type { CollectionItem } from '../types';
import { isFolder, isRequest } from '../types';

/**
 * Recursively count all requests in a collection tree
 */
export function countAllItems(items: CollectionItem[]): number {
  let count = 0;
  for (const item of items) {
    if (isRequest(item)) {
      count++;
    } else if (isFolder(item)) {
      count += countAllItems(item.children);
    }
  }
  return count;
}
