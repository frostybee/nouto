// Tab manager store for multi-tab support (desktop app only)
// Each Tab object embeds all per-request state directly.
// Singleton stores are the runtime view of the active tab;
// captureToActiveTab/restoreFromTab sync between them.

import type { ConnectionMode } from '@nouto/core';
import type { ResponseState } from './response.svelte';
import type { RequestState, RequestContext } from './request.svelte';
import { clearRequestUndoStack } from './requestUndo.svelte';

// --- Imports for capture (reading singleton stores) ---
import {
  request as requestStore,
  originalRequest, requestContext,
} from './request.svelte';
import { response } from './response.svelte';
import { assertionResults } from './assertions.svelte';
import { scriptOutput } from './scripts.svelte';
import { wsStatus, wsMessages, wsError } from './websocket.svelte';
import { sseStatus, sseEvents, sseError } from './sse.svelte';
import { gqlSubStatus, gqlSubEvents, gqlSubError } from './graphqlSubscription.svelte';
import { ui } from './ui.svelte';

// --- Imports for restore (bulk setters) ---
import { bulkSetRequest } from './request.svelte';
import { bulkSetResponseState } from './response.svelte';
import { bulkSetAssertionState } from './assertions.svelte';
import { bulkSetScriptState } from './scripts.svelte';
import { bulkSetWsState } from './websocket.svelte';
import { bulkSetSseState } from './sse.svelte';
import { bulkSetGqlSubState } from './graphqlSubscription.svelte';
import { bulkSetPerTabUI } from './ui.svelte';

// --- Types ---

export type TabType = 'request' | 'settings' | 'environments' | 'collection-settings';

export interface Tab {
  // --- Metadata ---
  id: string;
  type: TabType;
  label: string;
  icon?: string;
  closable: boolean;
  dirty: boolean;
  pinned?: boolean;
  lastActivatedAt?: number;
  requestId?: string | null;
  collectionId?: string | null;
  collectionName?: string | null;

  // --- Per-tab request state ---
  method: string;
  url: string;
  params: any[];
  pathParams: any[];
  headers: any[];
  auth: any;
  body: any;
  assertions: any[];
  scripts: any;
  ssl: any;
  proxy: any;
  timeout: number | undefined;
  followRedirects: boolean | undefined;
  maxRedirects: number | undefined;
  description: string;
  authInheritance: any;
  scriptInheritance: any;
  grpc: any;

  // --- Per-tab response state ---
  response: ResponseState | null;
  isLoading: boolean;
  downloadProgress: { loaded: number; total: number | null } | null;

  // --- Per-tab results ---
  assertionResults: any[];
  scriptOutput: { preRequest: any; postResponse: any };

  // --- Per-tab protocol state ---
  wsState: { status: string; messages: any[]; error: string | null };
  sseState: { status: string; events: any[]; error: string | null };
  gqlSubState: { status: string; events: any[]; error: string | null };

  // --- Per-tab UI state ---
  requestTab: string;
  responseTab: string;
  connectionMode: ConnectionMode;

  // --- Per-tab identity ---
  context: {
    panelId: string;
    requestId: string | null;
    collectionId: string | null;
    collectionName: string | null;
  };
  originalSnapshot: any;
}

// --- Default state factory ---

export function createDefaultTabState(): Omit<Tab, 'id' | 'type' | 'label' | 'closable' | 'dirty'> {
  return {
    requestId: null,
    collectionId: null,
    collectionName: null,
    method: 'GET',
    url: '',
    params: [],
    pathParams: [],
    headers: [],
    auth: { type: 'none' },
    body: { type: 'none', content: '' },
    assertions: [],
    scripts: { preRequest: '', postResponse: '' },
    ssl: undefined,
    proxy: undefined,
    timeout: undefined,
    followRedirects: undefined,
    maxRedirects: undefined,
    description: '',
    authInheritance: undefined,
    scriptInheritance: undefined,
    grpc: undefined,
    response: null,
    isLoading: false,
    downloadProgress: null,
    assertionResults: [],
    scriptOutput: { preRequest: null, postResponse: null },
    wsState: { status: 'disconnected', messages: [], error: null },
    sseState: { status: 'disconnected', events: [], error: null },
    gqlSubState: { status: 'disconnected', events: [], error: null },
    requestTab: 'query',
    responseTab: 'body',
    connectionMode: 'http',
    context: { panelId: '', requestId: null, collectionId: null, collectionName: null },
    originalSnapshot: null,
  };
}

