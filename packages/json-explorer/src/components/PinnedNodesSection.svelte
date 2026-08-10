<script lang="ts">
  import { pinnedPaths, removePin, clearPins, explorerState, selectNode, navigateToBreadcrumb } from '../stores/jsonExplorer.svelte';
  import { getValueAtPath } from '../lib/path-utils';
  import Tooltip from '@nouto/ui/components/shared/Tooltip.svelte';

  function handleNavigate(path: string) {
    selectNode(path);
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
    if (Array.isArray(value)) return { text: `Array (${value.length} items)`, type: 'array' };
    if (typeof value === 'object') {
      const keys = Object.keys(value);
      return { text: `Object (${keys.length} keys)`, type: 'object' };
    }
    return { text: String(value), type: 'unknown' };
  }
</script>

{#if pinnedPaths().length > 0}
  <div class="pinned-section">
    <div class="pinned-header">
      <i class="codicon codicon-pin"></i>
      <span class="pinned-title">Pinned</span>
      <span class="pinned-count">{pinnedPaths().length}</span>
      <div class="pinned-actions">
        <Tooltip text="Clear all pins">
          <button class="action-btn" onclick={clearPins} aria-label="Clear pins">
            <i class="codicon codicon-clear-all"></i>
          </button>
        </Tooltip>
      </div>
    </div>
    <div class="pinned-list">
      {#each pinnedPaths() as path}
        {@const value = getValueAtPath(explorerState().rawJson, path)}
        {@const preview = formatPreview(value)}
        <div class="pinned-item" class:not-found={preview.type === 'not-found'}>
          <button class="pinned-path" onclick={() => handleNavigate(path)}>
            <i class="codicon codicon-pinned"></i>
            <span class="path-text">{path}</span>
            <span class="value-preview {preview.type}">{preview.text}</span>
          </button>
          <button class="unpin-btn" onclick={() => removePin(path)} aria-label="Unpin">
            <i class="codicon codicon-close"></i>
          </button>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .pinned-section {
    border-bottom: 1px solid var(--hf-panel-border);
    max-height: 150px;
    overflow-y: auto;
    flex-shrink: 0;
  }

  .pinned-header {
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

  .pinned-header .codicon {
    color: var(--hf-charts-blue);
    font-size: 12px;
  }

  .pinned-count {
    font-size: 10px;
    font-weight: 600;
    background: var(--hf-badge-background);
    color: var(--hf-badge-foreground);
    padding: 0 5px;
    border-radius: 8px;
    min-width: 16px;
    text-align: center;
  }

  .pinned-actions {
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

  .pinned-list {
    padding: 2px 0;
  }

  .pinned-item {
    display: flex;
    align-items: center;
    padding: 0 4px;
  }

  .pinned-item:hover {
    background: var(--hf-list-hoverBackground);
  }

  .pinned-item.not-found {
    opacity: 0.5;
  }

  .pinned-path {
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

  .pinned-path .codicon {
    color: var(--hf-charts-blue);
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

  .unpin-btn {
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

  .pinned-item:hover .unpin-btn {
    opacity: 1;
  }

  .unpin-btn:hover {
    background: var(--hf-toolbar-hoverBackground);
  }
</style>
