<script lang="ts">
  import JsonTreeNode from './JsonTreeNode.svelte';

  interface Props {
    data: any;
  }
  let { data }: Props = $props();

  // Data is expected pre-parsed from ResponseViewer; fallback parse for safety
  const parsed = $derived(typeof data === 'string' ? (() => { try { return JSON.parse(data); } catch { return data; } })() : data);

  let expandAllFlag = $state(0);
  let collapseAllFlag = $state(0);

  function handleExpandAll() {
    expandAllFlag++;
  }

  function handleCollapseAll() {
    collapseAllFlag++;
  }
</script>

<div class="tree-view">
  <div class="tree-toolbar">
    <button class="tree-btn" onclick={handleExpandAll}>Expand All</button>
    <button class="tree-btn" onclick={handleCollapseAll}>Collapse All</button>
  </div>
  <div class="tree-content">
    {#key `${expandAllFlag}-${collapseAllFlag}`}
      <JsonTreeNode
        nodeKey={null}
        value={parsed}
        depth={0}
      />
    {/key}
  </div>
</div>

<style>
  .tree-view {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .tree-toolbar {
    display: flex;
    gap: 6px;
    padding: 4px 8px;
    border-bottom: 1px solid var(--vscode-panel-border);
    flex-shrink: 0;
  }

  .tree-btn {
    padding: 2px 8px;
    background: var(--vscode-button-secondaryBackground, #3a3d41);
    color: var(--vscode-button-secondaryForeground, #d4d4d4);
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
  }

  .tree-btn:hover {
    background: var(--vscode-button-secondaryHoverBackground, #45494e);
  }

  .tree-content {
    flex: 1;
    overflow: auto;
    padding: 4px 8px;
  }
</style>
