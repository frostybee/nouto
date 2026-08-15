/**
 * Monaco bootstrap for the OpenAPI editor: the slim editor.api entry, the
 * explicit contribution list, worker environment, JSON tokenization, and the
 * monaco-yaml configuration. All state here is module-global by design —
 * remounts of the editor component reuse it.
 */
// monaco-editor MUST stay on 0.52.x: 0.53+ rewrote the ESM worker bootstrap
// protocol (breaks monaco-yaml 5.x) and added an `exports` map that forbids
// these deep esm/vs/... paths. editor.api is the slim entry: it skips the
// language services barrel (language/typescript alone is 11 MB raw) that the
// package root pulls in — but it also skips every editor contribution, which
// is why the explicit contrib list below exists.
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
// editor.api.js is ONLY the API surface + core editor: it registers zero
// editor contributions (the one exception is a formatting-conflict helper).
// Every interactive controller lives in editor.all.js, which also drags in
// contribs we have no providers for. So the needed ones are imported
// explicitly below — without them the language providers registered by
// monacoProviders.ts still resolve, but nothing ever invokes them or renders
// a result: no hover tooltip, no lightbulb, no completion widget, no
// go-to-definition. Marker squiggles are the misleading part — they keep
// working either way, because markerDecorations is imported by
// codeEditorWidget (core).
// Cross-contrib deps come along via their static imports (codeAction pulls
// message, markerHover pulls gotoError, suggest pulls snippetController2 —
// which our InsertAsSnippet completions need).
// DO NOT drop these to "slim down" the chunk: it silently guts IntelliSense.
// coreCommands (undo/redo, select-all, cursor motion) already arrives
// transitively through standaloneEditor; listed explicitly because
// editor.all.js does the same and the transitive path is not a contract.
import 'monaco-editor/esm/vs/editor/browser/coreCommands.js';
import 'monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution.js';
import 'monaco-editor/esm/vs/editor/contrib/codeAction/browser/codeActionContributions.js';
import 'monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController.js';
import 'monaco-editor/esm/vs/editor/contrib/gotoSymbol/browser/goToCommands.js';
import 'monaco-editor/esm/vs/editor/contrib/gotoSymbol/browser/link/goToDefinitionAtPosition.js';
import 'monaco-editor/esm/vs/editor/contrib/gotoError/browser/gotoError.js';
import 'monaco-editor/esm/vs/editor/contrib/contextmenu/browser/contextmenu.js';
import 'monaco-editor/esm/vs/editor/contrib/clipboard/browser/clipboard.js';
import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js';
import 'monaco-editor/esm/vs/editor/contrib/folding/browser/folding.js';
import 'monaco-editor/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching.js';
import 'monaco-editor/esm/vs/editor/contrib/comment/browser/comment.js';
import 'monaco-editor/esm/vs/editor/contrib/linesOperations/browser/linesOperations.js';
import 'monaco-editor/esm/vs/editor/contrib/multicursor/browser/multicursor.js';
import 'monaco-editor/esm/vs/editor/contrib/wordHighlighter/browser/wordHighlighter.js';
import 'monaco-editor/esm/vs/editor/contrib/cursorUndo/browser/cursorUndo.js';
import 'monaco-editor/esm/vs/editor/contrib/indentation/browser/indentation.js';
import 'monaco-editor/esm/vs/editor/contrib/smartSelect/browser/smartSelect.js';
// Ctrl+Left/Right/Backspace word-wise motion is a contrib, not a core command.
import 'monaco-editor/esm/vs/editor/contrib/wordOperations/browser/wordOperations.js';
// Cheap lazy tokenizer registration (no workers). JSON has no
// basic-languages entry — its tokenizer lives in language/json, whose
// monaco.contribution eagerly activates a validation pipeline + dedicated
// worker; diagnostics for JSON are the Rust pass, so a minimal Monarch JSON
// grammar is registered locally below instead.
import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution.js';
// Vite `?worker` imports emit same-origin worker chunks (no blob:
// bootstrap), which the Tauri CSP (`script-src 'self'`, no worker-src)
// requires — proven by the Phase 0 spike with zero CSP delta.
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker.js?worker';
import YamlWorker from 'monaco-yaml/yaml.worker.js?worker';
import { configureMonacoYaml, type MonacoYaml } from 'monaco-yaml';
// Deep import, proven Ajv-free by the Phase 0b bundle audit.
import { getOpenApiMetaSchema } from '@nouto/core/services/openapi/schemas';
import type { OpenApiVersion } from '@nouto/core/services/openapi/types';

