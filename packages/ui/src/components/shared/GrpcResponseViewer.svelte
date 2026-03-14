<script lang="ts">
  import { GRPC_STATUS_CODES } from '../../types';
  import { grpcConnection, grpcEvents, grpcConnectionHistory, selectPreviousConnection, grpcIsStreaming } from '../../stores/grpc.svelte';
  import { formatBytes } from '../../stores/response.svelte';
  import Tooltip from './Tooltip.svelte';
  import CodeMirrorEditor from './CodeMirrorEditor.svelte';

  let activeTab = $state<'response' | 'headers' | 'trailers'>('response');

  const connection = $derived(grpcConnection());
  const events = $derived(grpcEvents());
  const history = $derived(grpcConnectionHistory());
  const streaming = $derived(grpcIsStreaming());

  const serverMessages = $derived(events.filter(e => e.eventType === 'server_message'));
  const responseEvent = $derived(serverMessages[serverMessages.length - 1]);
  const errorEvent = $derived(events.find(e => e.eventType === 'error'));
  const isMultiMessage = $derived(serverMessages.length > 1);

  const statusLabel = $derived(
    connection ? (GRPC_STATUS_CODES[connection.status] || `Code ${connection.status}`) : ''
  );

  const statusClass = $derived(
    connection ? (connection.status === 0 ? 'success' : 'error') : ''
  );

  const headerEntries = $derived(
    connection ? Object.entries(connection.initialMetadata || {}) : []
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
        {#if streaming && connection.state !== 'closed'}
          <span class="status-badge streaming">Streaming</span>
          <span class="msg-count">{serverMessages.length} messages</span>
        {:else}
          <span class="status-badge {statusClass}">
            {statusLabel} {connection.status}
          </span>
          <span class="duration">{connection.elapsed}ms</span>
          {#if isMultiMessage}
            <span class="msg-count">{serverMessages.length} messages</span>
          {:else if responseEvent?.size}
            <span class="size">{formatBytes(responseEvent.size)}</span>
          {/if}
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
      {#if headerEntries.length > 0}
        <button class="tab" class:active={activeTab === 'headers'} onclick={() => activeTab = 'headers'}>
          Headers ({headerEntries.length})
        </button>
      {/if}
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
        {:else if isMultiMessage}
          <div class="event-log">
            {#each events.filter(e => e.eventType === 'server_message' || e.eventType === 'client_message') as evt, i}
              <div class="event-entry {evt.eventType === 'client_message' ? 'client' : 'server'}">
                <div class="event-header">
                  <span class="event-direction">{evt.eventType === 'client_message' ? 'Sent' : 'Received'}</span>
                  <span class="event-index">#{i + 1}</span>
                  <span class="event-time">{new Date(evt.createdAt).toLocaleTimeString()}</span>
                </div>
                <CodeMirrorEditor
                  content={evt.content}
                  language="json"
                  readonly={true}
                />
              </div>
            {/each}
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
      {:else if activeTab === 'headers'}
        <div class="trailers-list">
          {#each headerEntries as [key, value]}
            <div class="trailer-item">
              <span class="trailer-key">{key}</span>
              <span class="trailer-value">{value}</span>
            </div>
          {/each}
        </div>
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
  .status-badge.streaming { background: var(--vscode-progressBar-background, #0078d4); color: white; }
  .msg-count { color: var(--vscode-descriptionForeground); font-size: 11px; }
  .event-log { display: flex; flex-direction: column; gap: 8px; }
  .event-entry { border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border)); border-radius: 4px; overflow: hidden; }
  .event-entry.client { border-left: 3px solid var(--vscode-charts-blue, #2196f3); }
  .event-entry.server { border-left: 3px solid var(--vscode-charts-green, #4caf50); }
  .event-header { display: flex; align-items: center; gap: 8px; padding: 4px 8px; background: var(--vscode-editor-background); font-size: 11px; }
  .event-direction { font-weight: 600; color: var(--vscode-foreground); }
  .event-index { color: var(--vscode-descriptionForeground); }
  .event-time { color: var(--vscode-descriptionForeground); margin-left: auto; }
</style>
