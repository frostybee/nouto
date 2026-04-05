<script lang="ts">
  import type { FlatNode } from '../stores/jsonExplorer.svelte';
  import { toggleNode, selectNode, showMoreItems, selectedPath, searchMatchPaths, searchCurrentIndex, searchResults, searchQuery, searchCaseSensitive, expandNodeRecursive, toggleBookmark, isBookmarked } from '../stores/jsonExplorer.svelte';
  import { copyToClipboard } from '@nouto/ui/lib/clipboard';
  import Tooltip from '@nouto/ui/components/shared/Tooltip.svelte';

  interface Props {
    node: FlatNode;
    wordWrap?: boolean;
    onContextMenu?: (e: MouseEvent, node: FlatNode) => void;
  }
  let { node, wordWrap = false, onContextMenu }: Props = $props();

  const isSelected = $derived(selectedPath() === node.path);
  const isSearchMatch = $derived(searchMatchPaths().has(node.path));
  const isCurrentSearchMatch = $derived.by(() => {
    if (searchResults().length === 0) return false;
    const current = searchResults()[searchCurrentIndex()];
    return current?.path === node.path;
  });

  const isNodeBookmarked = $derived(isBookmarked(node.path));

  let showCopied = $state(false);

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

  function handleDblClick(e: MouseEvent) {
    e.stopPropagation();
    if (!node.isExpandable) return;
    if (node.isExpanded) {
      toggleNode(node.path);
    } else {
      expandNodeRecursive(node.path);
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

  function handleBookmark(e: MouseEvent) {
    e.stopPropagation();
    toggleBookmark(node.path);
  }

  async function handleCopyValue(e: MouseEvent) {
    e.stopPropagation();
    const text = node.isExpandable
      ? JSON.stringify(node.value, null, 2)
      : String(node.value);
    await copyToClipboard(text);
    showCopied = true;
    setTimeout(() => { showCopied = false; }, 1200);
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

  function truncateValue(value: any, type: string): string {
    const formatted = formatValue(value, type);
    if (!wordWrap && formatted.length > 200) {
      return formatted.slice(0, 197) + '...';
    }
    return formatted;
  }

  function highlightMatch(text: string): { before: string; match: string; after: string } | null {
    const query = searchQuery();
    if (!query || !isSearchMatch) return null;
    const caseSensitive = searchCaseSensitive();
    const idx = caseSensitive
      ? text.indexOf(query)
      : text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return null;
    return {
      before: text.slice(0, idx),
      match: text.slice(idx, idx + query.length),
      after: text.slice(idx + query.length),
    };
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
    class:word-wrap={wordWrap}
    style="padding-left: {node.depth * 16}px"
    onclick={handleClick}
    ondblclick={handleDblClick}
    onkeydown={handleKeydown}
    oncontextmenu={handleContextMenu}
    role="treeitem"
    tabindex={0}
    aria-expanded={node.isExpandable ? node.isExpanded : undefined}
    aria-selected={isSelected}
    data-path={node.path}
  >
    {#if node.isExpandable}
      <span class="toggle">
        <span class="chevron" class:open={node.isExpanded}></span>
      </span>
    {:else}
      <span class="leaf-indent"></span>
    {/if}

    {#if node.key !== null}
      {@const keyText = typeof node.key === 'number' ? String(node.key) : `"${node.key}"`}
      {@const keyHighlight = highlightMatch(keyText)}
      <span class="key">
        {#if keyHighlight}
          {keyHighlight.before}<mark class="search-highlight">{keyHighlight.match}</mark>{keyHighlight.after}
        {:else}
          {keyText}
        {/if}
      </span>
      <span class="punctuation">: </span>
    {/if}

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
      {@const valueText = truncateValue(node.value, node.type)}
      {@const valueHighlight = highlightMatch(valueText)}
      <span class="value {node.type}">
        {#if valueHighlight}
          {valueHighlight.before}<mark class="search-highlight">{valueHighlight.match}</mark>{valueHighlight.after}
        {:else}
          {valueText}
        {/if}
      </span>
    {/if}

    <!-- Hover action buttons -->
    <span class="hover-actions">
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <i
        class="codicon {isNodeBookmarked ? 'codicon-bookmark-filled bookmark-icon bookmarked' : 'codicon-bookmark bookmark-icon'}"
        onclick={handleBookmark}
      ></i>
      {#if showCopied}
        <i class="codicon codicon-check copied-icon"></i>
      {:else}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <i class="codicon codicon-copy copy-icon" onclick={handleCopyValue}></i>
      {/if}
    </span>
  </div>
{/if}

<style>
  .tree-row {
    display: flex;
    align-items: center;
    gap: 2px;
    height: 22px;
    font-family: var(--hf-editor-font-family);
    font-size: 12px;
    line-height: 22px;
    white-space: nowrap;
    cursor: default;
    padding-right: 12px;
  }

  .tree-row.word-wrap {
    white-space: normal;
    height: auto;
    min-height: 22px;
    align-items: flex-start;
  }

  .tree-row.word-wrap .toggle,
  .tree-row.word-wrap .leaf-indent,
  .tree-row.word-wrap .key,
  .tree-row.word-wrap .punctuation {
    white-space: nowrap;
    flex-shrink: 0;
  }

  .tree-row.word-wrap .value {
    white-space: normal;
    word-break: break-word;
    overflow-wrap: anywhere;
  }

  .tree-row:hover {
    background: var(--hf-list-hoverBackground);
  }

  .tree-row.selected {
    background: var(--hf-list-activeSelectionBackground);
  }

  .tree-row.selected:not(.current-match) {
    color: var(--hf-list-activeSelectionForeground);
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
    background: var(--hf-list-hoverBackground);
  }

  .show-more-btn {
    padding: 0 8px;
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border-radius: 3px;
    font-size: 11px;
    font-style: italic;
    line-height: 18px;
  }

  .show-more-btn:hover {
    background: var(--hf-button-secondaryHoverBackground);
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
    border-color: var(--hf-editorLineNumber-foreground);
    transform: rotate(-45deg);
    transition: transform 0.1s;
  }

  .chevron.open {
    transform: rotate(45deg);
  }

  .key {
    color: var(--hf-symbolIcon-propertyForeground);
  }

  .punctuation {
    color: var(--hf-editor-foreground);
  }

  .value.string {
    color: var(--hf-debugTokenExpression-string);
  }

  .value.number {
    color: var(--hf-debugTokenExpression-number);
  }

  .value.boolean {
    color: var(--hf-debugTokenExpression-boolean);
  }

  .value.null {
    color: var(--hf-debugTokenExpression-boolean);
    font-style: italic;
  }

  .collapsed-badge {
    padding: 0 6px;
    background: var(--hf-badge-background);
    color: var(--hf-badge-foreground);
    border-radius: 4px;
    font-size: 10px;
    font-style: italic;
    margin: 0 2px;
  }

  .tree-row.search-match {
    background: var(--hf-editor-findMatchHighlightBackground);
  }

  .tree-row.current-match,
  .tree-row.selected.current-match {
    background: var(--hf-editor-findMatchBackground);
    outline: 1px solid var(--hf-editor-findMatchBorder);
    outline-offset: -1px;
  }

  .search-highlight {
    background: var(--hf-editor-findMatchHighlightBackground);
    color: inherit;
    border-radius: 2px;
    padding: 1px 2px;
  }

  .tree-row.current-match .search-highlight {
    background: var(--hf-focusBorder);
    color: #fff;
    outline: 1px solid var(--hf-focusBorder);
  }

  .tree-row.selected:not(.current-match) .key,
  .tree-row.selected:not(.current-match) .punctuation,
  .tree-row.selected:not(.current-match) .value {
    color: var(--hf-list-activeSelectionForeground);
  }

  .tree-row.selected:not(.current-match) .collapsed-badge {
    background: rgba(255, 255, 255, 0.2);
  }

  .hover-actions {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: 28px;
    flex-shrink: 0;
  }

  .bookmark-icon {
    font-size: 14px;
    color: var(--hf-icon-foreground);
    cursor: pointer;
    padding: 3px;
    border-radius: 3px;
    visibility: hidden;
    opacity: 0;
    transition: opacity 0.1s;
  }

  .bookmark-icon.bookmarked {
    color: var(--hf-charts-yellow);
    visibility: visible;
    opacity: 1;
  }

  .tree-row:hover .bookmark-icon {
    visibility: visible;
    opacity: 1;
  }

  .bookmark-icon:hover {
    background: var(--hf-toolbar-hoverBackground);
  }

  .copy-icon {
    font-size: 14px;
    color: var(--hf-icon-foreground);
    cursor: pointer;
    padding: 3px;
    border-radius: 3px;
    visibility: hidden;
    opacity: 0;
    transition: opacity 0.1s;
  }

  .tree-row:hover .copy-icon {
    visibility: visible;
    opacity: 1;
  }

  .copy-icon:hover {
    background: var(--hf-toolbar-hoverBackground);
  }

  .copied-icon {
    font-size: 14px;
    color: var(--hf-charts-green);
    padding: 3px;
  }
</style>
