<script lang="ts">
  import { bookmarks, removeBookmark, clearBookmarks, navigateToBreadcrumb, explorerState } from '../stores/jsonExplorer.svelte';
  import { getValueAtPath } from '../lib/path-utils';
  import { buildTooltipPreview } from '../lib/collapsed-preview';
  import Tooltip from '@nouto/ui/components/shared/Tooltip.svelte';

  interface Props {
    onClose?: () => void;
  }
  let { onClose }: Props = $props();

  function handleNavigate(path: string) {
    navigateToBreadcrumb(path);
  }

  function formatPreview(value: any): { text: string; type: string } {
    if (value === undefined) return { text: 'not found', type: 'not-found' };
    if (value === null) return { text: 'null', type: 'null' };
    if (typeof value === 'boolean') return { text: String(value), type: 'boolean' };
    if (typeof value === 'number') return { text: String(value), type: 'number' };
    if (typeof value === 'string') {
      const truncated = value.length > 60 ? value.slice(0, 60) + '...' : value;
      return { text: `"${truncated}"`, type: 'string' };
    }
    if (Array.isArray(value)) return { text: buildTooltipPreview(value, 'array', 3, 80), type: 'array' };
    if (typeof value === 'object') return { text: buildTooltipPreview(value, 'object', 3, 80), type: 'object' };
    return { text: String(value), type: 'unknown' };
  }

  function buildItemTooltip(value: any): string {
    if (value === undefined || value === null) return '';
    if (Array.isArray(value)) return buildTooltipPreview(value, 'array');
    if (typeof value === 'object') return buildTooltipPreview(value, 'object');
    return String(value);
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
      <span class="hint">Hover over a node and click the bookmark icon, or right-click and select "Bookmark".</span>
    </div>
  {:else}
    <div class="bookmark-list">
      {#each bookmarks() as path}
        {@const value = getValueAtPath(explorerState().rawJson, path)}
        {@const preview = formatPreview(value)}
        {@const tooltipText = buildItemTooltip(value)}
        <div class="bookmark-item" class:not-found={preview.type === 'not-found'}>
          <Tooltip text={tooltipText} position="bottom">
            <button class="bookmark-path" onclick={() => handleNavigate(path)}>
              <i class="codicon codicon-bookmark"></i>
              <span class="path-text">{path}</span>
              <span class="value-preview {preview.type}">{preview.text}</span>
            </button>
          </Tooltip>
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
    border-bottom: 1px solid var(--hf-panel-border);
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
    color: var(--hf-descriptionForeground);
    border-bottom: 1px solid var(--hf-panel-border);
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
    color: var(--hf-icon-foreground);
    cursor: pointer;
    border-radius: 3px;
    font-size: 12px;
  }

  .action-btn:hover {
    background: var(--hf-toolbar-hoverBackground);
  }

  .empty-state {
    padding: 12px;
    text-align: center;
    font-size: 11px;
    color: var(--hf-descriptionForeground);
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
    background: var(--hf-list-hoverBackground);
  }

  .bookmark-item.not-found {
    opacity: 0.5;
  }

  .bookmark-path {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
    padding: 3px 8px;
    background: none;
    border: none;
    color: var(--hf-editor-foreground);
    cursor: pointer;
    font-family: var(--hf-editor-font-family);
    font-size: 11px;
    text-align: left;
    overflow: hidden;
  }

  .bookmark-path .codicon {
    color: var(--hf-charts-yellow);
    font-size: 12px;
    flex-shrink: 0;
  }

  .path-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex-shrink: 1;
    min-width: 0;
  }

  .value-preview {
    margin-left: auto;
    flex-shrink: 0;
    font-size: 11px;
    opacity: 0.7;
    white-space: nowrap;
  }

  .value-preview.string { color: var(--hf-debugTokenExpression-string); }
  .value-preview.number { color: var(--hf-debugTokenExpression-number); }
  .value-preview.boolean { color: var(--hf-debugTokenExpression-boolean); }
  .value-preview.null { color: var(--hf-debugTokenExpression-name); }
  .value-preview.not-found { color: var(--hf-errorForeground); font-style: italic; }
  .value-preview.array,
  .value-preview.object { color: var(--hf-descriptionForeground); }

  .remove-btn {
    display: inline-flex;
    align-items: center;
    padding: 2px;
    background: none;
    border: none;
    color: var(--hf-icon-foreground);
    cursor: pointer;
    border-radius: 3px;
    font-size: 10px;
    opacity: 0;
    flex-shrink: 0;
  }

  .bookmark-item:hover .remove-btn {
    opacity: 1;
  }

  .remove-btn:hover {
    background: var(--hf-toolbar-hoverBackground);
  }
</style>
