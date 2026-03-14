<script lang="ts">
  import { GRPC_STATUS_CODES } from '../../types';
  import { grpcConnection, grpcEvents, grpcConnectionHistory, selectPreviousConnection } from '../../stores/grpc.svelte';
  import { formatBytes } from '../../stores/response.svelte';
  import Tooltip from './Tooltip.svelte';
  import CodeMirrorEditor from './CodeMirrorEditor.svelte';

  let activeTab = $state<'response' | 'trailers'>('response');

  const connection = $derived(grpcConnection());
  const events = $derived(grpcEvents());
  const history = $derived(grpcConnectionHistory());

  const responseEvent = $derived(events.find(e => e.eventType === 'server_message'));
  const errorEvent = $derived(events.find(e => e.eventType === 'error'));

  const statusLabel = $derived(
    connection ? (GRPC_STATUS_CODES[connection.status] || `Code ${connection.status}`) : ''
  );

  const statusClass = $derived(
    connection ? (connection.status === 0 ? 'success' : 'error') : ''
  );

  const trailerEntries = $derived(
    connection ? Object.entries(connection.trailers || {}) : []
  );

  function handleConnectionChange(e: Event) {
    selectPreviousConnection((e.target as HTMLSelectElement).value);
  }
</script>

{#if connection}
  <div class="grpc-response">
    <!-- Status bar -->
    <div class="status-bar">
      <div class="status-info">
        <span class="status-badge {statusClass}">
          {statusLabel} {connection.status}
        </span>
        <span class="duration">{connection.elapsed}ms</span>
        {#if responseEvent?.size}
          <span class="size">{formatBytes(responseEvent.size)}</span>
        {/if}
      </div>
      {#if history.length > 1}
        <select class="connection-select" value={connection.id} onchange={handleConnectionChange}>
          {#each history as conn, i}
            <option value={conn.id}>
              {i === 0 ? 'Latest' : `#${history.length - i}`} - {GRPC_STATUS_CODES[conn.status] || conn.status}
            </option>
          {/each}
        </select>
      {/if}
    </div>

    <!-- Tabs -->
    <div class="response-tabs">
      <button class="tab" class:active={activeTab === 'response'} onclick={() => activeTab = 'response'}>Response</button>
      {#if trailerEntries.length > 0}
        <button class="tab" class:active={activeTab === 'trailers'} onclick={() => activeTab = 'trailers'}>
          Trailers ({trailerEntries.length})
        </button>
      {/if}
    </div>

    <div class="response-content">
      {#if activeTab === 'response'}
        {#if errorEvent}
          <div class="error-display">
            <span class="error-status">gRPC Error: {GRPC_STATUS_CODES[errorEvent.status ?? 2] || 'UNKNOWN'} ({errorEvent.status ?? 2})</span>
            <p class="error-message">{errorEvent.error}</p>
          </div>
        {:else if responseEvent}
          <CodeMirrorEditor
            content={responseEvent.content}
            language="json"
            readonly={true}
          />
        {:else if connection.state === 'connecting'}
          <div class="loading">Connecting...</div>
        {:else}
          <div class="empty">No response data</div>
        {/if}
      {:else if activeTab === 'trailers'}
        <div class="trailers-list">
          {#each trailerEntries as [key, value]}
            <div class="trailer-item">
              <span class="trailer-key">{key}</span>
              <span class="trailer-value">{value}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .grpc-response { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
  .status-bar { display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; border-bottom: 1px solid var(--vscode-widget-border, var(--vscode-panel-border)); }
  .status-info { display: flex; align-items: center; gap: 10px; font-size: 12px; }
  .status-badge { padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
  .status-badge.success { background: var(--vscode-testing-iconPassed, #388a34); color: white; }
  .status-badge.error { background: var(--vscode-testing-iconFailed, #f14c4c); color: white; }
  .duration, .size { color: var(--vscode-descriptionForeground); }
  .connection-select { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--vscode-widget-border)); border-radius: 3px; padding: 2px 6px; font-size: 11px; }
  .response-tabs { display: flex; border-bottom: 1px solid var(--vscode-widget-border, var(--vscode-panel-border)); }
  .tab { background: none; border: none; padding: 6px 12px; cursor: pointer; font-size: 12px; color: var(--vscode-foreground); border-bottom: 2px solid transparent; }
  .tab.active { border-bottom-color: var(--vscode-focusBorder); }
  .tab:hover:not(.active) { background: var(--vscode-list-hoverBackground); }
  .response-content { flex: 1; overflow: auto; padding: 8px; }
  .error-display { padding: 8px; }
  .error-status { color: var(--vscode-errorForeground); font-weight: 600; font-size: 13px; }
  .error-message { color: var(--vscode-foreground); margin-top: 8px; font-size: 13px; }
  .loading, .empty { color: var(--vscode-descriptionForeground); font-size: 13px; padding: 20px; text-align: center; }
  .trailers-list { display: flex; flex-direction: column; gap: 4px; }
  .trailer-item { display: flex; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--vscode-widget-border, transparent); font-size: 12px; }
  .trailer-key { color: var(--vscode-foreground); font-weight: 500; min-width: 120px; }
  .trailer-value { color: var(--vscode-descriptionForeground); word-break: break-all; }
</style>