export { monaco };

const SCHEMA_URI = 'https://nouto.invalid/openapi-meta-schema.json';

let jsonLanguageRegistered = false;

/** Tokenization-only JSON support (see the import note above). */
export function ensureJsonLanguage(): void {
  if (jsonLanguageRegistered || monaco.languages.getLanguages().some((l) => l.id === 'json')) {
    jsonLanguageRegistered = true;
    return;
  }
  jsonLanguageRegistered = true;
  monaco.languages.register({ id: 'json', extensions: ['.json'], mimetypes: ['application/json'] });
  monaco.languages.setLanguageConfiguration('json', {
    brackets: [
      ['{', '}'],
      ['[', ']'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '"', close: '"', notIn: ['string'] },
    ],
  });
  monaco.languages.setMonarchTokensProvider('json', {
    defaultToken: 'invalid',
    tokenizer: {
      root: [
        [/"(?:[^"\\]|\\.)*"(?=\s*:)/, 'type'],
        [/"(?:[^"\\]|\\.)*"/, 'string'],
        [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, 'number'],
        [/\b(?:true|false)\b/, 'keyword'],
        [/\bnull\b/, 'keyword'],
        [/[{}[\]]/, '@brackets'],
        [/[,:]/, 'delimiter'],
        [/\s+/, 'white'],
      ],
    },
  });
}

export function ensureWorkerEnv(): void {
  if (self.MonacoEnvironment) return;
  self.MonacoEnvironment = {
    getWorker(_moduleId: unknown, label: string) {
      if (label === 'yaml') return new YamlWorker();
      return new EditorWorker();
    },
  };
}

// configureMonacoYaml registers global language services — once per app run
// (module-level so remounts of the editor component reuse the same handle).
let yamlHandle: MonacoYaml | undefined;

function yamlSchemas(version: OpenApiVersion) {
  return [
    {
      // Synthetic id, never fetched (enableSchemaRequest: false); the query
      // string cache-busts monaco-yaml's schema store on version change.
      uri: `${SCHEMA_URI}?v=${version}`,
      fileMatch: ['**/*.yaml', '**/*.yml'],
      schema: getOpenApiMetaSchema(version, 'editor'),
    },
  ];
}

// validate: false — the merged 5-source pipeline is the single marker
// owner ('nouto-openapi'); monaco-yaml keeps schema-driven completion only
// (gated on the IntelliSense setting). hover: false — the curated
// hover provider in monacoProviders.ts replaces monaco-yaml's content-poor
// meta-schema hover. Two validators would double-report YAML structural
// errors, and the yaml worker's shallow schema pass is superseded by the
// Rust validator.
function yamlOptions(version: OpenApiVersion, intelliSenseEnabled: boolean) {
  return {
    enableSchemaRequest: false,
    hover: false,
    completion: intelliSenseEnabled,
    validate: false,
    format: false,
    schemas: yamlSchemas(version),
  };
}

export function ensureMonacoYaml(version: OpenApiVersion, intelliSenseEnabled: boolean): void {
  if (!yamlHandle) {
    yamlHandle = configureMonacoYaml(monaco, yamlOptions(version, intelliSenseEnabled));
  }
}

/** update() replaces the whole option set — pass everything, not a delta,
 * or validate would silently revert to its default (true). */
export function updateMonacoYaml(version: OpenApiVersion, intelliSenseEnabled: boolean): void {
  void yamlHandle?.update(yamlOptions(version, intelliSenseEnabled));
}
