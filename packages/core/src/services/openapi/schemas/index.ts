import type { OpenApiDiagnostic, OpenApiVersion } from '../types';
import { openapi30MetaSchema } from './openapi-3.0-schema';
import { openapi31MetaSchema } from './openapi-3.1-schema';
import { openapi31MetaSchemaEditor } from './openapi-3.1-schema-editor';
import { openapi32MetaSchema } from './openapi-3.2-schema';
import { openapi32MetaSchemaEditor } from './openapi-3.2-schema-editor';

export {
  openapi30MetaSchema,
  openapi31MetaSchema,
  openapi31MetaSchemaEditor,
  openapi32MetaSchema,
  openapi32MetaSchemaEditor,
};

/**
 * Which flavor of a vendored meta-schema to return.
 *
 * - 'editor': safe for the in-editor codemirror-json-schema pipeline. For
 *   3.1/3.2 this is the pre-processed variant with $dynamicRef/$dynamicAnchor
 *   rewritten to static refs (draft-04-level validators cannot evaluate
 *   dynamic references). For 3.0 both variants are identical.
 * - 'full': the unmodified upstream schema. The 3.1/3.2 full schemas require
 *   a JSON Schema 2020-12 validator (host-side Ajv2020).
 */
export type OpenApiMetaSchemaVariant = 'editor' | 'full';

export function getOpenApiMetaSchema(
  version: OpenApiVersion,
  variant: OpenApiMetaSchemaVariant = 'editor'
): Record<string, unknown> {
  switch (version) {
    case '3.0':
      return openapi30MetaSchema;
    case '3.1':
      return variant === 'full' ? openapi31MetaSchema : openapi31MetaSchemaEditor;
    case '3.2':
      return variant === 'full' ? openapi32MetaSchema : openapi32MetaSchemaEditor;
  }
}

/**
 * The subset of Ajv's ErrorObject we consume. Ajv always populates
 * `keyword`/`schemaPath`/`params`; the original typing discarded them, but the
 * oneOf-collapse pass (`collapseSchemaErrors`) needs them re-surfaced to tell a
 * `required` leaf from a combinator (`oneOf`/`if`) meta-error.
 */
type AjvError = {
  keyword: string;
  instancePath: string;
  schemaPath: string;
  params?: Record<string, unknown>;
  message?: string;
};

type CompiledValidator = {
  (data: unknown): boolean;
  errors?: AjvError[] | null;
};

const validators = new Map<OpenApiVersion, CompiledValidator>();

/**
 * Validates a parsed OpenAPI document against the vendored meta-schema for the
 * given version.
 *
 * HOST-SIDE ONLY: compiles validators with Ajv, which generates code at
 * runtime. Webview CSPs forbid eval, so this must never be imported into a
 * webview bundle. In-editor schema diagnostics come from the
 * codemirror-json-schema pipeline instead.
 */
