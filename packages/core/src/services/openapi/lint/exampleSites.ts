import type { OpenApiAnalysis } from '../types';
import { escapePointerSegment } from '../pointer';
import { isRefNode } from '../refs';
import { isRecord, versionAtLeast } from './context';
import { walkMediaTypes, walkParameters, walkSchemas } from './schemaWalk';

/**
 * Example-vs-schema validation is split in two: this module (host-agnostic)
 * finds every (example value, schema) pair in the document; the host runs a
 * JSON Schema validator over the pairs (VS Code: Ajv on the extension host,
 * desktop: the Rust `jsonschema` crate) because the desktop webview CSP
 * forbids the code generation Ajv relies on. Findings surface as the two
 * `hostValidated` lint rules below so severity settings apply as usual.
 */

export const EXAMPLE_INVALID_SCHEMA = 'example-invalid-schema';
export const EXAMPLE_INVALID_MEDIA = 'example-invalid-media';

export interface ExampleSite {
  /** Which rule a mismatch is reported under. */
  rule: typeof EXAMPLE_INVALID_SCHEMA | typeof EXAMPLE_INVALID_MEDIA;
  /** Pointer to the example value (where the diagnostic is anchored). */
  valuePointer: string;
  /** Pointer to the Schema Object the value must satisfy (may be a `$ref` node). */
  schemaPointer: string;
  /** The example value itself. */
  value: unknown;
}

/** True when `schema` can be validated from this document alone. */
function validatable(schema: unknown): schema is Record<string, unknown> | boolean {
  if (typeof schema === 'boolean') return true;
  if (!isRecord(schema)) return false;
  // External refs are not loaded into the validator's document set.
  if (isRefNode(schema) && !schema.$ref.startsWith('#')) return false;
  return true;
}

/** Example Objects under an `examples` map, skipping `$ref` and `externalValue` entries. */
function exampleValues(examples: unknown, pointer: string): Array<{ valuePointer: string; value: unknown }> {
  if (!isRecord(examples)) return [];
  const out: Array<{ valuePointer: string; value: unknown }> = [];
  for (const [name, example] of Object.entries(examples)) {
    if (!isRecord(example) || isRefNode(example) || !('value' in example) || 'externalValue' in example) continue;
    out.push({ valuePointer: `${pointer}/${escapePointerSegment(name)}/value`, value: example.value });
  }
  return out;
}

/**
 * Every example the document pairs with a schema:
 * - Schema Object `example` (all versions) and `examples[]` (3.1+), validated
 *   against the schema that carries them.
 * - Media Type Object `example` / `examples.*.value` against its `schema`.
 * - Parameter Object `example` / `examples.*.value` against its `schema`.
 * Sites whose schema is missing or lives in another file are skipped.
 */
export function collectExampleSites(analysis: OpenApiAnalysis): ExampleSite[] {
  if (!analysis.parsedSpec) return [];
  const sites: ExampleSite[] = [];
  const modern = versionAtLeast(analysis, '3.1');

  for (const { schema, pointer } of walkSchemas(analysis)) {
    if ('example' in schema) {
      sites.push({ rule: EXAMPLE_INVALID_SCHEMA, valuePointer: `${pointer}/example`, schemaPointer: pointer, value: schema.example });
    }
    if (modern && Array.isArray(schema.examples)) {
      schema.examples.forEach((value, index) => {
        sites.push({ rule: EXAMPLE_INVALID_SCHEMA, valuePointer: `${pointer}/examples/${index}`, schemaPointer: pointer, value });
      });
    }
  }

  const fromContainer = (container: Record<string, unknown>, pointer: string) => {
    if (!validatable(container.schema)) return;
    const schemaPointer = `${pointer}/schema`;
    if ('example' in container) {
      sites.push({ rule: EXAMPLE_INVALID_MEDIA, valuePointer: `${pointer}/example`, schemaPointer, value: container.example });
    }
    for (const { valuePointer, value } of exampleValues(container.examples, `${pointer}/examples`)) {
      sites.push({ rule: EXAMPLE_INVALID_MEDIA, valuePointer, schemaPointer, value });
    }
  };

  for (const { mediaType, pointer } of walkMediaTypes(analysis)) fromContainer(mediaType, pointer);
  for (const { parameter, pointer } of walkParameters(analysis)) fromContainer(parameter, pointer);

  return sites;
}
