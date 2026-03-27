/**
 * Search utility for the JSON Explorer.
 * Searches keys and/or values in a parsed JSON tree.
 */

import { appendPath } from './path-utils';

export interface SearchOptions {
  regex: boolean;
  caseSensitive: boolean;
  scope: 'all' | 'keys' | 'values';
}

export interface SearchMatch {
  /** JSONPath to the matching node */
  path: string;
  /** Whether the match is in the key or the value */
  matchIn: 'key' | 'value';
  /** The text that matched */
  matchText: string;
}

/**
 * Search the JSON tree for matching keys/values.
 */
export function searchJson(
  json: any,
  query: string,
  options: SearchOptions,
): SearchMatch[] {
  if (!query) return [];

  const results: SearchMatch[] = [];
  let matcher: (text: string) => boolean;

  if (options.regex) {
    try {
      const flags = options.caseSensitive ? '' : 'i';
      const re = new RegExp(query, flags);
      matcher = (text) => re.test(text);
    } catch {
      // Invalid regex, treat as literal
      matcher = buildLiteralMatcher(query, options.caseSensitive);
    }
  } else {
    matcher = buildLiteralMatcher(query, options.caseSensitive);
  }

  searchNode(json, '$', null, options.scope, matcher, results);
  return results;
}

function buildLiteralMatcher(query: string, caseSensitive: boolean): (text: string) => boolean {
  if (caseSensitive) {
    return (text) => text.includes(query);
  }
  const lowerQuery = query.toLowerCase();
  return (text) => text.toLowerCase().includes(lowerQuery);
}

function searchNode(
  value: any,
  path: string,
  key: string | number | null,
  scope: 'all' | 'keys' | 'values',
  matcher: (text: string) => boolean,
  results: SearchMatch[],
): void {
  // Check key
  if (key !== null && (scope === 'all' || scope === 'keys')) {
    const keyStr = String(key);
    if (matcher(keyStr)) {
      results.push({ path, matchIn: 'key', matchText: keyStr });
    }
  }

  // Check value (only for primitives)
  if (value !== null && typeof value !== 'object' && (scope === 'all' || scope === 'values')) {
    const valueStr = String(value);
    if (matcher(valueStr)) {
      results.push({ path, matchIn: 'value', matchText: valueStr });
    }
  }

  // Recurse into children
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      searchNode(value[i], appendPath(path, i), i, scope, matcher, results);
    }
  } else if (value !== null && typeof value === 'object') {
    for (const [childKey, childValue] of Object.entries(value)) {
      searchNode(childValue, appendPath(path, childKey), childKey, scope, matcher, results);
    }
  }
}
