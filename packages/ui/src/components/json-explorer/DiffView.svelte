<script lang="ts">
  import { computeStructuralDiff, type DiffNode, type DiffSummary } from '../../lib/json-explorer/diff';
  import Tooltip from '../shared/Tooltip.svelte';

  interface Props {
    left: any;
    right: any;
    leftLabel?: string;
    rightLabel?: string;
    onClose?: () => void;
  }
  let { left, right, leftLabel = 'Original', rightLabel = 'Modified', onClose }: Props = $props();

  const diffResult = $derived(computeStructuralDiff(left, right));
  const nodes = $derived(diffResult.nodes);
  const summary = $derived(diffResult.summary);

  function formatValue(value: any): string {
    if (value === null) return 'null';
    if (value === undefined) return '';
    if (typeof value === 'string') return `"${value}"`;
    if (typeof value === 'object') {
      if (Array.isArray(value)) return `[${value.length} items]`;
      return `{${Object.keys(value).length} keys}`;
    }
    return String(value);
  }

  function truncate(text: string, max = 60): string {
    return text.length > max ? text.slice(0, max - 3) + '...' : text;
  }

  const statusColors: Record<string, string> = {
    added: 'var(--vscode-diffEditor-insertedTextBackground, rgba(155, 185, 85, 0.2))',
    removed: 'var(--vscode-diffEditor-removedTextBackground, rgba(255, 0, 0, 0.2))',
    changed: 'var(--vscode-diffEditor-diagonalFill, rgba(255, 200, 0, 0.15))',
    unchanged: 'transparent',
  };

  const statusIcons: Record<string, string> = {
    added: 'codicon-diff-added',
    removed: 'codicon-diff-removed',
    changed: 'codicon-diff-modified',
    unchanged: '',
  };
</script>

<div class="diff-view">
  <div class="diff-header">
    <div class="diff-summary">
      <span class="summary-item added">+{summary.added} added</span>
      <span class="summary-item removed">-{summary.removed} removed</span>
      <span class="summary-item changed">~{summary.changed} changed</span>
      <span class="summary-item unchanged">{summary.unchanged} unchanged</span>
    </div>
    {#if onClose}
      <button class="close-btn" onclick={onClose} aria-label="Close diff">
        <i class="codicon codicon-close"></i>
      </button>
    {/if}
  </div>

  <div class="diff-labels">
    <div class="diff-label left-label">{leftLabel}</div>
    <div class="diff-label right-label">{rightLabel}</div>
  </div>

  <div class="diff-body">
    {#each nodes as node}
      <div
        class="diff-row"
        style="background: {statusColors[node.status]};"
      >
        <!-- Left side -->
        <div class="diff-cell left-cell" style="padding-left: {node.depth * 14 + 4}px;">
          {#if node.status !== 'added'}
            {#if node.key !== null}
              <span class="diff-key">{typeof node.key === 'number' ? node.key : `"${node.key}"`}</span>
              <span class="diff-punct">: </span>
            {/if}
            <span class="diff-value {node.leftType ?? ''}">{truncate(formatValue(node.leftValue))}</span>
          {/if}
        </div>

        <!-- Status indicator -->
        <div class="diff-indicator">
          {#if node.status !== 'unchanged'}
            <i class="codicon {statusIcons[node.status]} indicator-icon {node.status}"></i>
          {/if}
        </div>

        <!-- Right side -->
        <div class="diff-cell right-cell" style="padding-left: {node.depth * 14 + 4}px;">
          {#if node.status !== 'removed'}
            {#if node.key !== null}
              <span class="diff-key">{typeof node.key === 'number' ? node.key : `"${node.key}"`}</span>
              <span class="diff-punct">: </span>
            {/if}
            <span class="diff-value {node.rightType ?? ''}">{truncate(formatValue(node.rightValue))}</span>
          {/if}
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .diff-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .diff-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 12px;
    border-bottom: 1px solid var(--vscode-panel-border, #2b2b2b);
    flex-shrink: 0;
  }

  .diff-summary {
    display: flex;
    gap: 12px;
    font-size: 11px;
  }

  .summary-item {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

  .summary-item.added { color: var(--vscode-gitDecoration-addedResourceForeground, #81b88b); }
  .summary-item.removed { color: var(--vscode-gitDecoration-deletedResourceForeground, #c74e39); }
  .summary-item.changed { color: var(--vscode-gitDecoration-modifiedResourceForeground, #e2c08d); }
  .summary-item.unchanged { color: var(--vscode-descriptionForeground, #8b8b8b); }

  .close-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 3px;
    background: none;
    border: none;
    color: var(--vscode-icon-foreground, #c5c5c5);
    cursor: pointer;
    border-radius: 3px;
  }

  .close-btn:hover {
    background: var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31));
  }

  .diff-labels {
    display: flex;
    border-bottom: 1px solid var(--vscode-panel-border, #2b2b2b);
    flex-shrink: 0;
  }

  .diff-label {
    flex: 1;
    padding: 3px 12px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--vscode-descriptionForeground, #8b8b8b);
  }

  .left-label {
    border-right: 1px solid var(--vscode-panel-border, #2b2b2b);
  }

  .diff-body {
    flex: 1;
    overflow: auto;
  }

  .diff-row {
    display: flex;
    min-height: 20px;
    border-bottom: 1px solid var(--vscode-panel-border, rgba(43, 43, 43, 0.3));
  }

  .diff-cell {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 1px 4px;
    font-family: var(--vscode-editor-font-family, Consolas, Monaco, monospace);
    font-size: 12px;
    line-height: 20px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .left-cell {
    border-right: 1px solid var(--vscode-panel-border, rgba(43, 43, 43, 0.3));
  }

  .diff-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    flex-shrink: 0;
  }

  .indicator-icon {
    font-size: 12px;
  }

  .indicator-icon.added { color: var(--vscode-gitDecoration-addedResourceForeground, #81b88b); }
  .indicator-icon.removed { color: var(--vscode-gitDecoration-deletedResourceForeground, #c74e39); }
  .indicator-icon.changed { color: var(--vscode-gitDecoration-modifiedResourceForeground, #e2c08d); }

  .diff-key {
    color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe);
  }

  .diff-punct {
    color: var(--vscode-editor-foreground, #d4d4d4);
  }

  .diff-value.string { color: #ce9178; }
  .diff-value.number { color: #b5cea8; }
  .diff-value.boolean { color: #569cd6; }
  .diff-value.null { color: #569cd6; font-style: italic; }
  .diff-value.object { color: var(--vscode-descriptionForeground, #8b8b8b); }
  .diff-value.array { color: var(--vscode-descriptionForeground, #8b8b8b); }
</style>
