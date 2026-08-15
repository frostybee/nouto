import { getByPointer } from './pointer';

/**
 * Collision-free naming for spec inserts and quick fixes.
 *
 * Shared by the outline's key-named inserts (a placeholder that can never
 * duplicate a sibling key), quick-fix providers (uniquifying a duplicate
 * operationId), and the response-schema insert. `uniqueName` is pure so an
 * analysis-scoped caller can supply the taken names itself; `uniqueMemberKey`
 * is the parsed-spec-scoped convenience layered on top of it.
 */

/**
 * Returns `base` when it is not in `existing`, otherwise the first of
 * `base-2`, `base-3`, … that is free.
 */
export function uniqueName(existing: Iterable<string>, base: string): string {
  const taken = existing instanceof Set ? existing : new Set(existing);
  if (!taken.has(base)) return base;
  for (let suffix = 2; ; suffix++) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * First `base` (then `base-2`, `base-3`, …) that is not already a member of
 * the object at `parentPointer` in the parsed spec. Key-named inserts use this
 * instead of a name dialog: the placeholder lands in the document with its key
 * selected for an inline rename, and can never collide into a duplicate key.
 * Collisions are checked against the parsed spec, so YAML and JSON behave
 * identically.
 */
export function uniqueMemberKey(
  parsedSpec: unknown,
  parentPointer: string,
  base: string
): string {
  const parent = getByPointer(parsedSpec, parentPointer);
  const existing = parent.found && parent.value && typeof parent.value === 'object'
    ? Object.keys(parent.value as Record<string, unknown>)
    : [];
  return uniqueName(existing, base);
}

// --------------------------------------------------------------------------
// Path segment classification & component naming
// --------------------------------------------------------------------------

/** Shared with schemaInference's format detection. */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Segments that can never yield a good component name. */
const VERSION_SEGMENT_RE = /^v\d+$/i;

export type PathSegmentClass = 'param' | 'numeric' | 'uuid' | 'version' | 'static';

/**
 * Classifies a URL path segment: `param` for template placeholders (`{id}`,
 * `{{baseUrl}}`, `:id`), `numeric`/`uuid` for concrete identifier values,
 * `version` for API-version markers (`v1`, `V2`), `static` otherwise. Shared
 * taxonomy for component naming here and URL→path templating in the
 * Collections/HAR → OpenAPI generator.
 */
export function classifyPathSegment(segment: string): PathSegmentClass {
  if (/^[{:]/.test(segment)) return 'param';
  if (/^\d+$/.test(segment)) return 'numeric';
  if (UUID_RE.test(segment)) return 'uuid';
  if (VERSION_SEGMENT_RE.test(segment)) return 'version';
  return 'static';
}

function pascalWord(word: string): string {
  const clean = word.replace(/[^A-Za-z0-9]/g, '');
  return clean ? clean[0].toUpperCase() + clean.slice(1) : '';
}

/**
 * Derives a camelCase operationId from an HTTP method and path template:
 * static segments are PascalCased and concatenated, template parameters
 * become `By<Param>` (`GET /store/order/{orderId}` → `getStoreOrderByOrderId`,
 * `QUERY /pet/search` → `queryPetSearch`, `GET /` → `getRoot`). Used by the
 * `operation-missing-operation-id` quick fix; callers pass the result through
 * `uniqueName` against the document's existing ids.
 */
export function deriveOperationId(method: string, path: string): string {
  const verb = method.toLowerCase().replace(/[^a-z0-9]/g, '') || 'op';
  const parts: string[] = [];
  for (const raw of path.split('/').filter(Boolean)) {
    if (classifyPathSegment(raw) === 'param') {
      const name = raw.replace(/^[{:]+|}+$/g, '');
      const pascal = name.split(/[-_.\s]+/).map(pascalWord).join('');
      if (pascal) parts.push(`By${pascal}`);
      continue;
    }
    const pascal = raw.split(/[-_.\s]+/).map(pascalWord).join('');
    if (pascal) parts.push(pascal);
  }
  return `${verb}${parts.length ? parts.join('') : 'Root'}`;
}

/**
 * Derives a component-schema name from a request URL: the last path segment
 * that is not a template parameter, numeric id, UUID, or API-version marker,
 * PascalCased with a `Response` suffix (`/api/v1/users/42` → `UsersResponse`,
 * `/orders/{id}/items` → `ItemsResponse`). Returns undefined when no segment
 * qualifies so callers can fall back to their own placeholder.
 */
export function deriveSchemaName(url: string | undefined): string | undefined {
  if (!url) return undefined;
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    // Relative URL or one with unexpanded {{variables}} — strip query/hash.
    path = url.split(/[?#]/)[0];
  }
  const segments = path.split('/').filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i--) {
    let segment = segments[i];
    try {
      segment = decodeURIComponent(segment);
    } catch {
      // Malformed escape — use the raw segment.
    }
    if (classifyPathSegment(segment) !== 'static') continue;
    const pascal = segment
      .split(/[-_.\s]+/)
      .filter(Boolean)
      .map((word) => word[0].toUpperCase() + word.slice(1))
      .join('')
      .replace(/[^A-Za-z0-9]/g, '');
    if (!pascal || /^\d/.test(pascal)) continue;
    return `${pascal}Response`;
  }
  return undefined;
}
