<script lang="ts">
  import type { WebSocketMessage } from '../../types';

  let { message }: { message: WebSocketMessage } = $props();
  let expanded = $state(false);

  const isSent = $derived(message.direction === 'sent');
  const directionColor = $derived(isSent ? '#49cc90' : '#61affe');
  const isLong = $derived(message.data.length > 200);

  const parsedJson = $derived.by(() => {
    const d = message.data;
    if (d.length > 0 && (d[0] === '{' || d[0] === '[')) {
      try { return JSON.parse(d); } catch { return null; }
    }
    return null;
  });

  const displayData = $derived.by(() => {
    if (expanded && parsedJson) {
      return JSON.stringify(parsedJson, null, 2);
    }
    if (expanded || !isLong) return message.data;
    return message.data.substring(0, 200) + '...';
  });

  function formatTimestamp(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
</script>

<div
  class="message-row"
  class:sent={isSent}
  class:received={!isSent}
  style="border-left: 3px solid {directionColor}"
>
  <div class="message-meta">
    <span class="timestamp">{formatTimestamp(message.timestamp)}</span>
    <span class="direction-arrow" style="color: {directionColor}">{isSent ? '\u2191' : '\u2193'}</span>
    <span class="type-badge" style="background: {directionColor}20; color: {directionColor}; border-color: {directionColor}40">
      {message.type === 'binary' ? 'BIN' : 'TEXT'}
    </span>
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <span
      class="message-content"
      class:expandable={isLong}
      role={isLong ? 'button' : undefined}
      tabindex={isLong ? 0 : undefined}
      onclick={() => isLong && (expanded = !expanded)}
    >
      <pre>{displayData}</pre>
      {#if isLong}
        <span class="expand-hint">{expanded ? 'Collapse' : 'Expand'}</span>
      {/if}
    </span>
    <span class="size">{formatSize(message.size)}</span>
  </div>
</div>

<style>
  .message-row {
    padding: 6px 8px;
    border-bottom: 1px solid var(--hf-panel-border);
    font-size: 12px;
  }

  .message-row.sent {
    background: rgba(73, 204, 144, 0.10);
  }

  .message-row.received {
    background: rgba(97, 175, 254, 0.10);
  }

  .message-meta {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }

  .timestamp {
    color: var(--hf-descriptionForeground);
    font-size: 10px;
    font-family: var(--hf-editor-font-family, monospace);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .direction-arrow {
    font-weight: bold;
    font-size: 12px;
    flex-shrink: 0;
  }

  .type-badge {
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 600;
    border: 1px solid;
    text-transform: uppercase;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .message-content {
    flex: 1;
    min-width: 0;
    cursor: default;
  }

  .message-content.expandable {
    cursor: pointer;
  }

  .message-content.expandable:hover {
    background: var(--hf-list-hoverBackground, rgba(255, 255, 255, 0.04));
    border-radius: 3px;
  }

  .message-content pre {
    margin: 0;
    padding: 0;
    font-family: var(--hf-editor-font-family, monospace);
    font-size: 12px;
    white-space: pre-wrap;
    word-break: break-all;
    color: var(--hf-foreground);
    display: inline;
  }

  .expand-hint {
    font-size: 10px;
    color: var(--hf-textLink-foreground, #3794ff);
    opacity: 0.7;
    margin-left: 8px;
    white-space: nowrap;
  }

  .message-content.expandable:hover .expand-hint {
    opacity: 1;
  }

  .size {
    font-size: 10px;
    color: var(--hf-descriptionForeground);
    white-space: nowrap;
    flex-shrink: 0;
    margin-left: auto;
  }
</style>
