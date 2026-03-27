<script lang="ts">
  import { expandAll, collapseAll, expandToDepth, totalNodeCount, explorerState, viewMode, setViewMode, isTableable } from '../../stores/jsonExplorer.svelte';
  import Tooltip from '../shared/Tooltip.svelte';
  import CopyButton from '../shared/CopyButton.svelte';
  import CopyAsMenu from './CopyAsMenu.svelte';

  interface Props {
    onToggleSearch?: () => void;
    searchActive?: boolean;
    onToggleFilter?: () => void;
    filterActive?: boolean;
    onToggleStats?: () => void;
    statsActive?: boolean;
    onToggleMinimap?: () => void;
    minimapActive?: boolean;
    onToggleQuery?: () => void;
    queryActive?: boolean;
    onToggleTypeGen?: () => void;
    typeGenActive?: boolean;
    onToggleBookmarks?: () => void;
    bookmarksActive?: boolean;
  }
  let {
    onToggleSearch,
    searchActive = false,
    onToggleFilter,
    filterActive = false,
    onToggleStats,
    statsActive = false,
    onToggleMinimap,
    minimapActive = false,
    onToggleQuery,
    queryActive = false,
    onToggleTypeGen,
    typeGenActive = false,
    onToggleBookmarks,
    bookmarksActive = false,
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
  <!-- Search -->
  <Tooltip text="Search (Ctrl+F)">
    <button
      class="toolbar-btn"
      class:active={searchActive}
      onclick={() => onToggleSearch?.()}
      aria-label="Search"
    >
      <i class="codicon codicon-search"></i>
    </button>
  </Tooltip>

  <!-- Fold controls -->
  <div class="fold-container" bind:this={foldMenuRef}>
    <Tooltip text="Fold controls">
      <button
        class="toolbar-btn"
        onclick={() => { foldMenuOpen = !foldMenuOpen; }}
        aria-label="Fold controls"
      >
        <i class="codicon codicon-fold"></i>
        <i class="codicon codicon-chevron-down fold-chevron"></i>
      </button>
    </Tooltip>
    {#if foldMenuOpen}
      <div class="fold-menu">
        <button class="fold-menu-item" onclick={() => { expandAll(); foldMenuOpen = false; }}>
          <i class="codicon codicon-unfold"></i> Expand All
        </button>
        <button class="fold-menu-item" onclick={() => { collapseAll(); foldMenuOpen = false; }}>
          <i class="codicon codicon-fold"></i> Collapse All
        </button>
        <div class="fold-separator"></div>
        {#each [1, 2, 3, 4, 5] as level}
          <button class="fold-menu-item" onclick={() => { expandToDepth(level); foldMenuOpen = false; }}>
            Expand to Level {level}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- View mode toggle -->
  {#if isTableable()}
    <div class="view-mode-group">
      <Tooltip text="Tree view">
        <button
          class="mode-btn"
          class:active={viewMode() === 'tree'}
          onclick={() => setViewMode('tree')}
          aria-label="Tree view"
        ><i class="codicon codicon-list-tree"></i></button>
      </Tooltip>
      <Tooltip text="Table view">
        <button
          class="mode-btn"
          class:active={viewMode() === 'table'}
          onclick={() => setViewMode('table')}
          aria-label="Table view"
        ><i class="codicon codicon-table"></i></button>
      </Tooltip>
    </div>
  {/if}

  <!-- JSONPath filter -->
  <Tooltip text="JSONPath filter">
    <button
      class="toolbar-btn"
      class:active={filterActive}
      onclick={() => onToggleFilter?.()}
      aria-label="JSONPath filter"
    >
      <i class="codicon codicon-filter"></i>
    </button>
  </Tooltip>

  <!-- Stats -->
  <Tooltip text="JSON statistics">
    <button
      class="toolbar-btn"
      class:active={statsActive}
      onclick={() => onToggleStats?.()}
      aria-label="JSON statistics"
    >
      <i class="codicon codicon-graph"></i>
    </button>
  </Tooltip>

  <!-- Query language -->
  <Tooltip text="Query filter">
    <button
      class="toolbar-btn"
      class:active={queryActive}
      onclick={() => onToggleQuery?.()}
      aria-label="Query filter"
    >
      <i class="codicon codicon-terminal"></i>
    </button>
  </Tooltip>

  <!-- Type generator -->
  <Tooltip text="Generate types">
    <button
      class="toolbar-btn"
      class:active={typeGenActive}
      onclick={() => onToggleTypeGen?.()}
      aria-label="Generate types"
    >
      <i class="codicon codicon-symbol-interface"></i>
    </button>
  </Tooltip>

  <!-- Bookmarks -->
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

  <!-- Minimap -->
  <Tooltip text="Toggle minimap">
    <button
      class="toolbar-btn"
      class:active={minimapActive}
      onclick={() => onToggleMinimap?.()}
      aria-label="Toggle minimap"
    >
      <i class="codicon codicon-layout-sidebar-right"></i>
    </button>
  </Tooltip>

  <div class="toolbar-spacer"></div>

  <!-- Copy -->
  <CopyButton text={getJsonText} iconOnly title="Copy JSON to clipboard" duration={2000} />
  <CopyAsMenu />

  <!-- Node count badge -->
  <span class="node-count-badge">{totalNodeCount()} nodes</span>
</div>

<style>
  .explorer-toolbar {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px 8px;
    border-bottom: 1px solid var(--vscode-panel-border, #2b2b2b);
    flex-shrink: 0;
  }

  .toolbar-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 3px 6px;
    background: transparent;
    color: var(--vscode-icon-foreground, #c5c5c5);
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-size: 14px;
  }

  .toolbar-btn:hover {
    background: var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31));
  }

  .toolbar-btn.active {
    background: var(--vscode-toolbar-activeBackground, rgba(99, 102, 103, 0.31));
    color: var(--vscode-icon-foreground, #fff);
  }

  .view-mode-group {
    display: inline-flex;
    border: 1px solid var(--vscode-panel-border, #2b2b2b);
    border-radius: 3px;
    overflow: hidden;
  }

  .mode-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 3px 6px;
    background: transparent;
    color: var(--vscode-icon-foreground, #c5c5c5);
    border: none;
    cursor: pointer;
    font-size: 14px;
  }

  .mode-btn:hover {
    background: var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31));
  }

  .mode-btn.active {
    background: var(--vscode-toolbar-activeBackground, rgba(99, 102, 103, 0.31));
  }

  .toolbar-spacer {
    flex: 1;
  }

  .fold-container {
    position: relative;
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
    background: var(--vscode-menu-background, #252526);
    border: 1px solid var(--vscode-menu-border, #454545);
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
    color: var(--vscode-menu-foreground, #ccc);
    border: none;
    cursor: pointer;
    font-size: 12px;
    text-align: left;
    white-space: nowrap;
  }

  .fold-menu-item:hover {
    background: var(--vscode-menu-selectionBackground, #094771);
    color: var(--vscode-menu-selectionForeground, #fff);
  }

  .fold-separator {
    height: 1px;
    background: var(--vscode-menu-separatorBackground, #454545);
    margin: 4px 0;
  }

  .node-count-badge {
    padding: 1px 6px;
    background: var(--vscode-badge-background, #4d4d4d);
    color: var(--vscode-badge-foreground, #fff);
    border-radius: 4px;
    font-size: 10px;
    white-space: nowrap;
  }
</style>
