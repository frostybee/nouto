<script lang="ts">
  import { GRPC_STATUS_CODES } from '../../types';
  import type { GrpcEvent } from '../../types';
  import { grpcConnection, grpcEvents, grpcConnectionHistory, selectPreviousConnection, grpcIsStreaming } from '../../stores/grpc.svelte';
  import { formatBytes } from '../../stores/response.svelte';
  import { ui, togglePanelLayout, setPanelLayout } from '../../stores/ui.svelte';
  import { resolvedShortcuts } from '../../stores/settings.svelte';
  import { bindingToDisplayString } from '../../lib/shortcuts';
  import Tooltip from './Tooltip.svelte';
  import CodeMirrorEditor from './CodeMirrorEditor.svelte';
  import AssertionResults from './AssertionResults.svelte';
  import { assertionResults } from '../../stores/assertions.svelte';

  let activeTab = $state<'response' | 'timeline'>('response');
  let expandedEventId = $state<string | null>(null);

  const connection = $derived(grpcConnection());
  const events = $derived(grpcEvents());
  const history = $derived(grpcConnectionHistory());
  const streaming = $derived(grpcIsStreaming());

  const serverMessages = $derived(events.filter(e => e.eventType === 'server_message'));
  const responseEvent = $derived(serverMessages[serverMessages.length - 1]);
  const errorEvent = $derived(events.find(e => e.eventType === 'error'));

  const statusLabel = $derived(
    connection ? (GRPC_STATUS_CODES[connection.status] || `Code ${connection.status}`) : ''
  );

  const statusClass = $derived(
    connection ? (connection.status === 0 ? 'success' : 'error') : ''
  );

  // Build unified timeline entries from connection lifecycle + events
  interface TimelineEntry {
    id: string;
    type: 'connecting' | 'client_message' | 'server_message' | 'metadata' | 'error' | 'complete' | 'info';
    label: string;
    icon: string;
    timestamp: string;
    expandable: boolean;
    content?: string;
    metadata?: Record<string, string>;
    size?: number;
    status?: number;
  }

  const timeline = $derived.by(() => {
    if (!connection) return [];
    const entries: TimelineEntry[] = [];

    // 1. Connecting entry
    entries.push({
      id: '__connecting',
      type: 'connecting',
      label: `Connecting to ${connection.url}`,
      icon: 'codicon-debug-start',
      timestamp: connection.createdAt,
      expandable: false,
    });

    // 2. Interleave actual events
    for (const evt of events) {
      if (evt.eventType === 'client_message') {
        entries.push({
          id: evt.id,
          type: 'client_message',
          label: 'Sent message',
          icon: 'codicon-arrow-up',
          timestamp: evt.createdAt,
          expandable: true,
          content: evt.content,
          size: evt.size,
        });
      } else if (evt.eventType === 'server_message') {
        entries.push({
          id: evt.id,
          type: 'server_message',
          label: 'Received response',
          icon: 'codicon-arrow-down',
          timestamp: evt.createdAt,
          expandable: true,
          content: evt.content,
          size: evt.size,
        });
      } else if (evt.eventType === 'error') {
        entries.push({
          id: evt.id,
          type: 'error',
          label: `Error: ${GRPC_STATUS_CODES[evt.status ?? 2] || 'UNKNOWN'} (${evt.status ?? 2})`,
          icon: 'codicon-error',
          timestamp: evt.createdAt,
          expandable: !!evt.error,
          content: evt.error,
          status: evt.status,
        });
      } else if (evt.eventType === 'info') {
        entries.push({
          id: evt.id,
          type: 'info',
          label: evt.content || 'Info',
          icon: 'codicon-info',
          timestamp: evt.createdAt,
          expandable: !!evt.metadata && Object.keys(evt.metadata).length > 0,
          metadata: evt.metadata,
        });
      }
    }

    // 3. Metadata received (from connection.initialMetadata, after first server event)
    const metaEntries = connection.initialMetadata ? Object.entries(connection.initialMetadata) : [];
    if (metaEntries.length > 0) {
      // Insert after the first server_message or error, before connection end
      const firstServerIdx = entries.findIndex(e => e.type === 'server_message' || e.type === 'error');
      const metaEntry: TimelineEntry = {
        id: '__metadata',
        type: 'metadata',
        label: `Received response metadata`,
        icon: 'codicon-list-unordered',
        timestamp: firstServerIdx >= 0 ? entries[firstServerIdx].timestamp : connection.createdAt,
        expandable: true,
        metadata: connection.initialMetadata,
      };
      if (firstServerIdx >= 0) {
        entries.splice(firstServerIdx, 0, metaEntry);
      } else {
        entries.push(metaEntry);
      }
    }

    // 4. Trailers (from connection.trailers, shown at the end)
    const trailerEntries = connection.trailers ? Object.entries(connection.trailers) : [];
    if (trailerEntries.length > 0 && connection.state === 'closed') {
      entries.push({
        id: '__trailers',
        type: 'metadata',
        label: `Received trailers`,
        icon: 'codicon-list-unordered',
        timestamp: connection.createdAt, // approximate
        expandable: true,
        metadata: connection.trailers,
      });
    }

    // 5. Connection complete (only if closed)
    if (connection.state === 'closed') {
      entries.push({
        id: '__complete',
        type: 'complete',
        label: 'Connection complete',
        icon: 'codicon-check',
        timestamp: connection.createdAt,
        expandable: false,
      });
    }

    return entries;
  });

  function toggleExpand(id: string) {
    expandedEventId = expandedEventId === id ? null : id;
  }

  function formatTime(iso: string): string {
    try {
      return new Date(iso).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 } as any);
    } catch {
      return iso;
    }
  }

  const panelLayout = $derived(ui.panelLayout);
  const shortcuts = $derived(resolvedShortcuts());
  const toggleLayoutDisplay = $derived.by(() => {
    const binding = shortcuts.get('toggleLayout');
    return binding ? bindingToDisplayString(binding) : 'Alt+L';
  });

  const testResults = $derived(assertionResults());

  let manualLayoutOverride = $state(false);

  function handleToggleLayout() {
    manualLayoutOverride = true;
    togglePanelLayout();
    setTimeout(() => { manualLayoutOverride = false; }, 5000);
  }

  function handleConnectionChange(e: Event) {
    selectPreviousConnection((e.target as HTMLSelectElement).value);
    expandedEventId = null;
  }
