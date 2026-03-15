<script lang="ts">
  import { wsStatus, wsMessages, wsError, wsMessageCount, clearWsMessages } from '../../stores/websocket.svelte';
  import { postMessage } from '../../lib/vscode';
  import { request } from '../../stores/request.svelte';
  import { substituteVariables } from '../../stores/environment.svelte';
  import { recordingState, currentSession, savedSessions, replayProgress, replaySpeed, setReplaySpeed, setCurrentSession } from '../../stores/wsRecording.svelte';
  import WebSocketMessageRow from './WebSocketMessageRow.svelte';
  import Tooltip from './Tooltip.svelte';
  import type { WebSocketMessageType } from '../../types';

  let messageText = $state('');
  let messageType = $state<WebSocketMessageType>('text');
  let autoReconnect = $state(false);
  let reconnectInterval = $state(3000);
  let protocols = $state('');
  let messageLogEl = $state<HTMLDivElement>(undefined!);
  let userScrolledUp = $state(false);
  let sessionName = $state('');
  let showSessions = $state(false);
  let showNamingInput = $state(false);

  const status = $derived(wsStatus());
  const messages = $derived(wsMessages());
  const error = $derived(wsError());
  const count = $derived(wsMessageCount());
  const isConnected = $derived(status === 'connected');
  const isConnecting = $derived(status === 'connecting');

  const recState = $derived(recordingState());
  const session = $derived(currentSession());
  const sessions = $derived(savedSessions());
  const progress = $derived(replayProgress());
  const speed = $derived(replaySpeed());
  const isRecording = $derived(recState === 'recording');
  const isReplaying = $derived(recState === 'replaying');

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

  function handleStartRecording() {
    postMessage({ type: 'wsStartRecording' });
  }

  function handleStopRecording() {
    showNamingInput = true;
  }

  function handleSaveRecording() {
    postMessage({ type: 'wsStopRecording', data: { name: sessionName || undefined } });
    showNamingInput = false;
    sessionName = '';
  }

  function handleCancelNaming() {
    // Stop recording without a custom name
    postMessage({ type: 'wsStopRecording', data: {} });
    showNamingInput = false;
    sessionName = '';
  }

  function handleSaveSession() {
    if (!session) return;
    postMessage({ type: 'wsSaveSession', data: { session: $state.snapshot(session) } });
  }

  function handleExportSession() {
    if (!session) return;
    postMessage({ type: 'wsExportSession', data: { session: $state.snapshot(session) } });
  }

  function handleLoadSession() {
    postMessage({ type: 'wsLoadSession' });
  }

  function handleListSessions() {
    showSessions = !showSessions;
    if (showSessions) {
      postMessage({ type: 'wsListSessions' });
    }
  }

  function handleDeleteSession(sessionId: string) {
    postMessage({ type: 'wsDeleteSession', data: { sessionId } });
    // Refresh list
    postMessage({ type: 'wsListSessions' });
  }

  function handleLoadSavedSession(s: any) {
    setCurrentSession(s);
  }

  function handleStartReplay() {
    if (!session) return;
    postMessage({ type: 'wsStartReplay', data: { session: $state.snapshot(session), speedMultiplier: speed } });
  }

  function handleCancelReplay() {
    postMessage({ type: 'wsCancelReplay' });
  }

  function handleSpeedChange(e: Event) {
    const val = parseFloat((e.target as HTMLSelectElement).value);
    setReplaySpeed(val);
  }

  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  function formatDate(ts: number): string {
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

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
      {#if isConnected && !isReplaying}
        {#if isRecording}
          <Tooltip text="Stop recording" position="top">
            <button class="record-btn recording" onclick={handleStopRecording} aria-label="Stop recording">
              <span class="record-dot pulsing"></span> Stop
            </button>
          </Tooltip>
        {:else}
          <Tooltip text="Record this session" position="top">
            <button class="record-btn" onclick={handleStartRecording} aria-label="Start recording">
              <span class="record-dot"></span> Record
            </button>
          </Tooltip>
        {/if}
      {/if}
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

  {#if showNamingInput}
    <div class="naming-bar">
      <input
        type="text"
        class="naming-input"
        bind:value={sessionName}
        placeholder="Session name (optional)"
        onkeydown={(e) => { if (e.key === 'Enter') handleSaveRecording(); }}
      />
      <button class="save-name-btn" onclick={handleSaveRecording}>Save</button>
      <button class="cancel-name-btn" onclick={handleCancelNaming}>Skip</button>
    </div>
  {/if}

  <div class="session-bar">
    <div class="session-actions">
      <Tooltip text="Load session from file" position="top">
        <button class="session-btn" onclick={handleLoadSession}>Load</button>
      </Tooltip>
      <Tooltip text="Browse saved sessions" position="top">
        <button class="session-btn" class:active={showSessions} onclick={handleListSessions}>
          Sessions
        </button>
      </Tooltip>
      {#if session}
        <span class="session-name">{session.name}</span>
        <Tooltip text="Save to workspace" position="top">
          <button class="session-btn" onclick={handleSaveSession}>Save</button>
        </Tooltip>
        <Tooltip text="Export to file" position="top">
          <button class="session-btn" onclick={handleExportSession}>Export</button>
        </Tooltip>
        <Tooltip text="Clear loaded session" position="top">
          <button class="session-btn" onclick={() => setCurrentSession(null)}>Clear</button>
        </Tooltip>
      {/if}
    </div>

    {#if session && isConnected && !isRecording}
      <div class="replay-controls">
        <select class="speed-select" onchange={handleSpeedChange} disabled={isReplaying}>
          <option value="0.5" selected={speed === 0.5}>0.5x</option>
          <option value="1" selected={speed === 1}>1x</option>
          <option value="2" selected={speed === 2}>2x</option>
        </select>
        {#if isReplaying}
          <button class="cancel-replay-btn" onclick={handleCancelReplay}>Cancel</button>
          {#if progress}
            <span class="replay-progress">{progress.index + 1}/{progress.total}</span>
          {/if}
        {:else}
          <Tooltip text="Replay sent messages to server" position="top">
            <button class="replay-btn" onclick={handleStartReplay}>Replay</button>
          </Tooltip>
        {/if}
      </div>
    {/if}
  </div>

  {#if showSessions}
    <div class="sessions-list">
      {#if sessions.length === 0}
        <p class="placeholder">No saved sessions.</p>
      {:else}
        {#each sessions as s (s.id)}
          <div class="session-item">
            <div class="session-item-info">
              <span class="session-item-name">{s.name}</span>
              <span class="session-item-meta">{s.messageCount} msgs, {formatDuration(s.durationMs)}, {formatDate(s.createdAt)}</span>
            </div>
            <div class="session-item-actions">
              <Tooltip text="Load this session" position="top">
                <button class="session-btn small" onclick={() => {
                  postMessage({ type: 'wsLoadSessionById', data: { sessionId: s.id } });
                }}>Load</button>
              </Tooltip>
              <Tooltip text="Delete this session" position="top">
                <button class="session-btn small danger" onclick={() => handleDeleteSession(s.id)}>Delete</button>
              </Tooltip>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  {/if}

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
    padding-bottom: 16px;
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

  /* Recording */
  .record-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 3px;
    border: 1px solid var(--hf-input-border);
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    font-size: 11px;
    cursor: pointer;
    font-weight: 600;
  }

  .record-btn.recording {
    border-color: #f93e3e;
    color: #f93e3e;
  }

  .record-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #f93e3e;
    display: inline-block;
  }

  .record-dot.pulsing {
    animation: pulse-recording 1s ease-in-out infinite;
  }

  @keyframes pulse-recording {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  /* Naming bar */
  .naming-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-bottom: 1px solid var(--hf-panel-border);
    background: var(--hf-editor-background);
  }

  .naming-input {
    flex: 1;
    padding: 4px 8px;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border);
    border-radius: 3px;
    font-size: 12px;
  }

  .save-name-btn {
    padding: 4px 12px;
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
    border: none;
    border-radius: 3px;
    font-size: 11px;
    cursor: pointer;
    font-weight: 600;
  }

  .cancel-name-btn {
    padding: 4px 12px;
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: none;
    border-radius: 3px;
    font-size: 11px;
    cursor: pointer;
  }

  /* Session bar */
  .session-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 12px;
    border-bottom: 1px solid var(--hf-panel-border);
    font-size: 11px;
    flex-wrap: wrap;
  }

  .session-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .session-btn {
    padding: 3px 8px;
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: 1px solid var(--hf-input-border);
    border-radius: 3px;
    font-size: 10px;
    cursor: pointer;
  }

  .session-btn.active {
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
    border-color: var(--hf-button-background);
  }

  .session-btn.small {
    padding: 2px 6px;
    font-size: 10px;
  }

  .session-btn.danger {
    color: #f93e3e;
    border-color: #f93e3e;
  }

  .session-name {
    color: var(--hf-foreground);
    font-weight: 600;
    font-size: 11px;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Replay controls */
  .replay-controls {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .speed-select {
    padding: 2px 4px;
    background: var(--hf-dropdown-background);
    color: var(--hf-dropdown-foreground);
    border: 1px solid var(--hf-dropdown-border);
    border-radius: 3px;
    font-size: 10px;
  }

  .replay-btn {
    padding: 3px 10px;
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
    border: none;
    border-radius: 3px;
    font-size: 11px;
    cursor: pointer;
    font-weight: 600;
  }

  .cancel-replay-btn {
    padding: 3px 10px;
    background: var(--hf-button-secondaryBackground);
    color: #f93e3e;
    border: 1px solid #f93e3e;
    border-radius: 3px;
    font-size: 11px;
    cursor: pointer;
    font-weight: 600;
  }

  .replay-progress {
    color: var(--hf-foreground);
    font-size: 11px;
    font-weight: 600;
  }

  /* Sessions list */
  .sessions-list {
    max-height: 150px;
    overflow-y: auto;
    border-bottom: 1px solid var(--hf-panel-border);
    padding: 4px;
  }

  .session-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 8px;
    border-radius: 3px;
  }

  .session-item:hover {
    background: var(--hf-list-hoverBackground);
  }

  .session-item-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .session-item-name {
    font-size: 11px;
    font-weight: 600;
    color: var(--hf-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .session-item-meta {
    font-size: 10px;
    color: var(--hf-descriptionForeground);
  }

  .session-item-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }
</style>
