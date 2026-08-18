<script lang="ts">
  import OpenApiOutlineNode from './OpenApiOutlineNode.svelte';
  import type { OutlineNode } from '@nouto/core/services/openapi/outline';
  import type { OpenApiAnalysis } from '@nouto/core/services/openapi/types';
  import type { SvelteMap } from 'svelte/reactivity';
  import ContextMenu from '@nouto/ui/components/shared/ContextMenu.svelte';
  import type { ContextMenuItem } from '@nouto/ui/components/shared/ContextMenu.svelte';
  import { copyToClipboard } from '@nouto/ui/lib/clipboard';
  import { showNotification } from '@nouto/ui/stores/notifications.svelte';
  import { buildOutlineMenu } from '../../lib/openapi/outlineMenu';
  import type { OutlineActionId } from '../../lib/openapi/outlineMenu';

  interface Props {
    node: OutlineNode;
    depth: number;
    /** 1-based position among siblings (aria-posinset). */
    posInSet: number;
    /** Sibling count (aria-setsize). */
    setSize: number;
    highlightedId?: string;
    /**
     * Explicit user expand/collapse choices, keyed by the stable node id and
     * owned by the tree root — mutating it here keeps state across rebuilds.
     */
    expandOverrides: SvelteMap<string, boolean>;
    /**
     * Reveal request. documentUri is the node's owning document — external
     * "Referenced files" nodes carry the target file's URI, which the view
     * routes to cross-file navigation instead of the local pointer map.
     */
    onreveal: (pointer: string, documentUri?: string) => void;
    /** Present on operation rows only: opens the operation as a request tab. */
    ontryit?: (operation: { path: string; method: string }) => void;
    /** Context-menu inputs (Phase 4): the menu table reads the parsed spec. */
    analysis: OpenApiAnalysis | null;
    /** Disables edit menu items while the document has error diagnostics. */
    hasErrors: boolean;
    /** Edit actions bubble to the view, which owns the editor surface. */
    oncontextaction?: (
      node: OutlineNode,
      id: OutlineActionId,
      payload?: Record<string, unknown>,
    ) => void;
  }
  let {
    node,
    depth,
    posInSet,
    setSize,
    highlightedId,
    expandOverrides,
    onreveal,
    ontryit,
    analysis,
    hasErrors,
    oncontextaction,
  }: Props = $props();

  let rowEl = $state<HTMLDivElement>();
  let showContextMenu = $state(false);
  let contextMenuX = $state(0);
  let contextMenuY = $state(0);

  function handleContextMenu(event: MouseEvent): void {
    if (!buildOutlineMenu(node, analysis, hasErrors).length) return;
    event.preventDefault();
    event.stopPropagation();
    // Close any other row's open menu first (broadcast the shared signal).
    window.dispatchEvent(new CustomEvent('close-context-menus'));
    contextMenuX = event.clientX;
    contextMenuY = event.clientY;
    showContextMenu = true;
  }

  async function handleCopyPointer(): Promise<void> {
    if (node.pointer === undefined) return;
    const copied = await copyToClipboard(node.pointer);
    showNotification(
      copied ? 'info' : 'error',
      copied ? `Copied JSON Pointer: ${node.pointer}` : 'Could not copy to the clipboard.',
    );
  }

  // Lazy: only evaluated while the menu is open (guarded by the {#if} below).
  const contextMenuItems = $derived.by<ContextMenuItem[]>(() =>
    buildOutlineMenu(node, analysis, hasErrors).map((entry) => ({
      label: entry.label,
      icon: entry.icon,
      danger: entry.danger,
      divider: entry.divider,
      disabled: entry.disabled,
      action:
        entry.id === 'copyJsonPointer'
          ? () => void handleCopyPointer()
          : entry.id === 'tryOperation'
            ? () => {
                if (node.operation) ontryit?.(node.operation);
              }
            : () => oncontextaction?.(node, entry.id, entry.payload),
    })),
  );

  const hasChildren = $derived(node.children.length > 0);
  // Top-level groups start open; everything deeper starts collapsed.
  const expanded = $derived(expandOverrides.get(node.id) ?? depth < 1);
  const highlighted = $derived(node.id === highlightedId);

  // iconColor is a VS Code theme color id ('charts.green'); the app exposes
  // the same palette as --hf-* custom properties.
  const iconStyle = $derived(
    node.iconColor ? `color: var(--hf-${node.iconColor.replace(/\./g, '-')})` : undefined,
  );

  function toggle(): void {
    expandOverrides.set(node.id, !expanded);
  }

  function activate(): void {
    if (node.pointer !== undefined) {
      onreveal(node.pointer, node.documentUri);
    } else if (hasChildren) {
      toggle();
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate();
    } else if (event.key === 'ArrowRight' && hasChildren && !expanded) {
      event.preventDefault();
      toggle();
    } else if (event.key === 'ArrowLeft' && hasChildren && expanded) {
      event.preventDefault();
      toggle();
    }
  }

  // Keep the cursor-synced node visible, like the VS Code tree's reveal.
  // (Optional chaining on the method: jsdom has no scrollIntoView.)
  $effect(() => {
    if (highlighted) rowEl?.scrollIntoView?.({ block: 'nearest' });
  });
