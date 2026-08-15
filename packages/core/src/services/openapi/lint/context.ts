import type { OpenApiAnalysis, OpenApiOperationSummary, OpenApiVersion } from '../types';
import { buildPointer, getByPointer } from '../pointer';
import { isRefNode } from '../refs';
import { mergeParameters, resolveParameters, type ResolvedParameter } from '../parameters';

/** Narrows to a plain (non-array) object. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** The parsed spec as a record, or undefined when the content did not parse. */
export function specOf(analysis: OpenApiAnalysis): Record<string, unknown> | undefined {
  return isRecord(analysis.parsedSpec) ? analysis.parsedSpec : undefined;
}

const VERSION_ORDER: OpenApiVersion[] = ['3.0', '3.1', '3.2'];

/**
 * True when the analyzed document's version is `minimum` or newer. Unknown
 * version (unparsed / unrecognized `openapi` field) counts as "not at least",
 * so version-gated rules stay silent rather than guessing.
 */
export function versionAtLeast(analysis: OpenApiAnalysis, minimum: OpenApiVersion): boolean {
  if (!analysis.version) return false;
  return VERSION_ORDER.indexOf(analysis.version) >= VERSION_ORDER.indexOf(minimum);
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

/** A Path Item entry under `paths`, with its key, pointer, and object. */
export interface PathItemView {
  path: string;
  pointer: string;
  object: Record<string, unknown>;
}

/**
 * Every Path Item under `paths` that is an inline object (a `$ref` path item
 * is skipped: its operations live elsewhere and are diagnosed there).
 */
export function pathItems(analysis: OpenApiAnalysis): PathItemView[] {
  const spec = specOf(analysis);
  if (!spec || !isRecord(spec.paths)) return [];
  const views: PathItemView[] = [];
  for (const [path, value] of Object.entries(spec.paths)) {
    if (!isRecord(value) || isRefNode(value)) continue;
    views.push({ path, pointer: buildPointer(['paths', path]), object: value });
  }
  return views;
}

/**
 * The effective parameters of an operation: path-level parameters merged
 * with operation-level ones (operation wins on the same `name` + `in`), each
 * resolved through the `$ref` cache and tagged `inherited` when it came from
 * the Path Item.
 */
export function mergedParameters(
  view: OperationView,
  analysis: OpenApiAnalysis
): Array<ResolvedParameter & { inherited: boolean }> {
  const spec = analysis.parsedSpec ?? {};
  const pathPointer = buildPointer(['paths', view.summary.path]);
  const pathItem = getByPointer(spec, pathPointer);
  const pathLevel = pathItem.found && isRecord(pathItem.value)
    ? resolveParameters(pathItem.value.parameters, `${pathPointer}/parameters`, analysis.resolvedRefs)
    : [];
  const operationLevel = resolveParameters(
    view.object.parameters,
    `${view.summary.pointer}/parameters`,
    analysis.resolvedRefs
  );
  return mergeParameters(pathLevel, operationLevel);
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

/** The `components` sub-object kinds OpenAPI 3.x defines. */
export type ComponentKind =
  | 'schemas'
  | 'responses'
  | 'parameters'
  | 'examples'
  | 'requestBodies'
  | 'headers'
  | 'securitySchemes'
  | 'links'
  | 'callbacks'
  | 'pathItems'
  | 'mediaTypes';

export const COMPONENT_KINDS: ComponentKind[] = [
  'schemas',
  'responses',
  'parameters',
  'examples',
  'requestBodies',
  'headers',
  'securitySchemes',
  'links',
  'callbacks',
  'pathItems',
  'mediaTypes',
];

/**
 * Named entries under `components.<kind>` whose value is an object, as
 * `[name, object, pointer]` triples. Non-object entries are left to the
 * meta-schema pass.
 */
export function componentEntries(
  spec: Record<string, unknown>,
  kind: ComponentKind
): Array<{ name: string; object: Record<string, unknown>; pointer: string }> {
  const components = isRecord(spec.components) ? spec.components : undefined;
  const section = components && isRecord(components[kind]) ? (components[kind] as Record<string, unknown>) : undefined;
  if (!section) return [];
  const entries: Array<{ name: string; object: Record<string, unknown>; pointer: string }> = [];
  for (const [name, object] of Object.entries(section)) {
    if (!isRecord(object)) continue;
    entries.push({ name, object, pointer: buildPointer(['components', kind, name]) });
  }
  return entries;
}

/** Named security scheme definitions under `components.securitySchemes`. */
export function securitySchemes(spec: Record<string, unknown>): Array<[string, Record<string, unknown>]> {
  return componentEntries(spec, 'securitySchemes').map(({ name, object }) => [name, object]);
}

/** Root-level Tag Objects with their pointer (non-object entries skipped). */
export function rootTags(spec: Record<string, unknown>): Array<{ name: string; object: Record<string, unknown>; pointer: string }> {
  if (!Array.isArray(spec.tags)) return [];
  const tags: Array<{ name: string; object: Record<string, unknown>; pointer: string }> = [];
  spec.tags.forEach((tag, index) => {
    if (!isRecord(tag) || typeof tag.name !== 'string') return;
    tags.push({ name: tag.name, object: tag, pointer: `/tags/${index}` });
  });
  return tags;
}
