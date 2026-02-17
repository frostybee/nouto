import type { Collection, CollectionItem, Folder, SavedRequest, AuthState, KeyValue, EnvironmentVariable } from '../types';
import { isFolder, isRequest } from '../types';

/**
 * Get the ancestor chain from collection root to the target item.
 * Returns array of [Collection, ...Folder[]] representing the path.
 */
export function getItemPath(collection: Collection, itemId: string): (Collection | Folder)[] {
  const path: (Collection | Folder)[] = [collection];

  function search(items: CollectionItem[], currentPath: Folder[]): Folder[] | null {
    for (const item of items) {
      if (item.id === itemId) {
        return currentPath;
      }
      if (isFolder(item)) {
        const result = search(item.children, [...currentPath, item]);
        if (result) return result;
      }
    }
    return null;
  }

  const folderPath = search(collection.items, []);
  if (folderPath) {
    path.push(...folderPath);
  }
  return path;
}

/**
 * Resolve effective auth for a request by walking the ancestor chain bottom-up.
 * - `undefined` or `'own'` authInheritance: use the request's own auth
 * - `'none'`: no auth (stops inheritance chain)
 * - `'inherit'`: walk up to parent folder/collection
 */
export function resolveAuthForRequest(
  collection: Collection,
  ancestors: (Collection | Folder)[],
  request: SavedRequest
): { auth: AuthState; inheritedFrom?: string } {
  // If request doesn't explicitly inherit, use its own auth
  if (!request.authInheritance || request.authInheritance === 'own') {
    return { auth: request.auth };
  }

  // 'none' means explicitly no auth
  if (request.authInheritance === 'none') {
    return { auth: { type: 'none' } };
  }

  // 'inherit': walk ancestors bottom-up (skip the collection itself at index 0)
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const ancestor = ancestors[i];

    if (isAncestorFolder(ancestor)) {
      // Folder: check its own inheritance mode
      if (ancestor.authInheritance === 'none') {
        return { auth: { type: 'none' } };
      }
      if (ancestor.auth && (!ancestor.authInheritance || ancestor.authInheritance === 'own')) {
        return { auth: ancestor.auth, inheritedFrom: ancestor.name };
      }
      // If folder inherits too, keep walking up
    } else {
      // Collection: top of the chain
      if (ancestor.auth) {
        return { auth: ancestor.auth, inheritedFrom: ancestor.name };
      }
    }
  }

  // Nothing found in chain, fall back to no auth
  return { auth: { type: 'none' } };
}

/**
 * Resolve effective headers by merging from collection → folders → request.
 * Child headers override parent headers by key (case-insensitive).
 */
export function resolveHeadersForRequest(
  collection: Collection,
  ancestors: (Collection | Folder)[],
  request: SavedRequest
): KeyValue[] {
  const headerMap = new Map<string, KeyValue>();

  // Start with collection headers
  if (collection.headers) {
    for (const h of collection.headers) {
      headerMap.set(h.key.toLowerCase(), h);
    }
  }

  // Apply folder headers in order (top to bottom)
  for (let i = 1; i < ancestors.length; i++) {
    const ancestor = ancestors[i];
    if (isAncestorFolder(ancestor) && ancestor.headers) {
      for (const h of ancestor.headers) {
        headerMap.set(h.key.toLowerCase(), h);
      }
    }
  }

  // Apply request's own headers (always override)
  for (const h of request.headers) {
    headerMap.set(h.key.toLowerCase(), h);
  }

  return Array.from(headerMap.values());
}

/**
 * Resolve scoped variables by merging from collection → folders (top to bottom).
 * Child key overrides parent key (case-sensitive). Only enabled entries included.
 */
export function resolveVariablesForRequest(
  collection: Collection,
  ancestors: (Collection | Folder)[]
): EnvironmentVariable[] {
  const varMap = new Map<string, EnvironmentVariable>();

  // Start with collection variables
  if (collection.variables) {
    for (const v of collection.variables) {
      if (v.enabled && v.key) {
        varMap.set(v.key, v);
      }
    }
  }

  // Apply folder variables in order (top to bottom, child overrides parent)
  for (let i = 1; i < ancestors.length; i++) {
    const ancestor = ancestors[i];
    if (isAncestorFolder(ancestor) && ancestor.variables) {
      for (const v of ancestor.variables) {
        if (v.enabled && v.key) {
          varMap.set(v.key, v);
        }
      }
    }
  }

  return Array.from(varMap.values());
}

/**
 * Convenience: resolve auth, headers, and variables for a request by ID.
 */
export function resolveRequestWithInheritance(
  collection: Collection,
  requestId: string
): { auth: AuthState; headers: KeyValue[]; variables: EnvironmentVariable[]; inheritedFrom?: string } | null {
  const request = findRequestInCollection(collection, requestId);
  if (!request) return null;

  const ancestors = getItemPath(collection, requestId);
  const { auth, inheritedFrom } = resolveAuthForRequest(collection, ancestors, request);
  const headers = resolveHeadersForRequest(collection, ancestors, request);
  const variables = resolveVariablesForRequest(collection, ancestors);

  return { auth, headers, variables, inheritedFrom };
}

// Helper to check if an ancestor is a Folder (not Collection)
function isAncestorFolder(ancestor: Collection | Folder): ancestor is Folder {
  return 'type' in ancestor && (ancestor as Folder).type === 'folder';
}

// Helper to find a request within a collection recursively
function findRequestInCollection(collection: Collection, requestId: string): SavedRequest | null {
  function search(items: CollectionItem[]): SavedRequest | null {
    for (const item of items) {
      if (isRequest(item) && item.id === requestId) {
        return item;
      }
      if (isFolder(item)) {
        const found = search(item.children);
        if (found) return found;
      }
    }
    return null;
  }
  return search(collection.items);
}
