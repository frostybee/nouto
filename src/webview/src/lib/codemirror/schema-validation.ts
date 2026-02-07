import { type Extension } from '@codemirror/state';
import { jsonSchema } from 'codemirror-json-schema';

/**
 * CodeMirror extension that validates JSON content against a JSON Schema.
 * Provides inline diagnostics (underlines + hover tooltips) for validation errors.
 */
export function schemaValidationExtension(schema: object): Extension {
  return jsonSchema(schema);
}
