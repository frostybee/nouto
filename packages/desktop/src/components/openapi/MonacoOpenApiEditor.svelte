<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
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
  import type { OpenApiDiagnostic, OpenApiVersion } from '@nouto/core/services/openapi/types';
  import { pointerToAnchorOffsetRange, pointerToOffsetRange } from '@nouto/core/services/openapi/pointerMap';
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

  const SCHEMA_URI = 'https://nouto.invalid/openapi-meta-schema.json';

  let container: HTMLDivElement;
  // $state so the marker $effect below re-runs once mount assigns them.
  let editor = $state<monaco.editor.IStandaloneCodeEditor>();
  let model = $state<monaco.editor.ITextModel>();
  let themeObserver: MutationObserver | undefined;
  let updatingFromProp = false;
  const disposables: monaco.IDisposable[] = [];

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

  // configureMonacoYaml registers global language services — once per app run,
  // shared across remounts of this component.
  let yamlHandle: MonacoYaml | undefined;
  let associatedVersion: OpenApiVersion | undefined;

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
  // owner ('nouto-openapi'); monaco-yaml keeps completion + hover only.
  // Two producers would double-report YAML structural errors, and the yaml
  // worker's shallow schema pass is superseded by the Rust validator.
  function yamlOptions(version: OpenApiVersion) {
    return {
      enableSchemaRequest: false,
      hover: true,
      completion: true,
      validate: false,
      format: false,
      schemas: yamlSchemas(version),
    };
  }

  function associateSchema(version: OpenApiVersion): void {
    if (!yamlHandle) {
      yamlHandle = configureMonacoYaml(monaco, yamlOptions(version));
      associatedVersion = version;
      return;
    }
    if (version !== associatedVersion) {
      associatedVersion = version;
      // update() replaces the whole option set — pass everything, not a delta,
      // or validate would silently revert to its default (true).
      void yamlHandle.update(yamlOptions(version));
    }
  }

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
    associateSchema(schemaVersion ?? '3.1');
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

  $effect(() => {
    if (schemaVersion) associateSchema(schemaVersion);
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

  onDestroy(() => {
    window.removeEventListener('nouto-font-change', handleFontChange);
    themeObserver?.disconnect();
    for (const d of disposables) d.dispose();
    editor?.dispose();
    model?.dispose();
    // Worker env and monaco-yaml config are module-global and stay for remounts.
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
