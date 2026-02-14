<script lang="ts">
  import type { XmlNode } from '../../lib/xml-parser';
  import XmlTreeNode from './XmlTreeNode.svelte';

  interface Props {
    node: XmlNode;
    depth?: number;
  }
  let { node, depth = 0 }: Props = $props();

  // svelte-ignore state_referenced_locally -- depth is constant per node instance
  let expanded = $state(depth < 3);

  const hasChildren = $derived(node.children && node.children.length > 0);
  const isTextOnly = $derived(
    node.children && node.children.length === 1 && node.children[0].type === 'text'
  );
  const textContent = $derived(isTextOnly ? node.children![0].value : null);
</script>

{#if node.type === 'element'}
  <div class="xml-node" style="padding-left: {depth * 16}px">
    {#if hasChildren && !isTextOnly}
      <button class="toggle-btn" onclick={() => { expanded = !expanded; }} aria-label={expanded ? 'Collapse' : 'Expand'}>
        <i class="codicon {expanded ? 'codicon-chevron-down' : 'codicon-chevron-right'}"></i>
      </button>
    {:else}
      <span class="toggle-spacer"></span>
    {/if}
    <span class="tag-bracket">&lt;</span><span class="tag-name">{node.name}</span>{#if node.attributes}{#each Object.entries(node.attributes) as [key, value]}{' '}<span class="attr-name">{key}</span><span class="attr-eq">=</span><span class="attr-value">"{value}"</span>{/each}{/if}<span class="tag-bracket">&gt;</span>
    {#if isTextOnly}
      <span class="text-content">{textContent}</span>
      <span class="tag-bracket">&lt;/</span><span class="tag-name">{node.name}</span><span class="tag-bracket">&gt;</span>
    {/if}
  </div>
  {#if hasChildren && !isTextOnly && expanded}
    {#each node.children! as child}
      <XmlTreeNode node={child} depth={depth + 1} />
    {/each}
    <div class="xml-node closing" style="padding-left: {depth * 16}px">
      <span class="toggle-spacer"></span>
      <span class="tag-bracket">&lt;/</span><span class="tag-name">{node.name}</span><span class="tag-bracket">&gt;</span>
    </div>
  {/if}
{:else if node.type === 'text'}
  <div class="xml-node text" style="padding-left: {depth * 16}px">
    <span class="toggle-spacer"></span>
    <span class="text-content">{node.value}</span>
  </div>
{:else if node.type === 'comment'}
  <div class="xml-node comment" style="padding-left: {depth * 16}px">
    <span class="toggle-spacer"></span>
    <span class="comment-text">&lt;!-- {node.value} --&gt;</span>
  </div>
{:else if node.type === 'cdata'}
  <div class="xml-node cdata" style="padding-left: {depth * 16}px">
    <span class="toggle-spacer"></span>
    <span class="cdata-text">&lt;![CDATA[{node.value}]]&gt;</span>
  </div>
{/if}

<style>
  .xml-node {
    display: flex;
    align-items: baseline;
    gap: 0;
    padding-top: 1px;
    padding-bottom: 1px;
    font-family: var(--vscode-editor-font-family), monospace;
    font-size: 13px;
    line-height: 1.5;
    white-space: nowrap;
  }

  .xml-node:hover {
    background: var(--vscode-list-hoverBackground);
  }

  .toggle-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    margin: 0;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--vscode-foreground);
    flex-shrink: 0;
  }

  .toggle-spacer {
    display: inline-block;
    width: 16px;
    flex-shrink: 0;
  }

  .tag-bracket {
    color: var(--vscode-descriptionForeground);
  }

  .tag-name {
    color: var(--vscode-symbolIcon-classForeground, #4ec9b0);
  }

  .attr-name {
    color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe);
  }

  .attr-eq {
    color: var(--vscode-foreground);
  }

  .attr-value {
    color: var(--vscode-symbolIcon-stringForeground, #ce9178);
  }

  .text-content {
    color: var(--vscode-foreground);
    margin-left: 2px;
  }

  .comment-text {
    color: var(--vscode-descriptionForeground);
    font-style: italic;
  }

  .cdata-text {
    color: var(--vscode-symbolIcon-stringForeground, #ce9178);
  }
</style>
