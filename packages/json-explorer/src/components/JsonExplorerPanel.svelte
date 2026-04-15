<script lang="ts">
  import { explorerState, viewMode, setViewMode, isTableable, tableData, tableSourcePath, viewArrayAsTable, flatNodes, initJsonExplorer, updateJsonData, searchQuery, searchMatchPaths, searchResults, searchCurrentIndex, filterMode, isBookmarked, toggleBookmark } from '../stores/jsonExplorer.svelte';
  import ExplorerToolbar from './ExplorerToolbar.svelte';
  import SearchBar from './SearchBar.svelte';
  import JsonPathFilterBar from './JsonPathFilterBar.svelte';
  import BreadcrumbBar from './BreadcrumbBar.svelte';
  import ExplorerTreeView from './ExplorerTreeView.svelte';
  import ContextMenu from './ContextMenu.svelte';
  import SaveToEnvDialog from './SaveToEnvDialog.svelte';
  import BookmarkPanel from './BookmarkPanel.svelte';
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
  let wordWrap = $state(true);
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

  function remapSearchPathsForTable(matchPaths: Set<string>, sourcePath: string): Set<string> {
    const remapped = new Set<string>();
    for (const p of matchPaths) {
      if (p.startsWith(sourcePath)) {
        remapped.add('$' + p.slice(sourcePath.length));
      }
    }
    return remapped;
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
    <BreadcrumbBar />
    {#if bookmarksActive}
      <BookmarkPanel onClose={() => { bookmarksActive = false; }} />
    {/if}
    <div class="explorer-body">
      {#if viewMode() === 'table' && isTableable()}
        {@const sourcePath = tableSourcePath()}
        {@const rawCurrentPath = searchResults()[searchCurrentIndex()]?.path ?? null}
        <TableView
          data={tableData()}
          searchQuery={searchQuery()}
          searchMatchPaths={sourcePath ? remapSearchPathsForTable(searchMatchPaths(), sourcePath) : searchMatchPaths()}
          currentSearchPath={sourcePath && rawCurrentPath?.startsWith(sourcePath) ? '$' + rawCurrentPath.slice(sourcePath.length) : rawCurrentPath}
          filterMode={filterMode()}
        />
      {:else}
        <ExplorerTreeView {wordWrap} onContextMenu={handleContextMenu} />
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

  .explorer-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 100%;
    color: var(--hf-descriptionForeground);
  }
</style>
