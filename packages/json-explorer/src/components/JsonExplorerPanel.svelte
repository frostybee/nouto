<script lang="ts">
  import { explorerState, viewMode, setViewMode, isTableable, tableData, flatNodes, comparisonJson, clearComparison, initJsonExplorer } from '../stores/jsonExplorer.svelte';
  import ExplorerToolbar from './ExplorerToolbar.svelte';
  import SearchBar from './SearchBar.svelte';
  import JsonPathFilterBar from './JsonPathFilterBar.svelte';
  import BreadcrumbBar from './BreadcrumbBar.svelte';
  import ExplorerTreeView from './ExplorerTreeView.svelte';
  import ContextMenu from './ContextMenu.svelte';
  import SaveToEnvDialog from './SaveToEnvDialog.svelte';
  import StatsPanel from './StatsPanel.svelte';
  import BookmarkPanel from './BookmarkPanel.svelte';
  import TableView from './TableView.svelte';
  import DiffView from './DiffView.svelte';
  import QueryBar from './QueryBar.svelte';
  import TypeGeneratorPanel from './TypeGeneratorPanel.svelte';
  import Minimap from './Minimap.svelte';
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
  let statsActive = $state(false);
  let showMinimap = $state(false);
  let queryActive = $state(false);
  let typeGenActive = $state(false);
  let bookmarksActive = $state(false);
  let wordWrap = $state(false);
  let saveToEnvNode = $state<FlatNode | null>(null);

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

  // Minimap scroll state
  let scrollRatio = $state(0);
  let viewportRatio = $state(0.1);

  let contextMenuNode = $state<FlatNode | null>(null);
  let contextMenuPos = $state({ x: 0, y: 0 });

  function handleContextMenu(e: MouseEvent, node: FlatNode) {
    contextMenuNode = node;
    contextMenuPos = { x: e.clientX, y: e.clientY };
  }

  function closeContextMenu() {
    contextMenuNode = null;
  }

  async function handlePaste(e: ClipboardEvent) {
    // Only handle paste when no input/textarea is focused
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as HTMLElement).isContentEditable)) return;

    const text = e.clipboardData?.getData('text');
    if (!text) return;

    // Try to parse as JSON
    try {
      const parsed = JSON.parse(text.trim());
      if (typeof parsed === 'object' && parsed !== null) {
        e.preventDefault();
        initJsonExplorer({ json: parsed });
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
  }
</script>

<svelte:window onkeydown={handleKeydown} onpaste={handlePaste} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="json-explorer-panel" onclick={closeContextMenu} role="application">
  {#if explorerState().rawJson !== undefined}
    <ExplorerToolbar
      onToggleSearch={() => { searchActive = !searchActive; }}
      {searchActive}
      onToggleFilter={() => { filterActive = !filterActive; }}
      {filterActive}
      onToggleStats={() => { statsActive = !statsActive; }}
      {statsActive}
      onToggleMinimap={() => { showMinimap = !showMinimap; }}
      minimapActive={showMinimap}
      onToggleQuery={() => { queryActive = !queryActive; }}
      {queryActive}
      onToggleTypeGen={() => { typeGenActive = !typeGenActive; }}
      {typeGenActive}
      onToggleBookmarks={() => { bookmarksActive = !bookmarksActive; }}
      {bookmarksActive}
      onToggleWordWrap={() => { wordWrap = !wordWrap; }}
      wordWrapActive={wordWrap}
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
      <JsonPathFilterBar onClose={() => { filterActive = false; }} />
    {/if}
    {#if queryActive}
      <QueryBar onClose={() => { queryActive = false; }} />
    {/if}
    <BreadcrumbBar />
    {#if statsActive}
      <StatsPanel />
    {/if}
    {#if typeGenActive}
      <TypeGeneratorPanel onClose={() => { typeGenActive = false; }} />
    {/if}
    {#if bookmarksActive}
      <BookmarkPanel onClose={() => { bookmarksActive = false; }} />
    {/if}
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
        <TableView data={tableData()} />
      {:else}
        <div class="tree-with-minimap">
          <ExplorerTreeView {wordWrap} onContextMenu={handleContextMenu} />
          {#if showMinimap && flatNodes().length > 20}
            <Minimap {scrollRatio} {viewportRatio} />
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
        onSaveToEnv={handleSaveToEnv}
        onSearchInNode={() => { searchActive = true; }}
      />
    {/if}
    {#if saveToEnvNode}
      <SaveToEnvDialog
        node={saveToEnvNode}
        onSave={handleSaveToEnvConfirm}
        onCancel={() => { saveToEnvNode = null; }}
      />
    {/if}
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
