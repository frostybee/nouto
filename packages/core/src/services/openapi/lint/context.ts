import type { OpenApiAnalysis, OpenApiOperationSummary } from '../types';
import { getByPointer } from '../pointer';
import { isRefNode } from '../refs';

/** Narrows to a plain (non-array) object. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** The parsed spec as a record, or undefined when the content did not parse. */
export function specOf(analysis: OpenApiAnalysis): Record<string, unknown> | undefined {
  return isRecord(analysis.parsedSpec) ? analysis.parsedSpec : undefined;
}

/** An operation summary paired with its resolved object in the document. */
export interface OperationView {
  summary: OpenApiOperationSummary;
  object: Record<string, unknown>;
}

/** Every operation whose pointer still resolves to an object. */
export function operationViews(analysis: OpenApiAnalysis): OperationView[] {
  const spec = analysis.parsedSpec ?? {};
  const views: OperationView[] = [];
  for (const summary of analysis.operations) {
    const resolved = getByPointer(spec, summary.pointer);
    if (resolved.found && isRecord(resolved.value)) {
      views.push({ summary, object: resolved.value });
    }
  }
  return views;
}

/**
 * Resolves a value that may be a Reference Object against the analysis's
 * resolved-ref cache. Returns the inline value unchanged, the resolved target
 * for a known `$ref`, or undefined for an unresolved/broken ref (already
 * diagnosed by the reference scan — lint stays silent on it).
 */
export function resolveMaybeRef(value: unknown, analysis: OpenApiAnalysis): unknown {
  if (!isRefNode(value)) return value;
  return analysis.resolvedRefs.get(value.$ref);
}

/** Named security scheme definitions under `components.securitySchemes`. */
export function securitySchemes(spec: Record<string, unknown>): Array<[string, Record<string, unknown>]> {
  const components = isRecord(spec.components) ? spec.components : undefined;
  const schemes = components && isRecord(components.securitySchemes) ? components.securitySchemes : undefined;
  if (!schemes) return [];
  return Object.entries(schemes).filter(
    (entry): entry is [string, Record<string, unknown>] => isRecord(entry[1])
  );
}
