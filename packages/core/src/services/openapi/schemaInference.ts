import { UUID_RE } from './specNaming';
import type { OpenApiVersion } from './types';

/**
 * JSON Schema inference from a real response body — the inverse of
 * OpenApiImportService's example generation. Exploits the fact that Nouto is a
 * live REST client with actual payloads in hand: infer once, then either copy
 * the schema or splice it into an open spec under `/components/schemas`.
 *
 * Architecture: a dialect-agnostic intermediate representation is built first
 * (`InferredNode`), then projected to the requested dialect in a single render
 * pass. This keeps the merge logic (needed to unify array items) free of
 * version concerns, and lets the Collections/HAR → OpenAPI generator reuse
 * `mergeSchemas` across many sampled bodies later without an API break.
 */

/**
 * Which dialect the emitted schema must be valid under.
 *
 * - `'standalone'` — a self-describing JSON Schema 2020-12 document: emits
 *   `$schema` at the root and encodes nullability as `type` arrays. Used by
 *   "Copy as JSON Schema".
 * - An {@link OpenApiVersion} — a schema embedded in a spec of that version:
 *   never emits `$schema` (the enclosing document declares its dialect);
 *   `'3.0'` encodes nullability as `nullable: true`, while `'3.1'`/`'3.2'`
 *   use JSON Schema 2020-12 `type` arrays.
 */
export type SchemaInferenceDialect = OpenApiVersion | 'standalone';

export interface SchemaInferenceOptions {
  dialect: SchemaInferenceDialect;
  /** Recursion depth guard; subtrees past this render as `{}`. Default 12. */
  maxDepth?: number;
}

const DEFAULT_MAX_DEPTH = 12;
/** Total inferred-node budget — insurance against pathological payloads. */
const MAX_NODES = 20000;
/** Strings longer than this skip format detection (cheap sanity bound). */
const MAX_FORMAT_STRING_LENGTH = 256;

const JSON_SCHEMA_2020_12 = 'https://json-schema.org/draft/2020-12/schema';

type InferredType = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null';

/** Dialect-agnostic intermediate representation of an inferred schema. */
interface InferredNode {
  types: Set<InferredType>;
  /** Only meaningful when the non-null type is exactly `string`. */
  format?: string;
  /** Insertion-ordered (first-seen) — preserved into the rendered output. */
  properties?: Map<string, InferredNode>;
  required?: string[];
  items?: InferredNode;
  /** A guard tripped here; the node renders as the empty schema `{}`. */
  truncated?: boolean;
}

/**
 * Infers a JSON Schema from a single JSON value (a parsed response body).
 *
 * Emits: primitive `type`s (`Number.isInteger` splits `integer` from
 * `number` — note JSON's `1.0` parses to `1` and reports as `integer`),
 * nested `properties` in first-seen key order, `required` listing every key
 * present in the sample (intersected across array items), unified array
 * `items`, and `format` for strings when every observed sample matches
 * (date-time, date, uuid, email, uri). Explicitly not attempted in v1:
 * int32/int64/float/double formats, `oneOf` modeling of heterogeneous
 * arrays (they degrade to a type union, or `{}` on 3.0), and constraint
 * keywords (`minimum`, `minItems`, …).
 */
export function inferJsonSchema(
  value: unknown,
  options: SchemaInferenceOptions
): Record<string, unknown> {
  return inferJsonSchemaFromSamples([value], options);
}

/**
 * Infers one JSON Schema unifying several sampled bodies (multiple saved
 * response examples, HAR entries for the same templated path, …). Merge
 * semantics are those of array-item unification: object keys union while
 * `required` intersects, an integer/number mix widens to `number`, `format`
 * survives only on unanimous agreement, and heterogeneous samples degrade to
 * a type union. An empty sample list renders as the empty schema `{}`.
 */
export function inferJsonSchemaFromSamples(
  values: unknown[],
  options: SchemaInferenceOptions
): Record<string, unknown> {
  const state: InferenceState = {
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
    nodesLeft: MAX_NODES,
    inProgress: new Set(),
  };
  const nodes = values.map((value) => inferNode(value, 0, state));
  const node = nodes.length ? mergeSchemas(nodes) : TRUNCATED;
  const schema = renderNode(node, options.dialect);
  if (options.dialect === 'standalone') {
    return { $schema: JSON_SCHEMA_2020_12, ...schema };
  }
  return schema;
}

interface InferenceState {
  maxDepth: number;
  nodesLeft: number;
  /** Objects on the current recursion path — cycle guard for live (non-JSON.parse) inputs. */
  inProgress: Set<object>;
}

const TRUNCATED: InferredNode = { types: new Set<InferredType>(), truncated: true };

