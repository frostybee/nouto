<script lang="ts">
  import type { JsonStats } from '../../lib/json';

  interface Props {
    stats: JsonStats;
  }
  let { stats }: Props = $props();

  const totalValues = $derived(
    stats.types.strings + stats.types.numbers + stats.types.booleans + stats.types.nulls
  );
</script>

<div class="stats-bar">
  <span class="stat" title="Total object keys">
    <i class="codicon codicon-symbol-key"></i> {stats.totalKeys} keys
  </span>
  <span class="stat" title="Objects">
    <i class="codicon codicon-symbol-object"></i> {stats.totalObjects}
  </span>
  <span class="stat" title="Arrays">
    <i class="codicon codicon-symbol-array"></i> {stats.totalArrays}
  </span>
  <span class="stat" title="Max nesting depth">
    <i class="codicon codicon-indent"></i> Depth {stats.maxDepth}
  </span>
  <span class="separator"></span>
  <span class="stat type-string" title="Strings">{stats.types.strings} str</span>
  <span class="stat type-number" title="Numbers">{stats.types.numbers} num</span>
  <span class="stat type-boolean" title="Booleans">{stats.types.booleans} bool</span>
  <span class="stat type-null" title="Nulls">{stats.types.nulls} null</span>
  <span class="stat total" title="Total leaf values">{totalValues} values</span>
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
