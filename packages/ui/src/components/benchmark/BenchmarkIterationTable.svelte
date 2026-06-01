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
    margin-bottom: 1.231rem;
  }

  h3 {
    font-size: 1.154rem;
    font-weight: 600;
    margin: 0 0 0.923rem;
    padding-bottom: 0.615rem;
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .table-container {
    max-height: 38.462rem;
    overflow-y: auto;
    border: 1px solid var(--hf-panel-border);
    border-radius: 0.308rem;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.923rem;
  }

  th, td {
    padding: 0.462rem 0.769rem;
    border-bottom: 1px solid var(--hf-panel-border);
    text-align: left;
  }

  th {
    background: var(--hf-editor-background);
    font-weight: 600;
    font-size: 0.846rem;
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
    font-size: 0.846rem;
    font-weight: 700;
    padding: 0.154rem 0.615rem;
    border-radius: 0.231rem;
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
    font-size: 0.846rem;
    max-width: 15.385rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
