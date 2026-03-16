<script lang="ts">
  import type { WebSocketMessage } from '../../types';

  let { message }: { message: WebSocketMessage } = $props();
  let expanded = $state(false);

  const isSent = $derived(message.direction === 'sent');
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

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
  class="message-row"
  class:sent={isSent}
  class:received={!isSent}
>
  <div class="bubble-wrapper">
    <div class="bubble" class:expandable={isLong} role={isLong ? 'button' : undefined} tabindex={isLong ? 0 : undefined} onclick={() => isLong && (expanded = !expanded)}>
      <pre>{displayData}</pre>
      {#if isLong}
        <span class="expand-hint">{expanded ? 'Collapse' : 'Expand'}</span>
      {/if}
    </div>
    <div class="bubble-meta">
      <span class="timestamp">{formatTimestamp(message.timestamp)}</span>
      <span class="type-badge" class:sent-badge={isSent} class:received-badge={!isSent}>
        {message.type === 'binary' ? 'BIN' : 'TEXT'}
      </span>
      <span class="size">{formatSize(message.size)}</span>
    </div>
  </div>
</div>

<style>
  .message-row {
    display: flex;
    padding: 4px 12px;
  }

  .message-row.sent {
    justify-content: flex-end;
  }

  .message-row.received {
    justify-content: flex-start;
  }

  .bubble-wrapper {
    max-width: 75%;
    min-width: 60px;
  }

  .bubble {
    padding: 8px 12px;
    border-radius: 12px;
    cursor: default;
  }

  .sent .bubble {
    background: rgba(73, 204, 144, 0.12);
    border-bottom-right-radius: 4px;
  }

  .received .bubble {
    background: rgba(97, 175, 254, 0.12);
    border-bottom-left-radius: 4px;
  }

  .bubble.expandable {
    cursor: pointer;
  }

  .bubble.expandable:hover {
    filter: brightness(1.15);
  }

  .bubble pre {
    margin: 0;
    padding: 0;
    font-family: var(--hf-editor-font-family, monospace);
    font-size: 12px;
    white-space: pre-wrap;
    word-break: break-all;
    color: var(--hf-foreground);
  }

  .expand-hint {
    display: block;
    font-size: 10px;
    color: var(--hf-textLink-foreground, #3794ff);
    opacity: 0.7;
    margin-top: 4px;
  }

  .bubble.expandable:hover .expand-hint {
    opacity: 1;
  }

  .bubble-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 3px;
    padding: 0 4px;
  }

  .sent .bubble-meta {
    justify-content: flex-end;
  }

  .timestamp {
    color: var(--hf-descriptionForeground);
    font-size: 10px;
    font-family: var(--hf-editor-font-family, monospace);
  }

  .type-badge {
    padding: 0px 5px;
    border-radius: 3px;
    font-size: 9px;
    font-weight: 600;
    border: 1px solid;
    text-transform: uppercase;
  }

  .type-badge.sent-badge {
    background: #49cc9020;
    color: #49cc90;
    border-color: #49cc9040;
  }

  .type-badge.received-badge {
    background: #61affe20;
    color: #61affe;
    border-color: #61affe40;
  }

  .size {
    font-size: 10px;
    color: var(--hf-descriptionForeground);
  }
</style>
