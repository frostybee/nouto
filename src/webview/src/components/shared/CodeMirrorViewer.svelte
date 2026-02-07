<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { EditorState } from '@codemirror/state';
  import { EditorView, lineNumbers, highlightActiveLineGutter } from '@codemirror/view';
  import { syntaxHighlighting, foldGutter, codeFolding, bracketMatching, syntaxTree, foldAll, unfoldAll } from '@codemirror/language';
  import { json } from '@codemirror/lang-json';
  import { search } from '@codemirror/search';
  import { vscodeDarkTheme, vscodeHighlightStyle } from '../../lib/codemirror-theme';
  import { foldToDepth } from '../../lib/codemirror/fold-depth';
  import { jsonPathExtension } from '../../lib/codemirror/json-path';
  import { urlClickableExtension } from '../../lib/codemirror/url-clickable';
  import { gotoLineExtension } from '../../lib/codemirror/goto-line';
  import { contextMenuExtension } from '../../lib/codemirror/context-menu';
  import { showMinimap } from '@replit/codemirror-minimap';
  import { schemaValidationExtension } from '../../lib/codemirror/schema-validation';

  export interface EditorActions {
    foldAll: () => void;
    unfoldAll: () => void;
    foldToDepth: (depth: number) => void;
    gotoLine: () => void;
  }

  interface Props {
    content: string;
    language: 'json' | 'text';
    schema?: object;
    onViewReady?: (actions: EditorActions) => void;
    onPathChange?: (path: string) => void;
    onOpenUrl?: (url: string) => void;
  }
  let { content, language, schema, onViewReady, onPathChange, onOpenUrl }: Props = $props();

  let container: HTMLDivElement;
  let view: EditorView | undefined;
  let observer: IntersectionObserver | undefined;

  function computeFoldLabel(state: EditorState, range: { from: number; to: number }): string {
    let count = 0;
    let type: 'object' | 'array' = 'object';

    try {
      const tree = syntaxTree(state);
      const node = tree.resolveInner(range.from, 1);
      if (node) {
        type = node.name === 'Array' ? 'array' : 'object';
        let child = node.firstChild;
        while (child) {
          if (child.name === 'Property' || (type === 'array' && child.name !== '[' && child.name !== ']' && child.name !== ',')) {
            count++;
          }
          child = child.nextSibling;
        }
      }
    } catch {
      const text = state.doc.sliceString(range.from, range.to);
      const openChar = text.charAt(0);
      type = openChar === '[' ? 'array' : 'object';
      let depth = 0;
      count = text.length > 2 ? 1 : 0;
      for (let i = 1; i < text.length - 1; i++) {
        const ch = text.charAt(i);
        if (ch === '{' || ch === '[') depth++;
        else if (ch === '}' || ch === ']') depth--;
        else if (ch === ',' && depth === 0) count++;
      }
    }

    return type === 'array'
      ? (count === 1 ? '\u2026 1 item \u2026' : `\u2026 ${count} items \u2026`)
      : (count === 1 ? '\u2026 1 key \u2026' : `\u2026 ${count} keys \u2026`);
  }

  function createEditor() {
    if (view) {
      view.destroy();
      view = undefined;
    }
    if (!container) return;

    const extensions = [
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      vscodeDarkTheme,
      syntaxHighlighting(vscodeHighlightStyle),
      lineNumbers(),
      highlightActiveLineGutter(),
      codeFolding({
        preparePlaceholder: computeFoldLabel,
        placeholderDOM(_view, onclick, prepared) {
          const el = document.createElement('span');
          el.textContent = prepared as string;
          el.setAttribute('aria-label', 'folded code');
          el.title = 'Click to unfold';
          el.onclick = onclick;
          return el;
        },
      }),
      foldGutter({
        markerDOM: (open) => {
          const el = document.createElement('div');
          el.classList.add('fold-gutter-icon');
          el.tabIndex = -1;
          if (open) {
            el.setAttribute('data-open', '');
          }
          return el;
        },
      }),
      bracketMatching(),
      search({ top: true }),
      EditorView.lineWrapping,
      gotoLineExtension(),
    ];

    if (language === 'json') {
      extensions.push(json());

      if (onPathChange) {
        extensions.push(jsonPathExtension({ onPathChange }));
      }

      if (onOpenUrl) {
        extensions.push(urlClickableExtension({ onOpenUrl }));
      }

      extensions.push(contextMenuExtension());

      if (schema) {
        extensions.push(schemaValidationExtension(schema));
      }
    }

    // Show minimap for large documents (>50 lines)
    if (content.split('\n').length > 50) {
      extensions.push(
        showMinimap.compute(['doc'], () => ({
          displayText: 'blocks',
          showOverlay: 'always',
        }))
      );
    }

    const state = EditorState.create({
      doc: content,
      extensions,
    });

    view = new EditorView({
      state,
      parent: container,
    });

    onViewReady?.({
      foldAll: () => { if (view) foldAll(view); },
      unfoldAll: () => { if (view) unfoldAll(view); },
      foldToDepth: (depth: number) => { if (view) foldToDepth(view, depth); },
      gotoLine: () => { /* Ctrl+G triggers the panel directly via keymap */ },
    });
  }

  onMount(() => {
    createEditor();

    // Handle tab switching: CodeMirror needs requestMeasure when becoming visible
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && view) {
          view.requestMeasure();
        }
      }
    });
    observer.observe(container);
  });

  onDestroy(() => {
    observer?.disconnect();
    view?.destroy();
  });

  // Update content when it changes
  $effect(() => {
    if (view && content !== undefined) {
      const currentDoc = view.state.doc.toString();
      if (currentDoc !== content) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: content },
        });
      }
    }
  });

  // Recreate editor when language or schema changes
  $effect(() => {
    const _lang = language;
    const _schema = schema;
    if (container && view) {
      createEditor();
    }
  });
</script>

<div class="codemirror-container" bind:this={container}></div>

<style>
  .codemirror-container {
    height: 100%;
    overflow: hidden;
  }

  .codemirror-container :global(.cm-editor) {
    height: 100%;
  }

  /* Gutter element alignment */
  .codemirror-container :global(.cm-gutterElement) {
    display: flex;
    align-items: center;
    transition: color 0.1s ease-in-out;
  }

  /* Fold gutter icon - yaak-style CSS chevron */
  .codemirror-container :global(.fold-gutter-icon) {
    padding: 0.25em 0.4em;
    height: 16px;
    border-radius: 3px;
    cursor: default;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .codemirror-container :global(.fold-gutter-icon)::after {
    content: '';
    display: block;
    width: 5px;
    height: 5px;
    border-style: solid;
    border-width: 0 1.5px 1.5px 0;
    border-color: currentColor;
  }

  /* Open state: chevron pointing down */
  .codemirror-container :global(.fold-gutter-icon[data-open])::after {
    transform: rotate(45deg);
    margin-top: -2px;
  }

  /* Closed state: chevron pointing right */
  .codemirror-container :global(.fold-gutter-icon:not([data-open]))::after {
    transform: rotate(-45deg);
    margin-left: -2px;
  }

  .codemirror-container :global(.fold-gutter-icon:hover) {
    color: var(--vscode-editorLineNumber-activeForeground, #c6c6c6);
    background: var(--vscode-list-hoverBackground, rgba(128, 128, 128, 0.12));
  }
</style>
