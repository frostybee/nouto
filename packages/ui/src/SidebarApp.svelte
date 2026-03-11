<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { postMessage as busPostMessage } from './lib/vscode';
  import CollectionsTab from './components/sidebar/CollectionsTab.svelte';
  import HistoryTab from './components/sidebar/HistoryTab.svelte';
  import { loadEnvironments, loadEnvFileVariables } from './stores/environment';
  import { collections as collectionsStore, initCollections, duplicateRequest, selectedRequestId } from './stores/collections';
  import { get } from 'svelte/store';
  import { setDirtyRequestIds } from './stores/dirtyState';
  import { initHistory, historyStats, historyStatsLoading } from './stores/history';
  import { ui, type SidebarTab } from './stores/ui';
  import Tooltip from './components/shared/Tooltip.svelte';
  import NotificationStack from './components/shared/NotificationStack.svelte';
  import InputBoxModal from './components/shared/InputBoxModal.svelte';
  import QuickPickModal from './components/shared/QuickPickModal.svelte';
  import ConfirmDialog from './components/shared/ConfirmDialog.svelte';
  import CreateItemDialog from './components/shared/CreateItemDialog.svelte';
  import { showNotification, setPendingInput, clearPendingInput, pendingInput } from './stores/notifications';

  let activeTab = $derived($ui.sidebarTab);
  let isLoading = $state(true);



  // Message handler
  function handleMessage(event: MessageEvent) {
    const message = event.data;
    try {
    switch (message.type) {
      case 'initialData':
        initCollections(message.data.collections || []);
        // Load environments into the store
        loadEnvironments({
          ...(message.data.environments || { environments: [], activeId: null, globalVariables: [] }),
          envFileVariables: message.data.envFileVariables,
          envFilePath: message.data.envFilePath,
        });
        isLoading = false;
        break;

      case 'collectionsUpdated':
        initCollections(message.data || []);
        break;

      case 'environmentsUpdated':
        // Update environments in the store
        loadEnvironments(message.data || { environments: [], activeId: null, globalVariables: [] });
        break;

      case 'envFileVariablesUpdated':
        loadEnvFileVariables(message.data);
        break;

      case 'dirtyRequestIds':
        setDirtyRequestIds(message.data || []);
        break;

      case 'historyLoaded':
      case 'historyUpdated':
        initHistory(message.data);
        break;

      case 'historyStatsLoaded':
        historyStats.set(message.data);
        historyStatsLoading.set(false);
        break;

      case 'triggerDuplicateSelected': {
        const reqId = get(selectedRequestId);
        if (reqId) {
          duplicateRequest(reqId);
        }
        break;
      }

      case 'showNotification':
        showNotification(message.data.level, message.data.message);
        break;
      case 'showInputBox':
        setPendingInput({ type: 'inputBox', requestId: message.data.requestId, data: message.data });
        break;
      case 'showQuickPick':
        setPendingInput({ type: 'quickPick', requestId: message.data.requestId, data: message.data });
        break;
      case 'showConfirm':
        setPendingInput({ type: 'confirm', requestId: message.data.requestId, data: message.data });
        break;
      case 'showCreateItemDialog':
        setPendingInput({ type: 'createItemDialog', requestId: message.data.requestId, data: message.data });
        break;
    }
    } catch (err) {
      console.error('[HiveFetch] Error handling sidebar message:', message?.type, err);
    }
  }

  onMount(() => {
    window.addEventListener('message', handleMessage);

    // Notify extension that we're ready
    busPostMessage({ type: 'ready' });
  });

  onDestroy(() => {
    window.removeEventListener('message', handleMessage);
  });

  function postMessage(message: any) {
    busPostMessage(message);
  }

  let newRequestDropdownOpen = $state(false);

  function toggleNewRequestDropdown() {
    newRequestDropdownOpen = !newRequestDropdownOpen;
  }

  function handleNewRequestKind(kind: string) {
    newRequestDropdownOpen = false;
    postMessage({ type: 'newRequest', data: { requestKind: kind } });
  }

  // Tab handlers
  function setActiveTab(tab: SidebarTab) {
    ui.update(s => ({ ...s, sidebarTab: tab }));
  }

  // UI Interaction response helpers
  function respondInputBox(value: string | null) {
    const pending = get(pendingInput);
    if (pending?.type === 'inputBox') {
      busPostMessage({ type: 'inputBoxResult', data: { requestId: pending.requestId, value } } as any);
      clearPendingInput();
    }
  }

  function respondQuickPick(value: string | string[] | null) {
    const pending = get(pendingInput);
    if (pending?.type === 'quickPick') {
      busPostMessage({ type: 'quickPickResult', data: { requestId: pending.requestId, value } } as any);
      clearPendingInput();
    }
  }

  function respondConfirm(confirmed: boolean) {
    const pending = get(pendingInput);
    if (pending?.type === 'confirm') {
      busPostMessage({ type: 'confirmResult', data: { requestId: pending.requestId, confirmed } } as any);
      clearPendingInput();
    }
  }

  function respondCreateItemDialog(value: { name: string; color?: string; icon?: string } | null) {
    const pending = get(pendingInput);
    if (pending?.type === 'createItemDialog') {
      busPostMessage({ type: 'createItemDialogResult', data: { requestId: pending.requestId, value } } as any);
      clearPendingInput();
    }
  }
