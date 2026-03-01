import type { KeyValue, PathParam } from '../types';
import { generateId } from '../types';

/**
 * Parse a full URL into base URL and query parameters.
 * Skips '?' inside {{ }} template variables.
 * Decodes percent-encoded values safely.
 */
export function parseUrlParams(fullUrl: string): { baseUrl: string; params: KeyValue[] } {
  const qIndex = findQueryStart(fullUrl);

  if (qIndex === -1) {
    return { baseUrl: fullUrl, params: [] };
  }

  const baseUrl = fullUrl.substring(0, qIndex);
  const rest = fullUrl.substring(qIndex + 1);

  // Strip hash fragment
  const hashIndex = rest.indexOf('#');
  const queryString = hashIndex >= 0 ? rest.substring(0, hashIndex) : rest;

  if (!queryString) {
    return { baseUrl, params: [] };
  }

  const params: KeyValue[] = queryString.split('&').map(pair => {
    const eqIndex = pair.indexOf('=');
    if (eqIndex === -1) {
      return { id: generateId(), key: decodeSafe(pair), value: '', enabled: true };
    }
    return {
      id: generateId(),
      key: decodeSafe(pair.substring(0, eqIndex)),
      value: decodeSafe(pair.substring(eqIndex + 1)),
      enabled: true,
    };
  });

  return { baseUrl, params };
}

/**
 * Build a human-readable display URL from base URL + enabled params.
 * Does NOT percent-encode — shows raw text for readability.
 */
export function buildDisplayUrl(baseUrl: string, params: KeyValue[]): string {
  const enabled = params.filter(p => p.enabled && p.key);
  if (enabled.length === 0) return baseUrl;
  const qs = enabled.map(p => p.value ? `${p.key}=${p.value}` : p.key).join('&');
  return baseUrl + '?' + qs;
}

/**
 * Merge params parsed from the URL with existing params.
 * Keeps disabled params from the existing list.
 * Reuses IDs from existing enabled params by position to avoid re-renders.
 */
export function mergeParams(existingParams: KeyValue[], parsedParams: KeyValue[]): KeyValue[] {
  const disabled = existingParams.filter(p => !p.enabled);
  const existingEnabled = existingParams.filter(p => p.enabled);

  const merged = parsedParams.map((parsed, i) => {
    if (i < existingEnabled.length) {
      return { ...parsed, id: existingEnabled[i].id };
    }
    return parsed;
  });

  return [...merged, ...disabled];
}

/**
 * Find the index of '?' that starts the query string,
 * skipping any '?' inside {{ }} template variable expressions.
 */
function findQueryStart(url: string): number {
  let insideBraces = 0;
  for (let i = 0; i < url.length; i++) {
    if (url[i] === '{' && i + 1 < url.length && url[i + 1] === '{') {
      insideBraces++;
      i++;
    } else if (url[i] === '}' && i + 1 < url.length && url[i + 1] === '}') {
      insideBraces = Math.max(0, insideBraces - 1);
      i++;
    } else if (url[i] === '?' && insideBraces === 0) {
      return i;
    }
  }
  return -1;
}

/**
 * Extract path parameter names from a URL template.
 * Supports two syntaxes:
 *   - Brace: `{param}` (but NOT double-brace `{{envVar}}`)
 *   - Colon: `:param` (Express/Rails style, stops at `/`, `?`, `#`, or end)
 * Deduplicates names across both syntaxes.
 */
export function parsePathParams(url: string): string[] {
  const names: string[] = [];

  // Match {param} but not {{envVar}}
  const braceRegex = /(?<!\{)\{([^{}]+)\}(?!\})/g;
  let match;
  while ((match = braceRegex.exec(url)) !== null) {
    const name = match[1].trim();
    if (name && !names.includes(name)) {
      names.push(name);
    }
  }

  // Match :param in path segments (after protocol://)
  // Only match after the host portion to avoid matching port numbers like :8080
  const pathStart = url.indexOf('//');
  const searchFrom = pathStart !== -1 ? url.indexOf('/', pathStart + 2) : 0;
  if (searchFrom !== -1) {
    const pathPortion = url.substring(searchFrom);
    const colonRegex = /:([a-zA-Z_]\w*)/g;
    while ((match = colonRegex.exec(pathPortion)) !== null) {
      const name = match[1];
      if (!names.includes(name)) {
        names.push(name);
      }
    }
  }

  return names;
}

/**
 * Replace path parameter placeholders in URL with values from path params.
 * Handles both `{param}` and `:param` syntaxes.
 * Only substitutes enabled params that have a value.
 */
export function substitutePathParams(url: string, pathParams: PathParam[]): string {
  let result = url;
  for (const param of pathParams) {
    if (param.enabled && param.key && param.value) {
      // Replace {param} syntax (but not {{param}})
      result = result.replace(
        new RegExp(`(?<!\\{)\\{${escapeRegex(param.key)}\\}(?!\\})`, 'g'),
        param.value
      );
      // Replace :param syntax (only in path, not matching partial words)
      result = result.replace(
        new RegExp(`:${escapeRegex(param.key)}(?=[/\\?#]|$)`, 'g'),
        param.value
      );
    }
  }
  return result;
}

/**
 * Merge path param names parsed from the URL with existing path params.
 * Preserves values/descriptions for existing params, adds new ones, keeps manually added params.
 */
export function mergePathParams(existing: PathParam[], parsedNames: string[]): PathParam[] {
  const result: PathParam[] = [];

  // Add params for each parsed name, reusing existing data
  for (const name of parsedNames) {
    const existingParam = existing.find(p => p.key === name);
    if (existingParam) {
      result.push(existingParam);
    } else {
      result.push({ id: generateId(), key: name, value: '', description: '', enabled: true });
    }
  }

  // Keep manually added params that aren't in the URL
  for (const param of existing) {
    if (!parsedNames.includes(param.key) && !result.some(p => p.id === param.id)) {
      result.push(param);
    }
  }

  return result;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeSafe(str: string): string {
  try {
    return decodeURIComponent(str);
  } catch {
    return str;
  }
}
