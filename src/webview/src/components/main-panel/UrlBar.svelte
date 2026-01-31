<script lang="ts">
  import { request, setMethod, setUrl, isLoading, type HttpMethod } from '../../stores';
  import { postMessage } from '../../lib/vscode';

  const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

  const methodColors: Record<HttpMethod, string> = {
    GET: '#61affe',
    POST: '#49cc90',
    PUT: '#fca130',
    PATCH: '#50e3c2',
    DELETE: '#f93e3e',
    HEAD: '#9012fe',
    OPTIONS: '#0d5aa7',
  };

  $: currentMethod = $request.method;
  $: currentUrl = $request.url;
  $: loading = $isLoading;

  function handleMethodChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    setMethod(target.value as HttpMethod);
  }

  function handleUrlChange(event: Event) {
    const target = event.target as HTMLInputElement;
    setUrl(target.value);
  }

  function handleSend() {
    if (!currentUrl.trim() || loading) return;

    isLoading.set(true);

    // Build headers object from KeyValue array
    const headers: Record<string, string> = {};
    $request.headers.forEach((h) => {
      if (h.enabled && h.key) {
        headers[h.key] = h.value;
      }
    });

    // Build params object from KeyValue array
    const params: Record<string, string> = {};
    $request.params.forEach((p) => {
      if (p.enabled && p.key) {
        params[p.key] = p.value;
      }
    });

    postMessage({
      type: 'sendRequest',
      data: {
        method: currentMethod,
        url: currentUrl,
        headers,
        params,
        body: $request.body,
        auth: $request.auth,
      },
    });
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      handleSend();
    }
  }
</script>

<div class="url-bar">
  <select
    class="method-select"
    value={currentMethod}
    on:change={handleMethodChange}
    style="--method-color: {methodColors[currentMethod]}"
  >
    {#each methods as method}
      <option value={method}>{method}</option>
    {/each}
  </select>

  <input
    type="text"
    class="url-input"
    placeholder="Enter request URL..."
    value={currentUrl}
    on:input={handleUrlChange}
    on:keydown={handleKeydown}
  />

  <button
    class="send-button"
    on:click={handleSend}
    disabled={loading || !currentUrl.trim()}
  >
    {#if loading}
      Sending...
    {:else}
      Send
    {/if}
  </button>
</div>

<style>
  .url-bar {
    display: flex;
    gap: 8px;
    padding: 12px;
    background: var(--vscode-editor-background);
    border-bottom: 1px solid var(--vscode-panel-border);
  }

  .method-select {
    padding: 8px 12px;
    border-radius: 4px;
    background: var(--vscode-dropdown-background);
    color: var(--method-color, var(--vscode-dropdown-foreground));
    border: 1px solid var(--vscode-dropdown-border);
    min-width: 110px;
    cursor: pointer;
    font-weight: 600;
    font-size: 13px;
  }

  .method-select:focus {
    outline: none;
    border-color: var(--vscode-focusBorder);
  }

  .url-input {
    flex: 1;
    padding: 8px 12px;
    border-radius: 4px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    font-size: 13px;
  }

  .url-input:focus {
    outline: none;
    border-color: var(--vscode-focusBorder);
  }

  .url-input::placeholder {
    color: var(--vscode-input-placeholderForeground);
  }

  .send-button {
    padding: 8px 24px;
    border-radius: 4px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    cursor: pointer;
    font-weight: 500;
    font-size: 13px;
    transition: background 0.15s;
  }

  .send-button:hover:not(:disabled) {
    background: var(--vscode-button-hoverBackground);
  }

  .send-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
