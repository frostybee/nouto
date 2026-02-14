<script lang="ts">
  import JsonTreeNode from './JsonTreeNode.svelte';

  interface Props {
    nodeKey: string | number | null;
    value: any;
    depth: number;
    expandMode?: 'default' | 'expand' | 'collapse';
  }
  let { nodeKey, value, depth, expandMode = 'default' }: Props = $props();

  const initialExpanded = $derived(
    expandMode === 'expand' ? true :
    expandMode === 'collapse' ? depth < 1 :
    depth < 1
  );
  let expanded = $state(true);
  $effect(() => { expanded = initialExpanded; });

  const valueType = $derived.by(() => {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  });

  const isExpandable = $derived(valueType === 'object' || valueType === 'array');
  const childEntries = $derived.by(() => {
    if (valueType === 'array') return (value as any[]).map((v, i) => [i, v] as [number, any]);
    if (valueType === 'object') return Object.entries(value) as [string, any][];
    return [];
  });
  const childCount = $derived(childEntries.length);
  const bracket = $derived(valueType === 'array' ? ['[', ']'] : ['{', '}']);

  const PAGE_SIZE = 100;
  let visibleCount = $state(PAGE_SIZE);

  const visibleChildren = $derived(
    childEntries.length > visibleCount
      ? childEntries.slice(0, visibleCount)
      : childEntries
  );
  const hasMore = $derived(childEntries.length > visibleCount);
  const remaining = $derived(childEntries.length - visibleCount);

  function showMore() {
    visibleCount += PAGE_SIZE;
  }

  function toggle() {
    expanded = !expanded;
  }

</script>

{#if isExpandable}
  <div class="tree-node expandable" style="padding-left: {depth * 16}px" onclick={toggle} role="button" tabindex={0} onkeydown={(e) => { if (e.key === 'Enter') toggle(); }}>
    <span class="toggle">
      <span class="chevron" class:open={expanded}></span>
    </span>
    {#if nodeKey !== null}
      <span class="key">"{nodeKey}"</span><span class="punctuation">: </span>
    {/if}
    <span class="punctuation">{bracket[0]}</span>
    {#if !expanded}
      <span class="collapsed-badge">{childCount} {valueType === 'array' ? (childCount === 1 ? 'item' : 'items') : (childCount === 1 ? 'key' : 'keys')}</span>
      <span class="punctuation">{bracket[1]}</span>
    {/if}
  </div>
{:else}
  <div class="tree-node" style="padding-left: {depth * 16}px">
    <span class="leaf-indent"></span>
    {#if nodeKey !== null}
      <span class="key">"{nodeKey}"</span><span class="punctuation">: </span>
    {/if}
    {#if valueType === 'string'}
      <span class="value string">"{value}"</span>
    {:else if valueType === 'number'}
      <span class="value number">{value}</span>
    {:else if valueType === 'boolean'}
      <span class="value boolean">{String(value)}</span>
    {:else if valueType === 'null'}
      <span class="value null">null</span>
    {:else}
      <span class="value">{String(value)}</span>
    {/if}
  </div>
{/if}

{#if isExpandable && expanded}
  {#each visibleChildren as [childKey, childValue]}
    <JsonTreeNode nodeKey={childKey} value={childValue} depth={depth + 1} {expandMode} />
  {/each}
  {#if hasMore}
    <div class="tree-node" style="padding-left: {(depth + 1) * 16}px">
      <button class="show-more-btn" onclick={(e) => { e.stopPropagation(); showMore(); }}>
        Show {remaining > PAGE_SIZE ? PAGE_SIZE : remaining} more ({remaining} remaining)
      </button>
    </div>
  {/if}
  <div class="tree-node" style="padding-left: {depth * 16}px">
    <span class="leaf-indent"></span>
    <span class="punctuation">{bracket[1]}</span>
  </div>
{/if}

<style>
  .tree-node {
    display: flex;
    align-items: center;
    gap: 2px;
    padding-top: 1px;
    padding-bottom: 1px;
    font-family: var(--hf-editor-font-family, Consolas, Monaco, monospace);
    font-size: 12px;
    line-height: 1.6;
    white-space: nowrap;
  }

  .tree-node:hover {
    background: var(--hf-list-hoverBackground, rgba(128, 128, 128, 0.08));
  }

  .tree-node.expandable {
    cursor: pointer;
  }

  .toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  .leaf-indent {
    display: inline-block;
    width: 16px;
    flex-shrink: 0;
  }

  .chevron {
    display: inline-block;
    width: 5px;
    height: 5px;
    border-style: solid;
    border-width: 0 1.5px 1.5px 0;
    border-color: var(--hf-editorLineNumber-foreground, #6e7681);
    transform: rotate(-45deg);
    transition: transform 0.1s;
  }

  .chevron.open {
    transform: rotate(45deg);
  }

  .key {
    color: var(--hf-symbolIcon-propertyForeground, #9cdcfe);
  }

  .punctuation {
    color: var(--hf-editor-foreground, #d4d4d4);
  }

  .value.string {
    color: var(--hf-debugTokenExpression-string, #ce9178);
  }

  .value.number {
    color: var(--hf-debugTokenExpression-number, #b5cea8);
  }

  .value.boolean {
    color: var(--hf-debugTokenExpression-boolean, #569cd6);
  }

  .value.null {
    color: var(--hf-debugTokenExpression-boolean, #569cd6);
  }

  .collapsed-badge {
    padding: 0 6px;
    background: var(--hf-badge-background, #4d4d4d);
    color: var(--hf-badge-foreground, #fff);
    border-radius: 4px;
    font-size: 10px;
    font-style: italic;
    margin: 0 2px;
  }

  .show-more-btn {
    padding: 2px 8px;
    background: var(--hf-button-secondaryBackground, #3a3d41);
    color: var(--hf-button-secondaryForeground, #d4d4d4);
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
    font-style: italic;
  }

  .show-more-btn:hover {
    background: var(--hf-button-secondaryHoverBackground, #45494e);
  }
</style>
