<script lang="ts">
  import type { TimingData } from '../../types';

  interface Props {
    timing: TimingData | null;
    timeout?: number;
    followRedirects?: boolean;
    maxRedirects?: number;
  }
  let { timing, timeout, followRedirects, maxRedirects }: Props = $props();

  interface WaterfallPhase {
    label: string;
    value: number;
    offset: number;  // cumulative start position in ms
    color: string;
    borderColor?: string;
    dashed?: boolean;
  }

  const phases = $derived.by((): WaterfallPhase[] => {
    if (!timing) return [];
    let offset = 0;
    const result: WaterfallPhase[] = [];

    const add = (label: string, value: number, color: string, opts?: { borderColor?: string; dashed?: boolean }) => {
      result.push({ label, value, offset, color, ...opts });
      offset += value;
    };

    add('DNS Lookup', timing.dnsLookup, '#26a69a');
    add('TCP Handshake', timing.tcpConnection, '#66bb6a');
    add('TLS Handshake', timing.tlsHandshake, '#ab47bc');
    add('Waiting (TTFB)', timing.ttfb, 'transparent', { borderColor: '#ffa726', dashed: true });
    add('Download', timing.contentTransfer, '#42a5f5');

    return result;
  });

  const total = $derived(timing?.total ?? 0);

  function formatMs(ms: number): string {
    if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
    return `${ms.toFixed(2)}ms`;
  }
</script>

<div class="timing-breakdown">
  {#if !timing}
    <p class="no-timing">No timing data available. Timing is captured on the next request.</p>
  {:else}
    <!-- Response time header -->
    <div class="response-time-header">
      <span class="rt-label">Response Time</span>
      <span class="rt-value">{formatMs(total)}</span>
    </div>

    <!-- Waterfall chart -->
    <div class="waterfall">
      {#each phases as phase}
        <div class="waterfall-row">
          <div class="wf-label">
            <span class="phase-dot" style="background: {phase.borderColor ?? phase.color}"></span>
            {phase.label}
          </div>
          <div class="wf-bar-track">
            {#if phase.value > 0}
              <div
                class="wf-bar"
                class:wf-bar-dashed={phase.dashed}
                style="
                  left: {total > 0 ? (phase.offset / total) * 100 : 0}%;
                  width: {total > 0 ? Math.max((phase.value / total) * 100, 0.5) : 0}%;
                  background: {phase.color};
                  {phase.borderColor ? `border: 1.5px dashed ${phase.borderColor};` : ''}
                "
                title="{phase.label}: {formatMs(phase.value)}"
              ></div>
            {/if}
          </div>
          <div class="wf-value">
            {#if phase.value === 0}
              <span class="wf-cache">Cache</span>
            {:else}
              {formatMs(phase.value)}
            {/if}
          </div>
        </div>
      {/each}
    </div>

    <!-- Config section -->
    <div class="config-section">
      <div class="config-title">Request Config</div>
      <table class="timing-table">
        <tbody>
          <tr>
            <td class="phase-indicator">
              <span class="config-icon codicon codicon-watch"></span>
            </td>
            <td class="phase-label">Timeout</td>
            <td class="phase-value">{timeout ? `${timeout}ms` : '30000ms (default)'}</td>
          </tr>
          <tr>
            <td class="phase-indicator">
              <span class="config-icon codicon codicon-arrow-swap"></span>
            </td>
            <td class="phase-label">Follow Redirects</td>
            <td class="phase-value">{followRedirects === false ? 'Off' : 'On'}</td>
          </tr>
          {#if followRedirects !== false}
            <tr>
              <td class="phase-indicator">
                <span class="config-icon codicon codicon-layers"></span>
              </td>
              <td class="phase-label">Max Redirects</td>
              <td class="phase-value">{maxRedirects ?? '10 (default)'}</td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>
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

  /* Response time header */
  .response-time-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    margin-bottom: 12px;
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .rt-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--hf-foreground);
  }

  .rt-value {
    font-size: 13px;
    font-weight: 700;
    font-family: var(--hf-editor-font-family, Consolas, Monaco, monospace);
    color: var(--hf-foreground);
  }

  /* Waterfall chart */
  .waterfall {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 16px;
  }

  .waterfall-row {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 28px;
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .phase-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .wf-label {
    width: 145px;
    flex-shrink: 0;
    font-size: 12px;
    color: var(--hf-foreground);
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 6px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .wf-bar-track {
    flex: 1;
    position: relative;
    height: 14px;
    min-width: 0;
  }

  .wf-bar {
    position: absolute;
    top: 0;
    height: 100%;
    border-radius: 2px;
    min-width: 3px;
    transition: left 0.3s ease, width 0.3s ease;
  }

  .wf-bar-dashed {
    background: transparent !important;
  }

  .wf-value {
    width: 72px;
    flex-shrink: 0;
    text-align: right;
    font-size: 12px;
    font-family: var(--hf-editor-font-family, Consolas, Monaco, monospace);
    font-weight: 600;
    color: var(--hf-foreground);
  }

  .wf-cache {
    color: var(--hf-descriptionForeground);
    font-weight: 400;
    font-style: italic;
  }

  /* Config section */
  .config-section {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid var(--hf-panel-border);
  }

  .config-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--hf-descriptionForeground);
    margin-bottom: 8px;
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

  .phase-label {
    color: var(--hf-foreground);
  }

  .phase-value {
    text-align: right;
    font-family: var(--hf-editor-font-family, Consolas, Monaco, monospace);
    color: var(--hf-foreground);
    font-weight: 600;
  }

  .config-icon {
    font-size: 12px;
    color: var(--hf-descriptionForeground);
  }
</style>
