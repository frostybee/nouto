<script lang="ts">
  import { expandAll, collapseAll, expandToDepth, totalNodeCount, explorerState, viewMode, setViewMode, isTableable } from '../stores/jsonExplorer.svelte';
  import Tooltip from '@nouto/ui/components/shared/Tooltip.svelte';
  import CopyButton from '@nouto/ui/components/shared/CopyButton.svelte';
  import CopyAsMenu from './CopyAsMenu.svelte';

  interface Props {
    onToggleSearch?: () => void;
    searchActive?: boolean;
    onToggleFilter?: () => void;
    filterActive?: boolean;
    onToggleBookmarks?: () => void;
    bookmarksActive?: boolean;
    onToggleWordWrap?: () => void;
    wordWrapActive?: boolean;
  }
  let {
    onToggleSearch,
    searchActive = false,
    onToggleFilter,
    filterActive = false,
    onToggleBookmarks,
    bookmarksActive = false,
    onToggleWordWrap,
    wordWrapActive = false,
  }: Props = $props();

  let foldMenuOpen = $state(false);
  let foldMenuRef = $state<HTMLDivElement>(undefined!);

  $effect(() => {
    if (foldMenuOpen) {
      const handler = (e: MouseEvent) => {
        if (foldMenuRef && !foldMenuRef.contains(e.target as Node)) {
          foldMenuOpen = false;
        }
      };
      document.addEventListener('click', handler, true);
      return () => document.removeEventListener('click', handler, true);
    }
  });

  function getJsonText(): string {
    if (explorerState().rawJson === undefined) return '';
    return JSON.stringify(explorerState().rawJson, null, 2);
  }
</script>

