<script lang="ts">
  import type { BenchmarkIteration } from '../../types';

  let { iterations }: { iterations: BenchmarkIteration[] } = $props();
</script>

<div class="iteration-section">
  <h3>Iterations ({iterations.length})</h3>
  <div class="table-container">
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Status</th>
          <th>Duration</th>
          <th>Size</th>
          <th>Result</th>
          <th>Error</th>
        </tr>
      </thead>
      <tbody>
        {#each iterations as iter}
          <tr class:failed={!iter.success}>
            <td class="num">{iter.iteration}</td>
            <td>{iter.status || '-'}</td>
            <td class="num">{iter.duration}ms</td>
            <td class="num">{iter.size > 0 ? `${(iter.size / 1024).toFixed(1)}KB` : '-'}</td>
            <td>
              <span class="badge" class:pass={iter.success} class:fail={!iter.success}>
                {iter.success ? 'OK' : 'FAIL'}
              </span>
            </td>
            <td class="error">{iter.error || ''}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .iteration-section {
    margin-bottom: 16px;
  }

  h3 {
    font-size: 15px;
    font-weight: 600;
    margin: 0 0 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .table-container {
    max-height: 500px;
    overflow-y: auto;
    border: 1px solid var(--hf-panel-border);
    border-radius: 4px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  th, td {
    padding: 6px 10px;
    border-bottom: 1px solid var(--hf-panel-border);
    text-align: left;
  }

  th {
    background: var(--hf-editor-background);
    font-weight: 600;
    font-size: 11px;
    color: var(--hf-descriptionForeground);
    position: sticky;
    top: 0;
    z-index: 1;
  }

  tbody tr:nth-child(even) {
    background: rgba(255, 255, 255, 0.04);
  }

  tbody tr:hover {
    background: var(--hf-list-hoverBackground);
  }

  .num {
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  tr.failed {
    background: rgba(249, 62, 62, 0.08);
  }

  .badge {
    font-size: 11px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 3px;
  }

  .badge.pass {
    background: rgba(73, 204, 144, 0.2);
    color: #49cc90;
  }

  .badge.fail {
    background: rgba(249, 62, 62, 0.2);
    color: #f93e3e;
  }

  .error {
    color: var(--hf-errorForeground);
    font-size: 11px;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
