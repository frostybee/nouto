<script lang="ts">
  import type { CollectionRunRequestResult } from '../../types';
  import { setExpandedResult } from '../../stores/collectionRunner';

  interface Props {
    result: CollectionRunRequestResult;
    index: number;
    expandedId: string | null;
    showIteration?: boolean;
  }
  let { result, index, expandedId, showIteration = false }: Props = $props();

  const statusClass = $derived(result.passed ? 'pass' : 'fail');
  const methodColor = $derived(getMethodColor(result.method));
  const hasAssertions = $derived(result.assertionResults && result.assertionResults.length > 0);
  const assertionPassed = $derived(result.assertionResults?.filter(r => r.passed).length ?? 0);
  const assertionTotal = $derived(result.assertionResults?.length ?? 0);
  const hasScriptTests = $derived(result.scriptTestResults && result.scriptTestResults.length > 0);
  const hasScriptLogs = $derived(result.scriptLogs && result.scriptLogs.length > 0);
  const isExpanded = $derived(expandedId === result.requestId);
  const isExpandable = $derived(hasAssertions || hasScriptTests || hasScriptLogs || !!result.responseData);

  const bodyPreview = $derived(getBodyPreview(result.responseData));

  function getMethodColor(method: string): string {
    const colors: Record<string, string> = {
      GET: '#61affe',
      POST: '#49cc90',
      PUT: '#fca130',
      PATCH: '#50e3c2',
      DELETE: '#f93e3e',
      HEAD: '#9012fe',
      OPTIONS: '#0d5aa7',
    };
    return colors[method] || '#61affe';
  }

  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  function getBodyPreview(data: any): string {
    if (!data) return '';
    const str = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    return str.length > 500 ? str.substring(0, 500) + '...' : str;
  }
</script>

<tr class="result-row" class:pass={result.passed} class:fail={!result.passed}
  onclick={() => isExpandable && setExpandedResult(result.requestId)}
  class:clickable={isExpandable}