// --- Constants ---

const MAX_TABS = 30;

// --- State ---

let _tabs = $state<Tab[]>([]);
let _activeTabId = $state<string | null>(null);
let _persistTimer: ReturnType<typeof setTimeout> | null = null;

// Tab search overlay
let _tabSearchOpen = $state(false);

// --- Getters ---

export function tabs(): Tab[] { return _tabs; }
export function activeTabId(): string | null { return _activeTabId; }
export function activeTab(): Tab | undefined { return _tabs.find(t => t.id === _activeTabId); }

// Tab search
export function tabSearchOpen(): boolean { return _tabSearchOpen; }
export function openTabSearch(): void { _tabSearchOpen = true; }
export function closeTabSearch(): void { _tabSearchOpen = false; }

// --- Deep clone helper ---

function deepClone<T>(value: T): T {
  if (value === null || value === undefined) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    // Fallback for non-serializable values (circular refs, BigInt, etc.)
    return value;
  }
}

// --- Capture / Restore ---

// Capture current singleton store state into the active tab's fields
function captureToActiveTab(): void {
  const tab = _tabs.find(t => t.id === _activeTabId);
  if (!tab) return;

  const ctx = requestContext();

  tab.method = requestStore.method;
  tab.url = requestStore.url;
  tab.params = deepClone(requestStore.params);
  tab.pathParams = deepClone(requestStore.pathParams);
  tab.headers = deepClone(requestStore.headers);
  tab.auth = deepClone(requestStore.auth);
  tab.body = deepClone(requestStore.body);
  tab.assertions = deepClone(requestStore.assertions);
  tab.scripts = deepClone(requestStore.scripts);
  tab.ssl = deepClone(requestStore.ssl);
  tab.proxy = deepClone(requestStore.proxy);
  tab.timeout = requestStore.timeout;
  tab.followRedirects = requestStore.followRedirects;
  tab.maxRedirects = requestStore.maxRedirects;
  tab.description = requestStore.description;
  tab.authInheritance = requestStore.authInheritance;
  tab.scriptInheritance = requestStore.scriptInheritance;
  tab.grpc = deepClone(requestStore.grpc);

  tab.response = deepClone(response());
  tab.isLoading = false;
  tab.downloadProgress = null;

  tab.assertionResults = deepClone(assertionResults());
  tab.scriptOutput = deepClone({ preRequest: scriptOutput.preRequest, postResponse: scriptOutput.postResponse });

  tab.wsState = { status: wsStatus(), messages: deepClone(wsMessages()), error: wsError() };
  tab.sseState = { status: sseStatus(), events: deepClone(sseEvents()), error: sseError() };
  tab.gqlSubState = { status: gqlSubStatus(), events: deepClone(gqlSubEvents()), error: gqlSubError() };

  tab.requestTab = ui.requestTab;
  tab.responseTab = ui.responseTab;
  tab.connectionMode = ui.connectionMode;

  tab.context = {
    panelId: ctx?.panelId || '',
    requestId: ctx?.requestId || null,
    collectionId: ctx?.collectionId || null,
    collectionName: ctx?.collectionName || null,
  };
  tab.originalSnapshot = deepClone(originalRequest());
}

