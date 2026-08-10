<script lang="ts">
  import { computeJsonStats, type JsonStats } from '@nouto/core';
  import { explorerState } from '../stores/jsonExplorer.svelte';
  import Tooltip from '@nouto/ui/components/shared/Tooltip.svelte';

  const stats: JsonStats | null = $derived(
    explorerState().rawJson !== undefined ? computeJsonStats(explorerState().rawJson) : null
  );

  const extendedStats = $derived.by(() => {
    if (explorerState().rawJson === undefined) return null;
    return computeExtendedStats(explorerState().rawJson);
  });

  interface ExtendedStats {
    uniqueKeys: string[];
    arrayLengths: { min: number; max: number; avg: number; count: number };
    stringLengths: { min: number; max: number; avg: number; count: number };
    totalValues: number;
  }

  function computeExtendedStats(value: unknown): ExtendedStats {
    const keys = new Set<string>();
    const arrayLens: number[] = [];
    const stringLens: number[] = [];
    let totalValues = 0;

    function traverse(val: unknown): void {
      if (Array.isArray(val)) {
        arrayLens.push(val.length);
        for (const item of val) traverse(item);
      } else if (val !== null && typeof val === 'object') {
        for (const [key, child] of Object.entries(val as Record<string, unknown>)) {
          keys.add(key);
          traverse(child);
        }
      } else {
        totalValues++;
        if (typeof val === 'string') {
          stringLens.push(val.length);
        }
      }
    }

    traverse(value);

    return {
      uniqueKeys: [...keys].sort(),
      arrayLengths: arrayLens.length > 0
        ? {
            min: Math.min(...arrayLens),
            max: Math.max(...arrayLens),
            avg: Math.round(arrayLens.reduce((a, b) => a + b, 0) / arrayLens.length),
            count: arrayLens.length,
          }
        : { min: 0, max: 0, avg: 0, count: 0 },
      stringLengths: stringLens.length > 0
        ? {
            min: Math.min(...stringLens),
            max: Math.max(...stringLens),
            avg: Math.round(stringLens.reduce((a, b) => a + b, 0) / stringLens.length),
            count: stringLens.length,
          }
        : { min: 0, max: 0, avg: 0, count: 0 },
      totalValues,
    };
  }

  // Type distribution for bar chart
  const typeDistribution = $derived.by(() => {
    if (!stats) return [];
    const items = [
      { label: 'Strings', count: stats.types.strings, color: '#ce9178' },
      { label: 'Numbers', count: stats.types.numbers, color: '#b5cea8' },
      { label: 'Booleans', count: stats.types.booleans, color: '#569cd6' },
      { label: 'Nulls', count: stats.types.nulls, color: '#808080' },
      { label: 'Objects', count: stats.totalObjects, color: '#dcdcaa' },
      { label: 'Arrays', count: stats.totalArrays, color: '#c586c0' },
    ].filter(d => d.count > 0);
    const total = items.reduce((s, i) => s + i.count, 0);
    return items.map(i => ({ ...i, pct: total > 0 ? (i.count / total) * 100 : 0 }));
  });

  let showUniqueKeys = $state(false);
</script>

