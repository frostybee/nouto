<script lang="ts">
  import { sseStatus, sseEvents, sseError, sseEventCount, clearSSEEvents } from '../../stores/sse';
  import { postMessage } from '../../lib/vscode';
  import { request } from '../../stores/request';
  import { substituteVariables } from '../../stores/environment';
  import SSEEventRow from './SSEEventRow.svelte';
  import Tooltip from './Tooltip.svelte';

  let autoReconnect = $state(true);
  let filterType = $state('');

  const status = $derived($sseStatus);
  const events = $derived($sseEvents);
  const error = $derived($sseError);
  const count = $derived($sseEventCount);
  const isConnected = $derived(status === 'connected');
  const isConnecting = $derived(status === 'connecting');

  const filteredEvents = $derived(
    filterType ? events.filter(e => e.eventType === filterType) : events
  );

  const eventTypes = $derived([...new Set(events.map(e => e.eventType))]);

  function handleConnect() {
    const rawHeaders = Array.isArray($request.headers) ? $request.headers : [];
    const resolvedHeaders = rawHeaders.map(h => ({
      ...h,
      key: substituteVariables(h.key),
      value: substituteVariables(h.value),
    }));
    postMessage({
      type: 'sseConnect',
      data: {
        url: substituteVariables($request.url),
        headers: resolvedHeaders,
        autoReconnect,
        withCredentials: false,
      },
    });
  }

  function handleDisconnect() {
    postMessage({ type: 'sseDisconnect' });
  }

  function getStatusColor(s: string): string {
    switch (s) {
      case 'connected': return '#49cc90';
      case 'connecting': return '#fca130';
      case 'error': return '#f93e3e';
      default: return 'var(--hf-descriptionForeground)';
    }
  }
</script>

<div class="sse-panel">
  <div class="sse-toolbar">
    <div class="status-row">
      <span class="status-dot" style="background: {getStatusColor(status)}"></span>
      <span class="status-text">{status}</span>
      {#if error}
        <span class="error-text">{error}</span>
      {/if}
      <span class="event-count">{count} events</span>
    </div>

    <div class="controls-row">
      <label class="control-label">
        <input type="checkbox" bind:checked={autoReconnect} /> Auto-reconnect
      </label>

      {#if eventTypes.length > 0}
        <select class="filter-select" bind:value={filterType}>
          <option value="">All events</option>
          {#each eventTypes as type}
            <option value={type}>{type}</option>
          {/each}
        </select>
      {/if}

      <Tooltip text="Clear events">
        <button class="clear-btn" onclick={() => clearSSEEvents()} aria-label="Clear events">Clear</button>
      </Tooltip>

      {#if isConnected || isConnecting}
        <button class="disconnect-btn" onclick={handleDisconnect}>Disconnect</button>
      {:else}
        <button class="connect-btn" onclick={handleConnect}>Connect</button>
      {/if}
    </div>
  </div>

  <div class="event-log">
    {#if filteredEvents.length === 0}
      <p class="placeholder">
        {#if events.length > 0 && filterType}
          No events matching filter "{filterType}"
        {:else}
          No events yet. Connect to an SSE endpoint to start.
        {/if}
      </p>
    {:else}
      {#each filteredEvents as event (event.id)}
        <SSEEventRow {event} />
      {/each}
    {/if}
  </div>
</div>

<style>
  .sse-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .sse-toolbar {
    padding: 8px 12px;
    border-bottom: 1px solid var(--hf-panel-border);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .status-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .status-text {
    font-weight: 600;
    color: var(--hf-foreground);
    text-transform: capitalize;
  }

  .error-text {
    color: #f93e3e;
    font-size: 11px;
  }

  .event-count {
    margin-left: auto;
    color: var(--hf-descriptionForeground);
    font-size: 11px;
  }

  .controls-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .control-label {
    font-size: 11px;
    color: var(--hf-foreground);
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
  }

  .filter-select {
    padding: 3px 6px;
    background: var(--hf-dropdown-background);
    color: var(--hf-dropdown-foreground);
    border: 1px solid var(--hf-dropdown-border);
    border-radius: 3px;
    font-size: 11px;
  }

  .clear-btn,
  .connect-btn,
  .disconnect-btn {
    padding: 4px 12px;
    border-radius: 3px;
    border: none;
    font-size: 11px;
    cursor: pointer;
    font-weight: 500;
    margin-left: auto;
  }

  .clear-btn {
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    margin-left: 0;
  }

  .connect-btn {
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
  }

  .disconnect-btn {
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: 1px solid var(--hf-errorForeground);
  }

  .event-log {
    flex: 1;
    overflow-y: auto;
    padding: 4px;
  }

  .placeholder {
    color: var(--hf-descriptionForeground);
    font-style: italic;
    font-size: 13px;
    padding: 12px;
  }
</style>
