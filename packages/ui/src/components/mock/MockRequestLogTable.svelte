<script lang="ts">
  import type { MockRequestLog, MockRoute } from '../../types';

  let { logs, routes }: { logs: MockRequestLog[]; routes: MockRoute[] } = $props();

  function getRouteName(routeId: string | null): string {
    if (!routeId) return '-';
    const route = routes.find(r => r.id === routeId);
    return route ? `${route.method} ${route.path}` : routeId;
  }

  function formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString();
  }

  const reversedLogs = $derived([...logs].reverse());
</script>

<div class="log-table-container">
  {#if logs.length === 0}
    <div class="empty">No requests logged yet. Start the server and send requests to see them here.</div>
  {:else}
    <table>
      <thead>
        <tr>
          <th>Time</th>
          <th>Method</th>
          <th>Path</th>
          <th>Matched Route</th>
          <th>Status</th>
          <th>Duration</th>
        </tr>
      </thead>
      <tbody>
        {#each reversedLogs as log (log.id)}
          <tr class:unmatched={!log.matchedRouteId}>
            <td class="time">{formatTime(log.timestamp)}</td>
            <td class="method method-{log.method.toLowerCase()}">{log.method}</td>
            <td class="path">{log.path}</td>
            <td class="route">{getRouteName(log.matchedRouteId)}</td>
            <td class="status" class:ok={log.statusCode < 400} class:error={log.statusCode >= 400}>{log.statusCode}</td>
            <td class="duration">{log.duration}ms</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .log-table-container {
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
    padding: 5px 8px;
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
  }

  .time {
    font-variant-numeric: tabular-nums;
    color: var(--hf-descriptionForeground);
  }

  .method {
    font-weight: 700;
    font-size: 11px;
  }

  .method-get { color: #61affe; }
  .method-post { color: #49cc90; }
  .method-put { color: #fca130; }
  .method-delete { color: #f93e3e; }
  .method-patch { color: #50e3c2; }

  .path {
    font-family: var(--hf-editor-font-family);
  }

  .route {
    color: var(--hf-descriptionForeground);
    font-size: 11px;
  }

  .status.ok { color: #49cc90; }
  .status.error { color: #f93e3e; }

  .duration {
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  tr.unmatched {
    background: rgba(249, 62, 62, 0.04);
  }

  .empty {
    font-size: 13px;
    color: var(--hf-descriptionForeground);
    text-align: center;
    padding: 24px;
  }
</style>
