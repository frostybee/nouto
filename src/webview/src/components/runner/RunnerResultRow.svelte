<script lang="ts">
  import type { CollectionRunRequestResult } from '../../types';

  interface Props {
    result: CollectionRunRequestResult;
    index: number;
  }
  let { result, index }: Props = $props();

  const statusClass = $derived(result.passed ? 'pass' : 'fail');
  const methodColor = $derived(getMethodColor(result.method));

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
</script>

<tr class="result-row" class:pass={result.passed} class:fail={!result.passed}>
  <td class="col-index">{index + 1}</td>
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
  </td>
</tr>

{#if result.error}
  <tr class="error-row">
    <td></td>
    <td colspan="5" class="error-detail">{result.error}</td>
  </tr>
{/if}

<style>
  .result-row {
    border-bottom: 1px solid var(--vscode-panel-border);
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
    color: var(--vscode-descriptionForeground);
    text-align: center;
  }

  .col-name {
    max-width: 200px;
  }

  .col-method {
    width: 70px;
  }

  .method-badge {
    font-weight: 600;
    font-size: 11px;
  }

  .col-status {
    width: 120px;
  }

  .status-code {
    font-size: 11px;
    font-weight: 500;
  }

  .status-ok {
    color: var(--vscode-testing-iconPassed, #49cc90);
  }

  .status-err {
    color: var(--vscode-testing-iconFailed, #f93e3e);
  }

  .status-error {
    color: var(--vscode-errorForeground);
    font-size: 11px;
  }

  .col-duration {
    width: 80px;
    text-align: right;
    color: var(--vscode-descriptionForeground);
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
    color: var(--vscode-testing-iconPassed, #49cc90);
  }

  .result-badge.fail {
    background: rgba(249, 62, 62, 0.15);
    color: var(--vscode-testing-iconFailed, #f93e3e);
  }

  .error-row td {
    padding: 4px 12px 8px;
  }

  .error-detail {
    font-size: 11px;
    color: var(--vscode-errorForeground);
    font-style: italic;
    white-space: normal;
    word-break: break-word;
  }
</style>
