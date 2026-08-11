<script lang="ts">
  import { explorerState, viewMode, setViewMode, isTableable, tableData, tableSourcePath, viewArrayAsTable, flatNodes, initJsonExplorer, updateJsonData, searchQuery, searchMatchPaths, searchResults, searchCurrentIndex, filterMode, comparisonJson, clearComparison, queryMatchPaths, queryCurrentPath, multiSelectCount, multiSelectedPaths, isBookmarked, toggleBookmark, sortKeys, toggleSortKeys } from '../stores/jsonExplorer.svelte';
  import ExplorerToolbar from './ExplorerToolbar.svelte';
  import SearchBar from './SearchBar.svelte';
  import JsonPathFilterBar from './JsonPathFilterBar.svelte';
  import BreadcrumbBar from './BreadcrumbBar.svelte';
  import ExplorerTreeView from './ExplorerTreeView.svelte';
  import ContextMenu from './ContextMenu.svelte';
  import SaveToEnvDialog from './SaveToEnvDialog.svelte';
  import BookmarkPanel from './BookmarkPanel.svelte';
  import StatsPanel from './StatsPanel.svelte';
  import SchemaPanel from './SchemaPanel.svelte';
  import PinnedNodesSection from './PinnedNodesSection.svelte';
  import DiffView from './DiffView.svelte';
  import QueryBar from './QueryBar.svelte';
  import QueryHelpPanel from './QueryHelpPanel.svelte';
  import JsonPathHelpPanel from './JsonPathHelpPanel.svelte';
  import TypeGeneratorPanel from './TypeGeneratorPanel.svelte';
  import Minimap from './Minimap.svelte';
  import CompareDialog from './CompareDialog.svelte';
  import { getValueAtPath } from '../lib/path-utils';
  import { copyToClipboard } from '@nouto/ui/lib/clipboard';
  import TableView from './TableView.svelte';
  import StatusBar from './StatusBar.svelte';
  import Tooltip from '@nouto/ui/components/shared/Tooltip.svelte';
  import type { FlatNode } from '../stores/jsonExplorer.svelte';

  const vscodeApi = (window as any).vscode as { postMessage: (msg: any) => void } | undefined;

  function postToExtension(msg: any) {
    vscodeApi?.postMessage(msg);
  }

  function handleFocusRequest() {
    if (explorerState().requestId) {
      postToExtension({ type: 'focusRequest', data: { requestId: explorerState().requestId } });
    }
  }

  let searchActive = $state(false);
  let filterActive = $state(false);
  let bookmarksActive = $state(false);
  let statsActive = $state(false);
  let showMinimap = $state(false);
  let queryActive = $state(false);
  let queryHelpActive = $state(false);
  let jsonPathHelpActive = $state(false);
  let typeGenActive = $state(false);
  let compareDialogOpen = $state(false);
  let schemaActive = $state(false);
  let wordWrap = $state(true);
  let saveToEnvNode = $state<FlatNode | null>(null);

  // Minimap + scroll-to-top state
  let scrollRatio = $state(0);
  let viewportRatio = $state(0.1);
  let showScrollTop = $state(false);
  let treeViewRef = $state<{ scrollToRatio: (r: number) => void; scrollToTop: () => void }>(undefined!);

  function handleTreeScroll(sr: number, vr: number, scrollTop: number) {
    scrollRatio = sr;
    viewportRatio = vr;
    showScrollTop = scrollTop > 200;
  }

  function handleMinimapScrollTo(ratio: number) {
    treeViewRef?.scrollToRatio(ratio);
  }

  function handleCreateAssertion(node: FlatNode) {
    if (!explorerState().requestId) return;
    const value = node.isExpandable ? undefined : node.value;
    postToExtension({
      type: 'createAssertion',
      data: {
        requestId: explorerState().requestId,
        path: node.path,
        operator: value !== undefined ? 'equals' : 'exists',
        expected: value,
      },
    });
  }

  function handleSaveToEnv(node: FlatNode) {
    saveToEnvNode = node;
  }

  function handleSaveToEnvConfirm(key: string, value: string) {
    postToExtension({ type: 'saveToEnvironment', data: { key, value } });
    saveToEnvNode = null;
  }

  let contextMenuNode = $state<FlatNode | null>(null);
  let contextMenuPos = $state({ x: 0, y: 0 });

  function handleContextMenu(e: MouseEvent, node: FlatNode) {
    contextMenuNode = node;
    contextMenuPos = { x: e.clientX, y: e.clientY };
  }

  function closeContextMenu() {
    contextMenuNode = null;
  }

  function handleViewAsTable(node: FlatNode) {
    viewArrayAsTable(node.path);
  }

  function handleOpenEmbeddedJson(node: FlatNode, parsed: any) {
    postToExtension({
      type: 'openSubtreePanel',
      data: {
        json: JSON.stringify(parsed, null, 2),
        path: `${node.path} (parsed)`,
      },
    });
  }

  function handleOpenSubtree(node: FlatNode) {
    postToExtension({
      type: 'openSubtreePanel',
      data: {
        json: JSON.stringify($state.snapshot(node.value), null, 2),
        path: node.path,
      },
    });
  }

  /** Remap root-relative paths ($<sourcePath>...) to table-relative paths ($...). */
  function remapPathsForTable(matchPaths: Set<string>, sourcePath: string): Set<string> {
    const remapped = new Set<string>();
    for (const p of matchPaths) {
      if (p.startsWith(sourcePath)) {
        remapped.add('$' + p.slice(sourcePath.length));
      }
    }
    return remapped;
  }

  async function handleBulkCopy() {
    const paths = multiSelectedPaths();
    const values: any[] = [];
    for (const path of paths) {
      const val = getValueAtPath(explorerState().rawJson, path);
      if (val !== undefined) values.push(val);
    }
    await copyToClipboard(JSON.stringify(values, null, 2));
  }

  function handleBulkBookmark() {
    for (const path of multiSelectedPaths()) {
      if (!isBookmarked(path)) toggleBookmark(path);
    }
  }

  async function handlePaste(e: ClipboardEvent) {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as HTMLElement).isContentEditable)) return;

    const text = e.clipboardData?.getData('text');
    if (!text) return;

    try {
      const parsed = JSON.parse(text.trim());
      if (typeof parsed === 'object' && parsed !== null) {
        e.preventDefault();
        updateJsonData(parsed);
      }
    } catch {
      // Not JSON, ignore
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    // Ctrl+F to toggle search
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      searchActive = !searchActive;
    }
    // Ctrl+Shift+T to toggle tree/table view
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') {
      e.preventDefault();
      if (isTableable()) {
        setViewMode(viewMode() === 'table' ? 'tree' : 'table');
      }
    }
    // Alt+Z to toggle word wrap
    if (e.altKey && e.key === 'z') {
      e.preventDefault();
      wordWrap = !wordWrap;
    }
    // Ctrl+/ to toggle JSONPath filter
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      e.preventDefault();
      filterActive = !filterActive;
    }
    // Ctrl+Shift+K to toggle query filter
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'K' || e.key === 'k')) {
      e.preventDefault();
      queryActive = !queryActive;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} onpaste={handlePaste} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="json-explorer-panel" onclick={closeContextMenu} role="none">
  {#if explorerState().rawJson !== undefined}
    <ExplorerToolbar
      onToggleSearch={() => { searchActive = !searchActive; }}
      {searchActive}
      onToggleFilter={() => { filterActive = !filterActive; }}
      {filterActive}
      onToggleBookmarks={() => { bookmarksActive = !bookmarksActive; }}
      {bookmarksActive}
      onToggleWordWrap={() => { wordWrap = !wordWrap; }}
      wordWrapActive={wordWrap}
      onToggleSortKeys={() => { toggleSortKeys(); }}
      sortKeysActive={sortKeys()}
      onToggleStats={() => { statsActive = !statsActive; }}
      {statsActive}
      onToggleMinimap={() => { showMinimap = !showMinimap; }}
      minimapActive={showMinimap}
      onToggleQuery={() => { queryActive = !queryActive; }}
      {queryActive}
      onToggleTypeGen={() => { typeGenActive = !typeGenActive; }}
      {typeGenActive}
      onToggleCompare={() => { compareDialogOpen = !compareDialogOpen; }}
      compareActive={compareDialogOpen || viewMode() === 'diff'}
      onToggleSchema={() => { schemaActive = !schemaActive; }}
      {schemaActive}
    />
    {#if explorerState().requestMethod || explorerState().requestUrl || explorerState().requestName}
      <div class="request-header">
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div class="request-info" class:clickable={!!explorerState().requestId} onclick={handleFocusRequest} onkeydown={(e) => { if (e.key === 'Enter') handleFocusRequest(); }} role={explorerState().requestId ? 'button' : undefined} tabindex={explorerState().requestId ? 0 : -1}>
          {#if explorerState().requestId}
            <Tooltip text="Go to request panel">
              <i class="codicon codicon-link link-icon"></i>
            </Tooltip>
          {/if}
          {#if explorerState().requestMethod}
            <span class="request-method">{explorerState().requestMethod}</span>
          {/if}
          {#if explorerState().requestUrl}
            <span class="request-url">{explorerState().requestUrl}</span>
          {/if}
        </div>
        <div class="request-meta">
          {#if explorerState().requestName}
            <span class="request-name">{explorerState().requestName}</span>
          {/if}
          {#if explorerState().timestamp}
            <span class="request-time">{new Date(explorerState().timestamp).toLocaleTimeString()}</span>
          {/if}
        </div>
      </div>
    {/if}
    {#if searchActive}
      <SearchBar onClose={() => { searchActive = false; }} />
    {/if}
    {#if filterActive}
      <JsonPathFilterBar onClose={() => { filterActive = false; jsonPathHelpActive = false; }} onToggleHelp={() => { jsonPathHelpActive = !jsonPathHelpActive; }} helpActive={jsonPathHelpActive} />
    {/if}
    {#if queryActive}
      <QueryBar onClose={() => { queryActive = false; queryHelpActive = false; }} onToggleHelp={() => { queryHelpActive = !queryHelpActive; }} helpActive={queryHelpActive} />
    {/if}
    <BreadcrumbBar />
    {#if statsActive}
      <StatsPanel />
    {/if}
    {#if schemaActive}
      <SchemaPanel onClose={() => { schemaActive = false; }} />
    {/if}
    {#if typeGenActive}
      <TypeGeneratorPanel onClose={() => { typeGenActive = false; }} />
    {/if}
    {#if bookmarksActive}
      <BookmarkPanel onClose={() => { bookmarksActive = false; }} />
    {/if}
    <PinnedNodesSection />
    <div class="explorer-body">
      {#if viewMode() === 'diff' && comparisonJson() !== undefined}
        <DiffView
          left={explorerState().rawJson}
          right={comparisonJson()}
          leftLabel="Original"
          rightLabel="Comparison"
          onClose={clearComparison}
        />
      {:else if viewMode() === 'table' && isTableable()}
        {@const sourcePath = tableSourcePath()}
        {@const rawCurrentPath = searchResults()[searchCurrentIndex()]?.path ?? null}
        {@const rawQueryCurrent = queryCurrentPath()}
        <TableView
          data={tableData()}
          searchQuery={searchQuery()}
          searchMatchPaths={sourcePath ? remapPathsForTable(searchMatchPaths(), sourcePath) : searchMatchPaths()}
          currentSearchPath={sourcePath && rawCurrentPath?.startsWith(sourcePath) ? '$' + rawCurrentPath.slice(sourcePath.length) : rawCurrentPath}
          filterMode={filterMode()}
          queryMatchPaths={sourcePath ? remapPathsForTable(queryMatchPaths(), sourcePath) : queryMatchPaths()}
          queryCurrentPath={sourcePath ? (rawQueryCurrent?.startsWith(sourcePath) ? '$' + rawQueryCurrent.slice(sourcePath.length) : null) : rawQueryCurrent}
        />
      {:else}
        <div class="tree-with-minimap">
          <ExplorerTreeView bind:this={treeViewRef} {wordWrap} onContextMenu={handleContextMenu} onScroll={handleTreeScroll} />
          {#if showMinimap && flatNodes().length > 20}
            <Minimap {scrollRatio} {viewportRatio} onScrollTo={handleMinimapScrollTo} />
          {/if}
          {#if showScrollTop}
            <div class="scroll-to-top-container">
              <Tooltip text="Scroll to top ({Math.round(scrollRatio * 100)}%)" position="top">
                <button class="scroll-to-top-btn" onclick={() => treeViewRef?.scrollToTop()} aria-label="Scroll to top">
                  <svg class="progress-ring" viewBox="0 0 36 36">
                    <circle class="progress-ring-bg" cx="18" cy="18" r="16" />
                    <circle class="progress-ring-fill" cx="18" cy="18" r="16"
                      stroke-dasharray="{scrollRatio * 100.53} 100.53" />
                  </svg>
                  <span class="codicon codicon-chevron-up"></span>
                </button>
              </Tooltip>
            </div>
          {/if}
        </div>
      {/if}
    </div>
    <StatusBar />
    {#if contextMenuNode}
      <ContextMenu
        node={contextMenuNode}
        x={contextMenuPos.x}
        y={contextMenuPos.y}
        onClose={closeContextMenu}
        onCreateAssertion={explorerState().requestId ? handleCreateAssertion : undefined}
        onSaveToEnv={explorerState().requestId ? handleSaveToEnv : undefined}
        onViewAsTable={handleViewAsTable}
        onOpenSubtree={vscodeApi && contextMenuNode.isExpandable ? handleOpenSubtree : undefined}
        onOpenEmbeddedJson={vscodeApi ? handleOpenEmbeddedJson : undefined}
        onSearchInNode={() => { searchActive = true; }}
        multiSelectCount={multiSelectCount()}
        onBulkCopy={handleBulkCopy}
        onBulkBookmark={handleBulkBookmark}
      />
    {/if}
    {#if saveToEnvNode}
      <SaveToEnvDialog
        node={saveToEnvNode}
        onSave={handleSaveToEnvConfirm}
        onCancel={() => { saveToEnvNode = null; }}
      />
    {/if}
    <QueryHelpPanel open={queryHelpActive} onclose={() => { queryHelpActive = false; }} />
    <JsonPathHelpPanel open={jsonPathHelpActive} onclose={() => { jsonPathHelpActive = false; }} />
    <CompareDialog open={compareDialogOpen} onclose={() => { compareDialogOpen = false; }} />
  {:else}
    <div class="explorer-loading">
      <i class="codicon codicon-loading codicon-modifier-spin"></i>
      <span>Loading JSON data...</span>
    </div>
  {/if}
</div>

<style>
  .json-explorer-panel {
    display: flex;
    flex-direction: column;
    height: 100vh;
    position: relative;
    overflow: hidden;
    background: var(--hf-editor-background);
    color: var(--hf-editor-foreground);
    font-family: var(--hf-font-family);
    font-size: var(--hf-font-size);
  }

  .request-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 12px;
    border-bottom: 1px solid var(--hf-panel-border);
    flex-shrink: 0;
    font-size: 12px;
  }

  .request-info {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--hf-editor-font-family);
    overflow: hidden;
  }

  .request-info.clickable {
    cursor: pointer;
  }

  .request-info.clickable:hover {
    opacity: 0.8;
  }

  .link-icon {
    font-size: 12px;
    color: var(--hf-textLink-foreground);
  }

  .request-method {
    font-weight: 600;
    color: var(--hf-charts-green);
    text-transform: uppercase;
    flex-shrink: 0;
  }

  .request-url {
    color: var(--hf-textLink-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .request-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .request-name {
    color: var(--hf-descriptionForeground);
    font-size: 11px;
  }

  .request-time {
    color: var(--hf-descriptionForeground);
    font-size: 10px;
    opacity: 0.7;
  }

  .explorer-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .tree-with-minimap {
    flex: 1;
    display: flex;
    overflow: hidden;
    position: relative;
  }

  .scroll-to-top-container {
    position: absolute;
    bottom: 2.769rem;
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
    z-index: 50;
    pointer-events: none;
  }

  .scroll-to-top-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.769rem;
    height: 2.769rem;
    padding: 0;
    background: var(--hf-button-secondaryBackground);
    border: none;
    border-radius: 50%;
    color: var(--hf-foreground);
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    transition: background 0.15s, transform 0.15s;
    font-size: 1.077rem;
    position: relative;
    pointer-events: auto;
  }

  .scroll-to-top-btn:hover {
    background: var(--hf-button-secondaryHoverBackground);
    transform: translateY(-1px);
  }

  .progress-ring {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
    pointer-events: none;
  }

  .progress-ring-bg {
    fill: none;
    stroke: var(--hf-panel-border);
    stroke-width: 2.5;
  }

  .progress-ring-fill {
    fill: none;
    stroke: var(--hf-charts-green, #49cc90);
    stroke-width: 2.5;
    stroke-linecap: round;
    transition: stroke-dasharray 0.15s;
  }

  .explorer-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 100%;
    color: var(--hf-descriptionForeground);
  }
</style>
