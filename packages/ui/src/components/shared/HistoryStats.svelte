<script lang="ts">
  import { historyStats, historyStatsLoading } from '../../stores/history.svelte';
  import MethodBadge from './MethodBadge.svelte';
  import Tooltip from './Tooltip.svelte';
  import type { HttpMethod } from '../../types';

  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  function formatDate(iso: string): string {
    if (!iso) return '-';
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function extractPath(url: string): string {
    try {
      const u = new URL(url);
      const path = u.pathname;
      return path.length > 40 ? path.substring(0, 37) + '...' : path;
    } catch {
      return url.substring(0, 40);
    }
  }

  const stats = $derived(historyStats());
  const isLoading = $derived(historyStatsLoading());

  // Status bar widths
  const totalStatus = $derived(
    stats ? stats.statusDistribution['2xx'] + stats.statusDistribution['3xx'] + stats.statusDistribution['4xx'] + stats.statusDistribution['5xx'] + stats.statusDistribution.error : 0
  );
</script>

<div class="stats-container">
  {#if isLoading}
    <div class="loading">Loading statistics...</div>
  {:else if !stats || stats.totalRequests === 0}
    <div class="empty">No history data to analyze.</div>
  {:else}
    <!-- Summary Cards -->
    <div class="summary-cards">
      <div class="card">
        <span class="card-value">{stats.totalRequests}</span>
        <span class="card-label">Total Requests</span>
      </div>
      <div class="card">
        <span class="card-value">{formatDuration(stats.avgResponseTime)}</span>
        <span class="card-label">Avg Response</span>
      </div>
      <div class="card">
        <span class="card-value">{stats.errorRate}%</span>
        <span class="card-label">Error Rate</span>
      </div>
      <div class="card">
        <span class="card-value">{formatDate(stats.timeRange.from)}</span>
        <span class="card-label">Since</span>
      </div>
    </div>

    <!-- Status Distribution Bar -->
    <div class="section">
      <div class="section-title">Status Distribution</div>
      {#if totalStatus > 0}
      <div class="status-bar">
        {#if stats.statusDistribution['2xx'] > 0}
          <Tooltip text="2xx: {stats.statusDistribution['2xx']}" position="top">
            <div class="bar-segment bar-2xx" style="width: {(stats.statusDistribution['2xx'] / totalStatus) * 100}%"></div>
          </Tooltip>
        {/if}
        {#if stats.statusDistribution['3xx'] > 0}
          <Tooltip text="3xx: {stats.statusDistribution['3xx']}" position="top">
            <div class="bar-segment bar-3xx" style="width: {(stats.statusDistribution['3xx'] / totalStatus) * 100}%"></div>
          </Tooltip>
        {/if}
        {#if stats.statusDistribution['4xx'] > 0}
          <Tooltip text="4xx: {stats.statusDistribution['4xx']}" position="top">
            <div class="bar-segment bar-4xx" style="width: {(stats.statusDistribution['4xx'] / totalStatus) * 100}%"></div>
          </Tooltip>
        {/if}
        {#if stats.statusDistribution['5xx'] > 0}
          <Tooltip text="5xx: {stats.statusDistribution['5xx']}" position="top">
            <div class="bar-segment bar-5xx" style="width: {(stats.statusDistribution['5xx'] / totalStatus) * 100}%"></div>
          </Tooltip>
        {/if}
        {#if stats.statusDistribution.error > 0}
          <Tooltip text="Error: {stats.statusDistribution.error}" position="top">
            <div class="bar-segment bar-err" style="width: {(stats.statusDistribution.error / totalStatus) * 100}%"></div>
          </Tooltip>
        {/if}
      </div>
      {/if}
      <div class="status-legend">
        <span class="legend-item"><span class="legend-dot dot-2xx"></span>2xx: {stats.statusDistribution['2xx']}</span>
        <span class="legend-item"><span class="legend-dot dot-3xx"></span>3xx: {stats.statusDistribution['3xx']}</span>
        <span class="legend-item"><span class="legend-dot dot-4xx"></span>4xx: {stats.statusDistribution['4xx']}</span>
        <span class="legend-item"><span class="legend-dot dot-5xx"></span>5xx: {stats.statusDistribution['5xx']}</span>
        <span class="legend-item"><span class="legend-dot dot-err"></span>Err: {stats.statusDistribution.error}</span>
      </div>
    </div>

    <!-- Top Endpoints -->
    <div class="section">
      <div class="section-title">Top Endpoints</div>
      <div class="endpoints-table">
        {#each stats.topEndpoints as ep}
          <div class="endpoint-row">
            <MethodBadge method={ep.method as HttpMethod} />
            <Tooltip text={ep.url} position="top"><span class="endpoint-url">{extractPath(ep.url)}</span></Tooltip>
            <span class="endpoint-count">{ep.count}x</span>
            <span class="endpoint-avg">{formatDuration(ep.avgDuration)}</span>
            {#if ep.errorRate > 0}
              <span class="endpoint-errors">{ep.errorRate}%</span>
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <!-- Requests per Day Sparkline -->
    {#if stats.requestsPerDay.length > 1}
      {@const maxCount = Math.max(...stats.requestsPerDay.map(d => d.count))}
      <div class="section">
        <div class="section-title">Activity</div>
        <div class="sparkline">
          {#each stats.requestsPerDay as day}
            <Tooltip text="{day.date}: {day.count} requests" position="top">
              <div
                class="spark-bar"
                style="height: {Math.max(4, (day.count / maxCount) * 100)}%"
              ></div>
            </Tooltip>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .stats-container {
    padding: 8px;
    overflow-y: auto;
    font-size: 12px;
  }

  .loading, .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    color: var(--hf-descriptionForeground);
    font-size: 12px;
  }

  .summary-cards {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    margin-bottom: 12px;
  }

  .card {
    display: flex;
    flex-direction: column;
    padding: 8px 10px;
    background: var(--hf-badge-background);
    border-radius: 4px;
  }

  .card-value {
    font-size: 16px;
    font-weight: 700;
    color: var(--hf-foreground);
    font-family: 'Consolas', 'Monaco', monospace;
  }

  .card-label {
    font-size: 10px;
    color: var(--hf-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.3px;
    margin-top: 2px;
  }

  .section {
    margin-bottom: 12px;
  }

  .section-title {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--hf-descriptionForeground);
    margin-bottom: 6px;
  }

  .status-bar {
    display: flex;
    height: 8px;
    border-radius: 4px;
    overflow: hidden;
    background: var(--hf-badge-background);
  }

  .bar-segment {
    min-width: 2px;
    transition: width 0.3s;
  }

  .bar-2xx { background: #3fb950; }
  .bar-3xx { background: #d29922; }
  .bar-4xx { background: #f85149; }
  .bar-5xx { background: #da3633; }
  .bar-err { background: #8b949e; }

  .status-legend {
    display: flex;
    gap: 8px;
    margin-top: 4px;
    flex-wrap: wrap;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    color: var(--hf-descriptionForeground);
  }

  .legend-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .dot-2xx { background: #3fb950; }
  .dot-3xx { background: #d29922; }
  .dot-4xx { background: #f85149; }
  .dot-5xx { background: #da3633; }
  .dot-err { background: #8b949e; }

  .endpoints-table {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .endpoint-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 6px;
    border-radius: 3px;
  }

  .endpoint-row:hover {
    background: var(--hf-list-hoverBackground);
  }

  .endpoint-url {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--hf-foreground);
  }

  .endpoint-count {
    font-size: 10px;
    font-weight: 600;
    color: var(--hf-descriptionForeground);
    font-family: 'Consolas', 'Monaco', monospace;
  }

  .endpoint-avg {
    font-size: 10px;
    color: var(--hf-descriptionForeground);
    font-family: 'Consolas', 'Monaco', monospace;
  }

  .endpoint-errors {
    font-size: 10px;
    font-weight: 600;
    color: var(--hf-errorForeground);
    font-family: 'Consolas', 'Monaco', monospace;
  }

  .sparkline {
    display: flex;
    align-items: flex-end;
    gap: 1px;
    height: 40px;
    padding: 2px 0;
  }

  .spark-bar {
    flex: 1;
    min-width: 2px;
    background: var(--hf-button-background);
    border-radius: 1px 1px 0 0;
    opacity: 0.8;
    transition: opacity 0.1s;
  }

  .spark-bar:hover {
    opacity: 1;
  }
</style>
