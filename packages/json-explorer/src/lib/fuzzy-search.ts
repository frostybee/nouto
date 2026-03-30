/**
 * Fuzzy search for JSON Explorer using fzf-for-js.
 */

import { Fzf } from 'fzf';

export interface FuzzySearchMatch {
  path: string;
  matchIn: 'key' | 'value';
  matchText: string;
  distance: number;
}

interface SearchCandidate {
  text: string;
  path: string;
  matchIn: 'key' | 'value';
}

/**
 * Search a JSON tree for fuzzy matches using fzf.
 */
export function fuzzySearchJson(
  json: any,
  query: string,
  options: { scope: 'all' | 'keys' | 'values' },
): FuzzySearchMatch[] {
  if (!query || query.length < 2) return [];

  // Collect all searchable strings from the JSON tree
  const candidates: SearchCandidate[] = [];
  collectCandidates(json, '$', null, options.scope, candidates);

  // Run fzf fuzzy matching
  const fzf = new Fzf(candidates, {
    selector: (c: SearchCandidate) => c.text,
    sort: true,
  });

  const fzfResults = fzf.find(query);

  return fzfResults.map(r => ({
    path: r.item.path,
    matchIn: r.item.matchIn,
    matchText: r.item.text,
    distance: r.score,
  }));
}

function collectCandidates(
  value: any,
  path: string,
  key: string | number | null,
  scope: 'all' | 'keys' | 'values',
  candidates: SearchCandidate[],
): void {
  // Check key
  if (key !== null && (scope === 'all' || scope === 'keys')) {
    candidates.push({ text: String(key), path, matchIn: 'key' });
  }

  // Check primitive values
  if (value !== null && typeof value !== 'object' && (scope === 'all' || scope === 'values')) {
    candidates.push({ text: String(value), path, matchIn: 'value' });
  }

  // Recurse
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      collectCandidates(value[i], `${path}[${i}]`, i, scope, candidates);
    }
  } else if (value !== null && typeof value === 'object') {
    for (const [childKey, childValue] of Object.entries(value)) {
      const childPath = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(childKey)
        ? `${path}.${childKey}`
        : `${path}["${childKey.replace(/"/g, '\\"')}"]`;
      collectCandidates(childValue, childPath, childKey, scope, candidates);
    }
  }
}
