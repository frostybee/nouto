<script lang="ts">
  import type { RedirectHop } from '@nouto/core';
  import CopyButton from './CopyButton.svelte';
  import Tooltip from './Tooltip.svelte';

  interface Props {
    chain: RedirectHop[];
    finalUrl?: string;
    finalStatus?: number;
  }
  let { chain, finalUrl, finalStatus }: Props = $props();

  // The actual final destination is the toUrl of the last hop, not the original request URL
  const resolvedFinalUrl = $derived(chain.length > 0 ? chain[chain.length - 1].toUrl : finalUrl);

  let expandedHops = $state<Set<number>>(new Set());

  function toggleHop(index: number) {
    const next = new Set(expandedHops);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    expandedHops = next;
  }

  function statusClass(status: number): string {
    if (status >= 300 && status < 400) return 'status-redirect';
    if (status >= 200 && status < 300) return 'status-success';
    if (status >= 400 && status < 500) return 'status-client-error';
    if (status >= 500) return 'status-server-error';
    return '';
  }

  function formatDuration(ms: number): string {
    if (ms < 1) return '<1 ms';
    return `${ms} ms`;
  }

  function truncateUrl(url: string, maxLen = 80): string {
    if (url.length <= maxLen) return url;
    return url.slice(0, maxLen) + '...';
  }
</script>