// Public version: returns a snapshot of the current singleton stores as partial Tab data.
// Used by App.svelte for handleDuplicateTab and similar flows.
export function saveCurrentSnapshot(): Partial<Tab> {
  const ctx = requestContext();
  return {
    method: requestStore.method,
    url: requestStore.url,
    params: deepClone(requestStore.params),
    pathParams: deepClone(requestStore.pathParams),
    headers: deepClone(requestStore.headers),
    auth: deepClone(requestStore.auth),
    body: deepClone(requestStore.body),
    assertions: deepClone(requestStore.assertions),
    scripts: deepClone(requestStore.scripts),
    ssl: deepClone(requestStore.ssl),
    proxy: deepClone(requestStore.proxy),
    timeout: requestStore.timeout,
    followRedirects: requestStore.followRedirects,
    maxRedirects: requestStore.maxRedirects,
    description: requestStore.description,
    authInheritance: requestStore.authInheritance,
    scriptInheritance: requestStore.scriptInheritance,
    grpc: deepClone(requestStore.grpc),
    response: deepClone(response()),
    isLoading: false,
    downloadProgress: null,
    assertionResults: deepClone(assertionResults()),
    scriptOutput: deepClone({ preRequest: scriptOutput.preRequest, postResponse: scriptOutput.postResponse }),
    wsState: { status: wsStatus(), messages: deepClone(wsMessages()), error: wsError() },
    sseState: { status: sseStatus(), events: deepClone(sseEvents()), error: sseError() },
    gqlSubState: { status: gqlSubStatus(), events: deepClone(gqlSubEvents()), error: gqlSubError() },
    requestTab: ui.requestTab,
    responseTab: ui.responseTab,
    connectionMode: ui.connectionMode,
    context: {
      panelId: ctx?.panelId || '',
      requestId: ctx?.requestId || null,
      collectionId: ctx?.collectionId || null,
      collectionName: ctx?.collectionName || null,
    },
    originalSnapshot: deepClone(originalRequest()),
  };
}

// Restore a tab's embedded state into the singleton stores using bulk setters
function restoreFromTab(tab: Tab): void {
  if (!tab) return;

  bulkSetRequest({
    method: tab.method,
    url: tab.url,
    params: tab.params,
    pathParams: tab.pathParams,
    headers: tab.headers,
    auth: tab.auth,
    body: tab.body,
    assertions: tab.assertions,
    scripts: tab.scripts,
    ssl: tab.ssl,
    proxy: tab.proxy,
    timeout: tab.timeout,
    followRedirects: tab.followRedirects,
    maxRedirects: tab.maxRedirects,
    description: tab.description,
    authInheritance: tab.authInheritance,
    scriptInheritance: tab.scriptInheritance,
    grpc: tab.grpc,
    context: tab.context,
    originalSnapshot: tab.originalSnapshot,
  });

  bulkSetResponseState({
    response: tab.response,
    isLoading: false,
    downloadProgress: null,
  });

  bulkSetAssertionState(tab.assertionResults);

  bulkSetScriptState(tab.scriptOutput || { preRequest: null, postResponse: null });

  bulkSetWsState(tab.wsState || { status: 'disconnected', messages: [], error: null });
  bulkSetSseState(tab.sseState || { status: 'disconnected', events: [], error: null });
  bulkSetGqlSubState(tab.gqlSubState || { status: 'disconnected', events: [], error: null });

  bulkSetPerTabUI({
    requestTab: tab.requestTab,
    responseTab: tab.responseTab,
    connectionMode: tab.connectionMode,
  });
}

// Reset all singleton stores to defaults (when no tabs remain)
function clearAllStores(): void {
  const defaults = createDefaultTabState();
  bulkSetRequest({
    method: defaults.method,
    url: defaults.url,
    params: defaults.params,
    pathParams: defaults.pathParams,
    headers: defaults.headers,
    auth: defaults.auth,
    body: defaults.body,
    assertions: defaults.assertions,
    scripts: defaults.scripts,
    ssl: defaults.ssl,
    proxy: defaults.proxy,
    timeout: defaults.timeout,
    followRedirects: defaults.followRedirects,
    maxRedirects: defaults.maxRedirects,
    description: defaults.description,
    authInheritance: defaults.authInheritance,
    scriptInheritance: defaults.scriptInheritance,
    grpc: defaults.grpc,
    context: null,
    originalSnapshot: null,
  });
  bulkSetResponseState({ response: null });
  bulkSetAssertionState([]);
  bulkSetScriptState({ preRequest: null, postResponse: null });
  bulkSetWsState({ status: 'disconnected', messages: [], error: null });
  bulkSetSseState({ status: 'disconnected', events: [], error: null });
  bulkSetGqlSubState({ status: 'disconnected', events: [], error: null });
  bulkSetPerTabUI({ requestTab: 'query', responseTab: 'body', connectionMode: 'http' });
}

