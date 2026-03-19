// Tab manager store for multi-tab support (desktop app only)
// Uses swap-on-switch pattern: singleton stores remain singletons,
// but their values are swapped in/out when switching tabs.

import type { ConnectionMode } from '@nouto/core';
import type { ResponseState } from './response.svelte';
import type { RequestState, RequestContext } from './request.svelte';

// --- Imports for snapshot/restore ---
import {
  request as requestStore,
  setMethod, setUrl, setParams, setPathParams, setHeaders, setAuth, setBody,
  setAssertions, setAuthInheritance, setScriptInheritance, setScripts,
  setDescription, setSsl, setProxy, setTimeout as setRequestTimeout,
  setRedirects, setGrpc,
  originalRequest, requestContext,
  setOriginalSnapshot, clearOriginalSnapshot,
  setRequestContext, clearRequestContext,
} from './request.svelte';
import { response, setResponse, clearResponse, setLoading } from './response.svelte';
import { assertionResults, setAssertionResults, clearAssertionResults } from './assertions.svelte';
import { scriptOutput, setScriptOutput, clearScriptOutput } from './scripts.svelte';
import { wsStatus, wsMessages, wsError, setWsStatus, clearWsMessages } from './websocket.svelte';
import { sseStatus, sseEvents, sseError, setSSEStatus, clearSSEEvents } from './sse.svelte';
import { gqlSubStatus, gqlSubEvents, gqlSubError, setGqlSubStatus, clearGqlSubEvents } from './graphqlSubscription.svelte';
import { ui, setRequestTab, setResponseTab, setConnectionMode } from './ui.svelte';

// --- Types ---

export type TabType = 'request' | 'settings' | 'environments' | 'collection-settings';

export interface Tab {
  id: string;
  type: TabType;
  label: string;
  icon?: string;
  closable: boolean;
  dirty: boolean;
  requestId?: string | null;
  collectionId?: string | null;
  collectionName?: string | null;
  connectionMode?: ConnectionMode;
}

export interface TabSnapshot {
  // Request state
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

  // Response state
  response: ResponseState | null;

  // Assertion/script results
  assertionResults: any[];
  scriptOutput: { preRequest: any; postResponse: any };

  // Protocol state
  wsState: { status: string; messages: any[]; error: string | null };
  sseState: { status: string; events: any[]; error: string | null };
  gqlSubState: { status: string; events: any[]; error: string | null };

  // UI state (per-tab portion)
  requestTab: string;
  responseTab: string;
  connectionMode: ConnectionMode;

  // Identity
  context: {
    panelId: string;
    requestId: string | null;
    collectionId: string | null;
    collectionName: string | null;
  };
  originalSnapshot: any;
}

// --- State ---

let _tabs = $state<Tab[]>([]);
let _activeTabId = $state<string | null>(null);
let _snapshots: Map<string, TabSnapshot> = new Map();
let _persistTimer: ReturnType<typeof setTimeout> | null = null;

// --- Getters ---

export function tabs(): Tab[] { return _tabs; }
export function activeTabId(): string | null { return _activeTabId; }
export function activeTab(): Tab | undefined { return _tabs.find(t => t.id === _activeTabId); }

// --- Tab Operations ---

export function openTab(tab: Tab, snapshot?: TabSnapshot): void {
  // Check if tab already exists (for singleton tabs like settings)
  const existing = _tabs.find(t => t.id === tab.id);
  if (existing) {
    switchTab(tab.id);
    return;
  }

  // Save current tab state before opening new one
  if (_activeTabId) {
    const current = saveCurrentSnapshot();
    _snapshots.set(_activeTabId, current);
  }

  _tabs = [..._tabs, tab];
  _activeTabId = tab.id;

  if (snapshot) {
    _snapshots.set(tab.id, snapshot);
    restoreSnapshot(snapshot);
  }

  schedulePersist();
}

