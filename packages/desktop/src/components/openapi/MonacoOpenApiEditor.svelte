<script lang="ts" module>
  // monaco-editor MUST stay on 0.52.x: 0.53+ rewrote the ESM worker bootstrap
  // protocol (breaks monaco-yaml 5.x) and added an `exports` map that forbids
  // these deep esm/vs/... paths. The editor.api entry is the slim import — it
  // carries the full standalone editor but skips the language services barrel
  // (language/typescript alone is 11 MB raw) that the package root pulls in.
  import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
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
  import { openApiSession } from '../../lib/openapi/session.svelte';
  import { detectJsonContext, detectYamlContext } from '../../lib/openapi/completion/context';
  import {
    buildKeySuggestions,
    buildValueSuggestions,
  } from '../../lib/openapi/completion/items';
  import type { KeySuggestion, ValueSuggestion } from '../../lib/openapi/completion/items';
  import { resolveHoverDocs } from '../../lib/openapi/hoverDocs';
  import { buildQuickFixes } from '../../lib/openapi/quickFixes';

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

  /** Guards the globally registered providers to the OpenAPI editor's model. */
  function isOpenApiModel(model: monaco.editor.ITextModel): boolean {
    return model.uri.path.startsWith('/nouto/openapi.');
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

  const completionProvider: monaco.languages.CompletionItemProvider = {
    // '/' and '#' re-trigger while typing $ref pointers.
    triggerCharacters: [':', ' ', '"', "'", '-', '/', '#'],
    provideCompletionItems(model, position) {
      const empty = { suggestions: [] as monaco.languages.CompletionItem[] };
      if (!isOpenApiModel(model) || !settings.openApiIntelliSenseEnabled) return empty;
      const analysis = openApiSession.analysis;
      if (!analysis) return empty;

      const format = modelFormat(model);
      const full = format === 'json';
      const text = model.getValue();
      const offset = model.getOffsetAt(position);
      const map = buildPointerMap(text, format);
      const version = openApiSession.version ?? '3.1';
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
        return {
          suggestions: values.map(
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
          ),
        };
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
      if (!isOpenApiModel(model) || !settings.openApiIntelliSenseEnabled) return undefined;
      const format = modelFormat(model);
      const map = buildPointerMap(model.getValue(), format);
      const version = openApiSession.version ?? '3.1';
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
      if (!isOpenApiModel(model)) return empty;
      const analysis = openApiSession.analysis;
      if (!analysis) return empty;

      const format = modelFormat(model);
      const text = model.getValue();
      const map = buildPointerMap(text, format);
      const requested = {
        from: model.getOffsetAt(range.getStartPosition()),
        to: model.getOffsetAt(range.getEndPosition()),
      };
      const candidates = buildQuickFixes(
        { text, format },
        openApiSession.diagnostics,
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
      return { actions, dispose() {} };
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
    }
  }
</script>

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { isVscodeDark } from '@nouto/ui/lib/codemirror-theme';
  import type { EditorSurfaceProps } from './OpenApiEditorSurface.svelte';

  let {
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

  onMount(() => {
    ensureWorkerEnv();
    ensureJsonLanguage();
    ensureMonacoYaml(schemaVersion ?? '3.1', settings.openApiIntelliSenseEnabled);
    registerOpenApiProviders();
    applyTheme();

    const ext = format === 'json' ? 'json' : 'yaml';
    model = monaco.editor.createModel(content, format, monaco.Uri.parse(`file:///nouto/openapi.${ext}`));
    editor = monaco.editor.create(container, {
      model,
      automaticLayout: true,
      fontSize: editorFontPx(),
      fontFamily: editorFontFamily(),
      minimap: { enabled: false },
      readOnly: readonly,
      theme: 'nouto-openapi',
      scrollBeyondLastLine: false,
    });

    disposables.push(
      model.onDidChangeContent((event) => {
        if (updatingFromProp) return;
        onchange?.(model!.getValue());
        onedits?.(
          event.changes.map((c) => ({ from: c.rangeOffset, to: c.rangeOffset + c.rangeLength, insert: c.text }))
        );
      }),
      editor.onDidChangeCursorPosition((event) => {
        oncursorchange?.({
          line: event.position.lineNumber,
          column: event.position.column,
          offset: model!.getOffsetAt(event.position),
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

  // External content replacement (open/new document). Keystroke round-trips
  // are identical strings and skip the setValue, preserving cursor and undo.
  $effect(() => {
    if (model && content !== model.getValue()) {
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
  $effect(() => {
    if (!model) return;
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
    editor?.dispose();
    model?.dispose();
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
