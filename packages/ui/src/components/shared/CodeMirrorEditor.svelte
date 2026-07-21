<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { EditorState, Compartment } from '@codemirror/state';
  import { EditorView, keymap, placeholder as cmPlaceholder, lineNumbers } from '@codemirror/view';
  import { bracketMatching, indentOnInput } from '@codemirror/language';
  import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
  import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands';
  import { forEachDiagnostic, setDiagnosticsEffect } from '@codemirror/lint';
  import { getThemeExtensions, isVscodeDark } from '../../lib/codemirror-theme';
  import { getLanguageExtension, type LanguageId } from '../../lib/codemirror/language-support';
  import {
    buildJsonSchemaExtensions,
    buildJsonSyntaxExtensions,
    buildYamlSchemaExtensions,
    buildYamlSyntaxExtensions,
    resolveSchemaPipeline,
  } from '../../lib/codemirror/schema-pipeline';
  import {
    createEditorActions,
    cursorInfoFromView,
    type CodeMirrorCursorInfo,
    type CodeMirrorDiagnostic,
    type CodeMirrorEditorActions,
    type EditorChange,
  } from '../../lib/codemirror/editor-actions';
  import type { PointerDocMode } from '../../lib/codemirror/pointer-map';

  interface Props {
    content: string;
    language: LanguageId;
    placeholder?: string;
    onchange?: (value: string) => void;
    onpaste?: () => void;
    enableLint?: boolean;
    wordWrap?: boolean;
    readonly?: boolean;
    jsonSchema?: object;
    extraExtensions?: import('@codemirror/state').Extension[];
    /** Fires once when the EditorView exists, delivering imperative actions. */
    onready?: (actions: CodeMirrorEditorActions) => void;
    /** Fires whenever the main selection changes. */
    oncursorchange?: (info: CodeMirrorCursorInfo) => void;
    /** Fires whenever the lint state is updated with the full diagnostics set. */
    ondiagnosticschange?: (diagnostics: CodeMirrorDiagnostic[]) => void;
    /**
     * Fires for user edits with the incremental UTF-16 change batch of the
     * transaction (pre-edit-document offsets). Host-applied content updates
     * (the `content` prop) do not re-emit.
     */
    onedits?: (changes: EditorChange[]) => void;
  }
  let {
    content, language, placeholder = '', onchange, onpaste, enableLint = false,
    wordWrap = true, readonly = false, jsonSchema, extraExtensions,
    onready, oncursorchange, ondiagnosticschange, onedits,
  }: Props = $props();

  let container: HTMLDivElement;
  let view: EditorView | undefined;
  let themeObserver: MutationObserver | undefined;
  // Every compartment is ALWAYS part of the initial extension set —
  // reconfiguring a compartment that was absent from the initial state is a
  // silent no-op.
  const themeCompartment = new Compartment();
  const wrapCompartment = new Compartment();
  const languageCompartment = new Compartment();
  const schemaCompartment = new Compartment();
  const readonlyCompartment = new Compartment();
  let currentIsDark = true;
  // Track whether we're programmatically updating to avoid feedback loops
  let updatingFromProp = false;
  let onreadyFired = false;
  // Guards async (YAML) schema pipeline loads against stale application
  let schemaConfigGeneration = 0;

  function currentPointerMode(): PointerDocMode | null {
    return language === 'json' ? 'json' : language === 'yaml' ? 'yaml' : null;
  }

  function readonlyExtensions(isReadonly: boolean) {
    return isReadonly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : [];
  }

  /** Synchronously computable schema/lint extensions (JSON pipelines). */
  function initialSchemaExtensions() {
    const kind = resolveSchemaPipeline(language, enableLint, !!jsonSchema);
    if (kind === 'json-schema') return buildJsonSchemaExtensions(jsonSchema!);
    if (kind === 'json-syntax') return buildJsonSyntaxExtensions();
    // YAML pipelines load asynchronously via the $effect below.
    return [];
  }

  function createEditor() {
    if (view) {
      view.destroy();
      view = undefined;
    }
    if (!container) return;

    currentIsDark = isVscodeDark();

    const extensions = [
      // Intercept Ctrl/Cmd+Enter so CodeMirror doesn't insert a newline;
      // the event still bubbles to the window handler which triggers send
      keymap.of([{ key: 'Mod-Enter', run: () => true }]),
      themeCompartment.of(getThemeExtensions()),
      lineNumbers(),
      bracketMatching(),
      closeBrackets(),
      indentOnInput(),
      history(),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        indentWithTab,
      ]),
      wrapCompartment.of(wordWrap ? EditorView.lineWrapping : []),
      languageCompartment.of(getLanguageExtension(language) ?? []),
      schemaCompartment.of(initialSchemaExtensions()),
      readonlyCompartment.of(readonlyExtensions(readonly)),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !updatingFromProp) {
          onchange?.(update.state.doc.toString());
          if (onedits) {
            const changes: EditorChange[] = [];
            update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
              changes.push({ from: fromA, to: toA, insert: inserted.toString() });
            });
            onedits(changes);
          }
        }
        if (update.selectionSet && oncursorchange) {
          oncursorchange(cursorInfoFromView(update.view, currentPointerMode));
        }
        if (
          ondiagnosticschange &&
          update.transactions.some((tr) => tr.effects.some((e) => e.is(setDiagnosticsEffect)))
        ) {
          const diagnostics: CodeMirrorDiagnostic[] = [];
          forEachDiagnostic(update.state, (d) => {
            diagnostics.push({
              from: d.from,
              to: d.to,
              severity: d.severity,
              message: d.message,
              source: d.source === 'schema' ? 'schema' : 'syntax',
            });
          });
          ondiagnosticschange(diagnostics);
        }
      }),
      EditorView.domEventHandlers({
        paste: () => {
          // Fire after CodeMirror processes the paste content
          setTimeout(() => onpaste?.(), 0);
          return false;
        },
      }),
    ];

    if (placeholder) {
      extensions.push(cmPlaceholder(placeholder));
    }

    if (extraExtensions) {
      extensions.push(...extraExtensions);
    }

    const state = EditorState.create({
      doc: content,
      extensions,
    });

    view = new EditorView({
      state,
      parent: container,
    });

    if (!onreadyFired && onready) {
      onreadyFired = true;
      onready(createEditorActions(view, currentPointerMode));
    }
  }

  onMount(() => {
    createEditor();

    // React to VS Code theme changes
    themeObserver = new MutationObserver(() => {
      const isDark = isVscodeDark();
      if (isDark !== currentIsDark && view) {
        currentIsDark = isDark;
        view.dispatch({
          effects: themeCompartment.reconfigure(getThemeExtensions()),
        });
      }
    });
    themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-vscode-theme-kind', 'class'],
    });
  });

  function handleFontChange() {
    requestAnimationFrame(() => view?.requestMeasure());
  }
  window.addEventListener('nouto-font-change', handleFontChange);

  onDestroy(() => {
    window.removeEventListener('nouto-font-change', handleFontChange);
    themeObserver?.disconnect();
    view?.destroy();
  });

  // Sync word wrap setting
  $effect(() => {
    if (view) {
      view.dispatch({
        effects: wrapCompartment.reconfigure(wordWrap ? EditorView.lineWrapping : []),
      });
    }
  });

  // Live language switching without recreating the EditorView
  $effect(() => {
    const lang = language;
    if (view) {
      view.dispatch({
        effects: languageCompartment.reconfigure(getLanguageExtension(lang) ?? []),
      });
    }
  });

  // Reconfigurable read-only state
  $effect(() => {
    const isReadonly = readonly;
    if (view) {
      view.dispatch({
        effects: readonlyCompartment.reconfigure(readonlyExtensions(isReadonly)),
      });
    }
  });

  // Sync the lint/schema pipeline with language, enableLint, and jsonSchema.
  // Clears FIRST so a stale pipeline (e.g. JSON linter on a now-YAML
  // document) is never active, then repopulates synchronously for JSON and
  // asynchronously (dynamic import) for YAML.
  $effect(() => {
    const generation = ++schemaConfigGeneration;
    const kind = resolveSchemaPipeline(language, enableLint, !!jsonSchema);
    const schema = jsonSchema;
    if (!view) return;

    view.dispatch({ effects: schemaCompartment.reconfigure([]) });
    if (kind === 'none') return;

    if (kind === 'json-schema') {
      view.dispatch({ effects: schemaCompartment.reconfigure(buildJsonSchemaExtensions(schema!)) });
    } else if (kind === 'json-syntax') {
      view.dispatch({ effects: schemaCompartment.reconfigure(buildJsonSyntaxExtensions()) });
    } else {
      const load = kind === 'yaml-schema' ? buildYamlSchemaExtensions(schema!) : buildYamlSyntaxExtensions();
      load.then((yamlExtensions) => {
        if (generation !== schemaConfigGeneration || !view) return;
        view.dispatch({ effects: schemaCompartment.reconfigure(yamlExtensions) });
      });
    }
  });

  // Sync content from parent (e.g., format/minify operations)
  $effect(() => {
    if (view && content !== undefined) {
      const currentDoc = view.state.doc.toString();
      if (currentDoc !== content) {
        updatingFromProp = true;

        // Preserve cursor position by counting non-whitespace chars before cursor
        const oldPos = view.state.selection.main.head;
        const beforeCursor = currentDoc.slice(0, oldPos);
        const nonWsCount = beforeCursor.replace(/\s/g, '').length;

        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: content },
        });

        // Restore cursor to same non-whitespace offset in new content
        if (nonWsCount > 0 && content.length > 0) {
          let count = 0;
          let newPos = content.length;
          for (let i = 0; i < content.length; i++) {
            if (!/\s/.test(content[i])) {
              count++;
              if (count >= nonWsCount) {
                newPos = i + 1;
                break;
              }
            }
          }
          view.dispatch({ selection: { anchor: newPos } });
        }

        updatingFromProp = false;
      }
    }
  });
</script>

<div class="cm-editor-container" bind:this={container}></div>

<style>
  .cm-editor-container {
    flex: 1;
    min-height: 11.538rem;
    overflow: hidden;
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 0.308rem;
  }

  .cm-editor-container :global(.cm-editor) {
    height: 100%;
  }

  .cm-editor-container :global(.cm-editor.cm-focused) {
    outline: none;
    border: none;
  }

  .cm-editor-container:focus-within {
    border-color: var(--hf-focusBorder);
  }
</style>
