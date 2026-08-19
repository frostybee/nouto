<script lang="ts" module>
  // Monaco bootstrap (contribs, workers, monaco-yaml) lives in monacoSetup.ts;
  // the OpenAPI language providers live in monacoProviders.ts. Both are
  // module-global by design — remounts of this component reuse them.
  import {
    ensureJsonLanguage,
    ensureMonacoYaml,
    ensureWorkerEnv,
    monaco,
    updateMonacoYaml,
  } from './monacoSetup';
  import { offsetsToRange, registerOpenApiProviders, sessionIdFromModel } from './monacoProviders';
  import { isAnchoredDiagnostic } from '@nouto/core/services/openapi/types';
  import type { OpenApiDiagnostic, OpenApiFormat } from '@nouto/core/services/openapi/types';
  import {
    buildPointerMap,
    pointerToAnchorOffsetRange,
    pointerToOffsetRange,
  } from '@nouto/core/services/openapi/pointerMap';
  import type { SpecTextEdit } from '@nouto/core/services/openapi/specEdit';
  import { settings } from '@nouto/ui/stores/settings.svelte';

  import type { RevealAndSelect } from './monacoProviders';
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
  /** A computed --hf-* colour as Monaco hex (#rrggbb / #rrggbbaa); undefined if unusable. */
  function readColor(styles: CSSStyleDeclaration, name: string): string | undefined {
    const value = styles.getPropertyValue(name).trim();
    if (/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value)) return value;
    if (/^#[0-9a-fA-F]{3}$/.test(value)) {
      return '#' + [...value.slice(1)].map((c) => c + c).join('');
    }
    // Engine-backed (custom) themes emit rgba() washes; Monaco wants hex8.
    const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(value);
    if (!m) return undefined;
    const hex = (n: number) =>
      Math.max(0, Math.min(255, Math.round(n)))
        .toString(16)
        .padStart(2, '0');
    const alpha = m[4] === undefined ? 1 : Number(m[4]);
    return '#' + hex(+m[1]) + hex(+m[2]) + hex(+m[3]) + (alpha < 1 ? hex(alpha * 255) : '');
  }

  /**
   * Syntax token colours, from the same --hf-* variables the CodeMirror
   * editors use (packages/ui/src/lib/codemirror-theme.ts), so the OpenAPI
   * editor follows the active theme — built-in or custom. Monaco needs
   * literal hex, so these are re-read on every theme change.
   */
  const TOKEN_VARS: [tokens: string[], cssVar: string][] = [
    // YAML keys tokenize as `type`; JSON keys as `string.key.json`.
    [['type', 'string.key.json'], '--hf-symbolIcon-propertyForeground'],
    [['string', 'string.value.json', 'string.yaml'], '--hf-debugTokenExpression-string'],
    [['number', 'number.date', 'number.float', 'number.hex'], '--hf-debugTokenExpression-number'],
    [['keyword', 'constant'], '--hf-debugTokenExpression-boolean'],
    [['comment'], '--hf-terminal-ansiGreen'],
    [['tag'], '--hf-terminal-ansiBlue'],
    [['delimiter', 'operators', 'operator'], '--hf-editor-foreground'],
    [['invalid'], '--hf-errorForeground'],
  ];

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
      'editorWidget.foreground': '--hf-editorWidget-foreground',
      'editorSuggestWidget.background': '--hf-editorSuggestWidget-background',
      'editorSuggestWidget.border': '--hf-editorSuggestWidget-border',
      'editorSuggestWidget.foreground': '--hf-editorSuggestWidget-foreground',
      'editorSuggestWidget.selectedBackground': '--hf-editorSuggestWidget-selectedBackground',
      'editorHoverWidget.background': '--hf-editorHoverWidget-background',
      'editorHoverWidget.border': '--hf-editorHoverWidget-border',
      'editorBracketMatch.background': '--hf-editorBracketMatch-background',
      'editorBracketMatch.border': '--hf-editorBracketMatch-border',
      'editor.findMatchBackground': '--hf-editor-findMatchBackground',
      'editor.findMatchHighlightBackground': '--hf-editor-findMatchHighlightBackground',
      'scrollbarSlider.background': '--hf-scrollbarSlider-background',
      'scrollbarSlider.hoverBackground': '--hf-scrollbarSlider-hoverBackground',
      'scrollbarSlider.activeBackground': '--hf-scrollbarSlider-activeBackground',
      'input.background': '--hf-input-background',
      'input.foreground': '--hf-input-foreground',
      'input.border': '--hf-input-border',
      focusBorder: '--hf-focusBorder',
    };
    for (const [monacoKey, cssVar] of Object.entries(mapping)) {
      const value = readColor(styles, cssVar);
      if (value) colors[monacoKey] = value;
    }
    const rules: { token: string; foreground: string }[] = [];
    for (const [tokens, cssVar] of TOKEN_VARS) {
      const value = readColor(styles, cssVar);
      if (!value) continue;
      const foreground = value.slice(1, 7); // Monaco rules take rrggbb without '#'
      for (const token of tokens) rules.push({ token, foreground });
    }
    monaco.editor.defineTheme('nouto-openapi', {
      base: dark ? 'vs-dark' : 'vs',
      inherit: true,
      rules,
      colors,
    });
    monaco.editor.setTheme('nouto-openapi');
  }

  /**
   * Editor font size in px from the same --hf-editor-font-size the CodeMirror
   * editors use (set by the theme store's applyFonts), falling back to the
   * root font size so the editor still scales with the interface when unset.
   */
  function editorFontPx(): number {
    const root = getComputedStyle(document.documentElement);
    const editorSize = parseFloat(root.getPropertyValue('--hf-editor-font-size'));
    return Number.isFinite(editorSize) && editorSize > 0 ? editorSize : parseFloat(root.fontSize);
  }

  function editorFontFamily(): string | undefined {
    const family = getComputedStyle(document.body)
      .getPropertyValue('--hf-editor-font-family')
      .trim();
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
        monaco.Uri.parse(`file:///nouto/openapi/${id}.${ext}`),
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
            event.changes.map((c) => ({
              from: c.rangeOffset,
              to: c.rangeOffset + c.rangeLength,
              insert: c.text,
            })),
          );
        }),
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
      }),
    );

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => onsave?.());

    // Desktop toggles data-theme on <html>; watch it (not body's VS Code
    // webview attributes) and re-derive the Monaco theme from computed styles.
    themeObserver = new MutationObserver(() => applyTheme());
    // `style` covers engine-backed themes, which repaint as inline --hf-* vars
    // without changing data-theme.
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-theme-mode', 'class', 'style'],
    });
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
      // Absence-type findings (missing property, no security, no 5xx...) have
      // no text of their own: underline the owning key, not the whole value.
      const range = isAnchoredDiagnostic(diagnostic)
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
      (diagnostics ?? []).map(diagnosticToMarker),
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
        new monaco.Selection(start.lineNumber, start.column, end.lineNumber, end.column),
      );
      editor.revealRangeInCenterIfOutsideViewport(
        new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
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
