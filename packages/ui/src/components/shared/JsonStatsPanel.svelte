<script lang="ts">
  import type { JsonStats } from '@nouto/core';
  import Tooltip from './Tooltip.svelte';

  interface Props {
    stats: JsonStats;
  }
  let { stats }: Props = $props();

  const totalValues = $derived(
    stats.types.strings + stats.types.numbers + stats.types.booleans + stats.types.nulls
  );
</script>

<div class="stats-bar">
  <Tooltip text="Total object keys" position="top"><span class="stat">
    <i class="codicon codicon-symbol-key"></i> {stats.totalKeys} keys
  </span></Tooltip>
  <Tooltip text="Objects" position="top"><span class="stat">
    <i class="codicon codicon-symbol-object"></i> {stats.totalObjects}
  </span></Tooltip>
  <Tooltip text="Arrays" position="top"><span class="stat">
    <i class="codicon codicon-symbol-array"></i> {stats.totalArrays}
  </span></Tooltip>
  <Tooltip text="Max nesting depth" position="top"><span class="stat">
    <i class="codicon codicon-indent"></i> Depth {stats.maxDepth}
  </span></Tooltip>
  <span class="separator"></span>
  <Tooltip text="Strings" position="top"><span class="stat type-string">{stats.types.strings} str</span></Tooltip>
  <Tooltip text="Numbers" position="top"><span class="stat type-number">{stats.types.numbers} num</span></Tooltip>
  <Tooltip text="Booleans" position="top"><span class="stat type-boolean">{stats.types.booleans} bool</span></Tooltip>
  <Tooltip text="Nulls" position="top"><span class="stat type-null">{stats.types.nulls} null</span></Tooltip>
  <Tooltip text="Total leaf values" position="top"><span class="stat total">{totalValues} values</span></Tooltip>
</div>

<style>
  .stats-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 4px 8px;
    border-top: 1px solid var(--hf-panel-border);
    background: var(--hf-editor-background);
    font-size: 11px;
    color: var(--hf-descriptionForeground, #999);
    flex-wrap: wrap;
  }

  .stat {
    display: flex;
    align-items: center;
    gap: 3px;
    white-space: nowrap;
  }

  .stat .codicon {
    font-size: 12px;
    opacity: 0.7;
  }

  .separator {
    width: 1px;
    height: 12px;
    background: var(--hf-panel-border);
    flex-shrink: 0;
  }

  .type-string { color: var(--hf-debugTokenExpression-string, #ce9178); }
  .type-number { color: var(--hf-debugTokenExpression-number, #b5cea8); }
  .type-boolean { color: var(--hf-debugTokenExpression-boolean, #569cd6); }
  .type-null { color: var(--hf-debugTokenExpression-value, #808080); }

  .total {
    margin-left: auto;
    opacity: 0.7;
  }
</style>
