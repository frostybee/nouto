<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { MergeView } from '@codemirror/merge';
  import { EditorState } from '@codemirror/state';
  import { EditorView } from '@codemirror/view';
  import { syntaxHighlighting } from '@codemirror/language';
  import { json } from '@codemirror/lang-json';
  import { vscodeDarkTheme, vscodeHighlightStyle } from '../../lib/codemirror-theme';

  interface Props {
    original: string;
    modified: string;
  }
  let { original, modified }: Props = $props();

  let container: HTMLDivElement;
  let mergeView: MergeView | undefined;

  const sharedExtensions = [
    EditorState.readOnly.of(true),
    EditorView.editable.of(false),
    vscodeDarkTheme,
    syntaxHighlighting(vscodeHighlightStyle),
    json(),
    EditorView.lineWrapping,
  ];

  function createView() {
    if (mergeView) {
      mergeView.destroy();
      mergeView = undefined;
    }
    if (!container) return;

    mergeView = new MergeView({
      a: {
        doc: original,
        extensions: sharedExtensions,
      },
      b: {
        doc: modified,
        extensions: sharedExtensions,
      },
      parent: container,
    });
  }

  onMount(createView);

  onDestroy(() => {
    mergeView?.destroy();
  });

  $effect(() => {
    // Recreate when original or modified content changes
    const _o = original;
    const _m = modified;
    if (container && mergeView) {
      createView();
    }
  });
</script>

<div class="diff-view">
  <div class="diff-labels">
    <span class="diff-label">Previous</span>
    <span class="diff-label">Current</span>
  </div>
  <div class="diff-container" bind:this={container}></div>
</div>

<style>
  .diff-view {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .diff-labels {
    display: flex;
    flex-shrink: 0;
    border-bottom: 1px solid var(--vscode-panel-border);
  }

  .diff-label {
    flex: 1;
    padding: 4px 12px;
    font-size: 11px;
    font-weight: 600;
    color: var(--vscode-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .diff-label:first-child {
    border-right: 1px solid var(--vscode-panel-border);
  }

  .diff-container {
    flex: 1;
    overflow: hidden;
  }

  .diff-container :global(.cm-mergeView) {
    height: 100%;
  }

  .diff-container :global(.cm-mergeViewEditor) {
    height: 100%;
  }

  .diff-container :global(.cm-editor) {
    height: 100%;
  }

  .diff-container :global(.cm-changedChunk) {
    background: rgba(255, 255, 0, 0.08);
  }

  .diff-container :global(.cm-insertedLine) {
    background: rgba(0, 255, 0, 0.08);
  }

  .diff-container :global(.cm-deletedLine) {
    background: rgba(255, 0, 0, 0.08);
  }

  .diff-container :global(.cm-insertedText) {
    background: rgba(0, 255, 0, 0.18);
  }

  .diff-container :global(.cm-deletedText) {
    background: rgba(255, 0, 0, 0.18);
  }
</style>
