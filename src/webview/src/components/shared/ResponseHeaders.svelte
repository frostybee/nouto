<script lang="ts">
  interface Props {
    headers?: Record<string, string>;
  }
  let { headers = {} }: Props = $props();

  let copiedKey: string | null = $state(null);
  let copyFailed = $state(false);
  let copyTimeout: ReturnType<typeof setTimeout>;

  const headerEntries = $derived(Object.entries(headers));
  const headerCount = $derived(headerEntries.length);

  async function copyHeader(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(`${key}: ${value}`);
      copiedKey = key;
      clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => {
        copiedKey = null;
      }, 1500);
    } catch {
      copyFailed = true;
      clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => { copyFailed = false; }, 2000);
    }
  }

  async function copyAllHeaders() {
    try {
      const text = headerEntries.map(([k, v]) => `${k}: ${v}`).join('\n');
      await navigator.clipboard.writeText(text);
      copiedKey = '__all__';
      clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => {
        copiedKey = null;
      }, 1500);
    } catch {
      copyFailed = true;
      clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => { copyFailed = false; }, 2000);
    }
  }
</script>

<div class="response-headers">
  <div class="headers-toolbar">
    <span class="header-count">{headerCount} header{headerCount !== 1 ? 's' : ''}</span>
    <button class="copy-all-btn" onclick={copyAllHeaders}>
      {#if copyFailed}
        <span class="copy-failed">Copy failed</span>
      {:else if copiedKey === '__all__'}
        <i class="codicon codicon-check"></i> Copied
      {:else}
        Copy All
      {/if}
    </button>
  </div>

  {#if headerCount === 0}
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
        {#each headerEntries as [key, value]}
          <tr class="header-row">
            <td class="header-key">{key}</td>
            <td class="header-value">{value}</td>
            <td class="header-action">
              <button
                class="copy-btn"
                onclick={() => copyHeader(key, value)}
                title="Copy header"
              >
                {#if copiedKey === key}
                  <i class="codicon codicon-check"></i>
                {:else}
                  <i class="codicon codicon-clippy"></i>
                {/if}
              </button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .response-headers {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .headers-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--vscode-panel-border);
  }

  .header-count {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .copy-all-btn {
    padding: 4px 10px;
    background: transparent;
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    transition: background 0.15s, border-color 0.15s;
  }

  .copy-all-btn:hover {
    background: var(--vscode-list-hoverBackground);
    border-color: var(--vscode-focusBorder);
  }

  .empty-message {
    color: var(--vscode-descriptionForeground);
    font-style: italic;
    font-size: 13px;
    margin: 0;
  }

  .headers-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    font-family: var(--vscode-editor-font-family, monospace);
    table-layout: auto;
  }

  .headers-table th {
    text-align: left;
    font-size: 10px;
    font-weight: 600;
    color: var(--vscode-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 4px 10px 6px;
    border-bottom: 1px solid var(--vscode-panel-border);
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
    background: var(--vscode-list-hoverBackground);
  }

  .header-row td {
    padding: 5px 10px;
    vertical-align: top;
  }

  .header-key {
    color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe);
    font-weight: 500;
    white-space: nowrap;
  }

  .header-value {
    color: var(--vscode-foreground);
    word-break: break-all;
  }

  .header-action {
    text-align: center;
  }

  .copy-btn {
    padding: 2px 6px;
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 11px;
    opacity: 0;
    transition: opacity 0.15s;
    border-radius: 3px;
    color: var(--vscode-foreground);
  }

  .header-row:hover .copy-btn {
    opacity: 0.6;
  }

  .copy-btn:hover {
    opacity: 1 !important;
    background: var(--vscode-list-hoverBackground);
  }

  .copy-failed {
    color: var(--vscode-errorForeground, #f44336);
    font-size: 11px;
  }
</style>
