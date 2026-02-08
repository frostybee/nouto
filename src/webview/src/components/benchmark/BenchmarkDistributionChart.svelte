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
    margin-bottom: 16px;
  }

  h3 {
    font-size: 14px;
    font-weight: 600;
    margin: 0 0 10px;
  }

  .chart {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .bar-row {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 22px;
  }

  .bucket-label {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    min-width: 100px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .bar-container {
    flex: 1;
    height: 16px;
    background: var(--vscode-editor-background);
    border-radius: 2px;
    overflow: hidden;
  }

  .bar {
    height: 100%;
    background: var(--vscode-charts-blue, var(--vscode-progressBar-background));
    border-radius: 2px;
    min-width: 2px;
    transition: width 0.3s ease;
  }

  .bar-count {
    font-size: 11px;
    min-width: 30px;
    font-variant-numeric: tabular-nums;
    color: var(--vscode-descriptionForeground);
  }
</style>
