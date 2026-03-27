/**
 * Fuzzy (approximate) string matching using Levenshtein distance.
 * Used as an optional "fuzzy" mode in the JSON Explorer search.
 */

/**
 * Compute the Levenshtein distance between two strings.
 * Returns the minimum number of single-character edits (insertions, deletions, substitutions)
 * required to change one string into the other.
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  // Optimize: if one string is empty, distance is the length of the other
  if (m === 0) return n;
  if (n === 0) return m;

  // Use single-row optimization (O(min(m,n)) space)
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);

  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,      // deletion
        curr[j - 1] + 1,  // insertion
        prev[j - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}

/**
 * Check if a string approximately matches a query within a given distance threshold.
 * Uses a sliding window approach: checks if any substring of `text` of length close to
 * `query.length` has a Levenshtein distance <= threshold.
 */
export function fuzzyMatch(text: string, query: string, maxDistance = 2): boolean {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  // Exact substring match is always a hit
  if (lowerText.includes(lowerQuery)) return true;

  // For very short queries, be stricter
  if (lowerQuery.length <= 2) return false;

  // Sliding window: check substrings of text with length +/- maxDistance of query length
  const qLen = lowerQuery.length;
  const minWindowLen = Math.max(1, qLen - maxDistance);
  const maxWindowLen = qLen + maxDistance;

  for (let windowLen = minWindowLen; windowLen <= maxWindowLen; windowLen++) {
    for (let start = 0; start <= lowerText.length - windowLen; start++) {
      const sub = lowerText.substring(start, start + windowLen);
      if (levenshteinDistance(sub, lowerQuery) <= maxDistance) {
        return true;
      }
    }
  }

  return false;
}

export interface FuzzySearchMatch {
  path: string;
  matchIn: 'key' | 'value';
  matchText: string;
  distance: number;
}

/**
 * Search a JSON tree for fuzzy matches.
 * Similar to the exact search but uses Levenshtein distance.
 */
export function fuzzySearchJson(
  json: any,
  query: string,
  options: { scope: 'all' | 'keys' | 'values'; maxDistance?: number },
): FuzzySearchMatch[] {
  if (!query || query.length < 2) return [];

  const results: FuzzySearchMatch[] = [];
  const maxDist = options.maxDistance ?? 2;

  fuzzySearchNode(json, '$', null, options.scope, query, maxDist, results);

  // Sort by distance (best matches first)
  results.sort((a, b) => a.distance - b.distance);

  return results;
}

function fuzzySearchNode(
  value: any,
  path: string,
  key: string | number | null,
  scope: 'all' | 'keys' | 'values',
  query: string,
  maxDistance: number,
  results: FuzzySearchMatch[],
): void {
  // Check key
  if (key !== null && (scope === 'all' || scope === 'keys')) {
    const keyStr = String(key);
    if (fuzzyMatch(keyStr, query, maxDistance)) {
      const dist = levenshteinDistance(keyStr.toLowerCase(), query.toLowerCase());
      results.push({ path, matchIn: 'key', matchText: keyStr, distance: dist });
    }
  }

  // Check primitive values
  if (value !== null && typeof value !== 'object' && (scope === 'all' || scope === 'values')) {
    const valueStr = String(value);
    if (fuzzyMatch(valueStr, query, maxDistance)) {
      const dist = levenshteinDistance(valueStr.toLowerCase(), query.toLowerCase());
      results.push({ path, matchIn: 'value', matchText: valueStr, distance: dist });
    }
  }

  // Recurse
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const childPath = `${path}[${i}]`;
      fuzzySearchNode(value[i], childPath, i, scope, query, maxDistance, results);
    }
  } else if (value !== null && typeof value === 'object') {
    for (const [childKey, childValue] of Object.entries(value)) {
      const childPath = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(childKey)
        ? `${path}.${childKey}`
        : `${path}["${childKey.replace(/"/g, '\\"')}"]`;
      fuzzySearchNode(childValue, childPath, childKey, scope, query, maxDistance, results);
    }
  }
}
