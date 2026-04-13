<script lang="ts">
  let { distribution }: { distribution: { bucket: string; count: number }[] } = $props();

  const maxCount = $derived(Math.max(...distribution.map(d => d.count), 1));
</script>

<div class="distribution-section">
  <h3>Response Time Distribution</h3>
  <div class="chart">
    {#each distribution as bucket}
      <div class="bar-row">
        <span class="bucket-label">{bucket.bucket}</span>
        <div class="bar-container">
          <div
            class="bar"
            style="width: {(bucket.count / maxCount) * 100}%"
          ></div>
        </div>
        <span class="bar-count">{bucket.count}</span>
      </div>
    {/each}
  </div>
</div>

<style>
  .distribution-section {
    margin-bottom: 28px;
  }

  h3 {
    font-size: 15px;
    font-weight: 600;
    margin: 0 0 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .chart {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .bar-row {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 28px;
  }

  .bar-row:hover .bar {
    filter: brightness(1.2);
  }

  .bucket-label {
    font-size: 12px;
    color: var(--hf-descriptionForeground);
    min-width: 100px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .bar-container {
    flex: 1;
    height: 20px;
    background: var(--hf-editor-background);
    border-radius: 3px;
    overflow: hidden;
  }

  .bar {
    height: 100%;
    background: var(--hf-charts-blue, var(--hf-focusBorder, var(--hf-button-background)));
    border-radius: 3px;
    min-width: 2px;
    transition: width 0.3s ease, filter 0.15s;
  }

  .bar-count {
    font-size: 12px;
    min-width: 30px;
    font-variant-numeric: tabular-nums;
    color: var(--hf-descriptionForeground);
  }
</style>
