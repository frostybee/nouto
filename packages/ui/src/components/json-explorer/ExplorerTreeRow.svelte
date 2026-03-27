<script lang="ts">
  import type { FlatNode } from '../../stores/jsonExplorer.svelte';
  import { toggleNode, selectNode, showMoreItems, selectedPath, searchMatchPaths, searchCurrentIndex, searchResults } from '../../stores/jsonExplorer.svelte';

  interface Props {
    node: FlatNode;
    onContextMenu?: (e: MouseEvent, node: FlatNode) => void;
  }
  let { node, onContextMenu }: Props = $props();

  const isSelected = $derived(selectedPath() === node.path);
  const isSearchMatch = $derived(searchMatchPaths().has(node.path));
  const isCurrentSearchMatch = $derived.by(() => {
    if (searchResults().length === 0) return false;
    const current = searchResults()[searchCurrentIndex()];
    return current?.path === node.path;
  });

  function handleClick(e: MouseEvent) {
    e.stopPropagation();
    if (node.isShowMore) {
      showMoreItems(node.path);
      return;
    }
    selectNode(node.path);
    if (node.isExpandable) {
      toggleNode(node.path);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick(e as any);
    }
  }

  function handleContextMenu(e: MouseEvent) {
    if (node.isShowMore) return;
    e.preventDefault();
    e.stopPropagation();
    selectNode(node.path);
    onContextMenu?.(e, node);
  }

  function formatValue(value: any, type: string): string {
    switch (type) {
      case 'string': return `"${value}"`;
      case 'number': return String(value);
      case 'boolean': return String(value);
      case 'null': return 'null';
      default: return String(value);
    }
  }

  /** Truncate long string values for display */
  function truncateValue(value: any, type: string): string {
    const formatted = formatValue(value, type);
    if (formatted.length > 200) {
      return formatted.slice(0, 197) + '...';
    }
    return formatted;
  }
</script>

{#if node.isShowMore}
  <div
    class="tree-row show-more-row"
    style="padding-left: {node.depth * 16 + 20}px"
    onclick={handleClick}
    onkeydown={handleKeydown}
    role="button"
    tabindex={0}
  >
    <span class="show-more-btn">
      Show {node.remaining! > 100 ? 100 : node.remaining} more ({node.remaining} remaining)
    </span>
  </div>
{:else}
  <div
    class="tree-row"
    class:selected={isSelected}
    class:search-match={isSearchMatch}
    class:current-match={isCurrentSearchMatch}
    class:expandable={node.isExpandable}
    style="padding-left: {node.depth * 16}px"
    onclick={handleClick}
    onkeydown={handleKeydown}
    oncontextmenu={handleContextMenu}
    role="treeitem"
    tabindex={0}
    aria-expanded={node.isExpandable ? node.isExpanded : undefined}
    aria-selected={isSelected}
    data-path={node.path}
  >
    <!-- Expand/collapse chevron or spacer -->
    {#if node.isExpandable}
      <span class="toggle">
        <span class="chevron" class:open={node.isExpanded}></span>
      </span>
    {:else}
      <span class="leaf-indent"></span>
    {/if}

    <!-- Key -->
    {#if node.key !== null}
      <span class="key">{typeof node.key === 'number' ? node.key : `"${node.key}"`}</span>
      <span class="punctuation">: </span>
    {/if}

    <!-- Value or bracket -->
    {#if node.isExpandable}
      <span class="punctuation">{node.type === 'array' ? '[' : '{'}</span>
      {#if !node.isExpanded}
        <span class="collapsed-badge">
          {node.childCount} {node.type === 'array'
            ? (node.childCount === 1 ? 'item' : 'items')
            : (node.childCount === 1 ? 'key' : 'keys')}
        </span>
        <span class="punctuation">{node.type === 'array' ? ']' : '}'}</span>
      {/if}
    {:else}
      <span class="value {node.type}">{truncateValue(node.value, node.type)}</span>
    {/if}
  </div>
{/if}

<style>
  .tree-row {
    display: flex;
    align-items: center;
    gap: 2px;
    height: 22px;
    font-family: var(--vscode-editor-font-family, Consolas, Monaco, monospace);
    font-size: 12px;
    line-height: 22px;
    white-space: nowrap;
    cursor: default;
    padding-right: 12px;
  }

  .tree-row:hover {
    background: var(--vscode-list-hoverBackground, rgba(128, 128, 128, 0.08));
  }

  .tree-row.selected {
    background: var(--vscode-list-activeSelectionBackground, #094771);
    color: var(--vscode-list-activeSelectionForeground, #fff);
  }

  .tree-row.expandable {
    cursor: pointer;
  }

  .show-more-row {
    display: flex;
    align-items: center;
    height: 22px;
    cursor: pointer;
  }

  .show-more-row:hover {
    background: var(--vscode-list-hoverBackground, rgba(128, 128, 128, 0.08));
  }

  .show-more-btn {
    padding: 0 8px;
    background: var(--vscode-button-secondaryBackground, #3a3d41);
    color: var(--vscode-button-secondaryForeground, #d4d4d4);
    border-radius: 3px;
    font-size: 11px;
    font-style: italic;
    line-height: 18px;
  }

  .show-more-btn:hover {
    background: var(--vscode-button-secondaryHoverBackground, #45494e);
  }

  .toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  .leaf-indent {
    display: inline-block;
    width: 16px;
    flex-shrink: 0;
  }

  .chevron {
    display: inline-block;
    width: 5px;
    height: 5px;
    border-style: solid;
    border-width: 0 1.5px 1.5px 0;
    border-color: var(--vscode-editorLineNumber-foreground, #6e7681);
    transform: rotate(-45deg);
    transition: transform 0.1s;
  }

  .chevron.open {
    transform: rotate(45deg);
  }

  .key {
    color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe);
  }

  .punctuation {
    color: var(--vscode-editor-foreground, #d4d4d4);
  }

  .value.string {
    color: #ce9178;
  }

  .value.number {
    color: #b5cea8;
  }

  .value.boolean {
    color: #569cd6;
  }

  .value.null {
    color: #569cd6;
    font-style: italic;
  }

  .collapsed-badge {
    padding: 0 6px;
    background: var(--vscode-badge-background, #4d4d4d);
    color: var(--vscode-badge-foreground, #fff);
    border-radius: 4px;
    font-size: 10px;
    font-style: italic;
    margin: 0 2px;
  }

  /* Search match highlight */
  .tree-row.search-match {
    background: var(--vscode-editor-findMatchHighlightBackground, rgba(234, 92, 0, 0.2));
  }

  .tree-row.current-match {
    background: var(--vscode-editor-findMatchBackground, rgba(255, 150, 50, 0.4));
    outline: 1px solid var(--vscode-editor-findMatchBorder, #f0a030);
    outline-offset: -1px;
  }

  /* When row is selected, override value colors for contrast */
  .tree-row.selected .key,
  .tree-row.selected .punctuation,
  .tree-row.selected .value {
    color: var(--vscode-list-activeSelectionForeground, #fff);
  }

  .tree-row.selected .collapsed-badge {
    background: rgba(255, 255, 255, 0.2);
  }
</style>
