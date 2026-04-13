<script lang="ts">
  import { benchmarkState, setRunning, updateConfig, resetBenchmark } from '../../stores/benchmark.svelte';
  import BenchmarkConfigForm from './BenchmarkConfigForm.svelte';
  import BenchmarkStatisticsTable from './BenchmarkStatisticsTable.svelte';
  import BenchmarkDistributionChart from './BenchmarkDistributionChart.svelte';
  import BenchmarkIterationTable from './BenchmarkIterationTable.svelte';
  import EnvironmentSelector from '../shared/EnvironmentSelector.svelte';
  import { postMessage as defaultPostMessage } from '../../lib/vscode';

  let { postMessage = defaultPostMessage }: { postMessage?: (message: any) => void } = $props();

  const state = $derived(benchmarkState);

  function handleStart() {
    setRunning();
    postMessage({
      type: 'startBenchmark',
      data: { config: $state.snapshot(state.config) },
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
    state.progress.total > 0 ? Math.round((state.progress.current / state.progress.total) * 100) : 0
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
      {#if state.requestName}
        <div class="request-info">
          <span class="method method-{state.requestMethod.toLowerCase()}">{state.requestMethod}</span>
          <span class="url">{state.requestUrl}</span>
        </div>
      {/if}
    </div>

    {#if state.status === 'idle'}
      <BenchmarkConfigForm
        config={state.config}
        onUpdate={(updates) => updateConfig(updates)}
        onStart={handleStart}
      />
    {:else if state.status === 'running'}
      <div class="progress-section">
        <div class="progress-header">
          <span>Running... {state.progress.current} / {state.progress.total} ({progressPercent}%)</span>
          <button class="cancel-btn" onclick={handleCancel}>Cancel</button>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: {progressPercent}%"></div>
        </div>
      </div>
      {#if state.iterations.length > 0}
        <BenchmarkIterationTable iterations={state.iterations} />
      {/if}
    {:else if state.status === 'completed' || state.status === 'cancelled'}
      <div class="results-actions">
        <button class="action-btn" onclick={handleReset}>New Benchmark</button>
        <button class="action-btn" onclick={() => handleExport('json')}>Export JSON</button>
        <button class="action-btn" onclick={() => handleExport('csv')}>Export CSV</button>
        {#if state.status === 'cancelled'}
          <span class="cancelled-badge">Cancelled</span>
        {/if}
      </div>
      {#if state.statistics}
        <BenchmarkStatisticsTable statistics={state.statistics} />
      {/if}
      {#if state.distribution.length > 0}
        <BenchmarkDistributionChart distribution={state.distribution} />
      {/if}
      <BenchmarkIterationTable iterations={state.iterations} />
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
    padding: 4px 16px;
    background: var(--hf-editor-background);
    border-bottom: 1px solid var(--hf-panel-border);
    min-height: 32px;
    gap: 8px;
  }

  .toolbar-left,
  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .toolbar-label {
    font-size: 10px;
    color: var(--hf-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    white-space: nowrap;
    user-select: none;
  }

  .panel-content {
    padding: 16px;
  }

  .header h2 {
    margin: 0 0 8px;
    font-size: 16px;
    font-weight: 600;
  }

  .request-info {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
    font-size: 13px;
  }

  .method {
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 11px;
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
    margin-bottom: 16px;
  }

  .progress-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    font-size: 13px;
  }

  .progress-bar {
    height: 6px;
    background: var(--hf-progressBar-background);
    border-radius: 2px;
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
    padding: 4px 12px;
    border-radius: 2px;
    cursor: pointer;
    font-size: 12px;
  }

  .cancel-btn:hover {
    background: var(--hf-button-secondaryHoverBackground);
  }

  .results-actions {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 16px;
  }

  .action-btn {
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
    border: none;
    padding: 7px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    transition: background 0.15s;
  }

  .action-btn:hover {
    background: var(--hf-button-hoverBackground);
  }

  .cancelled-badge {
    font-size: 12px;
    color: var(--hf-errorForeground);
    font-weight: 600;
  }
</style>
