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
  let showSettings = $state(false);
  let settingsRef = $state<HTMLDivElement>(undefined!);

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

  $effect(() => {
    if (showSettings) {
      const handleClickOutside = (e: MouseEvent) => {
        if (settingsRef && !settingsRef.contains(e.target as Node)) {
          showSettings = false;
        }
      };
      document.addEventListener('click', handleClickOutside, true);
      return () => document.removeEventListener('click', handleClickOutside, true);
    }
  });

  function handleStartRecording() {
    postMessage({ type: 'wsStartRecording' });
  }

  function handleStopRecording() {
    showNamingInput = true;
    showSessions = true;  // auto-open drawer
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

  function handleSegmentKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      messageType = messageType === 'text' ? 'binary' : 'text';
    }
  }
</script>

<div class="ws-panel">
  <div class="ws-toolbar">
    <span class="status-dot" style="background: {getStatusColor(status)}"></span>
    <span class="status-text">{status}</span>
    {#if error}
      <Tooltip text={error} position="bottom">
        <span class="error-text">{error}</span>
      </Tooltip>
    {/if}
    <span class="toolbar-separator"></span>
    <span class="message-count">{count} messages</span>
    <span class="toolbar-spacer"></span>

    {#if isConnected && !isReplaying}
      <Tooltip text={isRecording ? 'Stop recording' : 'Record session'} position="bottom">
        <button
          class="record-btn"
          class:recording={isRecording}
          onclick={isRecording ? handleStopRecording : handleStartRecording}
          aria-label={isRecording ? 'Stop recording' : 'Start recording'}
        >
          <span class="record-dot" class:pulsing={isRecording}></span>
          {isRecording ? 'Stop' : 'Record'}
        </button>
      </Tooltip>
    {/if}

    <Tooltip text="Sessions" position="bottom">
      <button
        class="icon-btn"
        class:active={showSessions}
        onclick={handleListSessions}
        aria-label="Toggle sessions drawer"
      >
        <i class="codicon codicon-list-tree"></i>
        {#if session && !showSessions}
          <span class="icon-indicator"></span>
        {/if}
      </button>
    </Tooltip>

    <Tooltip text="Clear messages" position="bottom">
      <button class="icon-btn" onclick={() => clearWsMessages()} aria-label="Clear messages">
        <i class="codicon codicon-clear-all"></i>
      </button>
    </Tooltip>

    <span class="toolbar-separator"></span>

    <div class="settings-anchor" bind:this={settingsRef}>
      <Tooltip text="Connection settings" position="bottom">
        <button
          class="icon-btn"
          class:active={showSettings}
          onclick={() => (showSettings = !showSettings)}
          aria-label="Connection settings"
        >
          <i class="codicon codicon-gear"></i>
        </button>
      </Tooltip>

      {#if showSettings}
        <div class="settings-popover">
          <div class="popover-field">
            <div class="popover-label">Protocols</div>
            <input
              type="text"
              class="popover-input"
              bind:value={protocols}
              placeholder="wss, graphql-ws (comma-separated)"
            />
          </div>
          <label class="popover-checkbox">
            <input type="checkbox" bind:checked={autoReconnect} /> Auto-reconnect
          </label>
          {#if autoReconnect}
            <div class="popover-field popover-indented">
              <div class="popover-label">Interval (ms)</div>
              <input
                type="number"
                class="popover-input"
                bind:value={reconnectInterval}
                min="500"
                max="60000"
                step="500"
              />
            </div>
          {/if}
        </div>
      {/if}
    </div>

    {#if isConnected || isConnecting}
      <button class="disconnect-btn" onclick={handleDisconnect}>Disconnect</button>
    {:else}
      <button class="connect-btn" onclick={handleConnect}>Connect</button>
    {/if}
  </div>

  <!-- Sessions drawer -->
  <div class="drawer-wrapper" class:open={showSessions}>
    <div class="drawer-content">
      {#if showNamingInput}
        <div class="naming-bar">
          <input
            type="text"
            class="naming-input"
            bind:value={sessionName}
            placeholder="Session name (optional)"
            onkeydown={(e) => { if (e.key === 'Enter') handleSaveRecording(); }}
          />
          <button class="naming-save-btn" onclick={handleSaveRecording}>Save</button>
          <button class="naming-skip-btn" onclick={handleCancelNaming}>Skip</button>
        </div>
      {/if}

      {#if session}
        <div class="replay-bar">
          <span class="replay-session-name">{session.name}</span>

          {#if isReplaying}
            <button class="drawer-btn danger" onclick={handleCancelReplay}>Cancel</button>
          {:else}
            <Tooltip text="Replay sent messages to server" position="bottom">
              <button
                class="drawer-btn primary"
                onclick={handleStartReplay}
                disabled={!isConnected}
              >Play</button>
            </Tooltip>
          {/if}

          {#if progress}
            <div class="replay-progress-bar">
              <div class="replay-progress-fill" style="width: {((progress.index + 1) / progress.total) * 100}%"></div>
            </div>
            <span class="replay-progress-text">{progress.index + 1}/{progress.total}</span>
          {/if}

          <select class="speed-select" onchange={handleSpeedChange} disabled={isReplaying}>
            <option value="0.5" selected={speed === 0.5}>0.5x</option>
            <option value="1" selected={speed === 1}>1x</option>
            <option value="2" selected={speed === 2}>2x</option>
          </select>

          <Tooltip text="Save to workspace" position="bottom">
            <button class="drawer-btn" onclick={handleSaveSession}>Save</button>
          </Tooltip>
          <Tooltip text="Export to file" position="bottom">
            <button class="drawer-btn" onclick={handleExportSession}>Export</button>
          </Tooltip>
          <Tooltip text="Unload session" position="bottom">
            <button class="drawer-btn" onclick={() => setCurrentSession(null)}>
              <i class="codicon codicon-close"></i>
            </button>
          </Tooltip>
        </div>
      {/if}

      <div class="sessions-list">
        {#if sessions.length === 0}
          <p class="sessions-placeholder">No saved sessions.</p>
        {:else}
          {#each sessions as s (s.id)}
            <div class="session-item">
              <div class="session-item-info">
                <span class="session-item-name">{s.name}</span>
                <span class="session-item-meta">{s.messageCount} msgs, {formatDuration(s.durationMs)}, {formatDate(s.createdAt)}</span>
              </div>
              <div class="session-item-actions">
                <Tooltip text="Load this session" position="top">
                  <button class="drawer-btn" onclick={() => {
                    postMessage({ type: 'wsLoadSessionById', data: { sessionId: s.id } });
                  }}>Load</button>
                </Tooltip>
                <Tooltip text="Delete this session" position="top">
                  <button class="drawer-btn danger" onclick={() => handleDeleteSession(s.id)}>Delete</button>
                </Tooltip>
              </div>
            </div>
          {/each}
        {/if}
      </div>

      <button class="load-file-btn" onclick={handleLoadSession}>Load from file...</button>
    </div>
  </div>

  <div class="message-log" bind:this={messageLogEl} onwheel={handleWheel}>
    {#if messages.length === 0}
      <div class="empty-state">
        <i class="codicon codicon-plug empty-icon"></i>
        <div class="empty-title">No messages yet</div>
        <div class="empty-description">Connect to a WebSocket server to start sending and receiving messages.</div>
      </div>
    {:else}
      {#each messages as msg (msg.id)}
        <WebSocketMessageRow message={msg} />
      {/each}
    {/if}
  </div>

  <div class="composer" class:disabled={!isConnected}>
    <div class="composer-header">
      <div class="segment-toggle" role="radiogroup" aria-label="Message type">
        <button
          class="segment"
          class:active={messageType === 'text'}
          role="radio"
          aria-checked={messageType === 'text'}
          onclick={() => (messageType = 'text')}
          onkeydown={handleSegmentKeydown}
        >Text</button>
        <button
          class="segment"
          class:active={messageType === 'binary'}
          role="radio"
          aria-checked={messageType === 'binary'}
          onclick={() => (messageType = 'binary')}
          onkeydown={handleSegmentKeydown}
        >Binary</button>
      </div>
    </div>
    <textarea
      class="message-input"
      bind:value={messageText}
      onkeydown={handleKeydown}
      placeholder={isConnected ? 'Type a message...' : 'Connect to send messages'}
      disabled={!isConnected}
      rows="2"
    ></textarea>
    <div class="composer-footer">
      <button
        class="send-btn"
        onclick={handleSend}
        disabled={!isConnected || !messageText.trim()}
      >
        Send <span class="send-hint">Enter</span>
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

  /* Toolbar */
  .ws-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-bottom: 1px solid var(--hf-panel-border);
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
    color: var(--hf-errorForeground, #f93e3e);
    font-size: 11px;
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .toolbar-separator {
    width: 1px;
    height: 16px;
    background: var(--hf-panel-border);
    flex-shrink: 0;
  }

  .message-count {
    color: var(--hf-descriptionForeground);
    font-size: 11px;
    white-space: nowrap;
  }

  .toolbar-spacer {
    flex: 1;
  }

  /* Icon buttons */
  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    background: transparent;
    border: none;
    color: var(--hf-foreground);
    cursor: pointer;
    font-size: 14px;
    position: relative;
    flex-shrink: 0;
  }

  .icon-btn:hover {
    background: var(--hf-toolbar-hoverBackground);
  }

  .icon-btn.active {
    background: var(--hf-list-hoverBackground);
  }

  .record-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 10px;
    border-radius: 4px;
    border: 1px solid var(--hf-input-border);
    background: transparent;
    color: var(--hf-foreground);
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    flex-shrink: 0;
  }

  .record-btn:hover {
    background: var(--hf-toolbar-hoverBackground);
  }

  .record-btn.recording {
    border-color: #f93e3e;
    color: #f93e3e;
    background: rgba(249, 62, 62, 0.1);
  }

  .icon-indicator {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--hf-button-background);
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

  .connect-btn {
    padding: 4px 14px;
    border-radius: 4px;
    border: none;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
    flex-shrink: 0;
  }

  .disconnect-btn {
    padding: 4px 14px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    background: transparent;
    color: #f93e3e;
    border: 1px solid rgba(249, 62, 62, 0.4);
    flex-shrink: 0;
  }

  /* Settings popover */
  .settings-anchor {
    position: relative;
  }

  .settings-popover {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    background: var(--hf-editorWidget-background, #252526);
    border: 1px solid var(--hf-editorWidget-border, rgba(127, 127, 127, 0.3));
    border-radius: 6px;
    padding: 12px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    z-index: 100;
    width: 260px;
  }

  .popover-field {
    margin-bottom: 10px;
  }

  .popover-field:last-child {
    margin-bottom: 0;
  }

  .popover-label {
    font-size: 10px;
    color: var(--hf-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }

  .popover-input {
    width: 100%;
    padding: 4px 8px;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border);
    border-radius: 3px;
    font-size: 11px;
    box-sizing: border-box;
  }

  .popover-checkbox {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--hf-foreground);
    cursor: pointer;
    margin-bottom: 8px;
  }

  .popover-indented {
    margin-left: 20px;
  }

  /* Sessions drawer */
  .drawer-wrapper {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 200ms ease-out;
  }

  .drawer-wrapper.open {
    grid-template-rows: 1fr;
  }

  .drawer-content {
    overflow: hidden;
    min-height: 0;
    max-height: 250px;
    border-bottom: 1px solid var(--hf-panel-border);
    background: var(--hf-editor-background);
  }

  .drawer-wrapper:not(.open) .drawer-content {
    border-bottom: none;
  }

  /* Naming bar */
  .naming-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--hf-panel-border);
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

  .naming-save-btn {
    padding: 4px 12px;
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
    border: none;
    border-radius: 3px;
    font-size: 11px;
    cursor: pointer;
    font-weight: 600;
  }

  .naming-skip-btn {
    padding: 4px 12px;
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: none;
    border-radius: 3px;
    font-size: 11px;
    cursor: pointer;
  }

  /* Replay bar */
  .replay-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--hf-panel-border);
    font-size: 11px;
  }

  .replay-session-name {
    font-weight: 600;
    color: var(--hf-foreground);
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }


  .replay-progress-bar {
    flex: 1;
    min-width: 60px;
    max-width: 120px;
    height: 4px;
    border-radius: 2px;
    background: var(--hf-input-background);
    overflow: hidden;
  }

  .replay-progress-fill {
    height: 100%;
    background: var(--hf-button-background);
    border-radius: 2px;
    transition: width 150ms ease-out;
  }

  .replay-progress-text {
    font-size: 11px;
    font-weight: 600;
    color: var(--hf-foreground);
    white-space: nowrap;
  }

  .speed-select {
    padding: 2px 4px;
    background: var(--hf-dropdown-background);
    color: var(--hf-dropdown-foreground);
    border: 1px solid var(--hf-dropdown-border);
    border-radius: 3px;
    font-size: 10px;
  }

  /* Drawer buttons */
  .drawer-btn {
    padding: 3px 10px;
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: 1px solid var(--hf-input-border);
    border-radius: 3px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }

  .drawer-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .drawer-btn.primary {
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
    border-color: var(--hf-button-background);
  }

  .drawer-btn.danger {
    color: #f93e3e;
    border-color: #f93e3e;
  }

  /* Sessions list */
  .sessions-list {
    max-height: 150px;
    overflow-y: auto;
    padding: 4px;
  }

  .sessions-placeholder {
    color: var(--hf-descriptionForeground);
    font-style: italic;
    font-size: 12px;
    padding: 8px 12px;
    margin: 0;
  }

  .session-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px;
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

  .load-file-btn {
    display: block;
    width: calc(100% - 16px);
    margin: 4px 8px 8px;
    padding: 4px 8px;
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: 1px solid var(--hf-input-border);
    border-radius: 3px;
    font-size: 11px;
    cursor: pointer;
    text-align: center;
  }

  /* Message log */
  .message-log {
    flex: 1;
    overflow-y: auto;
    padding: 0;
    padding-bottom: 16px;
    min-height: 0;
  }

  /* Empty state */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
    padding: 24px;
  }

  .empty-icon {
    font-size: 28px;
    color: var(--hf-descriptionForeground);
    margin-bottom: 12px;
  }

  .empty-title {
    font-size: 14px;
    font-weight: 500;
    color: var(--hf-foreground);
    margin-bottom: 4px;
  }

  .empty-description {
    font-size: 12px;
    color: var(--hf-descriptionForeground);
  }

  /* Composer */
  .composer {
    border-top: 1px solid var(--hf-panel-border);
    padding: 8px;
  }

  .composer.disabled {
    opacity: 0.5;
  }

  .composer-header {
    margin-bottom: 6px;
  }

  .segment-toggle {
    display: inline-flex;
    border: 1px solid var(--hf-input-border);
    border-radius: 4px;
    overflow: hidden;
  }

  .segment {
    padding: 3px 10px;
    font-size: 11px;
    font-weight: 500;
    border: none;
    cursor: pointer;
    background: transparent;
    color: var(--hf-descriptionForeground);
  }

  .segment:hover:not(.active) {
    background: var(--hf-toolbar-hoverBackground);
  }

  .segment.active {
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
  }

  .message-input {
    width: 100%;
    padding: 8px;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border);
    border-radius: 3px;
    font-size: 12px;
    font-family: var(--hf-editor-font-family, monospace);
    resize: vertical;
    box-sizing: border-box;
  }

  .composer-footer {
    display: flex;
    justify-content: flex-end;
    margin-top: 6px;
  }

  .send-btn {
    padding: 5px 14px;
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
    border: none;
    border-radius: 3px;
    font-size: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .send-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .send-hint {
    font-size: 9px;
    opacity: 0.6;
  }
</style>
