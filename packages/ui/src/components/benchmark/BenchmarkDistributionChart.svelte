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
    margin-bottom: 2.154rem;
  }

  h3 {
    font-size: 1.154rem;
    font-weight: 600;
    margin: 0 0 0.923rem;
    padding-bottom: 0.615rem;
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .chart {
    display: flex;
    flex-direction: column;
    gap: 0.462rem;
  }

  .bar-row {
    display: flex;
    align-items: center;
    gap: 0.615rem;
    height: 2.154rem;
  }

  .bar-row:hover .bar {
    filter: brightness(1.2);
  }

  .bucket-label {
    font-size: 0.923rem;
    color: var(--hf-descriptionForeground);
    min-width: 7.692rem;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .bar-container {
    flex: 1;
    height: 1.538rem;
    background: var(--hf-editor-background);
    border-radius: 0.231rem;
    overflow: hidden;
  }

  .bar {
    height: 100%;
    background: var(--hf-charts-blue, var(--hf-focusBorder, var(--hf-button-background)));
    border-radius: 0.231rem;
    min-width: 2px;
    transition: width 0.3s ease, filter 0.15s;
  }

  .bar-count {
    font-size: 0.923rem;
    min-width: 2.308rem;
    font-variant-numeric: tabular-nums;
    color: var(--hf-descriptionForeground);
  }
</style>
