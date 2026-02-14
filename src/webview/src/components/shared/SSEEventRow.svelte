<script lang="ts">
  import type { SSEEvent } from '../../types';

  let { event }: { event: SSEEvent } = $props();
  let expanded = $state(false);

  const isLong = $derived(event.data.length > 200);
  const displayData = $derived(expanded || !isLong ? event.data : event.data.substring(0, 200) + '...');

  // Try to pretty-print if JSON
  const formattedData = $derived.by(() => {
    if (!expanded) return displayData;
    try {
      const parsed = JSON.parse(event.data);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return displayData;
    }
  });

  function formatTimestamp(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
  }

  const typeColors: Record<string, string> = {
    message: '#61affe',
    error: '#f93e3e',
    open: '#49cc90',
    ping: '#fca130',
  };

  const badgeColor = $derived(typeColors[event.eventType] || '#9012fe');
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="event-row" role="button" tabindex="0" onclick={() => isLong && (expanded = !expanded)}>
  <div class="event-meta">
    <span class="event-type" style="background: {badgeColor}20; color: {badgeColor}; border-color: {badgeColor}40">
      {event.eventType}
    </span>
    {#if event.eventId}
      <span class="event-id">id: {event.eventId}</span>
    {/if}
    <span class="timestamp">{formatTimestamp(event.timestamp)}</span>
  </div>
  <div class="event-data">
    <pre>{formattedData}</pre>
  </div>
</div>

<style>
  .event-row {
    padding: 4px 8px;
    border-bottom: 1px solid var(--vscode-panel-border);
    font-size: 12px;
    cursor: default;
  }

  .event-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 2px;
  }

  .event-type {
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 600;
    border: 1px solid;
  }

  .event-id {
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
    font-family: var(--vscode-editor-font-family, monospace);
  }

  .timestamp {
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
    font-family: var(--vscode-editor-font-family, monospace);
    margin-left: auto;
  }

  .event-data pre {
    margin: 0;
    padding: 2px 0;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 11px;
    white-space: pre-wrap;
    word-break: break-all;
    color: var(--vscode-foreground);
  }
</style>
