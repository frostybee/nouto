<script lang="ts">
  import CopyButton from './CopyButton.svelte';

  interface Props {
    headers?: Record<string, string>;
    httpVersion?: string;
    remoteAddress?: string;
    requestHeaders?: Record<string, string>;
    requestUrl?: string;
  }
  let {
    headers = {},
    httpVersion,
    remoteAddress,
    requestHeaders = {},
    requestUrl,
  }: Props = $props();

  const responseEntries = $derived(Object.entries(headers));
  const responseCount = $derived(responseEntries.length);
  const requestEntries = $derived(Object.entries(requestHeaders));
  const requestCount = $derived(requestEntries.length);

  let infoOpen = $state(true);
  let requestOpen = $state(true);
  let responseOpen = $state(true);

  const versionDisplay = $derived(
    httpVersion ? `HTTP/${httpVersion}` : undefined
  );

  function formatAllHeaders(entries: [string, string][]): string {
    return entries.map(([k, v]) => `${k}: ${v}`).join('\n');
  }
</script>

<div class="response-headers">
  <!-- Info Section -->
  {#if requestUrl || remoteAddress || versionDisplay}
    <section class="section">
      <button class="section-header" onclick={() => infoOpen = !infoOpen}>
        <i class="codicon {infoOpen ? 'codicon-chevron-down' : 'codicon-chevron-right'}"></i>
        <span class="section-title">Info</span>
      </button>
      {#if infoOpen}
        <table class="info-table">
          <tbody>
            {#if requestUrl}
              <tr class="info-row">
                <td class="info-key">Request URL</td>
                <td class="info-value">
                  <span class="url-text">{requestUrl}</span>
                  <CopyButton text={requestUrl} iconOnly title="Copy URL" size="sm" class="inline-copy" />
                </td>
              </tr>
            {/if}
            {#if remoteAddress}
              <tr class="info-row">
                <td class="info-key">Remote Address</td>
                <td class="info-value">{remoteAddress}</td>
              </tr>
            {/if}
            {#if versionDisplay}
              <tr class="info-row">
                <td class="info-key">Version</td>
                <td class="info-value">{versionDisplay}</td>
              </tr>
            {/if}
          </tbody>
        </table>
      {/if}
    </section>
  {/if}

  <!-- Request Headers Section -->
  {#if requestCount > 0}
    <section class="section">
      <button class="section-header" onclick={() => requestOpen = !requestOpen}>
        <i class="codicon {requestOpen ? 'codicon-chevron-down' : 'codicon-chevron-right'}"></i>
        <span class="section-title-wrap">
          <span class="section-title">Request Headers</span>
          <span class="section-badge">{requestCount}</span>
        </span>
        {#if requestOpen}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <span class="section-actions" onclick={(e) => e.stopPropagation()}>
            <CopyButton text={formatAllHeaders(requestEntries)} label="Copy All" size="sm" class="copy-all-btn" />
          </span>
        {/if}
      </button>
      {#if requestOpen}
        <table class="headers-table">
          <thead>
            <tr>
              <th class="col-name">Name</th>
              <th class="col-value">Value</th>
              <th class="col-action"></th>
            </tr>
          </thead>
          <tbody>
            {#each requestEntries as [key, value]}
              <tr class="header-row">
                <td class="header-key">{key}</td>
                <td class="header-value">{value}</td>
                <td class="header-action">
                  <CopyButton text={`${key}: ${value}`} iconOnly title="Copy header" class="copy-btn" />
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>
  {/if}

  <!-- Response Headers Section -->
  <section class="section">
    <button class="section-header" onclick={() => responseOpen = !responseOpen}>
      <i class="codicon {responseOpen ? 'codicon-chevron-down' : 'codicon-chevron-right'}"></i>
      <span class="section-title-wrap">
        <span class="section-title">Response Headers</span>
        <span class="section-badge">{responseCount}</span>
      </span>
      {#if responseOpen && responseCount > 0}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <span class="section-actions" onclick={(e) => e.stopPropagation()}>
          <CopyButton text={formatAllHeaders(responseEntries)} label="Copy All" size="sm" class="copy-all-btn" />
        </span>
      {/if}
    </button>
    {#if responseOpen}
      {#if responseCount === 0}
        <p class="empty-message">No headers in response</p>
      {:else}
        <table class="headers-table">
          <thead>
            <tr>
              <th class="col-name">Name</th>
              <th class="col-value">Value</th>
              <th class="col-action"></th>
            </tr>
          </thead>
          <tbody>
            {#each responseEntries as [key, value]}
              <tr class="header-row">
                <td class="header-key">{key}</td>
                <td class="header-value">{value}</td>
                <td class="header-action">
                  <CopyButton text={`${key}: ${value}`} iconOnly title="Copy header" class="copy-btn" />
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    {/if}
  </section>
</div>

<style>
  .response-headers {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .section {
    border: 1px solid var(--hf-panel-border);
    border-radius: 4px;
    overflow: hidden;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 6px 10px;
    background: rgba(128, 128, 128, 0.06);
    border: none;
    cursor: pointer;
    color: var(--hf-foreground);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    text-align: left;
    transition: background 0.1s;
  }

  .section-header:hover {
    background: rgba(128, 128, 128, 0.12);
  }

  .section-header .codicon {
    font-size: 12px;
    color: var(--hf-descriptionForeground);
  }

  .section-title-wrap {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: 0 0 auto;
  }

  .section-badge {
    font-size: 9px;
    font-weight: 600;
    color: var(--hf-badge-foreground);
    background: var(--hf-badge-background);
    padding: 2px 5px;
    border-radius: 3px;
    line-height: 1;
    position: relative;
    top: -5px;
  }

  .section-actions {
    margin-left: auto;
  }

  :global(.copy-all-btn) {
    font-size: 10px !important;
  }

  .info-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    font-family: var(--hf-editor-font-family, monospace);
  }

  .info-row td {
    padding: 4px 10px;
    vertical-align: top;
  }

  .info-row:nth-child(even) {
    background: rgba(128, 128, 128, 0.04);
  }

  .info-row:hover {
    background: var(--hf-list-hoverBackground);
  }

  .info-key {
    color: var(--hf-descriptionForeground);
    font-weight: 500;
    white-space: nowrap;
    width: 1%;
    padding-right: 24px !important;
  }

  .info-value {
    color: var(--hf-foreground);
    word-break: break-all;
  }

  .url-text {
    margin-right: 4px;
  }

  :global(.inline-copy) {
    vertical-align: middle;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .info-row:hover :global(.inline-copy) {
    opacity: 0.6;
  }

  .info-row:hover :global(.inline-copy:hover) {
    opacity: 1;
  }

  .empty-message {
    color: var(--hf-descriptionForeground);
    font-style: italic;
    font-size: 13px;
    margin: 0;
    padding: 8px 10px;
  }

  .headers-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    font-family: var(--hf-editor-font-family, monospace);
    table-layout: auto;
  }

  .headers-table th {
    text-align: left;
    font-size: 10px;
    font-weight: 600;
    color: var(--hf-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 4px 10px 6px;
    border-bottom: 1px solid var(--hf-panel-border);
  }

  .col-name {
    width: 1%;
    white-space: nowrap;
  }

  .col-value {
    width: 100%;
  }

  .col-action {
    width: 32px;
  }

  .header-row {
    transition: background 0.1s;
  }

  .header-row:nth-child(even) {
    background: rgba(128, 128, 128, 0.04);
  }

  .header-row:hover {
    background: var(--hf-list-hoverBackground);
  }

  .header-row td {
    padding: 5px 10px;
    vertical-align: top;
  }

  .header-key {
    color: var(--hf-symbolIcon-propertyForeground, #9cdcfe);
    font-weight: 500;
    white-space: nowrap;
  }

  .header-value {
    color: var(--hf-foreground);
    word-break: break-all;
  }

  .header-action {
    text-align: center;
  }

  :global(.copy-btn) {
    padding: 2px 6px;
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 11px;
    opacity: 0;
    transition: opacity 0.15s;
    border-radius: 3px;
    color: var(--hf-foreground);
  }

  .header-row:hover :global(.copy-btn) {
    opacity: 0.6;
  }

  :global(.copy-btn:hover) {
    opacity: 1 !important;
    background: var(--hf-list-hoverBackground);
  }
</style>
