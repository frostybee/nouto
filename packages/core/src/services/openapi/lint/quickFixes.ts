import type { OpenApiAnalysis, OpenApiDiagnostic } from '../types';
import { getByPointer } from '../pointer';
import { isRefNode } from '../refs';
import {
  planInsertArrayItem,
  planInsertObjectMember,
  planSetScalarAtPointer,
} from '../specEdit';
import type { SpecDocument, SpecTextEdit } from '../specEdit';
import { classifyPathSegment, deriveOperationId, uniqueName } from '../specNaming';
import { isRecord } from './context';

/**
 * A quick fix for a lint diagnostic. `key` identifies the fix independently of
 * which rule produced it: `operation-missing-4xx` and `operation-missing-5xx`
 * both resolve to the same "add a default response" edit, and hosts dedupe on
 * `key` so the lightbulb lists it once.
 */
export interface LintQuickFix {
  key: string;
  title: string;
  edits: SpecTextEdit[];
}

type LintFixBuilder = (
  doc: SpecDocument,
  diagnostic: OpenApiDiagnostic,
  analysis: OpenApiAnalysis
) => LintQuickFix | undefined;

/** Placeholder bounds inserted by the `parameter-unbounded` fix. */
export const UNBOUNDED_PARAMETER_FIX = { maxLength: 255, maxItems: 100 } as const;

/** Fix key scoped to the node it edits (`key@pointer`), so hosts can dedupe. */
const at = (key: string, pointer: string) => `${key}@${pointer}`;

function operationFor(analysis: OpenApiAnalysis, pointer: string | undefined) {
  if (pointer === undefined) return undefined;
  return analysis.operations.find((operation) => operation.pointer === pointer);
}

function valueAt(analysis: OpenApiAnalysis, pointer: string): unknown {
  const resolved = getByPointer(analysis.parsedSpec ?? {}, pointer);
  return resolved.found ? resolved.value : undefined;
}

const addDefaultResponse: LintFixBuilder = (doc, diagnostic, analysis) => {
  const pointer = diagnostic.pointer;
  if (!pointer) return undefined;
  const responses = valueAt(analysis, pointer);
  if (!isRecord(responses) || 'default' in responses) return undefined;
  const plan = planInsertObjectMember(doc, pointer, 'default', {
    description: 'Unexpected error',
  });
  return plan
    ? { key: at('add-default-response', pointer), title: 'Add "default" response', edits: plan.edits }
    : undefined;
};

const LINT_FIX_BUILDERS: Record<string, LintFixBuilder> = {
  'operation-missing-4xx': addDefaultResponse,
  'operation-missing-5xx': addDefaultResponse,

  'parameter-unbounded': (doc, diagnostic, analysis) => {
    const pointer = diagnostic.pointer;
    if (!pointer) return undefined;
    // A `$ref` parameter (or schema) lives elsewhere, possibly shared: editing
    // it from a usage-site warning would be a surprising side effect.
    const parameter = valueAt(analysis, pointer);
    if (!isRecord(parameter) || isRefNode(parameter)) return undefined;
    const schema = parameter.schema;
    if (!isRecord(schema) || isRefNode(schema)) return undefined;
    const schemaPointer = `${pointer}/schema`;
    if (schema.type === 'string' && schema.maxLength === undefined) {
      const plan = planInsertObjectMember(doc, schemaPointer, 'maxLength', UNBOUNDED_PARAMETER_FIX.maxLength);
      return plan
        ? { key: at('add-max-length', pointer), title: `Add maxLength: ${UNBOUNDED_PARAMETER_FIX.maxLength}`, edits: plan.edits }
        : undefined;
    }
    if (schema.type === 'array' && schema.maxItems === undefined) {
      const plan = planInsertObjectMember(doc, schemaPointer, 'maxItems', UNBOUNDED_PARAMETER_FIX.maxItems);
      return plan
        ? { key: at('add-max-items', pointer), title: `Add maxItems: ${UNBOUNDED_PARAMETER_FIX.maxItems}`, edits: plan.edits }
        : undefined;
    }
    return undefined;
  },

  'schema-unconstrained-additional-properties': (doc, diagnostic, analysis) => {
    const pointer = diagnostic.pointer;
    if (!pointer) return undefined;
    const schema = valueAt(analysis, pointer);
    if (!isRecord(schema)) return undefined;
    const edits = schema.additionalProperties === undefined
      ? planInsertObjectMember(doc, pointer, 'additionalProperties', false)?.edits
      : planSetScalarAtPointer(doc, `${pointer}/additionalProperties`, false);
    return edits
      ? { key: at('set-additional-properties-false', pointer), title: 'Set additionalProperties: false', edits }
      : undefined;
  },

  'operation-missing-tags': (doc, diagnostic, analysis) => {
    const operation = operationFor(analysis, diagnostic.pointer);
    if (!operation) return undefined;
    const firstStatic = operation.path
      .split('/')
      .filter(Boolean)
      .find((segment) => classifyPathSegment(segment) === 'static');
    const tag = firstStatic ?? 'default';
    const object = valueAt(analysis, operation.pointer);
    const existing = isRecord(object) ? object.tags : undefined;
    // `tags: []` already present: append rather than re-insert the key.
    const plan = Array.isArray(existing)
      ? planInsertArrayItem(doc, `${operation.pointer}/tags`, tag)
      : planInsertObjectMember(doc, operation.pointer, 'tags', [tag]);
    return plan
      ? { key: at('add-tag', operation.pointer), title: `Add tag "${tag}"`, edits: plan.edits }
      : undefined;
  },

  'operation-missing-operation-id': (doc, diagnostic, analysis) => {
    const operation = operationFor(analysis, diagnostic.pointer);
    if (!operation) return undefined;
    const existingIds = analysis.operations
      .map((candidate) => candidate.operationId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    const id = uniqueName(existingIds, deriveOperationId(operation.method, operation.path));
    const object = valueAt(analysis, operation.pointer);
    const current = isRecord(object) ? object.operationId : undefined;
    // An empty `operationId: ''` still trips the rule: overwrite it in place.
    const edits = typeof current === 'string'
      ? planSetScalarAtPointer(doc, `${operation.pointer}/operationId`, id)
      : planInsertObjectMember(doc, operation.pointer, 'operationId', id)?.edits;
    return edits
      ? { key: at('add-operation-id', operation.pointer), title: `Add operationId "${id}"`, edits }
      : undefined;
  },
};

/** Lint rule ids that have a quick fix. */
export const LINT_FIXABLE_CODES: ReadonlySet<string> = new Set(Object.keys(LINT_FIX_BUILDERS));

/**
 * Plans the quick fix for a lint diagnostic, or undefined when the rule has no
 * fix or the edit cannot be applied safely (the planners refuse flow-style
 * YAML collections and missing targets). Host-agnostic: VS Code wraps the
 * edits in a WorkspaceEdit, the desktop hands them to Monaco.
 */
export function planLintQuickFix(
  doc: SpecDocument,
  diagnostic: OpenApiDiagnostic,
  analysis: OpenApiAnalysis
): LintQuickFix | undefined {
  if (diagnostic.source !== 'lint' || diagnostic.code === undefined) return undefined;
  const builder = LINT_FIX_BUILDERS[diagnostic.code];
  if (!builder || !analysis.parsedSpec) return undefined;
  return builder(doc, diagnostic, analysis);
}
