import type { KeyValue } from '../types';
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

function decodeSafe(str: string): string {
  try {
    return decodeURIComponent(str);
  } catch {
    return str;
  }
}
