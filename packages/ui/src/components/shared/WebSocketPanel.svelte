<script lang="ts">
  import { wsStatus, wsMessages, wsError, wsMessageCount, clearWsMessages } from '../../stores/websocket.svelte';
  import { postMessage } from '../../lib/vscode';
  import { request } from '../../stores/request.svelte';
  import { substituteVariables } from '../../stores/environment.svelte';
  import WebSocketMessageRow from './WebSocketMessageRow.svelte';
  import Tooltip from './Tooltip.svelte';
  import type { WebSocketMessageType } from '../../types';

  let messageText = $state('');
  let messageType = $state<WebSocketMessageType>('text');
  let autoReconnect = $state(false);
  let reconnectInterval = $state(3000);
  let protocols = $state('');
  let messageLogEl = $state<HTMLDivElement>(undefined!);
  let userScrolledUp = false;

  const status = $derived(wsStatus());
  const messages = $derived(wsMessages());
  const error = $derived(wsError());
  const count = $derived(wsMessageCount());
  const isConnected = $derived(status === 'connected');
  const isConnecting = $derived(status === 'connecting');

  function handleConnect() {
    const rawHeaders = Array.isArray(request.headers) ? request.headers : [];
    const resolvedHeaders = rawHeaders.map(h => ({
      ...h,
      key: substituteVariables(h.key),
      value: substituteVariables(h.value),
    }));
    postMessage({
      type: 'wsConnect',
      data: {
        url: substituteVariables(request.url),
        protocols: protocols ? protocols.split(',').map(p => p.trim()) : [],
        headers: resolvedHeaders,
        autoReconnect,
        reconnectIntervalMs: reconnectInterval,
      },
    });
  }

  function handleDisconnect() {
    postMessage({ type: 'wsDisconnect' });
  }

  function handleSend() {
    if (!messageText.trim() || !isConnected) return;
    postMessage({
      type: 'wsSend',
      data: { message: messageText, type: messageType },
    });
    messageText = '';
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  function handleWheel(e: WheelEvent) {
    if (!messageLogEl) return;
    if (e.deltaY < 0) {
      // User scrolled up
      userScrolledUp = true;
    } else {
      // User scrolled down, check if they reached bottom
      const { scrollTop, scrollHeight, clientHeight } = messageLogEl;
      if (scrollHeight - scrollTop - clientHeight < 50) {
        userScrolledUp = false;
      }
    }
  }

  $effect(() => {
    // Read messages.length to establish reactive dependency
    if (messages.length > 0 && !userScrolledUp && messageLogEl) {
      messageLogEl.scrollTop = messageLogEl.scrollHeight;
    }
  });

  function getStatusColor(s: string): string {
    switch (s) {
      case 'connected': return '#49cc90';
      case 'connecting': return '#fca130';
      case 'error': return '#f93e3e';
      default: return 'var(--hf-descriptionForeground)';
    }
  }
</script>

<div class="ws-panel">
  <div class="ws-toolbar">
    <div class="status-row">
      <span class="status-dot" style="background: {getStatusColor(status)}"></span>
      <span class="status-text">{status}</span>
      {#if error}
        <span class="error-text">{error}</span>
      {/if}
      <span class="message-count">{count} messages</span>
    </div>

    <div class="controls-row">
      <label class="control-label">
        <input type="checkbox" bind:checked={autoReconnect} /> Auto-reconnect
      </label>
      {#if autoReconnect}
        <Tooltip text="Reconnect interval (ms)" position="top">
          <input
            type="number"
            class="interval-input"
            bind:value={reconnectInterval}
            min="500"
            max="60000"
            step="500"
            aria-label="Reconnect interval (ms)"
          />
        </Tooltip>
      {/if}
      <input
        type="text"
        class="protocols-input"
        bind:value={protocols}
        placeholder="Protocols (comma-separated)"
      />
      <Tooltip text="Clear messages" position="top">
        <button class="clear-btn" onclick={() => clearWsMessages()} aria-label="Clear messages">Clear</button>
      </Tooltip>
      {#if isConnected || isConnecting}
        <button class="disconnect-btn" onclick={handleDisconnect}>Disconnect</button>
      {:else}
        <button class="connect-btn" onclick={handleConnect}>Connect</button>
      {/if}
    </div>
  </div>

  <div class="message-log" bind:this={messageLogEl} onwheel={handleWheel}>
    {#if messages.length === 0}
      <p class="placeholder">No messages yet. Connect to a WebSocket server to start.</p>
    {:else}
      {#each messages as msg (msg.id)}
        <WebSocketMessageRow message={msg} />
      {/each}
    {/if}
  </div>

  <div class="composer">
    <div class="composer-row">
      <select class="type-select" bind:value={messageType}>
        <option value="text">Text</option>
        <option value="binary">Binary</option>
      </select>
      <textarea
        class="message-input"
        bind:value={messageText}
        onkeydown={handleKeydown}
        placeholder="Type a message..."
        disabled={!isConnected}
        rows="2"
      ></textarea>
      <button
        class="send-btn"
        onclick={handleSend}
        disabled={!isConnected || !messageText.trim()}
      >
        Send
      </button>
    </div>
  </div>
</div>

<style>
  .ws-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .ws-toolbar {
    padding: 8px 12px;
    border-bottom: 1px solid var(--hf-panel-border);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .status-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .status-text {
    font-weight: 600;
    color: var(--hf-foreground);
    text-transform: capitalize;
  }

  .error-text {
    color: #f93e3e;
    font-size: 11px;
  }

  .message-count {
    margin-left: auto;
    color: var(--hf-descriptionForeground);
    font-size: 11px;
  }

  .controls-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .control-label {
    font-size: 11px;
    color: var(--hf-foreground);
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
  }

  .interval-input {
    width: 70px;
    padding: 3px 6px;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border);
    border-radius: 3px;
    font-size: 11px;
  }

  .protocols-input {
    flex: 1;
    min-width: 120px;
    padding: 3px 6px;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border);
    border-radius: 3px;
    font-size: 11px;
  }

  .clear-btn,
  .connect-btn,
  .disconnect-btn {
    padding: 4px 12px;
    border-radius: 3px;
    border: none;
    font-size: 11px;
    cursor: pointer;
    font-weight: 600;
  }

  .clear-btn {
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
  }

  .connect-btn {
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
  }

  .disconnect-btn {
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: 1px solid var(--hf-errorForeground);
  }

  .message-log {
    flex: 1;
    overflow-y: auto;
    padding: 4px;
  }

  .placeholder {
    color: var(--hf-descriptionForeground);
    font-style: italic;
    font-size: 13px;
    padding: 12px;
  }

  .composer {
    border-top: 1px solid var(--hf-panel-border);
    padding: 8px;
  }

  .composer-row {
    display: flex;
    gap: 6px;
    align-items: flex-end;
  }

  .type-select {
    padding: 4px 6px;
    background: var(--hf-dropdown-background);
    color: var(--hf-dropdown-foreground);
    border: 1px solid var(--hf-dropdown-border);
    border-radius: 3px;
    font-size: 11px;
  }

  .message-input {
    flex: 1;
    padding: 6px 8px;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border);
    border-radius: 3px;
    font-size: 12px;
    font-family: var(--hf-editor-font-family, monospace);
    resize: vertical;
  }

  .message-input:disabled {
    opacity: 0.5;
  }

  .send-btn {
    padding: 6px 16px;
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
    border: none;
    border-radius: 3px;
    font-size: 12px;
    cursor: pointer;
  }

  .send-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
