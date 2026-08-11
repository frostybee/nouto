/**
 * Detect string values that contain embedded JSON objects or arrays.
 */

export interface EmbeddedJsonInfo {
  /** Whether the embedded document is an object or an array */
  kind: 'object' | 'array';
  /** The parsed embedded value */
  parsed: any;
}

/** Strings longer than this are never parsed, to keep render cost bounded. */
export const MAX_EMBEDDED_JSON_LENGTH = 64 * 1024;

/**
 * Detect whether a JSON string value itself parses as a JSON object or array.
 * Returns the parsed value if detected, or null if not embedded JSON.
 */
export function detectEmbeddedJson(value: any, type: string): EmbeddedJsonInfo | null {
  if (type !== 'string' || typeof value !== 'string') return null;
  if (value.length > MAX_EMBEDDED_JSON_LENGTH) return null;

  const trimmed = value.trim();
  if (trimmed.length < 2) return null;

  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if (!((first === '{' && last === '}') || (first === '[' && last === ']'))) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed !== null && typeof parsed === 'object') {
      return { kind: Array.isArray(parsed) ? 'array' : 'object', parsed };
    }
  } catch {
    // Not valid JSON
  }
  return null;
}
