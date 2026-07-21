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

type CompiledValidator = {
  (data: unknown): boolean;
  errors?: { instancePath?: string; message?: string }[] | null;
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
  return (validate.errors ?? []).map((err) => ({
    source: 'schema' as const,
    severity: 'error' as const,
    message: err.message ? `Schema: ${err.message}` : 'Schema validation failed',
    pointer: err.instancePath || undefined,
  }));
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
    // The 3.1/3.2 meta-schemas are JSON Schema 2020-12
    // ($dynamicRef/$dynamicAnchor); Ajv2020 is the draft-2020-12 build of Ajv v8.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Ajv2020 = require('ajv/dist/2020');
    const ajv = new (Ajv2020.default ?? Ajv2020)({ allErrors: true, strict: false, validateFormats: false });
    const schema = version === '3.1' ? openapi31MetaSchema : openapi32MetaSchema;
    validator = ajv.compile(schema) as CompiledValidator;
  }
  validators.set(version, validator);
  return validator;
}
