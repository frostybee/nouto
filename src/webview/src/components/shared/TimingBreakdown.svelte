<script lang="ts">
  import type { TimingData } from '../../types';

  interface Props {
    timing: TimingData | null;
  }
  let { timing }: Props = $props();

  const phases = $derived.by(() => {
    if (!timing) return [];
    return [
      { label: 'DNS Lookup', value: timing.dnsLookup, color: '#26a69a' },
      { label: 'TCP Connection', value: timing.tcpConnection, color: '#66bb6a' },
      { label: 'TLS Handshake', value: timing.tlsHandshake, color: '#ab47bc' },
      { label: 'Time to First Byte', value: timing.ttfb, color: '#ffa726' },
      { label: 'Content Transfer', value: timing.contentTransfer, color: '#42a5f5' },
    ];
  });

  const total = $derived(timing?.total ?? 0);
</script>

<div class="timing-breakdown">
  {#if !timing}
    <p class="no-timing">No timing data available. Timing is captured on the next request.</p>
  {:else}
    <div class="timing-bar">
      {#each phases as phase}
        {#if phase.value > 0}
          <div
            class="bar-segment"
            style="flex: {phase.value}; background: {phase.color}"
            title="{phase.label}: {phase.value}ms"
          ></div>
        {/if}
      {/each}
    </div>

    <div class="timing-total">
      Total: <strong>{total}ms</strong>
    </div>

    <table class="timing-table">
      <tbody>
        {#each phases as phase}
          <tr>
            <td class="phase-indicator">
              <span class="phase-dot" style="background: {phase.color}"></span>
            </td>
            <td class="phase-label">{phase.label}</td>
            <td class="phase-value">{phase.value}ms</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .timing-breakdown {
    padding: 16px;
  }

  .no-timing {
    color: var(--hf-descriptionForeground);
    font-style: italic;
    font-size: 13px;
    margin: 0;
  }

  .timing-bar {
    display: flex;
    height: 24px;
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 8px;
    gap: 1px;
  }

  .bar-segment {
    min-width: 2px;
    transition: flex 0.3s ease;
  }

  .timing-total {
    font-size: 12px;
    color: var(--hf-descriptionForeground);
    margin-bottom: 16px;
    text-align: right;
  }

  .timing-total strong {
    color: var(--hf-foreground);
  }

  .timing-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  .timing-table tr {
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .timing-table td {
    padding: 6px 8px;
  }

  .phase-indicator {
    width: 20px;
  }

  .phase-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .phase-label {
    color: var(--hf-foreground);
  }

  .phase-value {
    text-align: right;
    font-family: var(--hf-editor-font-family, Consolas, Monaco, monospace);
    color: var(--hf-foreground);
    font-weight: 600;
  }
</style>
