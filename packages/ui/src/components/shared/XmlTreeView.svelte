<script lang="ts">
  import { parseXml } from '../../lib/xml-parser';
  import XmlTreeNode from './XmlTreeNode.svelte';
  import Tooltip from './Tooltip.svelte';

  interface Props {
    data: string;
  }
  let { data }: Props = $props();

  let collapseKey = $state(0);

  const parsed = $derived(parseXml(data));

  function expandAll() {
    collapseKey++;
  }

  function collapseAll() {
    collapseKey++;
  }
</script>

<div class="xml-tree-view">
  <div class="tree-toolbar">
    <Tooltip text="Expand All" position="top">
      <button class="tree-btn" onclick={expandAll} aria-label="Expand All">
        <i class="codicon codicon-unfold"></i> Expand All
      </button>
    </Tooltip>
    <Tooltip text="Collapse All" position="top">
      <button class="tree-btn" onclick={collapseAll} aria-label="Collapse All">
        <i class="codicon codicon-fold"></i> Collapse All
      </button>
    </Tooltip>
  </div>
  <div class="tree-content">
    {#if parsed}
      {#key collapseKey}
        <XmlTreeNode node={parsed} depth={0} />
      {/key}
    {:else}
      <p class="parse-error">Unable to parse XML. The content may not be valid XML.</p>
    {/if}
  </div>
</div>

<style>
  .xml-tree-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .tree-toolbar {
    display: flex;
    gap: 0.462rem;
    padding: 0.308rem 0;
    flex-shrink: 0;
  }

  .tree-btn {
    display: flex;
    align-items: center;
    gap: 0.308rem;
    padding: 0.231rem 0.615rem;
    background: transparent;
    color: var(--hf-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 0.308rem;
    cursor: pointer;
    font-size: 0.846rem;
  }

  .tree-btn:hover {
    background: var(--hf-list-hoverBackground);
  }

  .tree-content {
    flex: 1;
    overflow: auto;
    min-height: 0;
  }

  .parse-error {
    color: var(--hf-errorForeground, #f44336);
    font-size: 0.923rem;
    padding: 0.615rem;
    margin: 0;
  }
</style>
