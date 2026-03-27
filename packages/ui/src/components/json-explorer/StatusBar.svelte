<script lang="ts">
  import { selectedPath, flatNodes, totalNodeCount } from '../../stores/jsonExplorer.svelte';

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
    border-top: 1px solid var(--vscode-panel-border, #2b2b2b);
    background: var(--vscode-statusBar-background, #007acc);
    color: var(--vscode-statusBar-foreground, #fff);
    font-size: 11px;
    flex-shrink: 0;
    min-height: 22px;
    overflow: hidden;
  }

  .status-item {
    white-space: nowrap;
  }

  .status-item.path {
    font-family: var(--vscode-editor-font-family, Consolas, Monaco, monospace);
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .status-item.type {
    opacity: 0.8;
  }

  .status-separator {
    opacity: 0.4;
  }
</style>
