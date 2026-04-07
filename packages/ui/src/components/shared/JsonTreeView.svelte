<script lang="ts">
  import JsonTreeNode from './JsonTreeNode.svelte';

  interface Props {
    data: any;
    expandMode?: 'default' | 'expand' | 'collapse';
    expandKey?: number;
  }
  let { data, expandMode = 'default', expandKey = 0 }: Props = $props();

  // Data is expected pre-parsed from ResponseViewer; fallback parse for safety
  const parsed = $derived(typeof data === 'string' ? (() => { try { return JSON.parse(data); } catch { return data; } })() : data);
</script>

<div class="tree-view">
  <div class="tree-content">
    {#key expandKey}
      <JsonTreeNode
        nodeKey={null}
        value={parsed}
        depth={0}
        {expandMode}
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

  .tree-content {
    flex: 1;
    overflow: auto;
    padding: 4px 8px;
  }
</style>
