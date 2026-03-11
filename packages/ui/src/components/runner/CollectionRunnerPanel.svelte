<script lang="ts">
  import {
    runnerState,
    filteredResults,
    setRunning,
    updateProgress,
    addResult,
    setCompleted,
    setCancelled,
    updateConfig,
    resetRunner,
    setResultFilter,
    getEnabledRequestIds,
    setDataFile,
    clearDataFile,
    setIterationLimit,
  } from '../../stores/collectionRunner.svelte';
  import type { CollectionRunRequestResult, CollectionRunResult } from '../../types';
  import type { ResultFilter } from '../../stores/collectionRunner.svelte';
  import RunnerResultRow from './RunnerResultRow.svelte';
  import RunnerRequestList from './RunnerRequestList.svelte';
  import Tooltip from '../shared/Tooltip.svelte';

  declare const vscode: { postMessage: (msg: any) => void };

  const state = $derived(runnerState);
  const results = $derived(filteredResults());
  const isRunning = $derived(state.status === 'running');
  const hasResults = $derived(state.results.length > 0);
  const enabledCount = $derived(state.requests.filter(r => r.enabled).length);
  const progressPercent = $derived(
    state.progress.total > 0
      ? Math.round((state.progress.current / state.progress.total) * 100)
      : 0
  );

  function handleRun() {
    setRunning();
    const requestIds = getEnabledRequestIds();
    vscode.postMessage({
      type: 'startCollectionRun',
      data: {
        collectionId: state.collectionId,
        folderId: state.folderId,
        config: state.config,
        requestIds,
      },
    });
  }

  function handleCancel() {
    vscode.postMessage({ type: 'cancelCollectionRun' });
  }

  function handleRunAgain() {
    resetRunner();
  }

  function handleRetryFailed() {
    const failedIds = state.results.filter(r => !r.passed).map(r => r.requestId);
    if (failedIds.length === 0) return;
    setRunning();
    vscode.postMessage({
      type: 'retryFailedRequests',
      data: {
        requestIds: failedIds,
        config: state.config,
      },
    });
  }

  function handleExportJson() {
    vscode.postMessage({
      type: 'exportRunResults',
      data: { format: 'json', results: $state.snapshot(state.results), summary: $state.snapshot(state.summary), collectionName: state.collectionName },
    });
  }

  function handleExportCsv() {
    vscode.postMessage({
      type: 'exportRunResults',
      data: { format: 'csv', results: $state.snapshot(state.results), summary: $state.snapshot(state.summary), collectionName: state.collectionName },
    });
  }

  function handleSelectDataFile() {
    vscode.postMessage({ type: 'selectDataFile' });
  }

  function handleClearDataFile() {
    clearDataFile();
  }

  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  // Handle messages from extension
  function handleMessage(event: MessageEvent) {
    const message = event.data;
    switch (message.type) {
      case 'initRunner':
        break;
      case 'collectionRunProgress':
        updateProgress(message.data);
        break;
      case 'collectionRunRequestResult':
        addResult(message.data);
        break;
      case 'collectionRunComplete':
        setCompleted(message.data);
        break;
      case 'collectionRunCancelled':
        setCancelled();
        break;
      case 'dataFileSelected':
        setDataFile(message.data);
        break;
    }
  }
</script>

<svelte:window onmessage={handleMessage} />