// --- Tab Operations ---

export function openTab(tab: Tab): void {
  // Check if tab already exists (for singleton tabs like settings)
  const existing = _tabs.find(t => t.id === tab.id);
  if (existing) {
    switchTab(tab.id);
    return;
  }

  // Save current tab state before opening new one
  if (_activeTabId) {
    try { captureToActiveTab(); } catch (e) {
      console.error('[Nouto Tabs] Failed to capture departing tab state:', e);
    }
  }

  tab.lastActivatedAt = Date.now();
  _tabs = [..._tabs, tab];
  _activeTabId = tab.id;

  // Tab limit enforcement: auto-close oldest unpinned, non-dirty tab
  if (_tabs.length > MAX_TABS) {
    const candidates = _tabs.filter(t => t.id !== tab.id && !t.pinned && !t.dirty && t.closable);
    if (candidates.length > 0) {
      candidates.sort((a, b) => (a.lastActivatedAt || 0) - (b.lastActivatedAt || 0));
      const victim = candidates[0];
      _tabs = _tabs.filter(t => t.id !== victim.id);
    }
  }

  try { restoreFromTab(tab); } catch (e) {
    console.error('[Nouto Tabs] Failed to restore new tab state, clearing stores:', e);
    clearAllStores();
  }
  schedulePersist();
}

export function closeTab(tabId: string): void {
  const idx = _tabs.findIndex(t => t.id === tabId);
  if (idx === -1) return;

  const tab = _tabs[idx];
  if (!tab.closable || tab.pinned) return;

  // Clean up undo stack for this tab
  clearRequestUndoStack(tabId);

  // Determine new active tab
  if (_activeTabId === tabId) {
    const remaining = _tabs.filter(t => t.id !== tabId);
    if (remaining.length > 0) {
      // Prefer the tab to the right, then to the left
      const newIdx = Math.min(idx, remaining.length - 1);
      const newActive = remaining[newIdx];
      _tabs = remaining;
      _activeTabId = newActive.id;
      try { restoreFromTab(newActive); } catch (e) {
        console.error('[Nouto Tabs] Failed to restore tab after close, clearing stores:', e);
        clearAllStores();
      }
    } else {
      _tabs = [];
      _activeTabId = null;
      clearAllStores();
    }
  } else {
    _tabs = _tabs.filter(t => t.id !== tabId);
  }

  schedulePersist();
}

export function switchTab(tabId: string): void {
  if (tabId === _activeTabId) return;
  const target = _tabs.find(t => t.id === tabId);
  if (!target) return;

  // Save current tab state
  if (_activeTabId) {
    try { captureToActiveTab(); } catch (e) {
      console.error('[Nouto Tabs] Failed to capture departing tab state:', e);
    }
  }

  target.lastActivatedAt = Date.now();
  _activeTabId = tabId;
  try { restoreFromTab(target); } catch (e) {
    console.error('[Nouto Tabs] Failed to restore target tab state, clearing stores:', e);
    clearAllStores();
  }
  schedulePersist();
}

export function updateTabLabel(tabId: string, label: string): void {
  _tabs = _tabs.map(t => t.id === tabId ? { ...t, label } : t);
  schedulePersist();
}

export function setTabDirty(tabId: string, dirty: boolean): void {
  _tabs = _tabs.map(t => t.id === tabId ? { ...t, dirty } : t);
}

