/**
 * Flatten a parsed JSON value into a flat array of nodes for virtual scrolling.
 * Only expanded nodes' children appear in the output.
 */

import { appendPath } from './path-utils';

export interface FlatNode {
  /** Unique identifier, same as path. Used by VirtualList for keying. */
  id: string;
  /** JSONPath, e.g. "$.users[0].name" */
  path: string;
  /** The key within the parent (string for objects, number for arrays, null for root) */
  key: string | number | null;
  /** The raw value at this node */
  value: any;
  /** Discriminated type */
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  /** Nesting depth (root = 0) */
  depth: number;
  /** Whether this node can be expanded (object or array) */
  isExpandable: boolean;
  /** Whether this node is currently expanded */
  isExpanded: boolean;
  /** Number of direct children (for badge display) */
  childCount: number;
  /** Parent's JSONPath */
  parentPath: string;
  /** Whether this is the last child in its parent */
  isLastChild: boolean;
  /** Sentinel: this row is a "Show N more" button, not a real node */
  isShowMore?: boolean;
  /** For show-more rows: how many items remain */
  remaining?: number;
}

/** Default number of array items visible before pagination. Shared with the store. */
export const DEFAULT_PAGE_SIZE = 100;

function getValueType(value: any): FlatNode['type'] {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  switch (typeof value) {
    case 'string': return 'string';
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    default: return typeof value === 'object' ? 'object' : 'string';
  }
}

/**
 * Flatten the JSON tree into a flat array.
 *
 * @param json - The parsed JSON value (root)
 * @param expandedPaths - Set of paths that are currently expanded
 * @param arrayPageMap - Map of array path -> number of visible items (for pagination)
 * @returns Flat array of nodes suitable for virtual scrolling
 */
export function flattenJson(
  json: any,
  expandedPaths: Set<string>,
  arrayPageMap: Map<string, number> = new Map(),
): FlatNode[] {
  const result: FlatNode[] = [];
  flattenNode(json, '$', null, 0, '$', true, expandedPaths, arrayPageMap, result);
  return result;
}

function flattenNode(
  value: any,
  path: string,
  key: string | number | null,
  depth: number,
  parentPath: string,
  isLastChild: boolean,
  expandedPaths: Set<string>,
  arrayPageMap: Map<string, number>,
  result: FlatNode[],
): void {
  const type = getValueType(value);
  const isExpandable = type === 'object' || type === 'array';
  const isExpanded = isExpandable && expandedPaths.has(path);

  let childCount = 0;
  if (type === 'array') {
    childCount = (value as any[]).length;
  } else if (type === 'object') {
    childCount = Object.keys(value).length;
  }

  result.push({
    id: path,
    path,
    key,
    value,
    type,
    depth,
    isExpandable,
    isExpanded,
    childCount,
    parentPath,
    isLastChild,
  });

  if (!isExpanded) return;

  if (type === 'array') {
    const arr = value as any[];
    const pageSize = arrayPageMap.get(path) ?? DEFAULT_PAGE_SIZE;
    const visibleCount = Math.min(pageSize, arr.length);

    for (let i = 0; i < visibleCount; i++) {
      const childPath = appendPath(path, i);
      const isLast = i === visibleCount - 1 && visibleCount === arr.length;
      flattenNode(arr[i], childPath, i, depth + 1, path, isLast, expandedPaths, arrayPageMap, result);
    }

    if (visibleCount < arr.length) {
      result.push({
        id: `${path}.__showMore__`,
        path: `${path}.__showMore__`,
        key: null,
        value: null,
        type: 'null',
        depth: depth + 1,
        isExpandable: false,
        isExpanded: false,
        childCount: 0,
        parentPath: path,
        isLastChild: true,
        isShowMore: true,
        remaining: arr.length - visibleCount,
      });
    }
  } else if (type === 'object') {
    const entries = Object.entries(value);
    for (let i = 0; i < entries.length; i++) {
      const [childKey, childValue] = entries[i];
      const childPath = appendPath(path, childKey);
      flattenNode(childValue, childPath, childKey, depth + 1, path, i === entries.length - 1, expandedPaths, arrayPageMap, result);
    }
  }
}
