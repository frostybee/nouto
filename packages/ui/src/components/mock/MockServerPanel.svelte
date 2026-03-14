<script lang="ts">
  import {
    mockServerState,
    setPort,
    addRoute,
    removeRoute,
    updateRoute,
    updateRoutes,
    clearLogs,
  } from '../../stores/mockServer.svelte';
  import MockRouteRow from './MockRouteRow.svelte';
  import MockRequestLogTable from './MockRequestLogTable.svelte';
  import type { MockRoute, HttpMethod } from '../../types';
  import { generateId } from '../../types';
  import { postMessage } from '../../lib/vscode';

  const state = $derived(mockServerState);

  let activeTab = $state<'routes' | 'logs'>('routes');

  function handleStart() {
    postMessage({
      type: 'startMockServer',
      data: { config: $state.snapshot(state.config) },
    });
  }

  function handleStop() {
    postMessage({ type: 'stopMockServer' });
  }

  function handleAddRoute() {
    const route: MockRoute = {
      id: generateId(),
      enabled: true,
      method: 'GET' as HttpMethod,
      path: '/new-route',
      statusCode: 200,
      responseBody: '{}',
      responseHeaders: [],
      latencyMin: 0,
      latencyMax: 0,
    };
    addRoute(route);
    sendRouteUpdate();
  }

  function handleRemoveRoute(routeId: string) {
    removeRoute(routeId);
    sendRouteUpdate();
  }

  function handleUpdateRoute(routeId: string, updates: Partial<MockRoute>) {
    updateRoute(routeId, updates);
    sendRouteUpdate();
  }

  function handleClearLogs() {
    clearLogs();
    postMessage({ type: 'clearMockLogs' });
  }

  function handleImportCollection() {
    postMessage({ type: 'importCollectionAsMocks' });
  }

  function sendRouteUpdate() {
    // Debounced: send current routes to extension for persistence and live update
    postMessage({
      type: 'updateMockRoutes',
      data: { config: $state.snapshot(state.config) },
    });
  }

  const isRunning = $derived(state.status === 'running');
  const isBusy = $derived(state.status === 'starting' || state.status === 'stopping');
</script>

<div class="mock-panel">
  <div class="header">
    <h2>Mock Server</h2>
    <div class="controls">
      <div class="port-input">
        <label for="port">Port:</label>
        <input
          id="port"
          type="number"
          min="1024"
          max="65535"
          value={state.config.port}
          disabled={isRunning || isBusy}
          onchange={(e) => {
            setPort(parseInt((e.target as HTMLInputElement).value) || 3000);
            sendRouteUpdate();
          }}
        />
      </div>
      {#if isRunning}
        <button class="stop-btn" onclick={handleStop} disabled={isBusy}>Stop Server</button>
        <span class="status-badge running">Running on :{state.config.port}</span>
      {:else}
        <button class="start-btn" onclick={handleStart} disabled={isBusy || state.config.routes.length === 0}>
          Start Server
        </button>
        <span class="status-badge stopped">{state.status === 'error' ? 'Error' : 'Stopped'}</span>
      {/if}
    </div>
  </div>

  <div class="tabs">
    <button class="tab" class:active={activeTab === 'routes'} onclick={() => activeTab = 'routes'}>
      Routes ({state.config.routes.length})
    </button>
    <button class="tab" class:active={activeTab === 'logs'} onclick={() => activeTab = 'logs'}>
      Request Log ({state.logs.length})
    </button>
  </div>

  {#if activeTab === 'routes'}
    <div class="routes-toolbar">
      <button class="tool-btn" onclick={handleAddRoute}>+ Add Route</button>
      <button class="tool-btn" onclick={handleImportCollection}>Import from Collection</button>
    </div>
    <div class="routes-list">
      {#each state.config.routes as route (route.id)}
        <MockRouteRow
          {route}
          onUpdate={(updates) => handleUpdateRoute(route.id, updates)}
          onRemove={() => handleRemoveRoute(route.id)}
        />
      {/each}
      {#if state.config.routes.length === 0}
        <div class="empty">No routes defined. Add a route or import from a collection.</div>
      {/if}
    </div>
  {:else}
    <div class="log-toolbar">
      <button class="tool-btn" onclick={handleClearLogs} disabled={state.logs.length === 0}>Clear Logs</button>
    </div>
    <MockRequestLogTable logs={state.logs} routes={state.config.routes} />
  {/if}
</div>

<style>
  .mock-panel {
    padding: 16px;
    color: var(--hf-foreground);
    font-family: var(--hf-font-family);
    max-width: 900px;
  }

  .header h2 {
    margin: 0 0 8px;
    font-size: 16px;
    font-weight: 600;
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }

  .port-input {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
  }

  .port-input input {
    width: 80px;
    padding: 4px 8px;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border);
    border-radius: 2px;
    font-size: 13px;
  }

  .start-btn, .stop-btn {
    padding: 6px 14px;
    border: none;
    border-radius: 2px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
  }

  .start-btn {
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
  }

  .start-btn:hover { background: var(--hf-button-hoverBackground); }
  .start-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .stop-btn {
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
  }

  .stop-btn:hover { background: var(--hf-button-secondaryHoverBackground); }

  .status-badge {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 10px;
  }

  .status-badge.running {
    background: rgba(73, 204, 144, 0.15);
    color: #49cc90;
  }

  .status-badge.stopped {
    background: rgba(150, 150, 150, 0.15);
    color: var(--hf-descriptionForeground);
  }

  .tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--hf-panel-border);
    margin-bottom: 12px;
  }

  .tab {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--hf-descriptionForeground);
    padding: 8px 16px;
    cursor: pointer;
    font-size: 13px;
  }

  .tab.active {
    color: var(--hf-foreground);
    border-bottom-color: var(--hf-focusBorder);
  }

  .routes-toolbar, .log-toolbar {
    display: flex;
    gap: 8px;
    margin-bottom: 10px;
  }

  .tool-btn {
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: none;
    padding: 4px 12px;
    border-radius: 2px;
    cursor: pointer;
    font-size: 12px;
  }

  .tool-btn:hover { background: var(--hf-button-secondaryHoverBackground); }
  .tool-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .routes-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .empty {
    font-size: 13px;
    color: var(--hf-descriptionForeground);
    text-align: center;
    padding: 24px;
  }
</style>