</script>

{#if connection}
  <div class="grpc-response">
    <!-- Status bar -->
    <div class="status-bar">
      <div class="status-info">
        <Tooltip text={panelLayout === 'vertical' ? `Switch to horizontal layout (${toggleLayoutDisplay})` : `Switch to vertical layout (${toggleLayoutDisplay})`}>
          <button
            class="layout-toggle-btn"
            onclick={handleToggleLayout}
            aria-label={panelLayout === 'vertical' ? 'Switch to horizontal layout' : 'Switch to vertical layout'}
          >
            <i class="codicon {panelLayout === 'vertical' ? 'codicon-split-horizontal' : 'codicon-split-vertical'}"></i>
          </button>
        </Tooltip>
        {#if streaming && connection.state !== 'closed'}
          <span class="status-badge streaming">Streaming</span>
          <span class="msg-count">{serverMessages.length} messages</span>
        {:else}
          <span class="status-badge {statusClass}">
            {statusLabel} {connection.status}
          </span>
          <span class="duration">{connection.elapsed}ms</span>
          {#if serverMessages.length > 1}
            <span class="msg-count">{serverMessages.length} messages</span>
          {:else if responseEvent?.size}
            <span class="size">{formatBytes(responseEvent.size)}</span>
          {/if}
        {/if}
      </div>
      {#if history.length > 1}
        <div class="status-actions">
          <select class="connection-select" value={connection.id} onchange={handleConnectionChange}>
            {#each history as conn, i}
              <option value={conn.id}>
                {i === 0 ? 'Latest' : `#${history.length - i}`} - {GRPC_STATUS_CODES[conn.status] || conn.status}
              </option>
            {/each}
          </select>
        </div>
      {/if}
    </div>

    <!-- Tabs -->
    <div class="response-tabs">
      <button class="tab" class:active={activeTab === 'response'} onclick={() => activeTab = 'response'}>Response</button>
      <button class="tab" class:active={activeTab === 'timeline'} onclick={() => activeTab = 'timeline'}>
        Timeline
        <span class="tab-badge">{events.length}</span>
      </button>
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
      {:else if activeTab === 'timeline'}
        <div class="timeline">
          {#each timeline as entry (entry.id)}
            {@const isExpanded = expandedEventId === entry.id}
            <div class="timeline-entry" class:expanded={isExpanded}>
              <button
                class="timeline-row"
                class:expandable={entry.expandable}
                class:type-connecting={entry.type === 'connecting'}
                class:type-client={entry.type === 'client_message'}
                class:type-server={entry.type === 'server_message'}
                class:type-metadata={entry.type === 'metadata' || entry.type === 'info'}
                class:type-error={entry.type === 'error'}
                class:type-complete={entry.type === 'complete'}
                onclick={() => entry.expandable && toggleExpand(entry.id)}
              >
                <span class="timeline-icon codicon {entry.icon}"></span>
                <span class="timeline-label">{entry.label}</span>
                {#if entry.size}
                  <span class="timeline-size">{formatBytes(entry.size)}</span>
                {/if}
                <span class="timeline-time">{formatTime(entry.timestamp)}</span>
                {#if entry.expandable}
                  <span class="timeline-chevron codicon codicon-chevron-right" class:open={isExpanded}></span>
                {/if}
              </button>

              {#if isExpanded}
                <div class="timeline-detail">
                  {#if entry.content && (entry.type === 'client_message' || entry.type === 'server_message')}
                    <CodeMirrorEditor
                      content={entry.content}
                      language="json"
                      readonly={true}
                    />
                  {:else if entry.content && entry.type === 'error'}
                    <div class="detail-error">{entry.content}</div>
                  {:else if entry.metadata}
                    <div class="detail-metadata">
                      {#each Object.entries(entry.metadata) as [key, value]}
                        <div class="metadata-row">
                          <span class="metadata-key">{key}</span>
                          <span class="metadata-value">{value}</span>
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      {#if testResults.length > 0}
        <AssertionResults results={testResults} />
      {/if}
    </div>
  </div>
{:else}
  <div class="grpc-response">
    <div class="status-bar">
      <div class="status-info">
        <Tooltip text={panelLayout === 'vertical' ? `Switch to horizontal layout (${toggleLayoutDisplay})` : `Switch to vertical layout (${toggleLayoutDisplay})`}>
          <button
            class="layout-toggle-btn"
            onclick={handleToggleLayout}
            aria-label={panelLayout === 'vertical' ? 'Switch to horizontal layout' : 'Switch to vertical layout'}
          >
            <i class="codicon {panelLayout === 'vertical' ? 'codicon-split-horizontal' : 'codicon-split-vertical'}"></i>
          </button>
        </Tooltip>
        <span class="status-idle">Ready</span>
      </div>
    </div>
  </div>
{/if}

<style>
  .grpc-response { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

  /* Status bar */
  .status-bar { display: flex; align-items: center; justify-content: space-between; padding: 6px 12px; border-bottom: 1px solid var(--vscode-widget-border, var(--vscode-panel-border)); }
  .status-info { display: flex; align-items: center; gap: 10px; font-size: 12px; }
  .status-badge { padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
  .status-badge.success { background: var(--vscode-testing-iconPassed, #388a34); color: white; }
  .status-badge.error { background: var(--vscode-testing-iconFailed, #f14c4c); color: white; }
  .status-badge.streaming { background: var(--vscode-progressBar-background, #0078d4); color: white; }
  .duration, .size, .msg-count { color: var(--vscode-descriptionForeground); font-size: 11px; }
  .status-actions { display: flex; align-items: center; gap: 6px; margin-left: auto; }
  .connection-select { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--vscode-widget-border)); border-radius: 3px; padding: 2px 6px; font-size: 11px; }
  .layout-toggle-btn { display: flex; align-items: center; justify-content: center; padding: 4px; background: transparent; border: 1px solid transparent; border-radius: 3px; color: var(--vscode-foreground); cursor: pointer; opacity: 0.6; transition: opacity 0.15s, background 0.15s, border-color 0.15s; }
  .layout-toggle-btn:hover { opacity: 1; background: var(--vscode-list-hoverBackground); border-color: var(--vscode-widget-border, var(--vscode-panel-border)); }
  .layout-toggle-btn .codicon { font-size: 14px; }
  .status-idle { color: var(--vscode-descriptionForeground); font-size: 12px; }

  /* Tabs */
  .response-tabs { display: flex; border-bottom: 1px solid var(--vscode-widget-border, var(--vscode-panel-border)); }
  .tab { display: inline-flex; align-items: center; gap: 6px; background: none; border: none; padding: 6px 12px; cursor: pointer; font-size: 12px; color: var(--vscode-foreground); border-bottom: 2px solid transparent; }
  .tab.active { border-bottom-color: var(--vscode-focusBorder); }
  .tab:hover:not(.active) { background: var(--vscode-list-hoverBackground); }
  .tab-badge { font-size: 10px; padding: 0 5px; border-radius: 8px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); font-weight: 600; line-height: 16px; }

  /* Response content */
  .response-content { flex: 1; overflow: auto; padding: 8px 12px; }
  .error-display { padding: 8px; }
  .error-status { color: var(--vscode-errorForeground); font-weight: 600; font-size: 13px; }
  .error-message { color: var(--vscode-foreground); margin-top: 8px; font-size: 13px; }
  .loading, .empty { color: var(--vscode-descriptionForeground); font-size: 13px; padding: 20px; text-align: center; }

  /* Timeline */
  .timeline { display: flex; flex-direction: column; gap: 1px; }

  .timeline-entry { border-radius: 4px; overflow: hidden; }
  .timeline-entry.expanded { background: var(--vscode-editor-background); }

  .timeline-row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 8px;
    background: transparent;
    border: none;
    border-left: 3px solid transparent;
    color: var(--vscode-foreground);
    font-size: 12px;
    text-align: left;
    transition: background 0.1s;
  }
  .timeline-row.expandable { cursor: pointer; }
  .timeline-row.expandable:hover { background: var(--vscode-list-hoverBackground); }

  /* Color accents by type */
  .timeline-row.type-connecting { border-left-color: var(--vscode-charts-blue, #2196f3); }
  .timeline-row.type-client { border-left-color: var(--vscode-charts-blue, #2196f3); }
  .timeline-row.type-server { border-left-color: var(--vscode-charts-green, #4caf50); }
  .timeline-row.type-metadata { border-left-color: var(--vscode-charts-yellow, #e0a30b); }
  .timeline-row.type-error { border-left-color: var(--vscode-charts-red, #f14c4c); }
  .timeline-row.type-complete { border-left-color: var(--vscode-charts-green, #4caf50); }

  /* Icon colors */
  .timeline-icon { font-size: 14px; flex-shrink: 0; width: 16px; text-align: center; }
  .type-connecting .timeline-icon { color: var(--vscode-charts-blue, #2196f3); }
  .type-client .timeline-icon { color: var(--vscode-charts-blue, #2196f3); }
  .type-server .timeline-icon { color: var(--vscode-charts-green, #4caf50); }
  .type-metadata .timeline-icon { color: var(--vscode-charts-yellow, #e0a30b); }
  .type-error .timeline-icon { color: var(--vscode-charts-red, #f14c4c); }
  .type-complete .timeline-icon { color: var(--vscode-charts-green, #4caf50); }

  .timeline-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .timeline-size { color: var(--vscode-descriptionForeground); font-size: 11px; flex-shrink: 0; }
  .timeline-time { color: var(--vscode-descriptionForeground); font-size: 11px; flex-shrink: 0; font-variant-numeric: tabular-nums; }
  .timeline-chevron { font-size: 10px; flex-shrink: 0; transition: transform 0.15s; color: var(--vscode-descriptionForeground); }
  .timeline-chevron.open { transform: rotate(90deg); }

  /* Expanded detail panel */
  .timeline-detail { padding: 6px 8px 8px 27px; }

  .detail-error {
    color: var(--vscode-errorForeground);
    font-size: 12px;
    padding: 6px 8px;
    background: var(--vscode-inputValidation-errorBackground, rgba(255, 0, 0, 0.1));
    border-radius: 3px;
    line-height: 1.4;
  }

  .detail-metadata { display: flex; flex-direction: column; gap: 2px; }
  .metadata-row {
    display: flex;
    gap: 12px;
    padding: 3px 8px;
    font-size: 12px;
    border-radius: 2px;
  }
  .metadata-row:nth-child(odd) { background: rgba(128, 128, 128, 0.06); }
  .metadata-key { color: var(--vscode-foreground); font-weight: 500; min-width: 160px; flex-shrink: 0; font-family: var(--vscode-editor-font-family, monospace); font-size: 11px; }
  .metadata-value { color: var(--vscode-descriptionForeground); word-break: break-all; font-family: var(--vscode-editor-font-family, monospace); font-size: 11px; }
</style>