export function setTabIcon(tabId: string, icon: string): void {
  _tabs = _tabs.map(t => t.id === tabId ? { ...t, icon } : t);
}

export function setTabRequestId(tabId: string, requestId: string | null, collectionId?: string | null, collectionName?: string | null): void {
  _tabs = _tabs.map(t => t.id === tabId ? { ...t, requestId, collectionId: collectionId ?? t.collectionId, collectionName: collectionName ?? t.collectionName } : t);
  schedulePersist();
}

export function reorderTabs(fromIndex: number, toIndex: number): void {
  const reordered = [..._tabs];
  const movedTab = reordered[fromIndex];
  if (!movedTab) return;

  // Enforce pinned/unpinned boundary
  const pinnedCount = reordered.filter(t => t.pinned).length;
  if (movedTab.pinned) {
    // Pinned tabs can only reorder among pinned tabs (indices 0..pinnedCount-1)
    toIndex = Math.min(toIndex, pinnedCount - 1);
  } else {
    // Unpinned tabs can only reorder among unpinned tabs (indices pinnedCount..)
    toIndex = Math.max(toIndex, pinnedCount);
  }

  const [moved] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, moved);
  _tabs = reordered;
  schedulePersist();
}

// --- Pin / Unpin ---

export function pinTab(tabId: string): void {
  const tab = _tabs.find(t => t.id === tabId);
  if (!tab || tab.pinned) return;

  tab.pinned = true;
  // Move to end of pinned section (before first unpinned tab)
  const without = _tabs.filter(t => t.id !== tabId);
  const pinnedCount = without.filter(t => t.pinned).length;
  without.splice(pinnedCount, 0, tab);
  _tabs = without;
  schedulePersist();
}

export function unpinTab(tabId: string): void {
  const tab = _tabs.find(t => t.id === tabId);
  if (!tab || !tab.pinned) return;

  tab.pinned = false;
  // Move to beginning of unpinned section (right after last pinned tab)
  const without = _tabs.filter(t => t.id !== tabId);
  const pinnedCount = without.filter(t => t.pinned).length;
  without.splice(pinnedCount, 0, tab);
  _tabs = without;
  schedulePersist();
}

export function findTabByRequestId(requestId: string): Tab | undefined {
  return _tabs.find(t => t.type === 'request' && t.requestId === requestId);
}

export function findSingletonTab(type: TabType): Tab | undefined {
  return _tabs.find(t => t.type === type);
}

export function closeOtherTabs(tabId: string): void {
  const keep = _tabs.find(t => t.id === tabId);
  if (!keep) return;

  _tabs = _tabs.filter(t => t.id === tabId || !t.closable || t.pinned);

  if (_activeTabId !== tabId) {
    switchTab(tabId);
  }

  schedulePersist();
}

export function closeAllTabs(): void {
  _tabs = _tabs.filter(t => !t.closable || t.pinned);

  if (_tabs.length > 0) {
    if (!_tabs.find(t => t.id === _activeTabId)) {
      _activeTabId = _tabs[0].id;
      try { restoreFromTab(_tabs[0]); } catch (e) {
        console.error('[Nouto Tabs] Failed to restore tab after close all, clearing stores:', e);
        clearAllStores();
      }
    }
  } else {
    _activeTabId = null;
    clearAllStores();
  }

  schedulePersist();
}

// --- Session Persistence ---

const STORAGE_KEY = 'nouto_tabs';

// Max sizes for persisted data to avoid hitting localStorage limits
const MAX_PERSISTED_RESPONSE_SIZE = 1024 * 1024; // 1 MB
const MAX_PERSISTED_MESSAGES = 100;

function schedulePersist(): void {
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    persistToStorage();
  }, 500);
}

