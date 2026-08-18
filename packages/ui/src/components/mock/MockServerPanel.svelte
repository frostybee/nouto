<script lang="ts">
  import {
    mockServerState,
    setPort,
    addRoute,
    removeRoute,
    updateRoute,
    
    clearLogs,
  } from '../../stores/mockServer.svelte';
  import MockRouteRow from './MockRouteRow.svelte';
  import MockRequestLogTable from './MockRequestLogTable.svelte';
  import EnvironmentSelector from '../shared/EnvironmentSelector.svelte';
  import type { MockRoute, HttpMethod } from '../../types';
  import { generateId } from '../../types';
  import { postMessage as defaultPostMessage } from '../../lib/vscode';

  let { postMessage = defaultPostMessage }: { postMessage?: (message: any) => void } = $props();

  const server = $derived(mockServerState);

  let activeTab = $state<'routes' | 'logs'>('routes');

  function handleStart() {
    postMessage({
      type: 'startMockServer',
      data: { config: $state.snapshot(server.config) },
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
      data: { config: $state.snapshot(server.config) },
    });
  }

  const isRunning = $derived(server.status === 'running');
  const isBusy = $derived(server.status === 'starting' || server.status === 'stopping');
</script>

<div class="mock-panel">
  <div class="panel-toolbar">
    <div class="toolbar-left"></div>
    <div class="toolbar-right">
      <span class="toolbar-label">Environment</span>
      <EnvironmentSelector />
    </div>
  </div>
  <div class="panel-content">
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
            value={server.config.port}
            disabled={isRunning || isBusy}
            onchange={(e) => {
              setPort(parseInt((e.target as HTMLInputElement).value) || 3000);
              sendRouteUpdate();
            }}
          />
        </div>
        {#if isRunning}
          <button class="stop-btn" onclick={handleStop} disabled={isBusy}>Stop Server</button>
          <span class="status-badge running">Running on :{server.config.port}</span>
        {:else}
          <button class="start-btn" onclick={handleStart} disabled={isBusy || server.config.routes.length === 0}>
            Start Server
          </button>
          <span class="status-badge stopped">{server.status === 'error' ? 'Error' : 'Stopped'}</span>
        {/if}
      </div>
    </div>

    <div class="tabs">
      <button class="tab" class:active={activeTab === 'routes'} onclick={() => activeTab = 'routes'}>
        Routes ({server.config.routes.length})
      </button>
      <button class="tab" class:active={activeTab === 'logs'} onclick={() => activeTab = 'logs'}>
        Request Log ({server.logs.length})
      </button>
    </div>

    {#if activeTab === 'routes'}
      <div class="routes-toolbar">
        <button class="tool-btn" onclick={handleAddRoute}>+ Add Route</button>
        <button class="tool-btn" onclick={handleImportCollection}>Import from Collection</button>
      </div>
      <div class="routes-list">
        {#each server.config.routes as route (route.id)}
          <MockRouteRow
            {route}
            onUpdate={(updates) => handleUpdateRoute(route.id, updates)}
            onRemove={() => handleRemoveRoute(route.id)}
          />
        {/each}
        {#if server.config.routes.length === 0}
          <div class="empty">No routes defined. Add a route or import from a collection.</div>
        {/if}
      </div>
    {:else}
      <div class="log-toolbar">
        <button class="tool-btn" onclick={handleClearLogs} disabled={server.logs.length === 0}>Clear Logs</button>
      </div>
      <MockRequestLogTable logs={server.logs} routes={server.config.routes} />
    {/if}
  </div>
</div>

<style>
  .mock-panel {
    padding: 0;
    color: var(--hf-foreground);
    font-family: var(--hf-font-family);
    max-width: 900px;
  }

  .panel-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.308rem 1.231rem;
    background: var(--hf-editor-background);
    border-bottom: 1px solid var(--hf-panel-border);
    min-height: 2.462rem;
    gap: 0.615rem;
  }

  .toolbar-left,
  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 0.308rem;
  }

  .toolbar-label {
    font-size: 0.769rem;
    color: var(--hf-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    white-space: nowrap;
    user-select: none;
  }

  .panel-content {
    padding: 1.231rem;
  }

  .header h2 {
    margin: 0 0 0.615rem;
    font-size: 1.231rem;
    font-weight: 600;
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 0.769rem;
    margin-bottom: 0.923rem;
  }

  .port-input {
    display: flex;
    align-items: center;
    gap: 0.462rem;
    font-size: 1rem;
  }

  .port-input input {
    width: 6.154rem;
    padding: 0.308rem 0.615rem;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border);
    border-radius: 0.154rem;
    font-size: 1rem;
  }

  .start-btn, .stop-btn {
    padding: 0.462rem 1.077rem;
    border: 1px solid transparent;
    border-radius: 0.154rem;
    cursor: pointer;
    font-size: 0.923rem;
    font-weight: 600;
  }

  .start-btn {
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
  }

  .start-btn:hover { background: var(--hf-button-hoverBackground); }
  .start-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .stop-btn {
    background: transparent;
    color: #f93e3e;
    border: 1px solid color-mix(in srgb, #f93e3e 55%, transparent);
  }

  .stop-btn:hover {
    background: color-mix(in srgb, #f93e3e 10%, transparent);
    border-color: #f93e3e;
  }

  .status-badge {
    font-size: 0.846rem;
    font-weight: 600;
    padding: 0.154rem 0.615rem;
    border-radius: 0.769rem;
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
    margin-bottom: 0.923rem;
  }

  .tab {
    background: none;
    border: none;
    border-bottom: 0.154rem solid transparent;
    color: var(--hf-descriptionForeground);
    padding: 0.615rem 1.231rem;
    cursor: pointer;
    font-size: 1rem;
  }

  .tab.active {
    color: var(--hf-foreground);
    border-bottom-color: var(--hf-focusBorder);
  }

  .routes-toolbar, .log-toolbar {
    display: flex;
    gap: 0.615rem;
    margin-bottom: 0.769rem;
  }

  .tool-btn {
    background: var(--hf-button-secondaryBackground);
    color: var(--hf-button-secondaryForeground);
    border: none;
    padding: 0.308rem 0.923rem;
    border-radius: 0.154rem;
    cursor: pointer;
    font-size: 0.923rem;
  }

  .tool-btn:hover { background: var(--hf-button-secondaryHoverBackground); }
  .tool-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .routes-list {
    display: flex;
    flex-direction: column;
    gap: 0.462rem;
  }

  .empty {
    font-size: 1rem;
    color: var(--hf-descriptionForeground);
    text-align: center;
    padding: 1.846rem;
  }
</style>