export function validateOpenApiMetaSchema(spec: object, version: OpenApiVersion): OpenApiDiagnostic[] {
  const validate = compile(version);
  if (validate(spec)) return [];
  const collapsed = collapseSchemaErrors((validate.errors ?? []) as AjvError[], spec);
  // The collapse can leave two errors reducing to the same rendered line
  // (e.g. duplicate `required` leaves under sibling branches); dedupe on the
  // final (pointer, message) pair so the editor never shows a line twice.
  const seen = new Set<string>();
  const diagnostics: OpenApiDiagnostic[] = [];
  for (const err of collapsed) {
    const message = schemaErrorMessage(err);
    const pointer = err.instancePath || undefined;
    const key = `${pointer ?? ''}|${message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const diagnostic: OpenApiDiagnostic = { source: 'schema', severity: 'error', message, pointer };
    // Flags the defect as an *absence*, so the editor can anchor the squiggle to
    // the key that owns the gap rather than underlining the whole value.
    if (err.keyword === 'required' && typeof err.params?.missingProperty === 'string') {
      diagnostic.data = { missingProperty: err.params.missingProperty };
    }
    diagnostics.push(diagnostic);
  }
  return diagnostics;
}

/**
 * Renders one Ajv error as a diagnostic message. `required` failures become the
 * friendlier "Missing property 'x'" (matching what schema-aware editors show)
 * using `params.missingProperty`; everything else keeps Ajv's own wording.
 */
function schemaErrorMessage(err: AjvError): string {
  if (err.keyword === 'required' && typeof err.params?.missingProperty === 'string') {
    return `Schema: Missing property '${err.params.missingProperty}'`;
  }
  return err.message ? `Schema: ${err.message}` : 'Schema validation failed';
}

/**
 * Ajv keywords that describe an *alternation* rather than a concrete defect.
 * When a value fails a `oneOf`/`if`/… the useful signal is the leaf error of the
 * branch the author actually meant, not "must match exactly one schema in
 * oneOf" — so these are dropped whenever a substantive leaf survives alongside
 * them (see `collapseGroup`).
 */
const STRUCTURAL_KEYWORDS = new Set(['oneOf', 'anyOf', 'if', 'then', 'else', 'not']);

/**
 * Matches the schemaPath of an error produced *inside* an inline `oneOf`/`anyOf`
 * branch, capturing the branch's parent path, the combinator, and the branch
 * index — e.g. `#/definitions/SchemaXORContent/oneOf/1/required` →
 * (`#/definitions/SchemaXORContent`, `oneOf`, `1`).
 */
const INLINE_BRANCH_RE = /^(.*)\/(oneOf|anyOf)\/(\d+)(?:\/.*)?$/;

/**
 * Collapses Ajv's `allErrors` output so one real defect surfaces as one
 * diagnostic. OpenAPI meta-schemas wrap nearly every object in
 * `oneOf: [ConcreteThing, Reference]` (3.0) or `if/then/else` + a schema/content
 * `oneOf` (3.1/3.2); with `allErrors` a single mistake (e.g. a parameter missing
 * its `schema`) fans out into ~5 messages. We keep the branch the author meant
 * and drop the alternation noise. Grouping is per `instancePath` because every
 * branch failure for one value is reported against that same pointer.
 */
function collapseSchemaErrors(errors: AjvError[], spec: unknown): AjvError[] {
  const byPath = new Map<string, AjvError[]>();
  for (const err of errors) {
    const group = byPath.get(err.instancePath);
    if (group) group.push(err);
    else byPath.set(err.instancePath, [err]);
  }
  const kept: AjvError[] = [];
  for (const [instancePath, group] of byPath) {
    kept.push(...collapseGroup(instancePath, group, spec));
  }
  // Safety net: never turn an invalid document into a clean one. If the
  // reduction somehow emptied everything, fall back to the raw errors.
  return kept.length > 0 ? kept : errors;
}

/** Collapses the errors reported against a single `instancePath`. */
function collapseGroup(instancePath: string, group: AjvError[], spec: unknown): AjvError[] {
  const structural = group.filter((err) => STRUCTURAL_KEYWORDS.has(err.keyword));
  // No combinator here → these are all concrete defects (e.g. a missing
  // `info.title` at the root). Leave them exactly as Ajv reported them.
  if (structural.length === 0) return group;

  const substantiveOriginal = group.filter((err) => !STRUCTURAL_KEYWORDS.has(err.keyword));
  // A location that failed only via a combinator with no leaf error still needs
  // to show *something*; surface the first combinator error.
  if (substantiveOriginal.length === 0) return [structural[0]];

  const instance = resolveJsonPointer(spec, instancePath);
  const instanceKeys = isPlainObject(instance) ? Object.keys(instance) : [];
  const isConcreteObject = instanceKeys.some((key) => key !== '$ref');

  let substantive = substantiveOriginal;
  // The author wrote a concrete object (has keys other than `$ref`), so the
  // `Reference` alternative's "must have required property '$ref'" is pure
  // noise — drop it. (3.1/3.2 express this via `if/else` and produce no such
  // error; there the structural drop above is enough.)
  if (isConcreteObject) {
    substantive = substantive.filter(
      (err) => !(err.keyword === 'required' && err.params?.missingProperty === '$ref')
    );
  }

  // Within an inline `oneOf` (e.g. schema-XOR-content) keep only the
  // best-matching branch so we don't show both "Missing 'schema'" and
  // "Missing 'content'".
  substantive = collapseInlineBranches(substantive);

  return substantive.length > 0 ? substantive : substantiveOriginal;
}

/**
 * For errors sitting inside an inline `oneOf`/`anyOf`, keep only the single
 * best-matching branch's errors. Branches are scored by the approved
 * fewest-errors heuristic (the branch closest to validating), ties broken by
 * lowest branch index — deterministic, and for the symmetric schema/content
 * case yields `schema`, matching schema-aware editors. Errors not inside an
 * inline branch pass through untouched.
 */
function collapseInlineBranches(errors: AjvError[]): AjvError[] {
  const buckets = new Map<string, Map<number, AjvError[]>>();
  const passthrough: AjvError[] = [];
  for (const err of errors) {
    const match = INLINE_BRANCH_RE.exec(err.schemaPath);
    if (!match) {
      passthrough.push(err);
      continue;
    }
    const prefix = `${match[1]}/${match[2]}`;
    const index = Number(match[3]);
    let byIndex = buckets.get(prefix);
    if (!byIndex) {
      byIndex = new Map();
      buckets.set(prefix, byIndex);
    }
    const list = byIndex.get(index);
    if (list) list.push(err);
    else byIndex.set(index, [err]);
  }

  const result = [...passthrough];
  for (const byIndex of buckets.values()) {
    let bestIndex = -1;
    let fewestErrors = Infinity;
    // Ascending index so a tie on error count keeps the lowest-index branch.
    for (const [index, list] of [...byIndex.entries()].sort((a, b) => a[0] - b[0])) {
      if (list.length < fewestErrors) {
        fewestErrors = list.length;
        bestIndex = index;
      }
    }
    result.push(...(byIndex.get(bestIndex) ?? []));
  }
  return result;
}

/** True for a non-null, non-array plain object. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Resolves an RFC 6901 JSON Pointer (Ajv's `instancePath` form, e.g.
 * `/paths/~1pets/get/parameters/0`) against the parsed document, so the
 * collapse pass can inspect the actual value at a failing location.
 */
function resolveJsonPointer(root: unknown, pointer: string): unknown {
  if (!pointer) return root;
  const parts = pointer
    .split('/')
    .slice(1)
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
  let current: unknown = root;
  for (const part of parts) {
    if (Array.isArray(current)) {
      const index = Number(part);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
    } else if (isPlainObject(current)) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  return current;
}

function compile(version: OpenApiVersion): CompiledValidator {
  let validator = validators.get(version);
  if (validator) return validator;

  if (version === '3.0') {
    // The 3.0 meta-schema is JSON Schema draft-04 (it uses the boolean form
    // of exclusiveMinimum), which Ajv v8 proper cannot compile.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AjvDraft04 = require('ajv-draft-04');
    const ajv = new AjvDraft04({ allErrors: true, strict: false, validateFormats: false });
    validator = ajv.compile(openapi30MetaSchema) as CompiledValidator;
  } else {
    // The 3.1/3.2 meta-schemas are JSON Schema 2020-12; Ajv2020 is the
    // draft-2020-12 build of Ajv v8. Compile the editor variant (static refs)
    // rather than the upstream one: Ajv (observed through 8.18) mis-evaluates
    // `$dynamicRef: "#meta"` when the referencing schema sits under a parent
    // with `unevaluatedProperties: false` — every Schema Object (e.g. a media
    // type's `schema`) is then falsely flagged "must NOT have unevaluated
    // properties", cascading into hundreds of errors on valid documents. The
    // standalone OAS schemas declare exactly one `$dynamicAnchor: meta`, so
    // the static rewrite is semantically identical.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Ajv2020 = require('ajv/dist/2020');
    const ajv = new (Ajv2020.default ?? Ajv2020)({ allErrors: true, strict: false, validateFormats: false });
    const schema = version === '3.1' ? openapi31MetaSchemaEditor : openapi32MetaSchemaEditor;
    validator = ajv.compile(schema) as CompiledValidator;
  }
  validators.set(version, validator);
  return validator;
}
