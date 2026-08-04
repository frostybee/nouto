<script lang="ts">
  import { SvelteMap } from 'svelte/reactivity';
  import { buildOutlineTree } from '@nouto/core/services/openapi/outline';
  import type { OutlineBuildResult, OutlineNode } from '@nouto/core/services/openapi/outline';
  import type { OpenApiAnalysis } from '@nouto/core/services/openapi/types';
  import OpenApiOutlineNode from './OpenApiOutlineNode.svelte';
  import type { OutlineActionId } from '../../lib/openapi/outlineMenu';

  interface Props {
    analysis: OpenApiAnalysis | null;
    documentUri: string;
    sortAlphabetically: boolean;
    /** Current cursor's RFC 6901 pointer (debounced), for highlight sync. */
    activePointer?: string;
    onreveal: (pointer: string) => void;
    /** Per-operation Try It action (Phase 3). */
    ontryit?: (operation: { path: string; method: string }) => void;
    /** Disables the context menu's edit items (error diagnostics present). */
    hasErrors?: boolean;
    /** Context-menu edit actions (Phase 4), executed by the view. */
    oncontextaction?: (
      node: OutlineNode,
      id: OutlineActionId,
      payload?: Record<string, unknown>
    ) => void;
  }
  let {
    analysis,
    documentUri,
    sortAlphabetically,
    activePointer,
    onreveal,
    ontryit,
    hasErrors = false,
    oncontextaction,
  }: Props = $props();

  const built = $derived.by<OutlineBuildResult>(() =>
    analysis
      ? buildOutlineTree(documentUri, analysis, { sortAlphabetically })
      : { roots: [], pointerIndex: new Map() }
  );

  /**
   * Explicit user expand/collapse choices, keyed by stable node id — kept
   * across content-driven rebuilds; cleared when the document changes.
   */
  const expandOverrides = new SvelteMap<string, boolean>();
  $effect(() => {
    void documentUri;
    expandOverrides.clear();
  });

  // Nearest-ancestor resolution (VS Code outline's resolveNode): the cursor
  // usually sits deeper than any outline node, so walk the pointer's ancestor
  // chain up until one is indexed.
  const highlightedNode = $derived.by(() => {
    if (activePointer === undefined) return undefined;
    const segments = activePointer.split('/');
    for (let length = segments.length; length > 0; length--) {
      const node = built.pointerIndex.get(segments.slice(0, length).join('/'));
      if (node) return node;
    }
    return undefined;
  });
  const highlightedId = $derived(highlightedNode?.id);

  // Reveal expands the highlighted node's ancestors (matches TreeView.reveal).
  $effect(() => {
    let ancestor = highlightedNode?.parent;
    while (ancestor) {
      expandOverrides.set(ancestor.id, true);
      ancestor = ancestor.parent;
    }
  });
</script>

<div class="outline-pane">
  <div class="outline-header">Outline</div>
  {#if built.roots.length === 0}
    <div class="outline-empty" role="status">
      {analysis ? 'No outline available for this document.' : 'Open an OpenAPI document to see its outline.'}
    </div>
  {:else}
    <div class="outline-tree" role="tree" aria-label="OpenAPI outline">
      {#each built.roots as root (root.id)}
        <OpenApiOutlineNode
          node={root}
          depth={0}
          {highlightedId}
          {expandOverrides}
          {onreveal}
          {ontryit}
          {analysis}
          {hasErrors}
          {oncontextaction}
        />
      {/each}
    </div>
  {/if}
</div>

<style>
  .outline-pane {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--hf-sideBar-background, var(--hf-editor-background));
  }

  .outline-header {
    flex-shrink: 0;
    padding: 6px 10px;
    font-size: 0.846rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--hf-descriptionForeground);
  }

  .outline-empty {
    padding: 8px 10px;
    font-size: 0.923rem;
    color: var(--hf-descriptionForeground);
  }

  .outline-tree {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
</style>