function inferNode(value: unknown, depth: number, state: InferenceState): InferredNode {
  if (--state.nodesLeft < 0 || depth > state.maxDepth) return TRUNCATED;

  if (value === null || value === undefined) return { types: new Set(['null']) };

  switch (typeof value) {
    case 'string':
      return { types: new Set(['string']), format: detectFormat(value) };
    case 'number':
      return { types: new Set([Number.isInteger(value) ? 'integer' : 'number']) };
    case 'boolean':
      return { types: new Set(['boolean']) };
    case 'object':
      break;
    default:
      // function/symbol/bigint — not JSON; render as the empty schema.
      return TRUNCATED;
  }

  const obj = value as object;
  if (state.inProgress.has(obj)) return TRUNCATED;
  state.inProgress.add(obj);
  try {
    if (Array.isArray(obj)) {
      const items = obj.length
        ? mergeSchemas(obj.map((item) => inferNode(item, depth + 1, state)))
        : { types: new Set<InferredType>() };
      return { types: new Set(['array']), items };
    }
    const properties = new Map<string, InferredNode>();
    for (const [key, propertyValue] of Object.entries(obj)) {
      properties.set(key, inferNode(propertyValue, depth + 1, state));
    }
    const required = properties.size ? [...properties.keys()] : undefined;
    return { types: new Set(['object']), properties, required };
  } finally {
    state.inProgress.delete(obj);
  }
}

/**
 * Unifies inferred nodes into one: array items today, multiple sampled bodies
 * when the multi-sample follow-up (Collections/HAR export) lands.
 *
 * Same-type merges are structural: object properties union (a key missing
 * from one sample is *absent*, not null, so its sub-merge only sees the
 * samples that had it) while `required` intersects — a key is only required
 * in the merged shape when every sampled object carried it. Primitive merges
 * keep `format` only on unanimous agreement, and an integer/number mix widens
 * to `number`. Genuinely heterogeneous inputs (e.g. object + string) degrade
 * to a bare type union — no `oneOf` in v1.
 */
function mergeSchemas(nodes: InferredNode[]): InferredNode {
  if (nodes.length === 1) return nodes[0];
  if (nodes.some((node) => node.truncated)) return TRUNCATED;

  const types = new Set<InferredType>();
  for (const node of nodes) {
    for (const type of node.types) types.add(type);
  }
  // An integer sample and a float sample together simply mean "number".
  if (types.has('integer') && types.has('number')) types.delete('integer');

  const nonNull = [...types].filter((type) => type !== 'null');
  if (nonNull.length !== 1) return { types };

  switch (nonNull[0]) {
    case 'object': {
      const objectNodes = nodes.filter((node) => node.types.has('object'));
      const properties = new Map<string, InferredNode>();
      for (const node of objectNodes) {
        for (const [key, property] of node.properties ?? []) {
          const merged = properties.get(key);
          properties.set(key, merged ? mergeSchemas([merged, property]) : property);
        }
      }
      const required = [...(objectNodes[0]?.required ?? [])].filter((key) =>
        objectNodes.every((node) => node.required?.includes(key))
      );
      return { types, properties, required: required.length ? required : undefined };
    }
    case 'array': {
      const itemNodes = nodes
        .map((node) => node.items)
        .filter((items): items is InferredNode => !!items && items.types.size > 0);
      return {
        types,
        items: itemNodes.length ? mergeSchemas(itemNodes) : { types: new Set<InferredType>() },
      };
    }
    default: {
      const formats = nodes
        .filter((node) => !node.types.has('null') || node.types.size > 1)
        .map((node) => node.format);
      const format = formats.length && formats.every((f) => f && f === formats[0])
        ? formats[0]
        : undefined;
      return format ? { types, format } : { types };
    }
  }
}

function renderNode(node: InferredNode, dialect: SchemaInferenceDialect): Record<string, unknown> {
  if (node.truncated || node.types.size === 0) return {};

  const hasNull = node.types.has('null');
  const nonNull = [...node.types].filter((type): type is Exclude<InferredType, 'null'> => type !== 'null');

  if (nonNull.length === 0) {
    // Null-only: 3.0 has no `type: 'null'`, so an unconstrained-but-nullable
    // schema is the only honest representation there.
    return dialect === '3.0' ? { nullable: true } : { type: 'null' };
  }

  if (nonNull.length > 1) {
    // Heterogeneous union: expressible as a `type` array everywhere but 3.0,
    // whose `type` keyword cannot hold an array — give up honestly there.
    if (dialect === '3.0') return {};
    return { type: hasNull ? [...nonNull.sort(), 'null'] : nonNull.sort() };
  }

  const type = nonNull[0];
  const schema: Record<string, unknown> =
    hasNull && dialect !== '3.0' ? { type: [type, 'null'] } : { type };
  if (hasNull && dialect === '3.0') schema.nullable = true;

  switch (type) {
    case 'object': {
      const properties: Record<string, unknown> = {};
      for (const [key, property] of node.properties ?? []) {
        properties[key] = renderNode(property, dialect);
      }
      schema.properties = properties;
      if (node.required?.length) schema.required = node.required;
      break;
    }
    case 'array':
      schema.items = node.items ? renderNode(node.items, dialect) : {};
      break;
    default:
      if (node.format) schema.format = node.format;
  }
  return schema;
}

// --------------------------------------------------------------------------
// Format detection
// --------------------------------------------------------------------------

const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** First matching well-known format, or undefined. Checked in precedence order. */
function detectFormat(value: string): string | undefined {
  if (!value || value.length > MAX_FORMAT_STRING_LENGTH) return undefined;
  if (DATE_TIME_RE.test(value)) return 'date-time';
  if (DATE_RE.test(value)) return 'date';
  if (UUID_RE.test(value)) return 'uuid';
  if (EMAIL_RE.test(value)) return 'email';
  if (isAbsoluteUri(value)) return 'uri';
  return undefined;
}

function isAbsoluteUri(value: string): boolean {
  // Cheap pre-check keeps `new URL` off ordinary words ("hello", "a/b").
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}
