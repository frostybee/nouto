<script lang="ts">
  export let headers: Record<string, string> = {};

  let copiedKey: string | null = null;
  let copyTimeout: ReturnType<typeof setTimeout>;

  $: headerEntries = Object.entries(headers);
  $: headerCount = headerEntries.length;

  async function copyHeader(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(`${key}: ${value}`);
      copiedKey = key;
      clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => {
        copiedKey = null;
      }, 1500);
    } catch (err) {
      console.error('Failed to copy:', err);
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
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }
</script>

<div class="response-headers">
  <div class="headers-toolbar">
    <span class="header-count">{headerCount} header{headerCount !== 1 ? 's' : ''}</span>
    <button class="copy-all-btn" on:click={copyAllHeaders}>
      {#if copiedKey === '__all__'}
        ✓ Copied
      {:else}
        Copy All
      {/if}
    </button>
  </div>

  {#if headerCount === 0}
    <p class="empty-message">No headers in response</p>
  {:else}
    <div class="headers-list">
      {#each headerEntries as [key, value]}
        <div class="header-row">
          <span class="header-key">{key}</span>
          <span class="header-value">{value}</span>
          <button
            class="copy-btn"
            on:click={() => copyHeader(key, value)}
            title="Copy header"
          >
            {#if copiedKey === key}
              ✓
            {:else}
              📋
            {/if}
          </button>
        </div>
      {/each}
    </div>
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

  .headers-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .header-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 6px 8px;
    background: var(--vscode-textCodeBlock-background);
    border-radius: 4px;
    font-size: 12px;
    font-family: var(--vscode-editor-font-family), monospace;
  }

  .header-row:hover {
    background: var(--vscode-list-hoverBackground);
  }

  .header-key {
    color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe);
    flex-shrink: 0;
    font-weight: 500;
  }

  .header-key::after {
    content: ':';
    color: var(--vscode-foreground);
  }

  .header-value {
    flex: 1;
    color: var(--vscode-foreground);
    word-break: break-all;
  }

  .copy-btn {
    flex-shrink: 0;
    padding: 2px 6px;
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 11px;
    opacity: 0;
    transition: opacity 0.15s;
    border-radius: 3px;
  }

  .header-row:hover .copy-btn {
    opacity: 0.6;
  }

  .copy-btn:hover {
    opacity: 1 !important;
    background: var(--vscode-list-hoverBackground);
  }
</style>