{#if stats && extendedStats}
  <div class="stats-panel">
    <div class="stats-header">
      <i class="codicon codicon-graph"></i>
      <span class="stats-title">Statistics</span>
    </div>

    <!-- Overview row -->
    <div class="stats-row">
      <Tooltip text="Total object keys">
        <span class="stat-item"><i class="codicon codicon-symbol-key"></i> {stats.totalKeys} keys</span>
      </Tooltip>
      <Tooltip text="Total objects">
        <span class="stat-item"><i class="codicon codicon-json"></i> {stats.totalObjects} obj</span>
      </Tooltip>
      <Tooltip text="Total arrays">
        <span class="stat-item"><i class="codicon codicon-symbol-array"></i> {stats.totalArrays} arr</span>
      </Tooltip>
      <Tooltip text="Maximum nesting depth">
        <span class="stat-item"><i class="codicon codicon-indent"></i> depth {stats.maxDepth}</span>
      </Tooltip>
      <Tooltip text="Total primitive values">
        <span class="stat-item"><i class="codicon codicon-symbol-numeric"></i> {extendedStats.totalValues} values</span>
      </Tooltip>
    </div>

    <!-- Type distribution bar -->
    <div class="type-bar-section">
      <span class="section-label">Type distribution</span>
      <div class="type-bar">
        {#each typeDistribution as item}
          <Tooltip text="{item.label}: {item.count} ({item.pct.toFixed(1)}%)">
            <div
              class="type-bar-segment"
              style="width: {item.pct}%; background: {item.color};"
            ></div>
          </Tooltip>
        {/each}
      </div>
      <div class="type-legend">
        {#each typeDistribution as item}
          <span class="legend-item">
            <span class="legend-dot" style="background: {item.color};"></span>
            {item.label} ({item.count})
          </span>
        {/each}
      </div>
    </div>

    <!-- Array/String stats -->
    {#if extendedStats.arrayLengths.count > 0}
      <div class="mini-stat-row">
        <span class="section-label">Array lengths</span>
        <span class="mini-stat">min: {extendedStats.arrayLengths.min}</span>
        <span class="mini-stat">max: {extendedStats.arrayLengths.max}</span>
        <span class="mini-stat">avg: {extendedStats.arrayLengths.avg}</span>
      </div>
    {/if}
    {#if extendedStats.stringLengths.count > 0}
      <div class="mini-stat-row">
        <span class="section-label">String lengths</span>
        <span class="mini-stat">min: {extendedStats.stringLengths.min}</span>
        <span class="mini-stat">max: {extendedStats.stringLengths.max}</span>
        <span class="mini-stat">avg: {extendedStats.stringLengths.avg}</span>
      </div>
    {/if}

    <!-- Unique keys -->
    {#if extendedStats.uniqueKeys.length > 0}
      <div class="unique-keys-section">
        <button class="section-toggle" onclick={() => { showUniqueKeys = !showUniqueKeys; }}>
          <i class="codicon {showUniqueKeys ? 'codicon-chevron-down' : 'codicon-chevron-right'}"></i>
          <span class="section-label">Unique keys ({extendedStats.uniqueKeys.length})</span>
        </button>
        {#if showUniqueKeys}
          <div class="unique-keys-list">
            {#each extendedStats.uniqueKeys as key}
              <span class="key-tag">{key}</span>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .stats-panel {
    border-bottom: 1px solid var(--hf-panel-border);
    padding: 8px 12px;
    flex-shrink: 0;
    max-height: 280px;
    overflow-y: auto;
  }

  .stats-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--hf-descriptionForeground);
  }

  .stats-row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 8px;
  }

  .stat-item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--hf-editor-foreground);
  }

  .stat-item .codicon {
    font-size: 12px;
    color: var(--hf-icon-foreground);
  }

  .type-bar-section {
    margin-bottom: 8px;
  }

  .section-label {
    font-size: 10px;
    color: var(--hf-descriptionForeground);
    text-transform: uppercase;
    font-weight: 500;
  }

  .type-bar {
    display: flex;
    height: 6px;
    border-radius: 3px;
    overflow: hidden;
    margin: 4px 0;
    background: var(--hf-editor-background);
  }

  .type-bar-segment {
    min-width: 2px;
    transition: width 0.2s;
  }

  .type-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    color: var(--hf-descriptionForeground);
  }

  .legend-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .mini-stat-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 4px;
  }

  .mini-stat {
    font-size: 11px;
    color: var(--hf-editor-foreground);
    font-family: var(--hf-editor-font-family);
  }

  .unique-keys-section {
    margin-top: 4px;
  }

  .section-toggle {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: none;
    color: var(--hf-descriptionForeground);
    cursor: pointer;
    padding: 2px 0;
    font-size: 10px;
  }

  .section-toggle:hover {
    color: var(--hf-editor-foreground);
  }

  .unique-keys-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 4px 0;
  }

  .key-tag {
    padding: 1px 6px;
    background: var(--hf-badge-background);
    color: var(--hf-badge-foreground);
    border-radius: 3px;
    font-size: 10px;
    font-family: var(--hf-editor-font-family);
  }
</style>
