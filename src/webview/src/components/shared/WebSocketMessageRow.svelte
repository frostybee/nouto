<script lang="ts">
  import type { WebSocketMessage } from '../../types';

  let { message }: { message: WebSocketMessage } = $props();
  let expanded = $state(false);

  const isSent = $derived(message.direction === 'sent');
  const isLong = $derived(message.data.length > 200);
  const displayData = $derived(expanded || !isLong ? message.data : message.data.substring(0, 200) + '...');

  function formatTimestamp(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
</script>

<div class="message-row" class:sent={isSent} class:received={!isSent}>
  <div class="message-meta">
    <span class="direction-icon">{isSent ? '\u2191' : '\u2193'}</span>
    <span class="timestamp">{formatTimestamp(message.timestamp)}</span>
    <span class="type-badge">{message.type}</span>
    <span class="size">{formatSize(message.size)}</span>
  </div>
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="message-data" role="button" tabindex="0" onclick={() => isLong && (expanded = !expanded)}>
    <pre>{displayData}</pre>
  </div>
</div>

<style>
  .message-row {
    padding: 4px 8px;
    border-bottom: 1px solid var(--hf-panel-border);
    font-size: 12px;
  }

  .message-row.sent {
    background: rgba(73, 204, 144, 0.05);
  }

  .message-row.received {
    background: rgba(97, 175, 254, 0.05);
  }

  .message-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 2px;
  }

  .direction-icon {
    font-weight: bold;
    font-size: 14px;
  }

  .sent .direction-icon { color: #49cc90; }
  .received .direction-icon { color: #61affe; }

  .timestamp {
    color: var(--hf-descriptionForeground);
    font-size: 10px;
    font-family: var(--hf-editor-font-family, monospace);
  }

  .type-badge {
    padding: 0 4px;
    border-radius: 2px;
    font-size: 9px;
    text-transform: uppercase;
    background: var(--hf-badge-background);
    color: var(--hf-badge-foreground);
  }

  .size {
    font-size: 10px;
    color: var(--hf-descriptionForeground);
    margin-left: auto;
  }

  .message-data {
    cursor: default;
  }

  .message-data pre {
    margin: 0;
    padding: 2px 0;
    font-family: var(--hf-editor-font-family, monospace);
    font-size: 11px;
    white-space: pre-wrap;
    word-break: break-all;
    color: var(--hf-foreground);
  }
</style>