</script>

<div
  bind:this={rowEl}
  class="outline-row"
  class:highlighted
  style="padding-left: {8 + depth * 14}px"
  role="treeitem"
  aria-level={depth + 1}
  aria-posinset={posInSet}
  aria-setsize={setSize}
  aria-expanded={hasChildren ? expanded : undefined}
  aria-selected={highlighted}
  tabindex="0"
  title={node.tooltip ?? node.label}
  onclick={activate}
  onkeydown={handleKeydown}
  oncontextmenu={handleContextMenu}
>
  {#if hasChildren}
    <button
      class="chevron-btn"
      aria-label={expanded ? 'Collapse' : 'Expand'}
      tabindex="-1"
      onclick={(event) => {
        event.stopPropagation();
        toggle();
      }}
    >
      <span class="codicon {expanded ? 'codicon-chevron-down' : 'codicon-chevron-right'}"></span>
    </button>
  {:else}
    <span class="chevron-spacer"></span>
  {/if}
  <span class="codicon codicon-{node.iconId} node-icon" style={iconStyle}></span>
  <span class="node-label">{node.label}</span>
  {#if node.description}
    <span class="node-description">{node.description}</span>
  {/if}
  {#if node.operation && ontryit}
    <button
      class="tryit-btn"
      aria-label="Try It"
      title="Try It — open as a request"
      tabindex="-1"
      onclick={(event) => {
        event.stopPropagation();
        ontryit(node.operation!);
      }}
    >
      <span class="codicon codicon-play"></span>
    </button>
  {/if}
</div>

{#if showContextMenu}
  <ContextMenu
    items={contextMenuItems}
    x={contextMenuX}
    y={contextMenuY}
    show={showContextMenu}
    onclose={() => (showContextMenu = false)}
  />
{/if}

{#if expanded}
  {#each node.children as child, childIndex (child.id)}
    <OpenApiOutlineNode
      node={child}
      depth={depth + 1}
      posInSet={childIndex + 1}
      setSize={node.children.length}
      {highlightedId}
      {expandOverrides}
      {onreveal}
      {ontryit}
      {analysis}
      {hasErrors}
      {oncontextaction}
    />
  {/each}
{/if}

<style>
  .outline-row {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 22px;
    padding-right: 8px;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    color: var(--hf-sideBar-foreground, var(--hf-foreground));
    font-size: 1rem;
  }

  .outline-row:hover {
    background: var(--hf-list-hoverBackground);
  }

  .outline-row.highlighted {
    background: var(--hf-list-activeSelectionBackground);
    color: var(--hf-list-activeSelectionForeground);
  }

  .outline-row:focus-visible {
    outline: 1px solid var(--hf-focusBorder);
    outline-offset: -1px;
  }

  .chevron-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    flex-shrink: 0;
  }

  .chevron-spacer {
    width: 16px;
    flex-shrink: 0;
  }

  .node-icon {
    flex-shrink: 0;
    font-size: 1rem;
  }

  .node-label {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .node-description {
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--hf-descriptionForeground);
    font-size: 0.846rem;
  }

  .tryit-btn {
    display: none;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    margin-left: auto;
    padding: 0;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    flex-shrink: 0;
  }

  .outline-row:hover .tryit-btn,
  .outline-row:focus-within .tryit-btn,
  .outline-row.highlighted .tryit-btn {
    display: flex;
  }

  .tryit-btn:hover {
    background: var(--hf-toolbar-hoverBackground, rgba(90, 93, 94, 0.31));
  }
</style>
