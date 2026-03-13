import type { Collection, Folder, Assertion } from '../types';
import { isRequest } from '../types';
import { getItemPath } from './InheritanceService';

/**
 * Resolve the assertion chain for a request: collection -> folder(s) -> request.
 * Assertions are collected in ancestor order (collection first, request last).
 * If the same assertion ID exists at multiple levels, the deepest level wins.
 */
export function resolveAssertionsForRequest(
  collection: Collection,
  requestId: string
): Assertion[] {
  const ancestors = getItemPath(collection, requestId);
  const allAssertions: Assertion[] = [];

  // Collect assertions from collection and folder ancestors
  for (const ancestor of ancestors) {
    const assertions = getAssertions(ancestor);
    if (assertions && assertions.length > 0) {
      allAssertions.push(...assertions);
    }
  }

  // Find the request itself and add its assertions
  const request = findRequestById(collection, requestId);
  if (request?.assertions && request.assertions.length > 0) {
    allAssertions.push(...request.assertions);
  }

  // Deduplicate: if the same ID appears at multiple levels, keep the last (deepest) one
  const seen = new Map<string, number>();
  for (let i = 0; i < allAssertions.length; i++) {
    seen.set(allAssertions[i].id, i);
  }
  return allAssertions.filter((a, i) => seen.get(a.id) === i);
}

function getAssertions(item: Collection | Folder): Assertion[] | undefined {
  return item.assertions;
}

function findRequestById(collection: Collection, requestId: string): { assertions?: Assertion[] } | undefined {
  function search(items: any[]): any {
    for (const item of items) {
      if (isRequest(item) && item.id === requestId) return item;
      if (item.children) {
        const found = search(item.children);
        if (found) return found;
      }
    }
    return undefined;
  }
  return search(collection.items);
}
