<script lang="ts">
  import JsonTreeNode from './JsonTreeNode.svelte';

  interface Props {
    nodeKey: string | number | null;
    value: any;
    depth: number;
  }
  let { nodeKey, value, depth }: Props = $props();

  const initialExpanded = $derived(depth < 2);
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

  function toggle() {
    expanded = !expanded;
  }

  export function expandAll() {
    expanded = true;
  }

  export function collapseAll() {
    if (depth > 0) expanded = false;
  }
</script>

<div class="tree-node" style="padding-left: {depth * 16}px">
  {#if isExpandable}
    <span class="toggle" onclick={toggle} role="button" tabindex={0} onkeydown={(e) => { if (e.key === 'Enter') toggle(); }}>
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
  {:else}
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
  {/if}
</div>

{#if isExpandable && expanded}
  {#each childEntries as [childKey, childValue]}
    <JsonTreeNode nodeKey={childKey} value={childValue} depth={depth + 1} />
  {/each}
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
    font-family: var(--vscode-editor-font-family, Consolas, Monaco, monospace);
    font-size: 12px;
    line-height: 1.6;
    white-space: nowrap;
  }

  .tree-node:hover {
    background: var(--vscode-list-hoverBackground, rgba(128, 128, 128, 0.08));
  }

  .toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    cursor: pointer;
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
    border-color: var(--vscode-editorLineNumber-foreground, #6e7681);
    transform: rotate(-45deg);
    transition: transform 0.1s;
  }

  .chevron.open {
    transform: rotate(45deg);
  }

  .key {
    color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe);
  }

  .punctuation {
    color: var(--vscode-editor-foreground, #d4d4d4);
  }

  .value.string {
    color: var(--vscode-debugTokenExpression-string, #ce9178);
  }

  .value.number {
    color: var(--vscode-debugTokenExpression-number, #b5cea8);
  }

  .value.boolean {
    color: var(--vscode-debugTokenExpression-boolean, #569cd6);
  }

  .value.null {
    color: var(--vscode-debugTokenExpression-boolean, #569cd6);
  }

  .collapsed-badge {
    padding: 0 6px;
    background: var(--vscode-badge-background, #4d4d4d);
    color: var(--vscode-badge-foreground, #fff);
    border-radius: 4px;
    font-size: 10px;
    font-style: italic;
    margin: 0 2px;
  }
</style>
