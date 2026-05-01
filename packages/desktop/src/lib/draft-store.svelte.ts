import { activeTab as activeTabFn, activeTabId as activeTabIdFn, createRequestTab, openTab } from '@nouto/ui/stores/tabs.svelte';
import { request as requestStore } from '@nouto/ui/stores';
import { ui } from '@nouto/ui/stores/ui.svelte';

const DRAFTS_STORAGE_KEY = 'nouto_drafts';
let draftSaveTimer: ReturnType<typeof setTimeout> | null = null;

let _showDraftRecovery = $state(false);
let _pendingDrafts: Record<string, any> = $state({});

export function showDraftRecovery() { return _showDraftRecovery; }
export function pendingDrafts() { return _pendingDrafts; }

export function saveDraftDebounced() {
  if (draftSaveTimer) clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(() => {
    const atId = activeTabIdFn();
    if (!atId) return;
    const tab = activeTabFn();
    if (!tab || tab.dirty === false) return;
    try {
      const drafts = JSON.parse(localStorage.getItem(DRAFTS_STORAGE_KEY) || '{}');
      drafts[atId] = { ...$state.snapshot(requestStore), connectionMode: ui.connectionMode };
      localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
    } catch (e) {
      console.error('[Nouto] Failed to save draft:', e);
    }
  }, 2000);
}

export function clearDraftForTab(tabId: string) {
  try {
    const drafts = JSON.parse(localStorage.getItem(DRAFTS_STORAGE_KEY) || '{}');
    delete drafts[tabId];
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
  } catch (e) {
    console.error('[Nouto] Failed to clear draft:', e);
  }
}

export function loadDrafts(): Record<string, any> {
  try {
    const raw = localStorage.getItem(DRAFTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function clearAllDraftsFromStorage() {
  localStorage.removeItem(DRAFTS_STORAGE_KEY);
}

export function recoverDrafts() {
  for (const [_tabId, snapshot] of Object.entries(_pendingDrafts)) {
    const s = snapshot as any;
    const tab = createRequestTab(
      s.name || s.url || 'Recovered',
      null,
      null,
      null,
    );
    tab.icon = s.method || 'GET';
    tab.dirty = true;
    tab.method = s.method || 'GET';
    tab.url = s.url || '';
    tab.params = Array.isArray(s.params) ? s.params : [];
    tab.pathParams = Array.isArray(s.pathParams) ? s.pathParams : [];
    tab.headers = Array.isArray(s.headers) ? s.headers : [];
    tab.auth = s.auth || { type: 'none' };
    tab.body = s.body || { type: 'none', content: '' };
    tab.assertions = s.assertions || [];
    tab.authInheritance = s.authInheritance;
    tab.scriptInheritance = s.scriptInheritance;
    tab.scripts = s.scripts || { preRequest: '', postResponse: '' };
    tab.description = s.description || '';
    tab.ssl = s.ssl;
    tab.proxy = s.proxy;
    tab.timeout = s.timeout;
    tab.followRedirects = s.followRedirects;
    tab.maxRedirects = s.maxRedirects;
    tab.grpc = s.grpc;
    const connMode = s._connectionMode || s.connectionMode;
    if (connMode) tab.connectionMode = connMode;
    openTab(tab);
  }
  clearAllDraftsFromStorage();
  _pendingDrafts = {};
  _showDraftRecovery = false;
}

export function dismissDraftRecovery() {
  clearAllDraftsFromStorage();
  _pendingDrafts = {};
  _showDraftRecovery = false;
}

export function initDraftRecovery() {
  const existingDrafts = loadDrafts();
  if (Object.keys(existingDrafts).length > 0) {
    _pendingDrafts = existingDrafts;
    _showDraftRecovery = true;
  }
}