function truncateForPersistence(tab: Tab): Tab {
  const clone = { ...tab };

  // Truncate large response bodies
  if (clone.response?.data) {
    try {
      const dataStr = typeof clone.response.data === 'string'
        ? clone.response.data
        : JSON.stringify(clone.response.data);
      if (dataStr && dataStr.length > MAX_PERSISTED_RESPONSE_SIZE) {
        clone.response = { ...clone.response, data: '[truncated for storage]' };
      }
    } catch {
      // Non-serializable response data, truncate to prevent persistence failure
      clone.response = { ...clone.response, data: '[non-serializable]' };
    }
  }

  // Truncate protocol message arrays
  if (clone.wsState?.messages?.length > MAX_PERSISTED_MESSAGES) {
    clone.wsState = { ...clone.wsState, messages: clone.wsState.messages.slice(-MAX_PERSISTED_MESSAGES) };
  }
  if (clone.sseState?.events?.length > MAX_PERSISTED_MESSAGES) {
    clone.sseState = { ...clone.sseState, events: clone.sseState.events.slice(-MAX_PERSISTED_MESSAGES) };
  }
  if (clone.gqlSubState?.events?.length > MAX_PERSISTED_MESSAGES) {
    clone.gqlSubState = { ...clone.gqlSubState, events: clone.gqlSubState.events.slice(-MAX_PERSISTED_MESSAGES) };
  }

  return clone;
}

function persistToStorage(): void {
  try {
    // Capture active tab's current state before persisting
    if (_activeTabId) {
      captureToActiveTab();
    }

    const data = {
      tabs: _tabs.map(truncateForPersistence),
      activeTabId: _activeTabId,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('[Nouto Tabs] Failed to persist tab state:', error);
  }
}

export function loadFromStorage(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const data = JSON.parse(raw);
    if (!data.tabs || !Array.isArray(data.tabs) || data.tabs.length === 0) return;

    // Validate each tab has required fields
    const validTabs = data.tabs.filter((t: any) => t && t.id && t.type);
    if (validTabs.length === 0) return;

    // Backward compatibility: migrate old format (separate snapshots map)
    if (data.snapshots && typeof data.snapshots === 'object') {
      const defaults = createDefaultTabState();
      for (const tab of validTabs) {
        // Only migrate if this tab doesn't already have embedded state
        if (tab.method === undefined) {
          const snap = data.snapshots[tab.id];
          if (snap) {
            Object.assign(tab, snap);
            // Fields in snapshot but not in old Tab: add response extras
            if (tab.isLoading === undefined) tab.isLoading = false;
            if (tab.downloadProgress === undefined) tab.downloadProgress = null;
          } else {
            Object.assign(tab, defaults);
          }
        }
      }
    } else {
      // New format: ensure all tabs have per-tab state (in case of partial data)
      const defaults = createDefaultTabState();
      for (const tab of validTabs) {
        if (tab.method === undefined) {
          Object.assign(tab, defaults);
        }
      }
    }

    _tabs = validTabs;
    _activeTabId = data.activeTabId || null;

    // Ensure activeTabId references a valid tab
    if (_activeTabId && !_tabs.find(t => t.id === _activeTabId)) {
      _activeTabId = _tabs[0].id;
    }

    // Restore the active tab's state into singleton stores
    if (_activeTabId) {
      const active = _tabs.find(t => t.id === _activeTabId);
      if (active) {
        restoreFromTab(active);
      }
    }
  } catch (error) {
    console.error('[Nouto Tabs] Failed to load tab state:', error);
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function clearPersistedState(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// --- Helper to create a new tab ---

let _tabCounter = 0;

export function createRequestTab(label?: string, requestId?: string | null, collectionId?: string | null, collectionName?: string | null): Tab {
  _tabCounter++;
  return {
    id: `tab-${Date.now()}-${_tabCounter}`,
    type: 'request',
    label: label || 'New Request',
    icon: 'GET',
    closable: true,
    dirty: false,
    ...createDefaultTabState(),
    requestId: requestId || null,
    collectionId: collectionId || null,
    collectionName: collectionName || null,
  };
}

export function createSingletonTab(type: 'settings' | 'environments', label: string): Tab {
  return {
    id: `singleton-${type}`,
    type,
    label,
    closable: true,
    dirty: false,
    ...createDefaultTabState(),
  };
}
