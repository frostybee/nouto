<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { postMessage as busPostMessage } from './lib/vscode';
  import CollectionsTab from './components/sidebar/CollectionsTab.svelte';
  import HistoryTab from './components/sidebar/HistoryTab.svelte';
  import TrashTab from './components/sidebar/TrashTab.svelte';
  import { loadEnvironments, loadEnvFileVariables } from './stores/environment.svelte';
  import { collections as collectionsStore, initCollections, duplicateRequest, selectedRequestId, revealActiveRequest } from './stores/collections.svelte';
  import { setDirtyRequestIds } from './stores/dirtyState.svelte';
  import { initHistory, setHistoryStats, setHistoryStatsLoading } from './stores/history.svelte';
  import { ui, setSidebarTab, type SidebarTab } from './stores/ui.svelte';
  import Tooltip from './components/shared/Tooltip.svelte';
  import NotificationStack from './components/shared/NotificationStack.svelte';
  import InputBoxModal from './components/shared/InputBoxModal.svelte';
  import QuickPickModal from './components/shared/QuickPickModal.svelte';
  import ConfirmDialog from './components/shared/ConfirmDialog.svelte';
  import CreateItemDialog from './components/shared/CreateItemDialog.svelte';
  import { showNotification, setPendingInput, clearPendingInput, pendingInput } from './stores/notifications.svelte';
  import { dragState } from './stores/dragdrop.svelte';
  import { loadOnboardingState, markSampleLoaded, completeOnboarding } from './stores/onboarding.svelte';
  import { setAppVersion } from './stores/settings.svelte';
  import { initTrash, autoPurgeTrash, trashCount } from './stores/trash.svelte';
  import { initCollectionUndo, undoCollection, redoCollection, canUndoCollection, canRedoCollection } from './stores/collectionUndo.svelte';

  function handleKeydown(event: KeyboardEvent) {
    const isCtrl = event.ctrlKey || event.metaKey;
    if (!isCtrl || event.key.toLowerCase() !== 'z') return;

    event.preventDefault();
    if (event.shiftKey) {
      // Redo
      if (canRedoCollection()) {
        const label = redoCollection();
        if (label) showNotification('info', `Redo: ${label}`, 2000);
      }
    } else {
      // Undo
      if (canUndoCollection()) {
        const label = undoCollection();
        if (label) showNotification('info', `Undo: ${label}`, 2000);
      }
    }
  }

  let activeTab = $derived(ui.sidebarTab);
  let isLoading = $state(true);
  let activeActionPanel = $state<string | null>(null);

  // Auto-scroll during drag near edges
  // NOTE: .tab-content itself never scrolls. The actual scrollable element is
  // a descendant (.collections-list or .history-list). We discover it lazily
  // via a capture-phase scroll listener and on drag start.
  let tabContentEl = $state<HTMLDivElement>(undefined!);
  let autoScrollRaf = 0;
  let scrollInfo = $state({ top: 0, scrollable: false, atBottom: true });
  let scrollTarget: HTMLElement | null = null;
  const EDGE_ZONE = 40;
  const SCROLL_SPEED = 6;

  function getScrollEl(): HTMLElement | null {
    return scrollTarget || tabContentEl || null;
  }

  // Walk descendants to find the element that actually scrolls
  function discoverScrollTarget() {
    scrollTarget = null;
    if (!tabContentEl) return;
    if (tabContentEl.scrollHeight > tabContentEl.clientHeight) {
      scrollTarget = tabContentEl;
      return;
    }
    for (const el of tabContentEl.querySelectorAll('*')) {
      if (!(el instanceof HTMLElement)) continue;
      const { overflowY } = getComputedStyle(el);
      if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
        scrollTarget = el;
        return;
      }
    }
  }

  // Capture-phase scroll handler: catches scroll events from nested containers
  function handleScrollCapture(e: Event) {
    if (e.target instanceof HTMLElement && e.target !== tabContentEl) {
      scrollTarget = e.target;
    }
    updateScrollInfo();
  }

  function updateScrollInfo() {
    const el = getScrollEl();
    if (!el) return;
    scrollInfo = {
      top: el.scrollTop,
      scrollable: el.scrollHeight > el.clientHeight,
      atBottom: el.scrollTop >= el.scrollHeight - el.clientHeight - 1,
    };
  }

  const showTopHint = $derived(dragState.isDragging && scrollInfo.scrollable && scrollInfo.top > 0);
  const showBottomHint = $derived(dragState.isDragging && scrollInfo.scrollable && !scrollInfo.atBottom);

  // Refresh scroll info when a drag begins so indicators are accurate immediately
  $effect(() => {
    if (dragState.isDragging) {
      discoverScrollTarget();
      updateScrollInfo();
    }
  });

  function handleDragOverCapture(e: DragEvent) {
    if (!tabContentEl || !dragState.isDragging) return;
    const el = getScrollEl();
    if (!el) return;
    // Edge zones relative to the outer container (matches indicator position)
    const rect = tabContentEl.getBoundingClientRect();
    const y = e.clientY;

    cancelAnimationFrame(autoScrollRaf);

    if (y - rect.top < EDGE_ZONE && scrollInfo.top > 0) {
      doAutoScroll(-SCROLL_SPEED);
    } else if (rect.bottom - y < EDGE_ZONE && !scrollInfo.atBottom) {
      doAutoScroll(SCROLL_SPEED);
    }
  }

  function doAutoScroll(delta: number) {
    const el = getScrollEl();
    if (!el) return;
    el.scrollTop += delta;
    updateScrollInfo();
    if (delta < 0 && el.scrollTop <= 0) return;
    if (delta > 0 && el.scrollTop >= el.scrollHeight - el.clientHeight) return;
    autoScrollRaf = requestAnimationFrame(() => doAutoScroll(delta));
  }

  function handleDragEndCapture() {
    cancelAnimationFrame(autoScrollRaf);
  }

  // Message handler
  function handleMessage(event: MessageEvent) {
    const message = event.data;
    try {
    switch (message.type) {
      case 'initialData':
        initCollections(message.data.collections || []);
        if (message.data.appVersion) setAppVersion(message.data.appVersion);
        // Load trash
        if (message.data.trash) {
          initTrash(message.data.trash);
          autoPurgeTrash();
        }
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
        setHistoryStats(message.data);
        setHistoryStatsLoading(false);
        break;

      case 'triggerDuplicateSelected': {
        const reqId = selectedRequestId();
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
      case 'revealActiveRequest':
        revealActiveRequest(message.data?.requestId);
        break;
    }
    } catch (err) {
      console.error('[Nouto] Error handling sidebar message:', message?.type, err);
    }
  }

  onMount(() => {
    loadOnboardingState();
    initCollectionUndo();
    window.addEventListener('message', handleMessage);
    window.addEventListener('keydown', handleKeydown);
    document.addEventListener('dragover', handleDragOverCapture, true);
    document.addEventListener('dragend', handleDragEndCapture, true);
    document.addEventListener('drop', handleDragEndCapture, true);
    // Capture scroll events from nested scrollable containers
    tabContentEl?.addEventListener('scroll', handleScrollCapture, true);

    busPostMessage({ type: 'ready' });
  });

  onDestroy(() => {
    window.removeEventListener('message', handleMessage);
    window.removeEventListener('keydown', handleKeydown);
    document.removeEventListener('dragover', handleDragOverCapture, true);
    document.removeEventListener('dragend', handleDragEndCapture, true);
    document.removeEventListener('drop', handleDragEndCapture, true);
    tabContentEl?.removeEventListener('scroll', handleScrollCapture, true);
    cancelAnimationFrame(autoScrollRaf);
  });

  function postMessage(message: any) {
    busPostMessage(message);
  }

  let newRequestDropdownOpen = $state(false);

  function handleNewRequest() {
    postMessage({ type: 'newRequest', data: { requestKind: 'http' } });
  }

  function toggleNewRequestDropdown(e: MouseEvent) {
    e.stopPropagation();
    newRequestDropdownOpen = !newRequestDropdownOpen;
  }

  function handleNewRequestKind(kind: string) {
    newRequestDropdownOpen = false;
    postMessage({ type: 'newRequest', data: { requestKind: kind } });
  }

  // Tab handlers
  function setActiveTab(tab: SidebarTab) {
    setSidebarTab(tab);
  }

  // UI Interaction response helpers
  function respondInputBox(value: string | null) {
    const pending = pendingInput();
    if (pending?.type === 'inputBox') {
      busPostMessage({ type: 'inputBoxResult', data: { requestId: pending.requestId, value } } as any);
      clearPendingInput();
    }
  }

  function respondQuickPick(value: string | string[] | null) {
    const pending = pendingInput();
    if (pending?.type === 'quickPick') {
      busPostMessage({ type: 'quickPickResult', data: { requestId: pending.requestId, value } } as any);
      clearPendingInput();
    }
  }

  function respondConfirm(confirmed: boolean) {
    const pending = pendingInput();
    if (pending?.type === 'confirm') {
      busPostMessage({ type: 'confirmResult', data: { requestId: pending.requestId, confirmed } } as any);
      clearPendingInput();
    }
  }

  function respondCreateItemDialog(value: { name: string; color?: string; icon?: string } | null) {
    const pending = pendingInput();
    if (pending?.type === 'createItemDialog') {
      busPostMessage({ type: 'createItemDialogResult', data: { requestId: pending.requestId, value } } as any);
      clearPendingInput();
    }
  }
</script>

<NotificationStack />

{#if pendingInput()?.type === 'inputBox'}
  <InputBoxModal
    open={true}
    prompt={pendingInput()?.data?.prompt}
    placeholder={pendingInput()?.data?.placeholder}
    value={pendingInput()?.data?.value}
    validateNotEmpty={pendingInput()?.data?.validateNotEmpty}
    onsubmit={(value) => respondInputBox(value)}
    oncancel={() => respondInputBox(null)}
  />
{:else if pendingInput()?.type === 'quickPick'}
  <QuickPickModal
    open={true}
    title={pendingInput()?.data?.title}
    items={pendingInput()?.data?.items}
    canPickMany={pendingInput()?.data?.canPickMany}
    onselect={(value) => respondQuickPick(value)}
    oncancel={() => respondQuickPick(null)}
  />
{:else if pendingInput()?.type === 'confirm'}
  <ConfirmDialog
    open={true}
    message={pendingInput()?.data?.message}
    confirmLabel={pendingInput()?.data?.confirmLabel}
    variant={pendingInput()?.data?.variant}
    onconfirm={() => respondConfirm(true)}
    oncancel={() => respondConfirm(false)}
  />
{:else if pendingInput()?.type === 'createItemDialog'}
  <CreateItemDialog
    mode={pendingInput()?.data?.mode}
    oncreate={(data) => respondCreateItemDialog(data)}
    oncancel={() => respondCreateItemDialog(null)}
  />
{/if}

<div class="sidebar">
  <div class="action-bar">
    <Tooltip text="Environments">
      <button class="action-bar-btn" class:active={activeActionPanel === 'environments'} onclick={() => { activeActionPanel = 'environments'; postMessage({ type: 'openEnvironmentsPanel' }); }} aria-label="Environments">
        <span class="codicon codicon-symbol-variable"></span>
      </button>
    </Tooltip>
    <Tooltip text="Settings">
      <button class="action-bar-btn" class:active={activeActionPanel === 'settings'} onclick={() => { activeActionPanel = 'settings'; postMessage({ type: 'openSettings' }); }} aria-label="Settings">
        <span class="codicon codicon-gear"></span>
      </button>
    </Tooltip>
    <Tooltip text="Cookie Jars">
      <button class="action-bar-btn" class:active={activeActionPanel === 'cookieJar'} onclick={() => { activeActionPanel = 'cookieJar'; postMessage({ type: 'openEnvironmentsPanel', data: { tab: 'cookieJar' } }); }} aria-label="Cookie Jars">
        <span class="codicon codicon-globe"></span>
      </button>
    </Tooltip>
    <Tooltip text="Mock Server">
      <button class="action-bar-btn" class:active={activeActionPanel === 'mockServer'} onclick={() => { activeActionPanel = 'mockServer'; postMessage({ type: 'openMockServer' }); }} aria-label="Mock Server">
        <span class="codicon codicon-server"></span>
      </button>
    </Tooltip>
  </div>

  <div class="sidebar-main">
  <div class="new-request-bar">
    <div class="new-request-dropdown">
      <Tooltip text="New Request (Ctrl+N)">
        <div class="new-request-group">
          <button class="new-request-button" onclick={handleNewRequest}>
            <span class="button-icon codicon codicon-add"></span>
            <span class="button-label">New Request</span>
          </button>
          <span class="new-request-divider"></span>
          <button
            class="new-request-arrow"
            onclick={toggleNewRequestDropdown}
            type="button"
            aria-label="Request type options"
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 10.5L2.5 5h11L8 10.5z"/>
            </svg>
          </button>
        </div>
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
          <button class="dropdown-item" onclick={() => handleNewRequestKind('graphql-subscription')}>
            <span class="codicon codicon-radio-tower"></span>
            New GraphQL Subscription
          </button>
          <button class="dropdown-item" onclick={() => handleNewRequestKind('websocket')}>
            <span class="codicon codicon-plug"></span>
            New WebSocket
          </button>
          <button class="dropdown-item" onclick={() => handleNewRequestKind('sse')}>
            <span class="codicon codicon-broadcast"></span>
            New SSE Connection
          </button>
          <button class="dropdown-item" onclick={() => handleNewRequestKind('grpc')}>
            <span class="codicon codicon-server"></span>
            New gRPC Call
          </button>
        </div>
      {/if}
    </div>
  </div>

  <div class="tab-bar">
      <button
        class="tab-button"
        class:active={activeTab === 'collections'}
        onclick={() => setActiveTab('collections')}
        title="Collections"
      >
        <span class="tab-icon codicon codicon-folder-library"></span>
        Collections
      </button>
      <button
        class="tab-button"
        class:active={activeTab === 'history'}
        onclick={() => setActiveTab('history')}
        title="History"
      >
        <span class="tab-icon codicon codicon-history"></span>
        History
      </button>
      <button
        class="tab-button"
        class:active={activeTab === 'trash'}
        onclick={() => setActiveTab('trash')}
        title="Trash"
      >
        <span class="tab-icon codicon codicon-trash"></span>
        Trash
        {#if trashCount() > 0}
          <span class="trash-badge">{trashCount()}</span>
        {/if}
      </button>
    </div>

  <div class="tab-content-wrapper">
    <div class="scroll-indicator scroll-indicator-top" class:visible={showTopHint}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 5.5L2.5 11h11L8 5.5z"/></svg>
    </div>
    <div class="tab-content" bind:this={tabContentEl}>
        {#if isLoading}
          <div class="loading">Loading...</div>
        {:else if activeTab === 'collections'}
          <CollectionsTab {postMessage} onLoadSampleCollection={() => { postMessage({ type: 'loadSampleCollection' }); markSampleLoaded(); completeOnboarding(); }} />
        {:else if activeTab === 'history'}
          <HistoryTab {postMessage} />
        {:else if activeTab === 'trash'}
          <TrashTab />
        {/if}
    </div>
    <div class="scroll-indicator scroll-indicator-bottom" class:visible={showBottomHint}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 10.5L2.5 5h11L8 10.5z"/></svg>
    </div>
  </div>
  </div>

</div>

<style>
  .sidebar {
    height: 100%;
    display: flex;
    flex-direction: row;
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
    right: -2px;
    top: 50%;
    transform: translateY(-50%);
    width: 10px;
    height: 50px;
    background: var(--hf-scrollbarSlider-background);
    border-radius: 4px;
    pointer-events: none;
    z-index: 992;
  }

  .action-bar {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 8px 4px;
    flex-shrink: 0;
    border-right: 1px solid var(--hf-panel-border);
  }

  .action-bar-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--hf-foreground);
    cursor: pointer;
    opacity: 0.8;
    transition: opacity 0.15s, background 0.15s;
    position: relative;
  }

  .action-bar-btn:hover {
    opacity: 1;
    background: var(--hf-list-hoverBackground);
  }

  .action-bar-btn.active {
    opacity: 1;
  }

  .action-bar-btn.active::before {
    content: '';
    position: absolute;
    left: -4px;
    top: 4px;
    bottom: 4px;
    width: 2px;
    border-radius: 1px;
    background: var(--hf-focusBorder, var(--hf-button-background));
  }

  .action-bar-btn .codicon {
    font-size: 16px;
  }

  .sidebar-main {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    overflow: visible;
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

  .new-request-group {
    display: flex;
    align-items: stretch;
    width: 100%;
    border-radius: 6px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  }

  .new-request-group:hover {
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
  }

  .new-request-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    flex: 1;
    padding: 8px 12px;
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
    border: none;
    border-radius: 0;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
    white-space: nowrap;
  }

  .new-request-button:hover {
    background: var(--hf-button-hoverBackground);
  }

  .new-request-divider {
    width: 1px;
    background: rgba(255, 255, 255, 0.3);
  }

  .new-request-arrow {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px 16px;
    background: var(--hf-button-background);
    color: var(--hf-button-foreground);
    border: none;
    cursor: pointer;
    transition: background 0.15s;
  }

  .new-request-arrow:hover {
    background: var(--hf-button-hoverBackground);
  }

  .button-icon {
    font-size: 14px;
    font-weight: bold;
  }

  .button-label {
    line-height: 1;
  }

  .dropdown-backdrop {
    position: fixed;
    inset: 0;
    z-index: 999;
  }

  .dropdown-menu {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 4px;
    background: var(--hf-dropdown-background, var(--hf-input-background));
    border: 1px solid var(--hf-dropdown-border, var(--hf-panel-border));
    border-radius: 6px;
    padding: 4px;
    z-index: 1000;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    width: max-content;
    min-width: 100%;
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
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
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
    user-select: none;
  }

  .tab-icon {
    font-size: 13px;
  }

  .tab-button:hover {
    opacity: 0.9;
    background: var(--hf-list-hoverBackground);
  }

  .tab-button.active {
    opacity: 1;
    border-bottom-color: var(--hf-focusBorder);
  }

  .trash-badge {
    background: var(--hf-badge-background, #4d4d4d);
    color: var(--hf-badge-foreground, #fff);
    font-size: 9px;
    padding: 1px 4px;
    border-radius: 8px;
    font-weight: 600;
    min-width: 14px;
    text-align: center;
  }

  .tab-content-wrapper {
    flex: 1;
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .tab-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
    min-height: 0;
    isolation: isolate;
  }

  .scroll-indicator {
    position: absolute;
    left: 0;
    right: 0;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .scroll-indicator.visible {
    opacity: 1;
    animation: pulse-fade 0.8s ease-in-out infinite alternate;
  }

  .scroll-indicator-top {
    top: 0;
    background: linear-gradient(to bottom, color-mix(in srgb, var(--hf-focusBorder) 70%, transparent) 0%, color-mix(in srgb, var(--hf-focusBorder) 25%, transparent) 60%, transparent 100%);
  }

  .scroll-indicator-bottom {
    bottom: 0;
    background: linear-gradient(to top, color-mix(in srgb, var(--hf-focusBorder) 70%, transparent) 0%, color-mix(in srgb, var(--hf-focusBorder) 25%, transparent) 60%, transparent 100%);
  }

  .scroll-indicator svg {
    color: #fff;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
  }

  @keyframes pulse-fade {
    from { opacity: 0.6; }
    to { opacity: 1; }
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