<div class="redirect-chain-viewer">
  <div class="chain-list">
    {#each chain as hop, i}
      <div class="hop-card">
        <div class="hop-connector">
          <div class="hop-number">{i + 1}</div>
          {#if i < chain.length - 1 || finalUrl}
            <div class="connector-line"></div>
          {/if}
        </div>

        <div class="hop-content">
          <button class="hop-summary" onclick={() => toggleHop(i)}>
            <i class="codicon {expandedHops.has(i) ? 'codicon-chevron-down' : 'codicon-chevron-right'} toggle-icon"></i>
            <span class="hop-status {statusClass(hop.status)}">{hop.status}</span>
            <span class="hop-method">{hop.method}</span>
            {#if hop.methodChanged}
              <Tooltip text="Method changed due to redirect status">
                <span class="method-changed">
                  <i class="codicon codicon-arrow-right method-arrow"></i>
                  GET
                </span>
              </Tooltip>
            {/if}
            <Tooltip text={hop.fromUrl}>
              <span class="hop-url">{truncateUrl(hop.fromUrl)}</span>
            </Tooltip>
            <span class="hop-duration">{formatDuration(hop.duration)}</span>
          </button>

          {#if expandedHops.has(i)}
            <div class="hop-details">
              <div class="detail-row">
                <span class="detail-label">From</span>
                <span class="detail-value url-value">
                  {hop.fromUrl}
                  <CopyButton text={hop.fromUrl} iconOnly size="sm" />
                </span>
              </div>
              <div class="detail-row">
                <span class="detail-label">To</span>
                <span class="detail-value url-value">
                  {hop.toUrl}
                  <CopyButton text={hop.toUrl} iconOnly size="sm" />
                </span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Duration</span>
                <span class="detail-value">{formatDuration(hop.duration)}</span>
              </div>

              {#if hop.setCookies.length > 0}
                <div class="detail-section">
                  <span class="detail-section-title">Set-Cookie ({hop.setCookies.length})</span>
                  {#each hop.setCookies as cookie}
                    <div class="cookie-value">{cookie}</div>
                  {/each}
                </div>
              {/if}

              {#if Object.keys(hop.headers).length > 0}
                <div class="detail-section">
                  <span class="detail-section-title">Response Headers ({Object.keys(hop.headers).length})</span>
                  <table class="headers-table">
                    <tbody>
                      {#each Object.entries(hop.headers) as [key, value]}
                        <tr>
                          <td class="header-key">{key}</td>
                          <td class="header-value">{value}</td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    {/each}

    <!-- Final destination -->
    {#if resolvedFinalUrl}
      <div class="hop-card final-card">
        <div class="hop-connector">
          <div class="hop-number final-number">
            <i class="codicon codicon-check"></i>
          </div>
        </div>
        <div class="hop-content">
          <div class="hop-summary final-summary">
            {#if finalStatus}
              <span class="hop-status {statusClass(finalStatus)}">{finalStatus}</span>
            {/if}
            <Tooltip text={resolvedFinalUrl}>
              <span class="hop-url">{truncateUrl(resolvedFinalUrl)}</span>
            </Tooltip>
            <CopyButton text={resolvedFinalUrl} iconOnly size="sm" />
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .redirect-chain-viewer {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow-y: auto;
    padding: 8px 12px;
  }

  .chain-list {
    display: flex;
    flex-direction: column;
  }

  .hop-card {
    display: flex;
    gap: 10px;
  }

  .hop-connector {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 24px;
    flex-shrink: 0;
  }

  .hop-number {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--hf-badge-background, #4d4d4d);
    color: var(--hf-badge-foreground, #fff);
    font-size: 10px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .final-number {
    background: var(--hf-charts-green, #66bb6a);
  }

  .connector-line {
    width: 2px;
    flex: 1;
    min-height: 8px;
    background: var(--hf-panel-border, #333);
  }

  .hop-content {
    flex: 1;
    min-width: 0;
    margin-bottom: 4px;
  }

  .hop-summary {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    border-radius: 3px;
    font-family: var(--hf-editor-font-family, Consolas, Monaco, monospace);
    font-size: 11px;
    line-height: 1.5;
    background: none;
    border: 1px solid transparent;
    color: var(--hf-foreground);
    cursor: pointer;
    width: 100%;
    text-align: left;
  }

  .hop-summary:hover {
    background: var(--hf-list-hoverBackground);
    border-color: var(--hf-panel-border);
  }

  .final-summary {
    cursor: default;
  }

  .final-summary:hover {
    background: none;
    border-color: transparent;
  }

  .toggle-icon {
    flex-shrink: 0;
    font-size: 10px;
    color: var(--hf-descriptionForeground);
  }

  .hop-status {
    flex-shrink: 0;
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 600;
  }

  .status-redirect {
    background: var(--hf-charts-yellow, #ffa726);
    color: #000;
  }

  .status-success {
    background: var(--hf-charts-green, #66bb6a);
    color: #000;
  }

  .status-client-error {
    background: var(--hf-charts-orange, #fca130);
    color: #000;
  }

  .status-server-error {
    background: var(--hf-editorError-foreground, #f44336);
    color: #fff;
  }

  .hop-method {
    flex-shrink: 0;
    font-weight: 600;
    color: var(--hf-foreground);
  }

  .method-changed {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    color: var(--hf-editorWarning-foreground, #ff9800);
    font-weight: 600;
  }

  .method-arrow {
    font-size: 10px;
  }

  .hop-url {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--hf-textLink-foreground, #3794ff);
  }

  .hop-duration {
    flex-shrink: 0;
    color: var(--hf-descriptionForeground);
    font-size: 10px;
    font-variant-numeric: tabular-nums;
    min-width: 55px;
    text-align: right;
  }

  /* Expanded details */
  .hop-details {
    margin: 2px 0 6px 26px;
    padding: 6px 10px;
    border-left: 2px solid var(--hf-panel-border, #333);
    font-size: 11px;
  }

  .detail-row {
    display: flex;
    gap: 8px;
    padding: 2px 0;
    line-height: 1.5;
  }

  .detail-label {
    flex-shrink: 0;
    min-width: 55px;
    color: var(--hf-descriptionForeground);
    font-weight: 500;
  }

  .detail-value {
    flex: 1;
    min-width: 0;
    color: var(--hf-foreground);
    font-family: var(--hf-editor-font-family, Consolas, Monaco, monospace);
  }

  .url-value {
    display: flex;
    align-items: center;
    gap: 4px;
    word-break: break-all;
  }

  .detail-section {
    margin-top: 6px;
    padding-top: 4px;
    border-top: 1px solid var(--hf-panel-border, #333);
  }

  .detail-section-title {
    display: block;
    color: var(--hf-descriptionForeground);
    font-weight: 500;
    margin-bottom: 4px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .cookie-value {
    padding: 2px 0;
    font-family: var(--hf-editor-font-family, Consolas, Monaco, monospace);
    font-size: 11px;
    color: var(--hf-foreground);
    word-break: break-all;
    line-height: 1.4;
  }

  .headers-table {
    width: 100%;
    border-collapse: collapse;
  }

  .headers-table tr {
    border-bottom: 1px solid var(--hf-panel-border, #333);
  }

  .headers-table td {
    padding: 2px 6px 2px 0;
    font-family: var(--hf-editor-font-family, Consolas, Monaco, monospace);
    font-size: 11px;
    vertical-align: top;
    line-height: 1.4;
  }

  .header-key {
    color: var(--hf-charts-blue, #42a5f5);
    white-space: nowrap;
    font-weight: 500;
    width: 1%;
  }

  .header-value {
    color: var(--hf-foreground);
    word-break: break-all;
  }
</style>
