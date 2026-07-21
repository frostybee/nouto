/**
 * RFC 6901 JSON Pointer helpers.
 *
 * A pointer is either '' (whole document) or a sequence of '/'-prefixed
 * segments where '~' is escaped as '~0' and '/' as '~1'.
 */

/** Escapes a single path segment per RFC 6901 (`~` → `~0`, `/` → `~1`). */
export function escapePointerSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

/** Unescapes a single pointer segment per RFC 6901 (`~1` → `/`, then `~0` → `~`). */
export function unescapePointerSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

/** Builds a pointer string from raw (unescaped) segments. Empty array → ''. */
export function buildPointer(segments: readonly string[]): string {
  if (segments.length === 0) return '';
  return '/' + segments.map(escapePointerSegment).join('/');
}

/**
 * Parses a pointer string into raw (unescaped) segments.
 * Returns undefined for syntactically invalid pointers (non-empty without a
 * leading '/').
 */
export function parsePointer(pointer: string): string[] | undefined {
  if (pointer === '') return [];
  if (!pointer.startsWith('/')) return undefined;
  return pointer.slice(1).split('/').map(unescapePointerSegment);
}

/**
 * Resolves a pointer against a parsed document.
 * Returns `{ found: false }` when any segment is missing or traverses a
 * primitive; distinguishes "target is undefined" from "target not found".
 */
export function getByPointer(document: unknown, pointer: string): { found: boolean; value?: unknown } {
  const segments = parsePointer(pointer);
  if (segments === undefined) return { found: false };
  let current: unknown = document;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      if (!/^(0|[1-9][0-9]*)$/.test(segment)) return { found: false };
      const index = Number(segment);
      if (index >= current.length) return { found: false };
      current = current[index];
    } else if (current !== null && typeof current === 'object') {
      if (!Object.prototype.hasOwnProperty.call(current, segment)) return { found: false };
      current = (current as Record<string, unknown>)[segment];
    } else {
      return { found: false };
    }
  }
  return { found: true, value: current };
}
