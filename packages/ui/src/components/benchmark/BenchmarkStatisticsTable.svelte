<script lang="ts">
  import type { BenchmarkStatistics } from '../../types';

  let { statistics }: { statistics: BenchmarkStatistics } = $props();

  function fmt(ms: number): string {
    if (ms < 1) return '<1ms';
    return `${Math.round(ms)}ms`;
  }
</script>

<div class="stats-section">
  <h3>Statistics</h3>
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">Total</div>
      <div class="stat-value">{statistics.totalIterations}</div>
    </div>
    <div class="stat-card success">
      <div class="stat-label">Success</div>
      <div class="stat-value">{statistics.successCount}</div>
    </div>
    <div class="stat-card fail">
      <div class="stat-label">Failed</div>
      <div class="stat-value">{statistics.failCount}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Req/s</div>
      <div class="stat-value">{statistics.requestsPerSecond.toFixed(2)}</div>
    </div>
  </div>

  <table class="stats-table">
    <thead>
      <tr>
        <th>Min</th>
        <th>Max</th>
        <th>Mean</th>
        <th>Median</th>
        <th>P75</th>
        <th>P90</th>
        <th>P95</th>
        <th>P99</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>{fmt(statistics.min)}</td>
        <td>{fmt(statistics.max)}</td>
        <td>{fmt(statistics.mean)}</td>
        <td>{fmt(statistics.median)}</td>
        <td>{fmt(statistics.p75)}</td>
        <td>{fmt(statistics.p90)}</td>
        <td>{fmt(statistics.p95)}</td>
        <td>{fmt(statistics.p99)}</td>
      </tr>
    </tbody>
  </table>
</div>

<style>
  .stats-section {
    margin-bottom: 2.154rem;
  }

  h3 {
    font-size: 1.154rem;
    font-weight: 600;
    margin: 0 0 0.923rem;
    padding-bottom: 0.615rem;
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.769rem;
    margin-bottom: 0.769rem;
  }

  .stat-card {
    background: var(--hf-editor-background);
    border: 1px solid var(--hf-panel-border);
    border-radius: 0.308rem;
    padding: 1.077rem 0.769rem;
    text-align: center;
  }

  .stat-card.success {
    border-top: 0.231rem solid #49cc90;
  }

  .stat-card.fail {
    border-top: 0.231rem solid #f93e3e;
  }

  .stat-label {
    font-size: 0.846rem;
    color: var(--hf-descriptionForeground);
    margin-bottom: 0.462rem;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .stat-value {
    font-size: 1.385rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .stat-card.success .stat-value { color: #49cc90; }
  .stat-card.fail .stat-value { color: #f93e3e; }

  .stats-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.923rem;
  }

  .stats-table th,
  .stats-table td {
    padding: 0.615rem 0.769rem;
    border: 1px solid var(--hf-panel-border);
    text-align: center;
  }

  .stats-table th {
    background: var(--hf-editor-background);
    font-weight: 600;
    font-size: 0.923rem;
    color: var(--hf-descriptionForeground);
  }

  .stats-table td {
    font-variant-numeric: tabular-nums;
  }

  .stats-table tbody tr:hover {
    background: var(--hf-list-hoverBackground);
  }
</style>
