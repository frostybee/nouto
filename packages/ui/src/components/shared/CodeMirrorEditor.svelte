<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { EditorState, Compartment } from '@codemirror/state';
  import { EditorView, keymap, placeholder as cmPlaceholder, lineNumbers, hoverTooltip } from '@codemirror/view';
  import { bracketMatching, indentOnInput } from '@codemirror/language';
  import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
  import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands';
  import { linter, lintGutter } from '@codemirror/lint';
  import { jsonParseLinter, jsonLanguage } from '@codemirror/lang-json';
  import { jsonSchemaLinter, jsonSchemaHover, jsonCompletion, handleRefresh, stateExtensions } from 'codemirror-json-schema';
  import { getThemeExtensions, isVscodeDark } from '../../lib/codemirror-theme';
  import { getLanguageExtension, type LanguageId } from '../../lib/codemirror/language-support';

  // Skip JSON linting entirely when the document contains template expressions like {{...}}.
  // The raw text is not valid JSON until variables are substituted at send time.
  const TEMPLATE_PATTERN = /\{\{[^}]+\}\}/;
  function templateAwareJsonLinter() {
    const base = jsonParseLinter();
    return (editorView: EditorView) => {
      if (TEMPLATE_PATTERN.test(editorView.state.doc.toString())) return [];
      return base(editorView);
    };
  }
  function templateAwareSchemaLinter() {
    const base = jsonSchemaLinter();
    return (editorView: EditorView) => {
      if (TEMPLATE_PATTERN.test(editorView.state.doc.toString())) return [];
      return base(editorView);
    };
  }

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
  }
  let { content, language, placeholder = '', onchange, onpaste, enableLint = false, wordWrap = true, readonly = false, jsonSchema, extraExtensions }: Props = $props();

  let container: HTMLDivElement;
  let view: EditorView | undefined;
  let themeObserver: MutationObserver | undefined;
  const themeCompartment = new Compartment();
  const wrapCompartment = new Compartment();
  const schemaCompartment = new Compartment();
  let currentIsDark = true;
  // Track whether we're programmatically updating to avoid feedback loops
  let updatingFromProp = false;

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
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !updatingFromProp) {
          onchange?.(update.state.doc.toString());
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

    const langExtension = getLanguageExtension(language);
    if (langExtension) {
      extensions.push(langExtension);
    }

    if (enableLint && language === 'json') {
      if (jsonSchema) {
        // Schema-aware linting, hover, and completion (replaces jsonParseLinter)
        extensions.push(schemaCompartment.of([
          linter(templateAwareJsonLinter()),
          linter(templateAwareSchemaLinter(), { needsRefresh: handleRefresh }),
          hoverTooltip(jsonSchemaHover()),
          jsonLanguage.data.of({ autocomplete: jsonCompletion() }),
          stateExtensions(jsonSchema as any),
        ]));
        extensions.push(lintGutter());
      } else {
        extensions.push(schemaCompartment.of([]));
        extensions.push(linter(templateAwareJsonLinter()));
        extensions.push(lintGutter());
      }
    }

    if (readonly) {
      extensions.push(EditorState.readOnly.of(true));
      extensions.push(EditorView.editable.of(false));
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

  // Re-measure when fonts change (CSS variable updates don't trigger CodeMirror's layout)
  function handleFontChange() { view?.requestMeasure(); }
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

  // Sync JSON schema for autocomplete/linting
  $effect(() => {
    if (view && enableLint && language === 'json') {
      if (jsonSchema) {
        view.dispatch({
          effects: schemaCompartment.reconfigure([
            linter(templateAwareJsonLinter()),
            linter(templateAwareSchemaLinter(), { needsRefresh: handleRefresh }),
            hoverTooltip(jsonSchemaHover()),
            jsonLanguage.data.of({ autocomplete: jsonCompletion() }),
            stateExtensions(jsonSchema as any),
          ]),
        });
      } else {
        view.dispatch({
          effects: schemaCompartment.reconfigure([]),
        });
      }
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
    min-height: 150px;
    overflow: hidden;
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 4px;
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
