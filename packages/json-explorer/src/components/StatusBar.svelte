<script lang="ts">
  import { selectedPath, flatNodes, totalNodeCount, multiSelectCount } from '../stores/jsonExplorer.svelte';

  const selectedNode = $derived(
    selectedPath() ? flatNodes().find(n => n.path === selectedPath()) : null
  );

  const typeLabel = $derived.by(() => {
    if (!selectedNode) return '';
    switch (selectedNode.type) {
      case 'object': return `Object (${selectedNode.childCount} keys)`;
      case 'array': return `Array (${selectedNode.childCount} items)`;
      case 'string': return 'String';
      case 'number': return 'Number';
      case 'boolean': return 'Boolean';
      case 'null': return 'Null';
      default: return '';
    }
  });
</script>

<div class="status-bar">
  <span class="status-item">{totalNodeCount()} nodes</span>
  {#if multiSelectCount() > 1}
    <span class="status-separator">|</span>
    <span class="status-item selection-count">
      <i class="codicon codicon-check-all"></i>
      {multiSelectCount()} selected
    </span>
  {/if}
  {#if selectedPath()}
    <span class="status-separator">|</span>
    <span class="status-item path">{selectedPath()}</span>
    {#if typeLabel}
      <span class="status-separator">|</span>
      <span class="status-item type">{typeLabel}</span>
    {/if}
  {/if}
</div>

<style>
  .status-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 12px;
    border-top: 1px solid var(--hf-panel-border);
    background: var(--hf-statusBar-background);
    color: var(--hf-statusBar-foreground);
    font-size: 11px;
    flex-shrink: 0;
    min-height: 22px;
    overflow: hidden;
  }

  .status-item {
    white-space: nowrap;
  }

  .status-item.path {
    font-family: var(--hf-editor-font-family);
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .status-item.type {
    opacity: 0.8;
  }

  .status-separator {
    opacity: 0.4;
  }

  .status-item.selection-count {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

  .selection-count .codicon {
    font-size: 0.923rem;
  }
</style>
