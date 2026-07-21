import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { hoverTooltip } from '@codemirror/view';
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import { jsonLanguage, jsonParseLinter } from '@codemirror/lang-json';
import {
  jsonSchemaLinter,
  jsonSchemaHover,
  jsonCompletion,
  handleRefresh,
  stateExtensions,
} from 'codemirror-json-schema';

/** Provenance tag stamped onto every diagnostic a pipeline produces. */
export type LintSourceTag = 'syntax' | 'schema';

// Skip linting entirely when the document contains template expressions like
// {{...}} — the raw text is not valid JSON/YAML data until variables are
// substituted at send time.
const TEMPLATE_PATTERN = /\{\{[^}]+\}\}/;

/**
 * Wraps a lint-source factory so its diagnostics (a) are suppressed while the
 * document contains template expressions and (b) carry an explicit
 * `source` tag. The tag matters because @codemirror/lint merges every
 * linter's output into one shared state, and the libraries' own `source`
 * values are unreliable (jsonSchemaLinter reports the schema's title;
 * jsonParseLinter sets none).
 */
export function templateAwareLinter(
  factory: () => (view: EditorView) => Diagnostic[],
  sourceTag: LintSourceTag
): (view: EditorView) => Diagnostic[] {
  const base = factory();
  let warned = false;
  return (view: EditorView): Diagnostic[] => {
    if (TEMPLATE_PATTERN.test(view.state.doc.toString())) return [];
    let diagnostics: Diagnostic[];
    try {
      diagnostics = base(view);
    } catch (error) {
      // json-schema-library (inside jsonSchemaLinter) throws on schema
      // constructs it cannot compile (e.g. sibling not/oneOf combinators in
      // the OpenAPI meta-schemas). A broken schema must never break editing.
      if (!warned) {
        warned = true;
        console.warn(`[CodeMirror] ${sourceTag} linter failed; suppressing its diagnostics:`, error);
      }
      return [];
    }
    return diagnostics.map((diagnostic) => ({ ...diagnostic, source: sourceTag }));
  };
}

/**
 * Which lint/schema pipeline a given editor configuration needs. Pure —
 * extracted so the branching is unit-testable outside Svelte.
 */
export type SchemaPipelineKind =
  | 'none'
  | 'json-syntax'
  | 'json-schema'
  | 'yaml-syntax'
  | 'yaml-schema';

export function resolveSchemaPipeline(
  language: string,
  enableLint: boolean,
  hasSchema: boolean
): SchemaPipelineKind {
  if (!enableLint) return 'none';
  if (language === 'json') return hasSchema ? 'json-schema' : 'json-syntax';
  if (language === 'yaml') return hasSchema ? 'yaml-schema' : 'yaml-syntax';
  return 'none';
}

export function buildJsonSyntaxExtensions(): Extension[] {
  return [linter(templateAwareLinter(jsonParseLinter, 'syntax')), lintGutter()];
}

export function buildJsonSchemaExtensions(schema: object): Extension[] {
  return [
    linter(templateAwareLinter(jsonParseLinter, 'syntax')),
    linter(templateAwareLinter(jsonSchemaLinter, 'schema'), { needsRefresh: handleRefresh }),
    hoverTooltip(jsonSchemaHover()),
    jsonLanguage.data.of({ autocomplete: jsonCompletion() }),
    stateExtensions(schema as any),
    lintGutter(),
  ];
}

// The YAML pipeline is behind dynamic imports so that entries which never use
// YAML linting (every current webview) do not pay for codemirror-json-schema's
// yaml entry point or the yaml parser.

export async function buildYamlSyntaxExtensions(): Promise<Extension[]> {
  const { yamlParseLinter } = await import('./yaml-syntax-linter');
  return [linter(templateAwareLinter(yamlParseLinter, 'syntax')), lintGutter()];
}

export async function buildYamlSchemaExtensions(schema: object): Promise<Extension[]> {
  const [{ yamlSchemaLinter, yamlSchemaHover, yamlCompletion }, { yamlLanguage }, { yamlParseLinter }] =
    await Promise.all([
      import('codemirror-json-schema/yaml'),
      import('@codemirror/lang-yaml'),
      import('./yaml-syntax-linter'),
    ]);
  return [
    linter(templateAwareLinter(yamlParseLinter, 'syntax')),
    linter(templateAwareLinter(yamlSchemaLinter, 'schema'), { needsRefresh: handleRefresh }),
    hoverTooltip(yamlSchemaHover()),
    yamlLanguage.data.of({ autocomplete: yamlCompletion() }),
    stateExtensions(schema as any),
    lintGutter(),
  ];
}