>
  <td class="col-index">{index + 1}</td>
  {#if showIteration && result.iterationIndex !== undefined}
    <td class="col-iteration">#{result.iterationIndex + 1}</td>
  {/if}
  <td class="col-name" title={result.requestName}>{result.requestName}</td>
  <td class="col-method">
    <span class="method-badge" style="color: {methodColor}">{result.method}</span>
  </td>
  <td class="col-status">
    {#if result.status > 0}
      <span class="status-code" class:status-ok={result.status < 400} class:status-err={result.status >= 400}>
        {result.status} {result.statusText}
      </span>
    {:else}
      <span class="status-error">Error</span>
    {/if}
  </td>
  <td class="col-duration">{formatDuration(result.duration)}</td>
  <td class="col-result">
    <span class="result-badge {statusClass}">
      {result.passed ? 'Pass' : 'Fail'}
    </span>
    {#if hasAssertions}
      <span class="assertion-count">{assertionPassed}/{assertionTotal}</span>
    {/if}
  </td>
</tr>

{#if result.error}
  <tr class="error-row">
    <td></td>
    <td colspan="5" class="error-detail">{result.error}</td>
  </tr>
{/if}

{#if isExpanded}
  <tr class="detail-row">
    <td></td>
    <td colspan="5">
      <div class="detail-content">
        {#if result.url}
          <div class="detail-section">
            <span class="detail-label">URL:</span>
            <code class="detail-url">{result.url}</code>
          </div>
        {/if}

        {#if hasScriptTests}
          <div class="detail-section">
            <span class="detail-label">Script Tests:</span>
            <div class="script-tests">
              {#each result.scriptTestResults! as test}
                <div class="test-item" class:test-pass={test.passed} class:test-fail={!test.passed}>
                  <span>{test.passed ? '\u2713' : '\u2717'}</span>
                  <span>{test.name}</span>
                  {#if test.error}
                    <span class="test-error">({test.error})</span>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}

        {#if hasScriptLogs}
          <div class="detail-section">
            <span class="detail-label">Script Logs:</span>
            <div class="script-logs">
              {#each result.scriptLogs! as log}
                <div class="log-item log-{log.level}">
                  <span class="log-level">[{log.level}]</span>
                  <span>{log.args.join(' ')}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        {#if hasAssertions}
          <div class="detail-section">
            <span class="detail-label">Assertions:</span>
            <div class="assertion-details">
              {#each result.assertionResults! as ar}
                <div class="assertion-item" class:assertion-pass={ar.passed} class:assertion-fail={!ar.passed}>
                  <span>{ar.passed ? '\u2713' : '\u2717'}</span>
                  <span class="assertion-msg">{ar.message}</span>
                  {#if !ar.passed && ar.actual !== undefined}
                    <span class="assertion-actual">Got: {ar.actual}</span>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}

        {#if bodyPreview}
          <div class="detail-section">
            <span class="detail-label">Response Body:</span>
            <pre class="body-preview">{bodyPreview}</pre>
          </div>
        {/if}
      </div>
    </td>
  </tr>
{/if}

<style>
  .result-row {
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .result-row td {
    padding: 8px 12px;
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .col-index {
    width: 40px;
    color: var(--hf-descriptionForeground);
    text-align: center;
  }

  .col-iteration {
    width: 50px;
    color: var(--hf-descriptionForeground);
    text-align: center;
    font-size: 11px;
  }

  .col-name { max-width: 200px; }
  .col-method { width: 70px; }

  .method-badge {
    font-weight: 600;
    font-size: 11px;
  }

  .col-status { width: 120px; }

  .status-code {
    font-size: 11px;
    font-weight: 500;
  }

  .status-ok { color: var(--hf-testing-iconPassed, #49cc90); }
  .status-err { color: var(--hf-testing-iconFailed, #f93e3e); }
  .status-error { color: var(--hf-errorForeground); font-size: 11px; }

  .col-duration {
    width: 80px;
    text-align: right;
    color: var(--hf-descriptionForeground);
  }

  .col-result {
    width: 70px;
    text-align: center;
  }

  .result-badge {
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 500;
  }

  .result-badge.pass {
    background: rgba(73, 204, 144, 0.15);
    color: var(--hf-testing-iconPassed, #49cc90);
  }

  .result-badge.fail {
    background: rgba(249, 62, 62, 0.15);
    color: var(--hf-testing-iconFailed, #f93e3e);
  }

  .error-row td { padding: 4px 12px 8px; }

  .error-detail {
    font-size: 11px;
    color: var(--hf-errorForeground);
    font-style: italic;
    white-space: normal;
    word-break: break-word;
  }

  .clickable { cursor: pointer; }
  .clickable:hover { background: var(--hf-list-hoverBackground); }

  .assertion-count {
    font-size: 10px;
    color: var(--hf-descriptionForeground);
    margin-left: 4px;
  }

  .detail-row td { padding: 4px 12px 12px; }

  .detail-content {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    background: var(--hf-input-background);
    border-radius: 4px;
  }

  .detail-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .detail-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--hf-descriptionForeground);
    letter-spacing: 0.5px;
  }

  .detail-url {
    font-size: 11px;
    word-break: break-all;
    color: var(--hf-textLink-foreground);
  }

  .script-tests, .script-logs, .assertion-details {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .test-item, .assertion-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    padding: 2px 4px;
  }

  .test-pass, .assertion-pass { color: var(--hf-testing-iconPassed, #49cc90); }
  .test-fail, .assertion-fail { color: var(--hf-testing-iconFailed, #f93e3e); }
  .test-error { font-size: 10px; color: var(--hf-descriptionForeground); }

  .log-item {
    font-size: 11px;
    font-family: var(--hf-editor-font-family, monospace);
    padding: 1px 4px;
  }

  .log-level {
    font-weight: 600;
    margin-right: 4px;
  }

  .log-warn { color: var(--hf-editorWarning-foreground, #cca700); }
  .log-error { color: var(--hf-errorForeground, #f93e3e); }

  .assertion-msg { flex: 1; }
  .assertion-actual {
    font-size: 10px;
    color: var(--hf-descriptionForeground);
    font-family: var(--hf-editor-font-family, monospace);
  }

  .body-preview {
    margin: 0;
    padding: 8px;
    background: var(--hf-editor-background);
    border: 1px solid var(--hf-panel-border);
    border-radius: 4px;
    font-size: 11px;
    font-family: var(--hf-editor-font-family, monospace);
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 200px;
    overflow: auto;
    color: var(--hf-editor-foreground);
  }
</style>