<div class="runner-panel">
  <div class="runner-header">
    <h2 class="runner-title">Collection Runner</h2>
    <span class="collection-name">{state.collectionName}</span>
  </div>

  {#if state.status === 'idle'}
    <div class="config-section">
      <RunnerRequestList />

      <div class="config-options">
        <div class="config-row">
          <label class="config-label">
            <input
              type="checkbox"
              checked={state.config.stopOnFailure}
              onchange={(e) => updateConfig({ stopOnFailure: e.currentTarget.checked })}
            />
            Stop on first failure
          </label>
        </div>
        <div class="config-row">
          <label class="config-label" for="runner-delay">Delay between requests</label>
          <div class="delay-input-group">
            <input
              id="runner-delay"
              type="number"
              class="delay-input"
              min="0"
              max="60000"
              step="100"
              value={state.config.delayMs}
              oninput={(e) => updateConfig({ delayMs: parseInt(e.currentTarget.value) || 0 })}
            />
            <span class="delay-unit">ms</span>
          </div>
        </div>
        <div class="config-row">
          <label class="config-label" for="runner-timeout">Request timeout (0 = default 30s)</label>
          <div class="delay-input-group">
            <input
              id="runner-timeout"
              type="number"
              class="delay-input"
              min="0"
              max="300000"
              step="1000"
              value={state.config.timeoutMs ?? 0}
              oninput={(e) => updateConfig({ timeoutMs: parseInt(e.currentTarget.value) || 0 })}
            />
            <span class="delay-unit">ms</span>
          </div>
        </div>
        <div class="config-row data-file-row">
          <span class="config-label">Data Source (CSV/JSON)</span>
          {#if state.dataFile}
            <div class="data-file-info">
              <span class="data-file-name">{state.dataFile.path.split(/[\\/]/).pop()}</span>
              <span class="data-file-meta">{state.dataFile.rowCount} rows, {state.dataFile.columns.length} columns</span>
              <Tooltip text="Clear data file" position="top">
                <button class="clear-data-btn" onclick={handleClearDataFile} aria-label="Clear data file">
                  <span class="codicon codicon-close"></span>
                </button>
              </Tooltip>
            </div>
            <div class="config-row">
              <label class="config-label" for="runner-iterations">Limit rows (0 = all)</label>
              <input
                id="runner-iterations"
                type="number"
                class="delay-input"
                min="0"
                max={state.dataFile.rowCount}
                value={state.config.iterations ?? 0}
                oninput={(e) => setIterationLimit(parseInt(e.currentTarget.value) || 0)}
              />
            </div>
          {:else}
            <button class="data-file-btn" onclick={handleSelectDataFile}>
              <span class="codicon codicon-file"></span>
              Select Data File
            </button>
          {/if}
        </div>
      </div>

      <button class="run-button" onclick={handleRun} disabled={enabledCount === 0}>
        Run {enabledCount} Request{enabledCount !== 1 ? 's' : ''}
        {#if state.dataFile}
          ({state.config.iterations && state.config.iterations > 0 ? state.config.iterations : state.dataFile.rowCount} iterations)
        {/if}
      </button>
    </div>
  {/if}

  {#if isRunning}
    <div class="progress-section">
      <div class="progress-info">
        <span>Running: {state.progress.requestName}</span>
        <span>{state.progress.current}/{state.progress.total}</span>
      </div>
      <div class="progress-bar-container">
        <div class="progress-bar" style="width: {progressPercent}%"></div>
      </div>
      <button class="cancel-button" onclick={handleCancel}>Cancel</button>
    </div>
  {/if}

  {#if hasResults}
    <div class="summary-section">
      <div class="summary-stats">
        <span class="stat pass">{state.summary.passed} passed</span>
        <span class="stat-divider">|</span>
        <span class="stat fail">{state.summary.failed} failed</span>
        {#if state.summary.skipped > 0}
          <span class="stat-divider">|</span>
          <span class="stat skip">{state.summary.skipped} skipped</span>
        {/if}
        <span class="stat-divider">|</span>
        <span class="stat time">{formatDuration(state.summary.totalDuration)} total</span>
      </div>
    </div>

    <div class="filter-bar">
      <button
        class="filter-btn"
        class:active={state.resultFilter === 'all'}
        onclick={() => setResultFilter('all')}
      >All ({state.results.length})</button>
      <button
        class="filter-btn pass"
        class:active={state.resultFilter === 'passed'}
        onclick={() => setResultFilter('passed')}
      >Passed ({state.summary.passed})</button>
      <button
        class="filter-btn fail"
        class:active={state.resultFilter === 'failed'}
        onclick={() => setResultFilter('failed')}
      >Failed ({state.summary.failed})</button>
    </div>

    <div class="results-section">
      <table class="results-table">
        <thead>
          <tr>
            <th class="th-index">#</th>
            {#if state.dataFile}
              <th class="th-iteration">Iter</th>
            {/if}
            <th class="th-name">Name</th>
            <th class="th-method">Method</th>
            <th class="th-status">Status</th>
            <th class="th-duration">Duration</th>
            <th class="th-result">Result</th>
          </tr>
        </thead>
        <tbody>
          {#each results as result, i (result.requestId + '-' + i)}
            <RunnerResultRow {result} index={i} expandedId={state.expandedResultId} showIteration={!!state.dataFile} />
          {/each}
        </tbody>
      </table>
    </div>

    {#if state.status === 'completed' || state.status === 'cancelled'}
      <div class="actions-section">
        <button class="action-button" onclick={handleExportJson}>Export JSON</button>
        <button class="action-button" onclick={handleExportCsv}>Export CSV</button>
        {#if state.summary.failed > 0}
          <button class="action-button retry" onclick={handleRetryFailed}>Retry Failed ({state.summary.failed})</button>
        {/if}
        <button class="action-button primary" onclick={handleRunAgain}>Run Again</button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .runner-panel {
    display: flex;
    flex-direction: column;
    height: 100vh;
    padding: 16px;
    gap: 16px;
    overflow: auto;
    font-family: var(--hf-font-family);
    color: var(--hf-foreground);
    background: var(--hf-editor-background);
  }

  .runner-header {
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .runner-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }

  .collection-name {
    font-size: 13px;
    color: var(--hf-descriptionForeground);
  }

  .config-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .config-options {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 16px;
    background: var(--hf-input-background);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 6px;
  }

  .config-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .config-label {
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .delay-input-group {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .delay-input {
    width: 80px;
    padding: 4px 8px;
    background: var(--hf-editor-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 4px;
    font-size: 13px;
    text-align: right;
  }

  .delay-input:focus {
    outline: none;
    border-color: var(--hf-focusBorder);
  }

  .delay-unit {
    font-size: 12px;
    color: var(--hf-descriptionForeground);
  }

  .data-file-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .data-file-info {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: var(--hf-input-background);
    border: 1px solid var(--hf-input-border, transparent);
    border-radius: 4px;
    font-size: 12px;
    width: 100%;
  }

  .data-file-name {
    font-weight: 600;
  }

  .data-file-meta {
    color: var(--hf-descriptionForeground);
    flex: 1;
  }

  .clear-data-btn {
    background: transparent;
    border: none;
    color: var(--hf-foreground);
    cursor: pointer;
    opacity: 0.6;
    padding: 2px;
  }

  .clear-data-btn:hover {
    opacity: 1;
  }

  .data-file-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: none;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
  }

  .data-file-btn:hover {
    background: var(--hf-button-secondaryHoverBackground);
  }

  .run-button {
    padding: 8px 24px;
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
    border: none;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
    align-self: flex-start;
  }

  .run-button:hover:not(:disabled) {
    background: var(--hf-button-hoverBackground);
  }

  .run-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .progress-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 16px;
    background: var(--hf-input-background);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 6px;
  }

  .progress-info {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: var(--hf-descriptionForeground);
  }

  .progress-bar-container {
    height: 6px;
    background: var(--hf-progressBar-background, rgba(0, 120, 215, 0.2));
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-bar {
    height: 100%;
    background: var(--hf-progressBar-background, #0078d4);
    border-radius: 3px;
    transition: width 0.3s ease;
  }

  .cancel-button {
    padding: 6px 16px;
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: 1px solid var(--hf-errorForeground);
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    align-self: flex-start;
  }

  .cancel-button:hover {
    background: var(--hf-inputValidation-errorBackground, rgba(255, 0, 0, 0.1));
  }

  .summary-section {
    padding: 10px 16px;
    background: var(--hf-input-background);
    border: 1px solid var(--hf-input-border, var(--hf-panel-border));
    border-radius: 6px;
  }

  .summary-stats {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
  }

  .stat.pass { color: var(--hf-testing-iconPassed, #49cc90); }
  .stat.fail { color: var(--hf-testing-iconFailed, #f93e3e); }
  .stat.skip { color: var(--hf-descriptionForeground); }
  .stat.time { color: var(--hf-descriptionForeground); }
  .stat-divider { color: var(--hf-panel-border); }

  .filter-bar {
    display: flex;
    gap: 4px;
  }

  .filter-btn {
    padding: 4px 12px;
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: 1px solid transparent;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
  }

  .filter-btn.active {
    border-color: var(--hf-focusBorder);
    background: var(--hf-input-background);
  }

  .filter-btn.pass.active { color: var(--hf-testing-iconPassed, #49cc90); }
  .filter-btn.fail.active { color: var(--hf-testing-iconFailed, #f93e3e); }

  .results-section {
    flex: 1;
    overflow: auto;
    border: 1px solid var(--hf-panel-border);
    border-radius: 6px;
  }

  .results-table {
    width: 100%;
    border-collapse: collapse;
  }

  .results-table thead {
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .results-table th {
    padding: 8px 12px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--hf-descriptionForeground);
    background: var(--hf-editor-background);
    border-bottom: 2px solid var(--hf-panel-border);
    text-align: left;
  }

  .th-index { width: 40px; text-align: center; }
  .th-method { width: 70px; }
  .th-status { width: 120px; }
  .th-duration { width: 80px; text-align: right; }
  .th-result { width: 70px; text-align: center; }

  .actions-section {
    display: flex;
    gap: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--hf-panel-border);
  }

  .action-button {
    padding: 6px 16px;
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: none;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .action-button:hover {
    background: var(--hf-button-secondaryHoverBackground);
  }

  .action-button.retry {
    color: var(--hf-testing-iconFailed, #f93e3e);
    border: 1px solid var(--hf-testing-iconFailed, #f93e3e);
  }

  .action-button.primary {
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
    margin-left: auto;
  }

  .action-button.primary:hover {
    background: var(--hf-button-hoverBackground);
  }
</style>
