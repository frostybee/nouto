<script lang="ts">
  import type { GqlSubEvent } from '../../types';

  let { event }: { event: GqlSubEvent } = $props();
  let expanded = $state(false);

  const isLong = $derived(event.data.length > 200);
  const displayData = $derived.by(() => {
    if (!event.data) return '';
    if (!expanded && isLong) return event.data.substring(0, 200) + '...';
    // Try to pretty-print JSON
    try {
      return JSON.stringify(JSON.parse(event.data), null, 2);
    } catch {
      return event.data;
    }
  });

  function formatTimestamp(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
  }

  function badgeColor(type: string): string {
    switch (type) {
      case 'data': return '#49cc90';
      case 'error': return '#f93e3e';
      case 'complete': return '#fca130';
      default: return 'var(--hf-badge-background)';
    }
  }
</script>

<div class="event-row" class:error={event.type === 'error'}>
  <div class="event-meta">
    <span class="timestamp">{formatTimestamp(event.timestamp)}</span>
    <span class="type-badge" style="background: {badgeColor(event.type)}">{event.type}</span>
  </div>
  {#if event.data}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="event-data" class:expandable={isLong} role="button" tabindex="0" onclick={() => isLong && (expanded = !expanded)}>
      {#if isLong}
        <span class="expand-hint">{expanded ? 'Collapse' : 'Expand'}</span>
      {/if}
      <pre>{displayData}</pre>
    </div>
  {/if}
</div>

<style>
  .event-row {
    padding: 4px 8px;
    border-bottom: 1px solid var(--hf-panel-border);
    font-size: 12px;
  }

  .event-row.error {
    background: rgba(249, 62, 62, 0.05);
  }

  .event-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 2px;
  }

  .timestamp {
    color: var(--hf-descriptionForeground);
    font-size: 10px;
    font-family: var(--hf-editor-font-family, monospace);
  }

  .type-badge {
    padding: 1px 6px;
    border-radius: 2px;
    font-size: 9px;
    text-transform: uppercase;
    font-weight: 600;
    color: #fff;
  }

  .event-data {
    cursor: default;
  }

  .event-data.expandable {
    cursor: pointer;
  }

  .event-data.expandable:hover {
    background: var(--hf-list-hoverBackground, rgba(255, 255, 255, 0.04));
    border-radius: 3px;
  }

  .expand-hint {
    font-size: 10px;
    color: var(--hf-textLink-foreground, #3794ff);
    opacity: 0.7;
    float: right;
  }

  .event-data.expandable:hover .expand-hint {
    opacity: 1;
  }

  .event-data pre {
    margin: 0;
    padding: 2px 0;
    font-family: var(--hf-editor-font-family, monospace);
    font-size: 11px;
    white-space: pre-wrap;
    word-break: break-all;
    color: var(--hf-foreground);
  }
</style>
