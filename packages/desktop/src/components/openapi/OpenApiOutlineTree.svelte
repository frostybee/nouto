<script lang="ts">
  import { SvelteMap } from 'svelte/reactivity';
  import { buildOutlineTree, outlineParseFailure } from '@nouto/core/services/openapi/outline';
  import type { OutlineBuildResult, OutlineNode, OutlineParseFailure } from '@nouto/core/services/openapi/outline';
  import type { ExternalAnalysisResult } from '@nouto/core/services/openapi/externalRefs';
  import type { OpenApiAnalysis, OpenApiFormat } from '@nouto/core/services/openapi/types';
  import OpenApiOutlineNode from './OpenApiOutlineNode.svelte';
  import type { OutlineActionId } from '../../lib/openapi/outlineMenu';

  interface Props {
    analysis: OpenApiAnalysis | null;
    documentUri: string;
    /**
     * Session identity (stable across Save-As). Expand/collapse state is
     * keyed on this, not documentUri, so tab switches and renames don't wipe
     * it while a genuine document swap in the same tab still does.
     */
    sessionId?: string;
    /**
     * Source text + format, used only to explain a parse failure ("line 12:
     * ...") when `analysis.parsedSpec` is missing. Optional so callers that
     * never show broken documents can omit them.
     */
    content?: string;
    format?: OpenApiFormat;
    sortAlphabetically: boolean;
    /** Cross-file $ref analysis — adds the "Referenced files" group (Phase 5). */
    external?: ExternalAnalysisResult | null;
    /** Current cursor's RFC 6901 pointer (debounced), for highlight sync. */
    activePointer?: string;
    onreveal: (pointer: string, documentUri?: string) => void;
    /** Jump to a raw offset: the parse-failure banner's position (no pointer while the document is broken). */
    onrevealoffset?: (offset: number) => void;
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
    sessionId,
    content,
    format,
    sortAlphabetically,
    external,
    activePointer,
    onreveal,
    onrevealoffset,
    ontryit,
    hasErrors = false,
    oncontextaction,
  }: Props = $props();

  const EMPTY_BUILD: OutlineBuildResult = { roots: [], pointerIndex: new Map() };
  /**
   * The rendered tree. Rebuilt whenever the document parses; when it stops
   * parsing mid-edit the previous tree of the *same* session is kept (and
   * `parseFailure` explains why it is out of date) instead of blanking the
   * pane on every typo. A different session, or no analysis, always resets.
   * `$state.raw` because nodes are a plain object graph with parent links;
   * only whole-tree reassignment needs to be reactive.
   */
  let built = $state.raw<OutlineBuildResult>(EMPTY_BUILD);
  let builtKey: string | undefined;
  $effect.pre(() => {
    const key = sessionId ?? documentUri;
    if (!analysis) {
      built = EMPTY_BUILD;
      builtKey = undefined;
    } else if (analysis.parsedSpec) {
      built = buildOutlineTree(documentUri, analysis, { sortAlphabetically }, external ?? undefined);
      builtKey = key;
    } else if (builtKey !== key) {
      built = EMPTY_BUILD;
      builtKey = key;
    }
  });

  /** Why the document can't be outlined right now; null while it parses. */
  const parseFailure = $derived.by<OutlineParseFailure | null>(() => {
    if (!analysis || analysis.parsedSpec) return null;
    return outlineParseFailure(content ?? '', format ?? 'yaml', analysis, {
      stale: built.roots.length > 0,
    });
  });

  /**
   * Explicit user expand/collapse choices, keyed by stable node id. Kept
   * across content-driven rebuilds; per-session so every open document keeps
   * its own state across tab switches (falls back to documentUri keying when
   * no sessionId is supplied).
   */
  const expandOverridesBySession = new Map<string, SvelteMap<string, boolean>>();
  let expandOverrides = $state(new SvelteMap<string, boolean>());
  $effect(() => {
    const key = sessionId ?? documentUri;
    let map = expandOverridesBySession.get(key);
    if (!map) {
      map = new SvelteMap<string, boolean>();
      expandOverridesBySession.set(key, map);
    }
    expandOverrides = map;
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
  {#if parseFailure}
    {@const jump = parseFailure.offset !== undefined && onrevealoffset
      ? () => onrevealoffset(parseFailure.offset!)
      : undefined}
    <div class="outline-error" role="alert">
      <span class="codicon codicon-error" aria-hidden="true"></span>
      <div class="outline-error-text">
        <div class="outline-error-title">{parseFailure.title}</div>
        {#if jump}
          <button type="button" class="outline-error-detail outline-error-link" onclick={jump} title="Go to the error">
            {parseFailure.detail}
          </button>
        {:else}
          <div class="outline-error-detail">{parseFailure.detail}</div>
        {/if}
      </div>
    </div>
  {/if}
  {#if built.roots.length === 0}
    {#if !parseFailure}
      <div class="outline-empty" role="status" aria-live="polite">
        {analysis ? 'No outline available for this document.' : 'Open an OpenAPI document to see its outline.'}
      </div>
    {/if}
  {:else}
    <div class="outline-tree" role="tree" aria-label="OpenAPI outline">
      {#each built.roots as root, rootIndex (root.id)}
        <OpenApiOutlineNode
          node={root}
          depth={0}
          posInSet={rootIndex + 1}
          setSize={built.roots.length}
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

  .outline-error {
    flex-shrink: 0;
    display: flex;
    gap: 8px;
    align-items: flex-start;
    margin: 4px 8px 6px;
    padding: 6px 8px;
    border: 1px solid var(--hf-inputValidation-errorBorder, var(--hf-editorError-foreground, #f44336));
    border-left-width: 3px;
    border-radius: 3px;
    background: var(--hf-inputValidation-errorBackground, rgba(244, 67, 54, 0.1));
    color: var(--hf-inputValidation-errorForeground, var(--hf-foreground));
    font-size: 0.923rem;
    line-height: 1.4;
    word-break: break-word;
  }

  .outline-error .codicon {
    flex-shrink: 0;
    margin-top: 2px;
    color: var(--hf-editorError-foreground, #f44336);
  }

  .outline-error-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .outline-error-title {
    font-weight: 600;
  }

  .outline-error-detail {
    color: var(--hf-descriptionForeground);
  }

  .outline-error-link {
    all: unset;
    cursor: pointer;
    text-align: left;
    color: var(--hf-textLink-foreground, var(--hf-descriptionForeground));
    font-size: inherit;
    line-height: inherit;
    word-break: break-word;
  }

  .outline-error-link:hover {
    text-decoration: underline;
  }

  .outline-error-link:focus-visible {
    outline: 1px solid var(--hf-focusBorder);
    outline-offset: 1px;
  }

  .outline-tree {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
</style>
