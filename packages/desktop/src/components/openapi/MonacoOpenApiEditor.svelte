<script lang="ts" module>
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
  // explicitly below — without them the language providers registered further
  // down still resolve, but nothing ever invokes them or renders a result:
  // no hover tooltip, no lightbulb, no completion widget, no go-to-definition.
  // Marker squiggles are the misleading part — they keep working either way,
  // because markerDecorations is imported by codeEditorWidget (core).
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
  // worker; diagnostics for JSON are Phase 2's Rust pass, so a minimal
  // Monarch JSON grammar is registered locally below instead.
  import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution.js';
  // Vite `?worker` imports emit same-origin worker chunks (no blob:
  // bootstrap), which the Tauri CSP (`script-src 'self'`, no worker-src)
  // requires — proven by the Phase 0 spike with zero CSP delta.
  import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker.js?worker';
  import YamlWorker from 'monaco-yaml/yaml.worker.js?worker';
  import { configureMonacoYaml, type MonacoYaml } from 'monaco-yaml';
  // Deep import, proven Ajv-free by the Phase 0b bundle audit.
  import { getOpenApiMetaSchema } from '@nouto/core/services/openapi/schemas';
  import type {
    OpenApiDiagnostic,
    OpenApiFormat,
    OpenApiVersion,
  } from '@nouto/core/services/openapi/types';
  import {
    buildPointerMap,
    pointerToAnchorOffsetRange,
    pointerToOffsetRange,
  } from '@nouto/core/services/openapi/pointerMap';
  import type { SpecTextEdit } from '@nouto/core/services/openapi/specEdit';
  import { settings } from '@nouto/ui/stores/settings.svelte';
  import { getSession, type OpenApiSessionState } from '../../lib/openapi/session.svelte';
  import { detectJsonContext, detectYamlContext } from '../../lib/openapi/completion/context';
  import {
    buildKeySuggestions,
    buildValueSuggestions,
  } from '../../lib/openapi/completion/items';
  import type { KeySuggestion, ValueSuggestion } from '../../lib/openapi/completion/items';
  import { resolveHoverDocs } from '../../lib/openapi/hoverDocs';
  import { buildQuickFixes } from '../../lib/openapi/quickFixes';
  import { buildExternalQuickFixes } from '../../lib/openapi/externalQuickFixes';
  import {
    crossFileRefTargets,
    parsePartialRefValue,
    typedRefValue,
  } from '../../lib/openapi/completion/externalRefCompletion';
  import { getExternalAnalysis } from '../../lib/openapi/externalAnalysisCache';
  import { tauriFileResolver } from '../../lib/openapi/tauriFileResolver';
  import { pathToFileUri, normalizeFileUri } from '../../lib/openapi/pathUtils';
  import { resolveRefDefinition } from '../../lib/openapi/definition';
  import { openReferencedFileAndReveal } from '../../lib/openapi/crossFileNav';
  import { relativeLabel } from '@nouto/core/services/openapi/outline';
  import { enumerateRefTargets } from '@nouto/core/services/openapi/completion/refTargets';

  const SCHEMA_URI = 'https://nouto.invalid/openapi-meta-schema.json';

  /** Post-edit cursor target: select a pointer's value (placeholder overwrite)
   * or its key anchor (inline rename). */
  export interface RevealAndSelect {
    pointer: string;
    selectValue: boolean;
  }

  let jsonLanguageRegistered = false;

  /** Tokenization-only JSON support (see the import note above). */
  function ensureJsonLanguage(): void {
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

  function ensureWorkerEnv(): void {
    if (self.MonacoEnvironment) return;
    self.MonacoEnvironment = {
      getWorker(_moduleId: unknown, label: string) {
        if (label === 'yaml') return new YamlWorker();
        return new EditorWorker();
      },
    };
  }

  // configureMonacoYaml registers global language services — once per app run
  // (module-level so remounts of this component reuse the same handle).
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
  // registerHoverProvider below replaces monaco-yaml's content-poor
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

  function ensureMonacoYaml(version: OpenApiVersion, intelliSenseEnabled: boolean): void {
    if (!yamlHandle) {
      yamlHandle = configureMonacoYaml(monaco, yamlOptions(version, intelliSenseEnabled));
    }
  }

  /** update() replaces the whole option set — pass everything, not a delta,
   * or validate would silently revert to its default (true). */
  function updateMonacoYaml(version: OpenApiVersion, intelliSenseEnabled: boolean): void {
    void yamlHandle?.update(yamlOptions(version, intelliSenseEnabled));
  }

  /* ------------------------------------------------------------------------ */
  /* OpenAPI language providers (curated completion gaps, hover, quick fixes) */
  /* ------------------------------------------------------------------------ */

  /** Guards the globally registered providers to the OpenAPI editor's models. */
  function isOpenApiModel(model: monaco.editor.ITextModel): boolean {
    return model.uri.path.startsWith('/nouto/openapi/');
  }

  /**
   * Model URIs are file:///nouto/openapi/<sessionId>.<ext> — opaque session
   * ids, deliberately NOT real file paths: with real-file URIs Monaco's native
   * go-to-definition would setModel an already-open target itself, bypassing
   * the session registry and desyncing the tab strip. The synthetic namespace
   * forces all cross-file navigation through our editor opener.
   */
  function sessionIdFromModel(model: monaco.editor.ITextModel): string | undefined {
    return /^\/nouto\/openapi\/(.+)\.(?:yaml|json)$/.exec(model.uri.path)?.[1];
  }

  /** Resolves the session a model belongs to (providers run for any open tab's model). */
  function sessionForModel(model: monaco.editor.ITextModel): OpenApiSessionState | undefined {
    const id = sessionIdFromModel(model);
    return id ? getSession(id) : undefined;
  }

  function modelFormat(model: monaco.editor.ITextModel): OpenApiFormat {
    return model.getLanguageId() === 'json' ? 'json' : 'yaml';
  }

  function offsetsToRange(
    model: monaco.editor.ITextModel,
    from: number,
    to: number
  ): monaco.Range {
    const start = model.getPositionAt(from);
    const end = model.getPositionAt(to);
    return new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column);
  }

  /** IMarkerData.code may be a string or {value, target}; ours is a string. */
  function markerCode(marker: monaco.editor.IMarkerData): string | undefined {
    return typeof marker.code === 'string' ? marker.code : marker.code?.value;
  }

  function keySuggestionKind(kind: KeySuggestion['kind']): monaco.languages.CompletionItemKind {
    switch (kind) {
      case 'object':
        return monaco.languages.CompletionItemKind.Module;
      case 'array':
        return monaco.languages.CompletionItemKind.Field;
      case 'enum':
        return monaco.languages.CompletionItemKind.EnumMember;
      case 'dynamic-key':
        return monaco.languages.CompletionItemKind.Value;
      default:
        return monaco.languages.CompletionItemKind.Property;
    }
  }

  /**
   * Cross-file `$ref` suggestions (Phase 5). With a local file part typed
   * (`./common.yaml#/…`), suggests that file's ref targets; with no `#` yet,
   * suggests whole refs into files the document already references (from the
   * cached external analysis — no extra I/O). Failures degrade silently to
   * the in-document items.
   */
  async function appendCrossFileSuggestions(
    out: monaco.languages.CompletionItem[],
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    session: OpenApiSessionState,
    parentKind: Parameters<typeof enumerateRefTargets>[1],
    inQuotes: boolean,
    isYaml: boolean
  ): Promise<void> {
    if (!settings.openApiExternalRefsEnabled || !session.documentUri) return;
    const before = model.getValueInRange(
      new monaco.Range(position.lineNumber, 1, position.lineNumber, position.column)
    );
    const typed = typedRefValue(before);
    if (!typed) return;
    // typedRefValue speaks 0-based characters; Monaco columns are 1-based.
    const replaceRange = new monaco.Range(
      position.lineNumber,
      typed.startCharacter + 1,
      position.lineNumber,
      position.column
    );
    const item = (ref: string): monaco.languages.CompletionItem => ({
      label: ref,
      kind: monaco.languages.CompletionItemKind.Reference,
      // A leading '#' starts a comment in unquoted YAML, so YAML refs must be
      // quoted; JSON values are quoted unless the cursor already sits in one.
      insertText: inQuotes ? ref : isYaml ? `'${ref}'` : `"${ref}"`,
      range: replaceRange,
      filterText: ref,
    });
    const fromUri = pathToFileUri(session.documentUri);

    try {
      if (typed.text.includes('#')) {
        const partial = parsePartialRefValue(typed.text);
        if (!partial) return;
        const pointers = await crossFileRefTargets(fromUri, partial, parentKind, tauriFileResolver);
        for (const pointer of pointers) out.push(item(`${partial.filePart}${pointer}`));
        return;
      }

      const external = await getExternalAnalysis(session, tauriFileResolver);
      for (const [uri, file] of external.resolvedFiles) {
        const rel = relativeLabel(fromUri, uri);
        const display = rel.startsWith('../') ? rel : `./${rel}`;
        for (const pointer of enumerateRefTargets(file.parsed, parentKind)) {
          out.push(item(`${display}${pointer}`));
        }
      }
    } catch {
      // Unresolvable/unreadable targets must never break in-document completion.
    }
  }

  const completionProvider: monaco.languages.CompletionItemProvider = {
    // '/' and '#' re-trigger while typing $ref pointers.
    triggerCharacters: [':', ' ', '"', "'", '-', '/', '#'],
    async provideCompletionItems(model, position) {
      const empty = { suggestions: [] as monaco.languages.CompletionItem[] };
      if (!settings.openApiIntelliSenseEnabled) return empty;
      const session = sessionForModel(model);
      const analysis = session?.analysis;
      if (!session || !analysis) return empty;

      const format = modelFormat(model);
      const full = format === 'json';
      const text = model.getValue();
      const offset = model.getOffsetAt(position);
      const map = buildPointerMap(text, format);
      const version = session.version ?? '3.1';
      const ctx =
        format === 'json'
          ? detectJsonContext(text, offset, map)
          : detectYamlContext(text, offset, map);
      if (ctx.mode === 'none') return empty;

      // CompletionItem.range is required in Monaco (no vscode-style default):
      // fall back to the current word, mirroring vscode's implicit behavior.
      const word = model.getWordUntilPosition(position);
      const defaultRange = new monaco.Range(
        position.lineNumber,
        word.startColumn,
        position.lineNumber,
        word.endColumn
      );

      if (ctx.mode === 'value') {
        const values = buildValueSuggestions(ctx, version, analysis, { full });
        const suggestions = values.map(
          (value: ValueSuggestion): monaco.languages.CompletionItem => ({
            label: value.label,
            kind:
              value.kind === 'ref'
                ? monaco.languages.CompletionItemKind.Reference
                : monaco.languages.CompletionItemKind.EnumMember,
            insertText: value.insertText,
            range: defaultRange,
            documentation: value.docs ? { value: value.docs } : undefined,
            filterText: value.label,
          })
        );
        if (ctx.propertyName === '$ref') {
          await appendCrossFileSuggestions(
            suggestions,
            model,
            position,
            session,
            ctx.parentKind,
            ctx.inQuotes,
            format === 'yaml'
          );
        }
        return { suggestions };
      }

      const range =
        ctx.wordStart !== undefined
          ? monaco.Range.fromPositions(model.getPositionAt(ctx.wordStart), position)
          : defaultRange;
      const keys = buildKeySuggestions(ctx, version, analysis, { full });
      return {
        suggestions: keys.map(
          (key: KeySuggestion): monaco.languages.CompletionItem => ({
            label: key.name,
            kind: keySuggestionKind(key.kind),
            insertText: key.snippet,
            insertTextRules: key.isSnippet
              ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
              : undefined,
            range,
            documentation: key.docs ? { value: key.docs } : undefined,
            detail: key.detail,
          })
        ),
      };
    },
  };

  const hoverProvider: monaco.languages.HoverProvider = {
    provideHover(model, position) {
      if (!settings.openApiIntelliSenseEnabled) return undefined;
      const session = sessionForModel(model);
      if (!session) return undefined;
      const format = modelFormat(model);
      const map = buildPointerMap(model.getValue(), format);
      const version = session.version ?? '3.1';
      const result = resolveHoverDocs(map, model.getOffsetAt(position), version);
      if (!result) return undefined;
      return {
        contents: [{ value: result.docs }],
        range: offsetsToRange(model, result.range.from, result.range.to),
      };
    },
  };

  const codeActionProvider: monaco.languages.CodeActionProvider = {
    provideCodeActions(model, range, context) {
      const empty = { actions: [] as monaco.languages.CodeAction[], dispose() {} };
      const session = sessionForModel(model);
      const analysis = session?.analysis;
      if (!session || !analysis) return empty;

      const format = modelFormat(model);
      const text = model.getValue();
      const map = buildPointerMap(text, format);
      const requested = {
        from: model.getOffsetAt(range.getStartPosition()),
        to: model.getOffsetAt(range.getEndPosition()),
      };
      const candidates = buildQuickFixes(
        { text, format },
        session.diagnostics,
        analysis,
        map,
        requested
      );
      const actions = candidates.map(
        (candidate): monaco.languages.CodeAction => ({
          title: candidate.title,
          kind: 'quickfix',
          diagnostics: context.markers.filter((marker) => markerCode(marker) === candidate.code),
          edit: {
            edits: candidate.edits.map((edit) => ({
              resource: model.uri,
              // Stale actions (user kept typing before clicking) are rejected
              // instead of mis-applied.
              versionId: model.getVersionId(),
              textEdit: {
                range: offsetsToRange(model, edit.offset, edit.offset + edit.length),
                text: edit.text,
              },
            })),
          },
        })
      );
      // Cross-file fixes (Phase 5): side-effecting apply() dispatched through
      // a command — they edit ANOTHER document or create a file, which a
      // CodeAction.edit on this model cannot express.
      if (settings.openApiExternalRefsEnabled) {
        externalFixRegistry.clear();
        for (const fix of buildExternalQuickFixes(session, session.diagnostics, map, requested)) {
          const fixId = `external-fix-${++externalFixSeq}`;
          externalFixRegistry.set(fixId, fix.apply);
          actions.push({
            title: fix.title,
            kind: 'quickfix',
            diagnostics: context.markers.filter((marker) => markerCode(marker) === fix.code),
            command: { id: EXTERNAL_FIX_COMMAND, title: fix.title, arguments: [fixId] },
          });
        }
      }
      return { actions, dispose() {} };
    },
  };

  /** apply() closures for the currently offered external fixes (rebuilt per lightbulb). */
  const EXTERNAL_FIX_COMMAND = 'nouto.openapi.applyExternalQuickFix';
  const externalFixRegistry = new Map<string, () => Promise<void>>();
  let externalFixSeq = 0;

  /**
   * External definitions in flight (Phase 5): the definition provider returns
   * a placeholder Location whose URI has no model, Monaco hands that resource
   * to the editor opener, and the target pointer travels through this map
   * (the opener API has no pointer parameter; last-write-wins is fine — one
   * navigation happens at a time). Keys are normalizeFileUri'd because Monaco
   * Uri round-trips re-encode drive colons.
   */
  const pendingExternalDefinitions = new Map<string, string>();

  function externalDefinitionKey(uriText: string): string {
    try {
      return normalizeFileUri(uriText);
    } catch {
      return uriText;
    }
  }

  const definitionProvider: monaco.languages.DefinitionProvider = {
    provideDefinition(model, position) {
      const session = sessionForModel(model);
      if (!session?.analysis) return undefined;
      const format = modelFormat(model);
      const map = buildPointerMap(model.getValue(), format);
      const fromUri = session.documentUri ? pathToFileUri(session.documentUri) : undefined;
      const def = resolveRefDefinition(
        map,
        session.analysis,
        model.getOffsetAt(position),
        fromUri,
        tauriFileResolver
      );
      if (!def) return undefined;
      if (def.kind === 'internal') {
        return { uri: model.uri, range: offsetsToRange(model, def.range.from, def.range.to) };
      }
      if (!settings.openApiExternalRefsEnabled) return undefined;
      pendingExternalDefinitions.set(externalDefinitionKey(def.targetFileUri), def.targetPointer);
      // Placeholder range: no model exists for the target URI (model URIs are
      // synthetic session ids by design), so Monaco routes to the opener,
      // which does the real open + pointer reveal.
      return { uri: monaco.Uri.parse(def.targetFileUri), range: new monaco.Range(1, 1, 1, 1) };
    },
  };

  // Language providers are global (per language, not per editor) — register
  // once per app run and never dispose; remounts reuse them, same lifetime
  // contract as yamlHandle. Pushing these into a mount's disposables would
  // silently kill IntelliSense on the second document open.
  let providersRegistered = false;

  function registerOpenApiProviders(): void {
    if (providersRegistered) return;
    providersRegistered = true;
    for (const language of ['yaml', 'json'] as const) {
      monaco.languages.registerHoverProvider(language, hoverProvider);
      monaco.languages.registerCompletionItemProvider(language, completionProvider);
      monaco.languages.registerCodeActionProvider(language, codeActionProvider, {
        providedCodeActionKinds: ['quickfix'],
      });
      monaco.languages.registerDefinitionProvider(language, definitionProvider);
    }
    monaco.editor.registerCommand(EXTERNAL_FIX_COMMAND, (_accessor: unknown, fixId: string) => {
      const apply = externalFixRegistry.get(fixId);
      if (apply) void apply();
    });
    // Called by standalone Monaco when navigation targets a resource with no
    // live model (every external definition, by construction).
    monaco.editor.registerEditorOpener({
      openCodeEditor(_source, resource) {
        const key = externalDefinitionKey(resource.toString(true));
        const pointer = pendingExternalDefinitions.get(key);
        if (pointer === undefined) return false;
        pendingExternalDefinitions.delete(key);
        void openReferencedFileAndReveal(key, pointer);
        return true;
      },
    });
  }
