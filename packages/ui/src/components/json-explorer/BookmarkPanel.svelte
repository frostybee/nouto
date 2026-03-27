<script lang="ts">
  import { bookmarks, removeBookmark, clearBookmarks, navigateToBreadcrumb, selectNode } from '../../stores/jsonExplorer.svelte';
  import Tooltip from '../shared/Tooltip.svelte';

  interface Props {
    onClose?: () => void;
  }
  let { onClose }: Props = $props();

  function handleNavigate(path: string) {
    selectNode(path);
    navigateToBreadcrumb(path);
  }
</script>

<div class="bookmark-panel">
  <div class="bookmark-header">
    <i class="codicon codicon-bookmark"></i>
    <span class="bookmark-title">Bookmarks</span>
    <div class="bookmark-actions">
      {#if bookmarks().length > 0}
        <Tooltip text="Clear all bookmarks">
          <button class="action-btn" onclick={clearBookmarks} aria-label="Clear bookmarks">
            <i class="codicon codicon-clear-all"></i>
          </button>
        </Tooltip>
      {/if}
      {#if onClose}
        <button class="action-btn" onclick={onClose} aria-label="Close bookmarks">
          <i class="codicon codicon-close"></i>
        </button>
      {/if}
    </div>
  </div>

  {#if bookmarks().length === 0}
    <div class="empty-state">
      <span>No bookmarks yet.</span>
      <span class="hint">Right-click a node and select "Bookmark" to pin it here.</span>
    </div>
  {:else}
    <div class="bookmark-list">
      {#each bookmarks() as path}
        <div class="bookmark-item">
          <button class="bookmark-path" onclick={() => handleNavigate(path)}>
            <i class="codicon codicon-bookmark"></i>
            <span class="path-text">{path}</span>
          </button>
          <button class="remove-btn" onclick={() => removeBookmark(path)} aria-label="Remove bookmark">
            <i class="codicon codicon-close"></i>
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .bookmark-panel {
    border-bottom: 1px solid var(--vscode-panel-border, #2b2b2b);
    max-height: 200px;
    overflow-y: auto;
    flex-shrink: 0;
  }

  .bookmark-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--vscode-descriptionForeground, #8b8b8b);
    border-bottom: 1px solid var(--vscode-panel-border, rgba(43, 43, 43, 0.5));
  }

  .bookmark-actions {
    display: flex;
    gap: 2px;
    margin-left: auto;
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    padding: 2px;
    background: none;
    border: none;
    color: var(--vscode-icon-foreground, #c5c5c5);
    cursor: pointer;
    border-radius: 3px;
    font-size: 12px;
  }

  .action-btn:hover {
    background: var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31));
  }

  .empty-state {
    padding: 12px;
    text-align: center;
    font-size: 11px;
    color: var(--vscode-descriptionForeground, #8b8b8b);
  }

  .hint {
    display: block;
    margin-top: 4px;
    font-size: 10px;
    opacity: 0.7;
  }

  .bookmark-list {
    padding: 2px 0;
  }

  .bookmark-item {
    display: flex;
    align-items: center;
    padding: 0 4px;
  }

  .bookmark-item:hover {
    background: var(--vscode-list-hoverBackground, rgba(128, 128, 128, 0.08));
  }

  .bookmark-path {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    padding: 3px 8px;
    background: none;
    border: none;
    color: var(--vscode-editor-foreground, #d4d4d4);
    cursor: pointer;
    font-family: var(--vscode-editor-font-family, Consolas, Monaco, monospace);
    font-size: 11px;
    text-align: left;
    overflow: hidden;
  }

  .bookmark-path .codicon {
    color: var(--vscode-charts-yellow, #e2c08d);
    font-size: 12px;
    flex-shrink: 0;
  }

  .path-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .remove-btn {
    display: inline-flex;
    align-items: center;
    padding: 2px;
    background: none;
    border: none;
    color: var(--vscode-icon-foreground, #c5c5c5);
    cursor: pointer;
    border-radius: 3px;
    font-size: 10px;
    opacity: 0;
  }

  .bookmark-item:hover .remove-btn {
    opacity: 1;
  }

  .remove-btn:hover {
    background: var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31));
  }
</style>
