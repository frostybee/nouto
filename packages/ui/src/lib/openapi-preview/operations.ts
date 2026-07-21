import { listOpenApiOperations, type OpenApiOperationSummary } from '@nouto/core';

/**
 * Operation inventory for the preview toolbar.
 *
 * Deliberately delegates to the same core helper the extension host uses
 * instead of re-walking the specification here: ordering and JSON Pointers must
 * match the host exactly, or a retained selection would silently point at a
 * different operation than the one converted.
 */
export function listPreviewOperations(spec: unknown): OpenApiOperationSummary[] {
  if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) return [];
  return listOpenApiOperations(spec as object);
}

/**
 * Chooses which operation stays selected after the document changes: the
 * current one when it still exists, otherwise the first. Returns '' when the
 * document has no operations.
 */
export function resolveSelection(
  operations: readonly OpenApiOperationSummary[],
  currentPointer: string
): string {
  if (operations.length === 0) return '';
  return operations.some((operation) => operation.pointer === currentPointer)
    ? currentPointer
    : operations[0].pointer;
}

/** Human-readable label for one operation in the selector. */
export function operationLabel(operation: OpenApiOperationSummary): string {
  const base = `${operation.method.toUpperCase()} ${operation.path}`;
  return operation.summary ? `${base} — ${operation.summary}` : base;
}

export type { OpenApiOperationSummary };