export function closeTab(tabId: string): void {
  const idx = _tabs.findIndex(t => t.id === tabId);
  if (idx === -1) return;

  const tab = _tabs[idx];
  if (!tab.closable) return;

  // Remove snapshot
  _snapshots.delete(tabId);

  // Determine new active tab
  if (_activeTabId === tabId) {
    // Save nothing for the closing tab
    const remaining = _tabs.filter(t => t.id !== tabId);
    if (remaining.length > 0) {
      // Prefer the tab to the right, then to the left
      const newIdx = Math.min(idx, remaining.length - 1);
      const newActive = remaining[newIdx];
      _tabs = remaining;
      _activeTabId = newActive.id;

      // Restore the new active tab's snapshot
      const snap = _snapshots.get(newActive.id);
      if (snap) {
        restoreSnapshot(snap);
      } else {
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
    const current = saveCurrentSnapshot();
    _snapshots.set(_activeTabId, current);
  }

  _activeTabId = tabId;

  // Restore target tab state
  const snap = _snapshots.get(tabId);
  if (snap) {
    restoreSnapshot(snap);
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
  const [moved] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, moved);
  _tabs = reordered;
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

  // Remove snapshots for closed tabs
  for (const t of _tabs) {
    if (t.id !== tabId && t.closable) {
      _snapshots.delete(t.id);
    }
  }

  _tabs = _tabs.filter(t => t.id === tabId || !t.closable);

  if (_activeTabId !== tabId) {
    switchTab(tabId);
  }

  schedulePersist();
}

export function closeAllTabs(): void {
  const closable = _tabs.filter(t => t.closable);
  for (const t of closable) {
    _snapshots.delete(t.id);
  }

  _tabs = _tabs.filter(t => !t.closable);

  if (_tabs.length > 0) {
    if (!_tabs.find(t => t.id === _activeTabId)) {
      _activeTabId = _tabs[0].id;
      const snap = _snapshots.get(_tabs[0].id);
      if (snap) restoreSnapshot(snap);
    }
  } else {
    _activeTabId = null;
    clearAllStores();
  }

  schedulePersist();
}

// --- Snapshot Operations ---

function deepClone<T>(value: T): T {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

export function saveCurrentSnapshot(): TabSnapshot {
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

export function restoreSnapshot(snapshot: TabSnapshot): void {
  if (!snapshot) return;

  // Restore request state
  setMethod((snapshot.method || 'GET') as any);
  setUrl(snapshot.url || '');
  setParams(Array.isArray(snapshot.params) ? snapshot.params : []);
  setPathParams(Array.isArray(snapshot.pathParams) ? snapshot.pathParams : []);
  setHeaders(Array.isArray(snapshot.headers) ? snapshot.headers : []);
  setAuth(snapshot.auth || { type: 'none' });
  setBody(snapshot.body || { type: 'none', content: '' });
  setAssertions(Array.isArray(snapshot.assertions) ? snapshot.assertions : []);
  setAuthInheritance(snapshot.authInheritance);
  setScriptInheritance(snapshot.scriptInheritance);
  setScripts(snapshot.scripts || { preRequest: '', postResponse: '' });
  setDescription(snapshot.description || '');
  setSsl(snapshot.ssl);
  setProxy(snapshot.proxy);
  setRequestTimeout(snapshot.timeout);
  setRedirects(snapshot.followRedirects, snapshot.maxRedirects);
  setGrpc(snapshot.grpc);

  // Restore response state
  if (snapshot.response) {
    setResponse(snapshot.response);
  } else {
    clearResponse();
  }
  setLoading(false);

  // Restore assertion/script results
  if (snapshot.assertionResults?.length > 0) {
    setAssertionResults(snapshot.assertionResults);
  } else {
    clearAssertionResults();
  }
  if (snapshot.scriptOutput?.preRequest) {
    setScriptOutput('preRequest', snapshot.scriptOutput.preRequest);
  }
  if (snapshot.scriptOutput?.postResponse) {
    setScriptOutput('postResponse', snapshot.scriptOutput.postResponse);
  }
  if (!snapshot.scriptOutput?.preRequest && !snapshot.scriptOutput?.postResponse) {
    clearScriptOutput();
  }

  // Restore protocol state (status only, connections are not restored)
  setWsStatus(snapshot.wsState?.status as any || 'disconnected');
  clearWsMessages();
  if (snapshot.wsState?.messages?.length > 0) {
    // Bulk restore messages by re-adding them
    // Note: ws messages are read-only history, connection itself is not restored
  }

  setSSEStatus(snapshot.sseState?.status as any || 'disconnected');
  clearSSEEvents();

  setGqlSubStatus(snapshot.gqlSubState?.status as any || 'disconnected');
  clearGqlSubEvents();

  // Restore per-tab UI state
  setRequestTab(snapshot.requestTab as any || 'params');
  setResponseTab(snapshot.responseTab as any || 'body');
  setConnectionMode(snapshot.connectionMode || 'http');

  // Restore identity
  if (snapshot.context?.requestId) {
    setRequestContext({
      panelId: snapshot.context.panelId || '',
      requestId: snapshot.context.requestId,
      collectionId: snapshot.context.collectionId || '',
      collectionName: snapshot.context.collectionName || '',
    });
  } else {
    clearRequestContext();
  }

  if (snapshot.originalSnapshot) {
    setOriginalSnapshot(snapshot.originalSnapshot);
  } else {
    clearOriginalSnapshot();
  }
}

function clearAllStores(): void {
  setMethod('GET');
  setUrl('');
  setParams([]);
  setPathParams([]);
  setHeaders([]);
  setAuth({ type: 'none' });
  setBody({ type: 'none', content: '' });
  setAssertions([]);
  setScripts({ preRequest: '', postResponse: '' });
  setDescription('');
  setSsl(undefined);
  setProxy(undefined);
  setRequestTimeout(undefined);
  setRedirects(undefined, undefined);
  setGrpc(undefined);
  clearResponse();
  clearAssertionResults();
  clearScriptOutput();
  setWsStatus('disconnected' as any);
  clearWsMessages();
  setSSEStatus('disconnected' as any);
  clearSSEEvents();
  setGqlSubStatus('disconnected' as any);
  clearGqlSubEvents();
  clearRequestContext();
  clearOriginalSnapshot();
}

// --- Session Persistence ---

const STORAGE_KEY = 'nouto_tabs';

function schedulePersist(): void {
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    persistToStorage();
  }, 500);
}

function persistToStorage(): void {
  try {
    // Save current active tab's snapshot before persisting
    if (_activeTabId) {
      const current = saveCurrentSnapshot();
      _snapshots.set(_activeTabId, current);
    }

    const data = {
      tabs: _tabs,
      activeTabId: _activeTabId,
      snapshots: Object.fromEntries(_snapshots),
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

    _tabs = validTabs;
    _activeTabId = data.activeTabId || null;

    // Ensure activeTabId references a valid tab
    if (_activeTabId && !_tabs.find(t => t.id === _activeTabId)) {
      _activeTabId = _tabs[0].id;
    }

    if (data.snapshots && typeof data.snapshots === 'object') {
      _snapshots = new Map(Object.entries(data.snapshots));
    }

    // Restore the active tab's snapshot
    if (_activeTabId) {
      const snap = _snapshots.get(_activeTabId);
      if (snap) {
        restoreSnapshot(snap);
      }
    }
  } catch (error) {
    console.error('[Nouto Tabs] Failed to load tab state:', error);
    // Clear corrupted data
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
    requestId: requestId || null,
    collectionId: collectionId || null,
    collectionName: collectionName || null,
    connectionMode: 'http',
  };
}

export function createSingletonTab(type: 'settings' | 'environments', label: string): Tab {
  return {
    id: `singleton-${type}`,
    type,
    label,
    closable: true,
    dirty: false,
  };
}