</script>

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { isVscodeDark } from '@nouto/ui/lib/codemirror-theme';
  import type { EditorSurfaceProps } from './OpenApiEditorSurface.svelte';

  let {
    sessionId,
    content,
    format,
    schemaVersion,
    readonly = false,
    diagnostics,
    pointerMap,
    onchange,
    onsave,
    onedits,
    oncursorchange,
  }: EditorSurfaceProps = $props();

  let container: HTMLDivElement;
  // $state so the marker $effect below re-runs once mount assigns them.
  let editor = $state<monaco.editor.IStandaloneCodeEditor>();
  let model = $state<monaco.editor.ITextModel>();
  let themeObserver: MutationObserver | undefined;
  let updatingFromProp = false;
  const disposables: monaco.IDisposable[] = [];
  // One model per session, swapped via editor.setModel on tab switch —
  // per-model undo stacks come free, and view state round-trips per tab.
  const modelsById = new Map<string, monaco.editor.ITextModel>();
  const modelListeners = new Map<string, monaco.IDisposable>();
  const viewStates = new Map<string, monaco.editor.ICodeEditorViewState>();
  let currentSessionId: string | null = null;

  /** Reads a CSS custom property, keeping only hex colors (Monaco themes reject rgba()/var()). */
  function readColor(styles: CSSStyleDeclaration, name: string): string | undefined {
    const value = styles.getPropertyValue(name).trim();
    return /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value) ? value : undefined;
  }

  function applyTheme(): void {
    const dark = isVscodeDark();
    const styles = getComputedStyle(document.body);
    const colors: Record<string, string> = {};
    const mapping: Record<string, string> = {
      'editor.background': '--hf-editor-background',
      'editor.foreground': '--hf-editor-foreground',
      'editorLineNumber.foreground': '--hf-editorLineNumber-foreground',
      'editorLineNumber.activeForeground': '--hf-editorLineNumber-activeForeground',
      'editor.selectionBackground': '--hf-editor-selectionBackground',
      'editorCursor.foreground': '--hf-editorCursor-foreground',
      'editor.lineHighlightBackground': '--hf-editor-lineHighlightBackground',
      'editorWidget.background': '--hf-editorWidget-background',
      'editorWidget.border': '--hf-editorWidget-border',
    };
    for (const [monacoKey, cssVar] of Object.entries(mapping)) {
      const value = readColor(styles, cssVar);
      if (value) colors[monacoKey] = value;
    }
    monaco.editor.defineTheme('nouto-openapi', {
      base: dark ? 'vs-dark' : 'vs',
      inherit: true,
      rules: [],
      colors,
    });
    monaco.editor.setTheme('nouto-openapi');
  }

  /** Font size in px derived from the rem root, so the editor follows the app's interface scale. */
  function editorFontPx(): number {
    return parseFloat(getComputedStyle(document.documentElement).fontSize);
  }

  function editorFontFamily(): string | undefined {
    const family = getComputedStyle(document.body).getPropertyValue('--hf-editor-font-family').trim();
    return family || undefined;
  }

  function handleFontChange(): void {
    editor?.updateOptions({ fontSize: editorFontPx(), fontFamily: editorFontFamily() });
  }

  /**
   * Creates-or-reuses the session's model and attaches it to the editor,
   * saving/restoring per-tab view state (cursor, scroll, folding) around the
   * swap. Undo history lives on the model, so tab switches keep it natively.
   */
  function activateModel(id: string, nextContent: string, nextFormat: OpenApiFormat): void {
    if (!editor || currentSessionId === id) return;
    if (currentSessionId) {
      const outgoing = editor.saveViewState();
      if (outgoing) viewStates.set(currentSessionId, outgoing);
    }
    let next = modelsById.get(id);
    if (!next) {
      const ext = nextFormat === 'json' ? 'json' : 'yaml';
      next = monaco.editor.createModel(
        nextContent,
        nextFormat,
        monaco.Uri.parse(`file:///nouto/openapi/${id}.${ext}`)
      );
      modelsById.set(id, next);
      const created = next;
      modelListeners.set(
        id,
        created.onDidChangeContent((event) => {
          // Only the attached model receives user edits; the guard keeps a
          // stray programmatic change to a background model from being
          // reported as an active-session edit.
          if (updatingFromProp || created !== model) return;
          onchange?.(created.getValue());
          onedits?.(
            event.changes.map((c) => ({ from: c.rangeOffset, to: c.rangeOffset + c.rangeLength, insert: c.text }))
          );
        })
      );
    }
    editor.setModel(next);
    model = next;
    currentSessionId = id;
    const saved = viewStates.get(id);
    if (saved) editor.restoreViewState(saved);
  }

  /** Disposes a closed session's model + view state (called on tab close). */
  export function disposeSession(id: string): void {
    const target = modelsById.get(id);
    viewStates.delete(id);
    if (!target) return;
    if (editor?.getModel() === target) {
      editor.setModel(null);
      if (model === target) model = undefined;
    }
    if (currentSessionId === id) currentSessionId = null;
    modelListeners.get(id)?.dispose();
    modelListeners.delete(id);
    target.dispose();
    modelsById.delete(id);
  }

  onMount(() => {
    ensureWorkerEnv();
    ensureJsonLanguage();
    ensureMonacoYaml(schemaVersion ?? '3.1', settings.openApiIntelliSenseEnabled);
    registerOpenApiProviders();
    applyTheme();

    // model: null (not undefined) — undefined would auto-create a default
    // model; activateModel below attaches the session's own.
    editor = monaco.editor.create(container, {
      model: null,
      automaticLayout: true,
      fontSize: editorFontPx(),
      fontFamily: editorFontFamily(),
      minimap: { enabled: false },
      readOnly: readonly,
      theme: 'nouto-openapi',
      scrollBeyondLastLine: false,
    });
    activateModel(sessionId, content, format);

    disposables.push(
      editor.onDidChangeCursorPosition((event) => {
        const current = editor?.getModel();
        if (!current) return;
        oncursorchange?.({
          line: event.position.lineNumber,
          column: event.position.column,
          offset: current.getOffsetAt(event.position),
        });
      })
    );

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => onsave?.());

    // Desktop toggles data-theme on <html>; watch it (not body's VS Code
    // webview attributes) and re-derive the Monaco theme from computed styles.
    themeObserver = new MutationObserver(() => applyTheme());
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    window.addEventListener('nouto-font-change', handleFontChange);
  });

  // Tab switch: attach (or create) the newly-active session's model.
  $effect(() => {
    if (editor && sessionId) activateModel(sessionId, content, format);
  });

  // External content replacement (outline edits from stale state, reload).
  // Keystroke round-trips are identical strings and skip the setValue,
  // preserving cursor and undo. The session guard matters on tab switches:
  // this effect can run before activateModel in the same flush, when
  // `content` already belongs to the new session but `model` is still the
  // old tab's — writing then would corrupt the background document.
  $effect(() => {
    if (model && sessionIdFromModel(model) === sessionId && content !== model.getValue()) {
      updatingFromProp = true;
      model.setValue(content);
      updatingFromProp = false;
    }
  });

  // Version + IntelliSense sync in one effect: Svelte's dependency tracking
  // re-runs it on either change; the full option set is always passed.
  $effect(() => {
    updateMonacoYaml(schemaVersion ?? '3.1', settings.openApiIntelliSenseEnabled);
  });

  $effect(() => {
    editor?.updateOptions({ readOnly: readonly });
  });

  function diagnosticToMarker(diagnostic: OpenApiDiagnostic): monaco.editor.IMarkerData {
    let from = 0;
    let to = 0;
    const syntaxData = diagnostic.data as { from?: unknown; to?: unknown } | undefined;
    if (
      diagnostic.source === 'syntax' &&
      typeof syntaxData?.from === 'number' &&
      typeof syntaxData?.to === 'number'
    ) {
      // Syntax errors carry raw offsets — a broken document has no pointers.
      from = syntaxData.from;
      to = syntaxData.to;
    } else if (pointerMap) {
      const range =
        typeof diagnostic.data?.missingProperty === 'string'
          ? pointerToAnchorOffsetRange(pointerMap, diagnostic.pointer ?? '')
          : pointerToOffsetRange(pointerMap, diagnostic.pointer ?? '');
      if (range) {
        from = range.from;
        to = range.to;
      }
    }
    const start = model!.getPositionAt(from);
    const end = model!.getPositionAt(Math.max(to, from + 1));
    return {
      startLineNumber: start.lineNumber,
      startColumn: start.column,
      endLineNumber: end.lineNumber,
      endColumn: end.column,
      message: diagnostic.message,
      severity:
        diagnostic.severity === 'error'
          ? monaco.MarkerSeverity.Error
          : diagnostic.severity === 'warning'
            ? monaco.MarkerSeverity.Warning
            : monaco.MarkerSeverity.Info,
      source: 'nouto-openapi',
      code: diagnostic.code ?? diagnostic.source,
    };
  }

  // Single marker owner: the merged pipeline's diagnostics, converted here.
  // Same session guard as the content effect above: on a tab switch this can
  // run while `diagnostics` already belongs to the new session but `model` is
  // still the old tab's — stamping then would mark the wrong document.
  $effect(() => {
    if (!model || sessionIdFromModel(model) !== sessionId) return;
    monaco.editor.setModelMarkers(
      model,
      'nouto-openapi',
      (diagnostics ?? []).map(diagnosticToMarker)
    );
  });

  /** Scrolls to and selects the position at a UTF-16 offset (outline reveal). */
  export function revealOffset(offset: number): void {
    if (!editor || !model) return;
    const position = model.getPositionAt(offset);
    editor.revealPositionInCenterIfOutsideViewport(position);
    editor.setPosition(position);
    editor.focus();
  }

  /**
   * Applies an offset-based edit batch as exactly ONE undo step, then
   * optionally reveals + selects a pointer in the post-edit document (value
   * selected for placeholder overwrite, key anchor for inline rename).
   * The outline edit path — quick fixes are applied by Monaco itself.
   */
  export function applyEdits(edits: SpecTextEdit[], reveal?: RevealAndSelect): void {
    if (!editor || !model || edits.length === 0) return;
    const ops = edits.map((edit) => ({
      range: offsetsToRange(model!, edit.offset, edit.offset + edit.length),
      text: edit.text,
    }));
    // executeEdits lands on the undo stack but pushes no undo stop of its own;
    // bracketing with explicit stops seals the batch as a single Ctrl+Z and
    // keeps it from merging into the user's surrounding keystrokes.
    editor.pushUndoStop();
    editor.executeEdits('nouto-openapi-outline', ops);
    editor.pushUndoStop();
    if (!reveal) return;
    // Imperative rebuild: this runs synchronously inside a click handler,
    // before any $derived pointer map upstream has recomputed.
    const newMap = buildPointerMap(model.getValue(), format);
    const range = reveal.selectValue
      ? pointerToOffsetRange(newMap, reveal.pointer)
      : pointerToAnchorOffsetRange(newMap, reveal.pointer);
    if (range) {
      const start = model.getPositionAt(range.from);
      const end = model.getPositionAt(range.to);
      editor.setSelection(
        new monaco.Selection(start.lineNumber, start.column, end.lineNumber, end.column)
      );
      editor.revealRangeInCenterIfOutsideViewport(
        new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column)
      );
    }
    editor.focus();
  }

  onDestroy(() => {
    window.removeEventListener('nouto-font-change', handleFontChange);
    themeObserver?.disconnect();
    for (const d of disposables) d.dispose();
    for (const listener of modelListeners.values()) listener.dispose();
    modelListeners.clear();
    editor?.dispose();
    for (const m of modelsById.values()) m.dispose();
    modelsById.clear();
    viewStates.clear();
    // Worker env, monaco-yaml config, and language providers are
    // module-global and stay for remounts.
  });
</script>

<div class="monaco-host" bind:this={container}></div>

<style>
  .monaco-host {
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
</style>
