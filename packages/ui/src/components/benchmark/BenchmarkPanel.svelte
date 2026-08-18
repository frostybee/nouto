<script lang="ts">
  import { benchmarkState, setRunning, updateConfig, resetBenchmark } from '../../stores/benchmark.svelte';
  import BenchmarkConfigForm from './BenchmarkConfigForm.svelte';
  import BenchmarkStatisticsTable from './BenchmarkStatisticsTable.svelte';
  import BenchmarkDistributionChart from './BenchmarkDistributionChart.svelte';
  import BenchmarkIterationTable from './BenchmarkIterationTable.svelte';
  import EnvironmentSelector from '../shared/EnvironmentSelector.svelte';
  import { postMessage as defaultPostMessage } from '../../lib/vscode';

  let { postMessage = defaultPostMessage }: { postMessage?: (message: any) => void } = $props();

  const bench = $derived(benchmarkState);

  function handleStart() {
    setRunning();
    postMessage({
      type: 'startBenchmark',
      data: { config: $state.snapshot(bench.config) },
    });
  }

  function handleCancel() {
    postMessage({ type: 'cancelBenchmark' });
  }

  function handleExport(format: string) {
    postMessage({
      type: 'exportBenchmarkResults',
      data: { format },
    });
  }

  function handleReset() {
    resetBenchmark();
  }

  const progressPercent = $derived(
    bench.progress.total > 0 ? Math.round((bench.progress.current / bench.progress.total) * 100) : 0
  );
</script>

<div class="benchmark-panel">
  <div class="panel-toolbar">
    <div class="toolbar-left"></div>
    <div class="toolbar-right">
      <span class="toolbar-label">Environment</span>
      <EnvironmentSelector />
    </div>
  </div>
  <div class="panel-content">
    <div class="header">
      <h2>Performance Benchmark</h2>
      {#if bench.requestName}
        <div class="request-info">
          <span class="method method-{bench.requestMethod.toLowerCase()}">{bench.requestMethod}</span>
          <span class="url">{bench.requestUrl}</span>
        </div>
      {/if}
    </div>

    {#if bench.status === 'idle'}
      <BenchmarkConfigForm
        config={bench.config}
        onUpdate={(updates) => updateConfig(updates)}
        onStart={handleStart}
      />
    {:else if bench.status === 'running'}
      <div class="progress-section">
        <div class="progress-header">
          <span>Running... {bench.progress.current} / {bench.progress.total} ({progressPercent}%)</span>
          <button class="cancel-btn" onclick={handleCancel}>Cancel</button>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: {progressPercent}%"></div>
        </div>
      </div>
      {#if bench.iterations.length > 0}
        <BenchmarkIterationTable iterations={bench.iterations} />
      {/if}
    {:else if bench.status === 'completed' || bench.status === 'cancelled'}
      <div class="results-actions">
        <button class="action-btn" onclick={handleReset}>New Benchmark</button>
        <button class="action-btn" onclick={() => handleExport('json')}>Export JSON</button>
        <button class="action-btn" onclick={() => handleExport('csv')}>Export CSV</button>
        {#if bench.status === 'cancelled'}
          <span class="cancelled-badge">Cancelled</span>
        {/if}
      </div>
      {#if bench.statistics}
        <BenchmarkStatisticsTable statistics={bench.statistics} />
      {/if}
      {#if bench.distribution.length > 0}
        <BenchmarkDistributionChart distribution={bench.distribution} />
      {/if}
      <BenchmarkIterationTable iterations={bench.iterations} />
    {/if}
  </div>
</div>

<style>
  .benchmark-panel {
    padding: 0;
    color: var(--hf-foreground);
    font-family: var(--hf-font-family);
    max-width: 900px;
  }

  .panel-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.308rem 1.231rem;
    background: var(--hf-editor-background);
    border-bottom: 1px solid var(--hf-panel-border);
    min-height: 2.462rem;
    gap: 0.615rem;
  }

  .toolbar-left,
  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 0.308rem;
  }

  .toolbar-label {
    font-size: 0.769rem;
    color: var(--hf-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    white-space: nowrap;
    user-select: none;
  }

  .panel-content {
    padding: 1.231rem;
  }

  .header h2 {
    margin: 0 0 0.615rem;
    font-size: 1.231rem;
    font-weight: 600;
  }

  .request-info {
    display: flex;
    align-items: center;
    gap: 0.615rem;
    margin-bottom: 1.231rem;
    font-size: 1rem;
  }

  .method {
    font-weight: 700;
    padding: 0.154rem 0.462rem;
    border-radius: 0.231rem;
    font-size: 0.846rem;
    background: var(--hf-badge-background);
    color: var(--hf-badge-foreground);
  }

  .method-get { color: #61affe; }
  .method-post { color: #49cc90; }
  .method-put { color: #fca130; }
  .method-delete { color: #f93e3e; }
  .method-patch { color: #50e3c2; }

  .url {
    color: var(--hf-descriptionForeground);
    word-break: break-all;
  }

  .progress-section {
    margin-bottom: 1.231rem;
  }

  .progress-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.615rem;
    font-size: 1rem;
  }

  .progress-bar {
    height: 0.462rem;
    background: var(--hf-progressBar-background);
    border-radius: 0.154rem;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--hf-focusBorder, var(--hf-button-background));
    transition: width 0.2s;
  }

  .cancel-btn {
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: none;
    padding: 0.308rem 0.923rem;
    border-radius: 0.154rem;
    cursor: pointer;
    font-size: 0.923rem;
  }

  .cancel-btn:hover {
    background: var(--hf-button-secondaryHoverBackground);
  }

  .results-actions {
    display: flex;
    gap: 0.615rem;
    align-items: center;
    margin-bottom: 1.231rem;
  }

  .action-btn {
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
    border: none;
    padding: 0.538rem 1.231rem;
    border-radius: 0.308rem;
    cursor: pointer;
    font-size: 0.923rem;
    transition: background 0.15s;
  }

  .action-btn:hover {
    background: var(--hf-button-hoverBackground);
  }

  .cancelled-badge {
    font-size: 0.923rem;
    color: var(--hf-errorForeground);
    font-weight: 600;
  }
</style>