</script>

<NotificationStack />

{#if $pendingInput?.type === 'inputBox'}
  <InputBoxModal
    open={true}
    prompt={$pendingInput.data.prompt}
    placeholder={$pendingInput.data.placeholder}
    value={$pendingInput.data.value}
    validateNotEmpty={$pendingInput.data.validateNotEmpty}
    onsubmit={(value) => respondInputBox(value)}
    oncancel={() => respondInputBox(null)}
  />
{:else if $pendingInput?.type === 'quickPick'}
  <QuickPickModal
    open={true}
    title={$pendingInput.data.title}
    items={$pendingInput.data.items}
    canPickMany={$pendingInput.data.canPickMany}
    onselect={(value) => respondQuickPick(value)}
    oncancel={() => respondQuickPick(null)}
  />
{:else if $pendingInput?.type === 'confirm'}
  <ConfirmDialog
    open={true}
    message={$pendingInput.data.message}
    confirmLabel={$pendingInput.data.confirmLabel}
    variant={$pendingInput.data.variant}
    onconfirm={() => respondConfirm(true)}
    oncancel={() => respondConfirm(false)}
  />
{:else if $pendingInput?.type === 'createItemDialog'}
  <CreateItemDialog
    mode={$pendingInput.data.mode}
    oncreate={(data) => respondCreateItemDialog(data)}
    oncancel={() => respondCreateItemDialog(null)}
  />
{/if}

<div class="sidebar">
  <div class="new-request-bar">
    <div class="new-request-dropdown">
      <Tooltip text="New Request (Ctrl+N)">
        <button class="new-request-button" onclick={toggleNewRequestDropdown}>
          <span class="button-icon codicon codicon-add"></span>
          <span class="button-label">New Request</span>
          <span class="codicon codicon-chevron-down dropdown-chevron"></span>
        </button>
      </Tooltip>
      {#if newRequestDropdownOpen}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="dropdown-backdrop" onclick={() => { newRequestDropdownOpen = false; }} onkeydown={(e) => { if (e.key === 'Escape') newRequestDropdownOpen = false; }} role="none"></div>
        <div class="dropdown-menu">
          <button class="dropdown-item" onclick={() => handleNewRequestKind('http')}>
            <span class="codicon codicon-globe"></span>
            New HTTP Request
          </button>
          <button class="dropdown-item" onclick={() => handleNewRequestKind('graphql')}>
            <svg class="dropdown-icon" viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
              <path d="M8 1.5L2.5 4.75v6.5L8 14.5l5.5-3.25v-6.5L8 1.5zm0 1.15l4.1 2.42v4.86L8 12.35 3.9 9.93V5.07L8 2.65z"/>
              <circle cx="8" cy="3" r="1.2"/>
              <circle cx="12" cy="5.5" r="1.2"/>
              <circle cx="12" cy="10.5" r="1.2"/>
              <circle cx="8" cy="13" r="1.2"/>
              <circle cx="4" cy="10.5" r="1.2"/>
              <circle cx="4" cy="5.5" r="1.2"/>
            </svg>
            New GraphQL Request
          </button>
          <button class="dropdown-item" onclick={() => handleNewRequestKind('websocket')}>
            <span class="codicon codicon-plug"></span>
            New WebSocket
          </button>
          <button class="dropdown-item" onclick={() => handleNewRequestKind('sse')}>
            <span class="codicon codicon-broadcast"></span>
            New SSE Connection
          </button>
        </div>
      {/if}
    </div>
    <Tooltip text="Settings">
      <button class="settings-btn" onclick={() => postMessage({ type: 'openSettings' })} aria-label="Settings">
        <span class="codicon codicon-gear"></span>
      </button>
    </Tooltip>
  </div>

  <div class="tab-bar">
      <button
        class="tab-button"
        class:active={activeTab === 'collections'}
        onclick={() => setActiveTab('collections')}
        title="Collections"
      >
        Collections
      </button>
      <button
        class="tab-button"
        class:active={activeTab === 'history'}
        onclick={() => setActiveTab('history')}
        title="History"
      >
        History
      </button>
    </div>

  <div class="tab-content">
      {#if isLoading}
        <div class="loading">Loading...</div>
      {:else if activeTab === 'collections'}
        <CollectionsTab {postMessage} />
      {:else if activeTab === 'history'}
        <HistoryTab {postMessage} />
      {/if}
  </div>
</div>

<style>
  .sidebar {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: visible;
    position: relative;
    padding-right: 2px;
  }

  .sidebar::before {
    content: '';
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--hf-panel-border);
    z-index: 1;
  }

  .sidebar::after {
    content: '';
    position: absolute;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 4px;
    height: 40px;
    background: var(--hf-scrollbarSlider-background);
    border-radius: 2px;
    pointer-events: none;
    z-index: 2;
  }

  .new-request-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 10px 6px;
    flex-shrink: 0;
  }

  .new-request-dropdown {
    flex: 1;
    position: relative;
  }

  .new-request-dropdown :global(.tooltip-wrapper) {
    width: 100%;
  }

  .settings-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    flex-shrink: 0;
    padding: 8px 0;
    background: var(--hf-button-secondaryBackground);
    border: none;
    border-radius: 6px;
    color: var(--hf-button-secondaryForeground);
    cursor: pointer;
    transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  }

  .settings-btn:hover {
    background: var(--hf-button-secondaryHoverBackground);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
    transform: translateY(-1px);
  }

  .settings-btn:active {
    transform: translateY(0);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  }

  .settings-btn .codicon {
    font-size: 16px;
  }

  .new-request-button {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    width: 100%;
    padding: 8px 12px;
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
    white-space: nowrap;
  }

  .new-request-button:hover {
    background: var(--hf-button-hoverBackground);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
    transform: translateY(-1px);
  }

  .new-request-button:active {
    transform: translateY(0);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  }

  .button-icon {
    font-size: 14px;
    font-weight: bold;
  }

  .button-label {
    line-height: 1;
  }

  .dropdown-chevron {
    position: absolute;
    right: 10px;
    font-size: 12px;
    opacity: 0.7;
  }

  .dropdown-backdrop {
    position: fixed;
    inset: 0;
    z-index: 999;
  }

  .dropdown-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    background: var(--hf-dropdown-background, var(--hf-input-background));
    border: 1px solid var(--hf-dropdown-border, var(--hf-panel-border));
    border-radius: 6px;
    padding: 4px;
    z-index: 1000;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px 10px;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--hf-foreground);
    font-size: 12px;
    cursor: pointer;
    text-align: left;
    white-space: nowrap;
  }

  .dropdown-item:hover {
    background: var(--hf-list-hoverBackground);
  }

  .dropdown-item .codicon {
    font-size: 16px;
    width: 16px;
    text-align: center;
    flex-shrink: 0;
  }

  .dropdown-icon {
    flex-shrink: 0;
  }

  .tab-bar {
    display: flex;
    border-bottom: 1px solid var(--hf-panel-border);
    background: var(--hf-sideBar-background);
    flex-shrink: 0;
  }

  .tab-button {
    flex: 1;
    padding: 8px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--hf-foreground);
    cursor: pointer;
    opacity: 0.6;
    transition: opacity 0.15s, border-color 0.15s;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .tab-button:hover {
    opacity: 0.9;
    background: var(--hf-list-hoverBackground);
  }

  .tab-button.active {
    opacity: 1;
    border-bottom-color: var(--hf-focusBorder);
  }

  .tab-content {
    flex: 1;
    overflow: visible;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--hf-descriptionForeground);
    font-size: 12px;
  }
</style>
