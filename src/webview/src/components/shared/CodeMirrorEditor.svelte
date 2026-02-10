<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { EditorState, Compartment } from '@codemirror/state';
  import { EditorView, keymap, placeholder as cmPlaceholder, lineNumbers } from '@codemirror/view';
  import { bracketMatching, indentOnInput } from '@codemirror/language';
  import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
  import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands';
  import { getThemeExtensions, isVscodeDark } from '../../lib/codemirror-theme';
  import { getLanguageExtension, type LanguageId } from '../../lib/codemirror/language-support';

  interface Props {
    content: string;
    language: LanguageId;
    placeholder?: string;
    onchange?: (value: string) => void;
  }
  let { content, language, placeholder = '', onchange }: Props = $props();

  let container: HTMLDivElement;
  let view: EditorView | undefined;
  let themeObserver: MutationObserver | undefined;
  const themeCompartment = new Compartment();
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
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !updatingFromProp) {
          onchange?.(update.state.doc.toString());
        }
      }),
    ];

    if (placeholder) {
      extensions.push(cmPlaceholder(placeholder));
    }

    const langExtension = getLanguageExtension(language);
    if (langExtension) {
      extensions.push(langExtension);
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

  onDestroy(() => {
    themeObserver?.disconnect();
    view?.destroy();
  });

  // Sync content from parent (e.g., format/minify operations)
  $effect(() => {
    if (view && content !== undefined) {
      const currentDoc = view.state.doc.toString();
      if (currentDoc !== content) {
        updatingFromProp = true;
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: content },
        });
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
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
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
    border-color: var(--vscode-focusBorder);
  }
</style>
