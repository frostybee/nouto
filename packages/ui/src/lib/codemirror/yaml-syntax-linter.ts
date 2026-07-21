import { parseDocument } from 'yaml';
import type { EditorView } from '@codemirror/view';
import type { Diagnostic } from '@codemirror/lint';

/**
 * YAML syntax linter mirroring @codemirror/lang-json's jsonParseLinter.
 *
 * @codemirror/lang-yaml ships no parse linter (its Lezer grammar is
 * error-tolerant by design) and codemirror-json-schema's yamlSchemaLinter
 * reports schema errors only, so this reuses the `yaml` parser (already in
 * the dependency tree via codemirror-json-schema) for syntax diagnostics.
 * YAMLParseError.pos is a [from, to] pair of UTF-16 offsets.
 */
export function yamlParseLinter() {
  return (view: EditorView): Diagnostic[] => {
    const text = view.state.doc.toString();
    if (!text.trim()) return [];
    const docLength = view.state.doc.length;
    const parsed = parseDocument(text, { strict: false });
    return parsed.errors.map((error) => {
      const [from, to] = error.pos;
      return {
        from: Math.min(from, docLength),
        to: Math.min(Math.max(to, from + 1), docLength),
        severity: 'error' as const,
        message: error.message,
      };
    });
  };
}
