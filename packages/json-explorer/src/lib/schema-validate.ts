/**
 * JSON Schema validation via Ajv, with errors mapped to explorer JSONPaths.
 */

import Ajv, { type ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import { appendPath } from './path-utils';

export interface SchemaViolation {
  /** Explorer JSONPath of the failing node, e.g. "$.users[0].name" */
  path: string;
  /** Human-readable validation message */
  message: string;
  /** The failed JSON Schema keyword, e.g. "type", "required" */
  keyword: string;
}

export interface SchemaValidationResult {
  /** Violations found; empty when the document is valid */
  violations: SchemaViolation[];
  /** Set when the schema itself could not be compiled */
  schemaError?: string;
}

/** Convert an Ajv instancePath (JSON pointer, "/users/0/name") to an explorer JSONPath. */
function pointerToJsonPath(pointer: string): string {
  if (!pointer) return '$';
  let path = '$';
  for (const rawSegment of pointer.split('/').slice(1)) {
    const segment = rawSegment.replace(/~1/g, '/').replace(/~0/g, '~');
    path = appendPath(path, /^\d+$/.test(segment) ? Number(segment) : segment);
  }
  return path;
}

function describeError(err: ErrorObject): string {
  if (err.keyword === 'required') {
    return `missing required property "${(err.params as any).missingProperty}"`;
  }
  if (err.keyword === 'additionalProperties') {
    return `unexpected property "${(err.params as any).additionalProperty}"`;
  }
  return err.message ?? err.keyword;
}

/**
 * Validate a JSON document against a schema.
 * Schema compilation failures are reported via `schemaError`.
 */
export function validateAgainstSchema(data: any, schema: any): SchemaValidationResult {
  const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: true });
  addFormats(ajv as any);

  let validate;
  try {
    validate = ajv.compile(schema);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { violations: [], schemaError: msg };
  }

  const valid = validate(data);
  if (valid || !validate.errors) return { violations: [] };

  const violations: SchemaViolation[] = [];
  const seen = new Set<string>();
  for (const err of validate.errors) {
    const path = pointerToJsonPath(err.instancePath);
    const message = describeError(err);
    const key = `${path}|${err.keyword}|${message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    violations.push({ path, message, keyword: err.keyword });
  }
  return { violations };
}
