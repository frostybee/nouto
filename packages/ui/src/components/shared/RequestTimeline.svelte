<script lang="ts">
  import type { TimelineEvent, TimelineEventCategory } from '../../stores/response.svelte';

  interface Props {
    events: TimelineEvent[];
  }
  let { events }: Props = $props();

  const categoryIcons: Record<TimelineEventCategory, string> = {
    config: 'codicon-settings-gear',
    request: 'codicon-arrow-up',
    info: 'codicon-info',
    warning: 'codicon-warning',
    dns: 'codicon-globe',
    connection: 'codicon-plug',
    tls: 'codicon-lock',
    response: 'codicon-arrow-down',
    data: 'codicon-package',
  };

  const categoryColors: Record<TimelineEventCategory, string> = {
    config: 'var(--hf-descriptionForeground)',
    request: 'var(--hf-charts-blue, #42a5f5)',
    info: 'var(--hf-charts-yellow, #ffa726)',
    warning: 'var(--hf-editorWarning-foreground, #ff9800)',
    dns: 'var(--hf-charts-green, #66bb6a)',
    connection: 'var(--hf-charts-green, #66bb6a)',
    tls: 'var(--hf-charts-purple, #ab47bc)',
    response: 'var(--hf-charts-orange, #fca130)',
    data: 'var(--hf-charts-blue, #42a5f5)',
  };

  function formatTimestamp(epochMs: number): string {
    const d = new Date(epochMs);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    return `${hh}:${mm}:${ss}.${ms}`;
  }
</script>

<div class="request-timeline">
  {#if events.length === 0}
    <p class="empty-message">No timeline data available.</p>
  {:else}
    <div class="timeline-list">
      {#each events as event}
        <div class="timeline-row">
          <i
            class="timeline-icon codicon {categoryIcons[event.category]}"
            style="color: {categoryColors[event.category]}"
          ></i>
          <span class="timeline-text">{event.text}</span>
          <span class="timeline-time">{formatTimestamp(event.timestamp)}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .request-timeline {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .empty-message {
    color: var(--hf-descriptionForeground);
    font-style: italic;
    font-size: 13px;
    padding: 16px;
    margin: 0;
  }

  .timeline-list {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }

  .timeline-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 3px 12px;
    font-family: var(--hf-editor-font-family, Consolas, Monaco, monospace);
    font-size: 11px;
    line-height: 1.5;
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .timeline-row:hover {
    background: var(--hf-list-hoverBackground);
  }

  .timeline-icon {
    flex-shrink: 0;
    font-size: 12px;
    width: 16px;
    text-align: center;
  }

  .timeline-text {
    flex: 1;
    color: var(--hf-foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .timeline-time {
    flex-shrink: 0;
    color: var(--hf-descriptionForeground);
    font-size: 10px;
    font-variant-numeric: tabular-nums;
    text-align: right;
    min-width: 100px;
  }
</style>