<div class="explorer-toolbar">
  <!-- === Search & Filter group === -->
  <Tooltip text="Search (Ctrl+F)">
    <button
      class="toolbar-btn labeled"
      class:active={searchActive}
      onclick={() => onToggleSearch?.()}
      aria-label="Search"
    >
      <i class="codicon codicon-search"></i>
      <span class="btn-label">Search</span>
    </button>
  </Tooltip>

  <Tooltip text="JSONPath filter (Ctrl+/)">
    <button
      class="toolbar-btn labeled"
      class:active={filterActive}
      onclick={() => onToggleFilter?.()}
      aria-label="JSONPath filter"
    >
      <i class="codicon codicon-filter"></i>
      <span class="btn-label">Filter</span>
    </button>
  </Tooltip>

  <div class="toolbar-separator"></div>

  <!-- === View controls group === -->
  {#if isTableable()}
    <div class="view-mode-group">
      <Tooltip text="Tree view">
        <button
          class="mode-btn"
          class:active={viewMode() === 'tree'}
          onclick={() => setViewMode('tree')}
          aria-label="Tree view"
        ><i class="codicon codicon-list-tree"></i><span class="mode-label">Tree</span></button>
      </Tooltip>
      <Tooltip text="Table view">
        <button
          class="mode-btn"
          class:active={viewMode() === 'table'}
          onclick={() => setViewMode('table')}
          aria-label="Table view"
        ><i class="codicon codicon-table"></i><span class="mode-label">Table</span></button>
      </Tooltip>
    </div>
  {/if}

  {#if viewMode() === 'tree'}
    <!-- Expand split button -->
    <div class="split-btn-container" bind:this={foldMenuRef}>
      <Tooltip text="Expand All">
        <button
          class="toolbar-btn split-btn-main"
          onclick={() => expandAll()}
          aria-label="Expand All"
        >
          <i class="codicon codicon-unfold"></i>
        </button>
      </Tooltip>
      <Tooltip text="Expand to level...">
        <button
          class="toolbar-btn split-btn-dropdown"
          onclick={() => { foldMenuOpen = !foldMenuOpen; }}
          aria-label="Expand to level"
        >
          <i class="codicon codicon-chevron-down fold-chevron"></i>
        </button>
      </Tooltip>
      {#if foldMenuOpen}
        <div class="fold-menu">
          {#each [1, 2, 3, 4, 5] as level}
            <button class="fold-menu-item" onclick={() => { expandToDepth(level); foldMenuOpen = false; }}>
              Expand to Level {level}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Collapse button -->
    <Tooltip text="Collapse All">
      <button
        class="toolbar-btn"
        onclick={() => collapseAll()}
        aria-label="Collapse All"
      >
        <i class="codicon codicon-fold"></i>
      </button>
    </Tooltip>
  {/if}

  <Tooltip text="Toggle word wrap (Alt+Z)">
    <button
      class="toolbar-btn"
      class:active={wordWrapActive}
      onclick={() => onToggleWordWrap?.()}
      aria-label="Toggle word wrap"
    >
      <i class="codicon codicon-word-wrap"></i>
    </button>
  </Tooltip>

  <div class="toolbar-separator"></div>

  <!-- === Panels group === -->
  <Tooltip text="Bookmarks">
    <button
      class="toolbar-btn"
      class:active={bookmarksActive}
      onclick={() => onToggleBookmarks?.()}
      aria-label="Bookmarks"
    >
      <i class="codicon codicon-bookmark"></i>
    </button>
  </Tooltip>

  <div class="toolbar-separator"></div>

  <!-- Copy -->
  <CopyButton text={getJsonText} iconOnly title="Copy JSON to clipboard" duration={2000} />
  <CopyAsMenu />

  <div class="toolbar-spacer"></div>

  <!-- Node count badge -->
  <span class="node-count-badge">{totalNodeCount()} nodes</span>
</div>

<style>
  .explorer-toolbar {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px 8px;
    border-bottom: 1px solid var(--hf-panel-border);
    flex-shrink: 0;
  }

  .toolbar-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 3px 6px;
    background: transparent;
    color: var(--hf-icon-foreground);
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-size: 14px;
  }

  .toolbar-btn:hover {
    background: var(--hf-toolbar-hoverBackground);
  }

  .toolbar-btn.labeled {
    gap: 4px;
  }

  .btn-label {
    font-size: 12px;
    color: var(--hf-icon-foreground);
  }

  .toolbar-btn.active {
    background: var(--hf-toolbar-activeBackground);
    color: var(--hf-icon-foreground);
  }

  .view-mode-group {
    display: inline-flex;
    border: 1px solid var(--hf-panel-border);
    border-radius: 3px;
    overflow: hidden;
  }

  .mode-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 3px 6px;
    background: transparent;
    color: var(--hf-icon-foreground);
    border: none;
    cursor: pointer;
    font-size: 14px;
  }

  .mode-btn:hover {
    background: var(--hf-toolbar-hoverBackground);
  }

  .mode-btn.active {
    background: var(--hf-toolbar-activeBackground);
  }

  .mode-label {
    font-size: 12px;
    color: var(--hf-icon-foreground);
  }

  .toolbar-separator {
    width: 1px;
    height: 16px;
    background: var(--hf-panel-border);
    margin: 0 2px;
    flex-shrink: 0;
  }

  .toolbar-spacer {
    flex: 1;
  }

  .split-btn-container {
    position: relative;
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--hf-panel-border);
    border-radius: 3px;
  }

  .split-btn-main {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
    padding-right: 4px;
    border-right: 1px solid var(--hf-panel-border);
  }

  .split-btn-dropdown {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    padding-left: 2px;
    padding-right: 4px;
  }

  .fold-chevron {
    font-size: 10px;
  }

  .fold-menu {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 100;
    min-width: 160px;
    background: var(--hf-menu-background);
    border: 1px solid var(--hf-menu-border);
    border-radius: 4px;
    padding: 4px 0;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .fold-menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 4px 12px;
    background: none;
    color: var(--hf-menu-foreground);
    border: none;
    cursor: pointer;
    font-size: 12px;
    text-align: left;
    white-space: nowrap;
  }

  .fold-menu-item:hover {
    background: var(--hf-menu-selectionBackground);
    color: var(--hf-menu-selectionForeground);
  }


  .node-count-badge {
    padding: 1px 6px;
    background: var(--hf-badge-background);
    color: var(--hf-badge-foreground);
    border-radius: 4px;
    font-size: 10px;
    white-space: nowrap;
  }
</style>
