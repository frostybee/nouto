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
