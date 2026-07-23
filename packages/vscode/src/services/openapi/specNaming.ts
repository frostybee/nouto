/**
 * Collision-free naming for spec inserts and quick fixes.
 *
 * Shared by the outline's key-named inserts (a placeholder that can never
 * duplicate a sibling key) and the code-action provider (uniquifying a
 * duplicate operationId). Kept pure — no document/VS Code dependency — so both
 * a document-scoped and an analysis-scoped caller can supply the taken names.
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
