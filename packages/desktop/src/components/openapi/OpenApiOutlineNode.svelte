<script lang="ts">
  import OpenApiOutlineNode from './OpenApiOutlineNode.svelte';
  import type { OutlineNode } from '@nouto/core/services/openapi/outline';
  import type { SvelteMap } from 'svelte/reactivity';

  interface Props {
    node: OutlineNode;
    depth: number;
    highlightedId?: string;
    /**
     * Explicit user expand/collapse choices, keyed by the stable node id and
     * owned by the tree root — mutating it here keeps state across rebuilds.
     */
    expandOverrides: SvelteMap<string, boolean>;
    onreveal: (pointer: string) => void;
  }
  let { node, depth, highlightedId, expandOverrides, onreveal }: Props = $props();

  let rowEl = $state<HTMLDivElement>();

  const hasChildren = $derived(node.children.length > 0);
  // Top-level groups start open; everything deeper starts collapsed.
  const expanded = $derived(expandOverrides.get(node.id) ?? depth < 1);
  const highlighted = $derived(node.id === highlightedId);

  // iconColor is a VS Code theme color id ('charts.green'); the app exposes
  // the same palette as --hf-* custom properties.
  const iconStyle = $derived(
    node.iconColor ? `color: var(--hf-${node.iconColor.replace(/\./g, '-')})` : undefined
  );

  function toggle(): void {
    expandOverrides.set(node.id, !expanded);
  }

  function activate(): void {
    if (node.pointer !== undefined) {
      onreveal(node.pointer);
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
  aria-expanded={hasChildren ? expanded : undefined}
  aria-selected={highlighted}
  tabindex="0"
  title={node.tooltip ?? node.label}
  onclick={activate}
  onkeydown={handleKeydown}
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
</div>

{#if expanded}
  {#each node.children as child (child.id)}
    <OpenApiOutlineNode
      node={child}
      depth={depth + 1}
      {highlightedId}
      {expandOverrides}
      {onreveal}
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
</style>
