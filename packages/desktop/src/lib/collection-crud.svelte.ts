import {
  collections as collectionsStore, addRequestToCollection, addCollection,
  setCollections, deleteCollection as storeDeleteCollection,
  deleteRequest as storeDeleteRequest, deleteFolder as storeDeleteFolder,
  moveItem, findItemById, findItemRecursive, findCollectionForItem,
  isDraftsCollection, addFolder, updateRequest,
  renameCollection as storeRenameCollection, renameFolder as storeRenameFolder,
  selectRequest,
} from '@nouto/ui/stores/collections.svelte';
import {
  activeTabId as activeTabIdFn, activeTab as activeTabFn,
  openTab, switchTab as switchTabFn, setTabRequestId,
  findTabByRequestId, createRequestTab, saveCurrentSnapshot,
} from '@nouto/ui/stores/tabs.svelte';
import { setOriginalSnapshot, request as requestStore } from '@nouto/ui/stores';
import { setConnectionMode } from '@nouto/ui/stores/ui.svelte';
import { showNotification } from '@nouto/ui/stores/notifications.svelte';
import { notifySettingsSaved, type SettingsInitData } from '@nouto/ui/stores/collectionSettings.svelte';
import {
  getDefaultsForRequestKind, isFolder, isRequest, generateId,
  type RequestKind, type SavedRequest, type Collection, type Folder,
  type CollectionItem, type ConnectionMode,
} from '@nouto/core';
import { showLocalQuickPick, showLocalInputBox, showLocalConfirm } from './modal-store.svelte';
import type { IMessageBus } from '@nouto/transport';

let bus: IMessageBus;
let getCollections: () => Collection[];
let setCollectionsLocal: (c: Collection[]) => void;
let getCollectionId: () => string | null;
let setCollectionId: (id: string | null) => void;
let getCollectionName: () => string | null;
let setCollectionName: (name: string | null) => void;
let getRequestId: () => string | null;
let setRequestId: (id: string | null) => void;
let getPanelId: () => string | null;
let setCurrentView: (v: string) => void;
let setShowSaveNudge: (v: boolean) => void;
let setNudgeDismissed: (v: boolean) => void;
let getCollectionSettingsDialogData: () => SettingsInitData | null;
let setCollectionSettingsDialogData: (v: SettingsInitData | null) => void;

export function initCollectionCrud(deps: {
  messageBus: IMessageBus;
  getCollections: () => Collection[];
  setCollections: (c: Collection[]) => void;
  getCollectionId: () => string | null;
  setCollectionId: (id: string | null) => void;
  getCollectionName: () => string | null;
  setCollectionName: (name: string | null) => void;
  getRequestId: () => string | null;
  setRequestId: (id: string | null) => void;
  getPanelId: () => string | null;
  setCurrentView: (v: string) => void;
  setShowSaveNudge: (v: boolean) => void;
  setNudgeDismissed: (v: boolean) => void;
  getCollectionSettingsDialogData: () => SettingsInitData | null;
  setCollectionSettingsDialogData: (v: SettingsInitData | null) => void;
}) {
  bus = deps.messageBus;
  getCollections = deps.getCollections;
  setCollectionsLocal = deps.setCollections;
  getCollectionId = deps.getCollectionId;
  setCollectionId = deps.setCollectionId;
  getCollectionName = deps.getCollectionName;
  setCollectionName = deps.setCollectionName;
  getRequestId = deps.getRequestId;
  setRequestId = deps.setRequestId;
  getPanelId = deps.getPanelId;
  setCurrentView = deps.setCurrentView;
  setShowSaveNudge = deps.setShowSaveNudge;
  setNudgeDismissed = deps.setNudgeDismissed;
  getCollectionSettingsDialogData = deps.getCollectionSettingsDialogData;
  setCollectionSettingsDialogData = deps.setCollectionSettingsDialogData;
}

function syncCollections() {
  setCollectionsLocal(collectionsStore());
}

function persistCollections() {
  bus.send({ type: 'saveCollections', data: $state.snapshot(collectionsStore()) } as any);
}

export function countAllItems(items: (SavedRequest | Folder)[]): number {
  let count = 0;
  for (const item of items) {
    if (isFolder(item)) {
      count += countAllItems(item.children);
    } else {
      count++;
    }
  }
  return count;
}

export function buildCollectionPickerItems(cols: Collection[]): { label: string; value: string; description?: string; kind?: string; icon?: string; accent?: boolean }[] {
  const items: { label: string; value: string; description?: string; kind?: string; icon?: string; accent?: boolean }[] = [
    { label: 'Quick Start', value: '_sep_quick', kind: 'separator' },
    { label: 'No Collection (Quick Request)', value: 'no-collection', description: 'Saved to Drafts and History after sending' },
    { label: 'Collections', value: '_sep_collections', kind: 'separator' },
    { label: 'Create New Collection...', value: 'new-collection', icon: 'codicon-new-folder', accent: true },
    { label: '', value: '_sep_existing', kind: 'separator' },
  ];
  for (const col of cols) {
    const itemCount = countAllItems(col.items);
    items.push({
      label: col.name,
      value: `collection:${col.id}`,
      description: `${itemCount} item${itemCount !== 1 ? 's' : ''}`,
    });
  }
  return items;
}

export function duplicateItemsRecursive(items: CollectionItem[]): CollectionItem[] {
  const now = new Date().toISOString();
  return items.map(item => {
    if (isFolder(item)) {
      return {
        ...item,
        id: generateId(),
        children: duplicateItemsRecursive(item.children),
        createdAt: now,
        updatedAt: now,
      };
    }
    return {
      ...item,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    };
  });
}

function buildMoveTargetItems(excludeIds: Set<string>): { label: string; value: string; description?: string; kind?: string }[] {
  const items: { label: string; value: string; description?: string; kind?: string }[] = [];
  const cols = collectionsStore();

  for (const col of cols) {
    if (col.builtin) continue;
    items.push({
      label: col.name,
      value: `collection:${col.id}`,
      description: `${countAllItems(col.items)} items`,
    });
    addFolderTargets(col.items, items, excludeIds, 1);
  }
  return items;
}

function addFolderTargets(
  items: CollectionItem[],
  result: { label: string; value: string; description?: string }[],
  excludeIds: Set<string>,
  depth: number
) {
  for (const item of items) {
    if (isFolder(item) && !excludeIds.has(item.id)) {
      const indent = '\u00A0\u00A0'.repeat(depth);
      result.push({
        label: `${indent}${item.name}`,
        value: `folder:${item.id}`,
      });
      addFolderTargets(item.children, result, excludeIds, depth + 1);
    }
  }
}

export function loadNewRequestIntoForm(defaults: ReturnType<typeof getDefaultsForRequestKind>, savedReq: SavedRequest | null, targetColId: string | null, targetColName: string | null) {
  setCollectionId(targetColId);
  setCollectionName(targetColName);
  setRequestId(savedReq?.id ?? null);
  setShowSaveNudge(false);
  setNudgeDismissed(false);

  const tab = createRequestTab(
    savedReq?.name ?? defaults.name,
    savedReq?.id ?? null,
    targetColId,
    targetColName,
  );
  tab.icon = savedReq?.method ?? defaults.method;
  tab.method = savedReq?.method ?? defaults.method;
  tab.url = savedReq?.url ?? defaults.url;
  tab.body = savedReq?.body ?? defaults.body ?? { type: 'none', content: '' };
  tab.connectionMode = defaults.connectionMode;

  if (savedReq?.id && targetColId) {
    tab.context = { panelId: 'desktop-main', requestId: savedReq.id, collectionId: targetColId, collectionName: targetColName || '' };
    tab.originalSnapshot = JSON.parse(JSON.stringify({
      method: tab.method, url: tab.url, params: tab.params, pathParams: tab.pathParams,
      headers: tab.headers, auth: tab.auth, body: tab.body, assertions: tab.assertions,
      scripts: tab.scripts, description: tab.description, ssl: tab.ssl, proxy: tab.proxy,
      timeout: tab.timeout, followRedirects: tab.followRedirects, maxRedirects: tab.maxRedirects,
      authInheritance: tab.authInheritance, scriptInheritance: tab.scriptInheritance, grpc: tab.grpc,
    }));
  }

  openTab(tab);
  setCurrentView('main');
}

export async function handleNewRequestKind(kind: string) {
  const collections = getCollections();
  const defaults = getDefaultsForRequestKind(kind as RequestKind);

  const pickerItems = buildCollectionPickerItems(collections);
  const selectedValue = await showLocalQuickPick('Select or create a collection', pickerItems);
  if (!selectedValue) return;

  if (selectedValue === 'no-collection') {
    loadNewRequestIntoForm(defaults, null, null, null);
    return;
  }

  if (selectedValue === 'new-collection') {
    const name = await showLocalInputBox('Collection name', 'My Collection');
    if (!name) return;

    const created = addCollection(name);
    if (!created) return;
    syncCollections();

    const savedRequest = addRequestToCollection(created.id, {
      name: defaults.name,
      method: defaults.method,
      url: defaults.url,
      params: [],
      headers: [],
      auth: { type: 'none' },
      body: defaults.body,
      connectionMode: defaults.connectionMode,
      grpc: defaults.grpc,
    });
    syncCollections();
    loadNewRequestIntoForm(defaults, savedRequest, created.id, created.name);
    return;
  }

  const colId = selectedValue.replace('collection:', '');
  const targetCollection = collections.find(c => c.id === colId);
  if (!targetCollection) return;

  const savedRequest = addRequestToCollection(targetCollection.id, {
    name: defaults.name,
    method: defaults.method,
    url: defaults.url,
    params: [],
    headers: [],
    auth: { type: 'none' },
    body: defaults.body,
    connectionMode: defaults.connectionMode,
    grpc: defaults.grpc,
  });
  syncCollections();
  loadNewRequestIntoForm(defaults, savedRequest, targetCollection.id, targetCollection.name);
}

export async function handleDeleteCollection(id: string) {
  const collections = getCollections();
  const col = collections.find(c => c.id === id);
  if (!col) return;
  if (isDraftsCollection(col)) {
    showNotification('warning', 'Cannot delete the Drafts collection. Use "Clear All" instead.');
    return;
  }
  storeDeleteCollection(id);
  syncCollections();
}

export function handleDeleteRequest(reqId: string) {
  storeDeleteRequest(reqId);
  syncCollections();
}

export function handleDeleteFolder(folderId: string) {
  storeDeleteFolder(folderId);
  syncCollections();
}

export function handleDuplicateCollection(id: string) {
  const collections = getCollections();
  const col = collections.find(c => c.id === id);
  if (!col) return;
  const now = new Date().toISOString();
  const newCol: Collection = {
    ...col,
    id: generateId(),
    name: `${col.name} (copy)`,
    items: duplicateItemsRecursive(col.items),
    variables: col.variables ? [...col.variables] : undefined,
    headers: col.headers ? [...col.headers] : undefined,
    createdAt: now,
    updatedAt: now,
    builtin: undefined,
  };
  setCollections([...collectionsStore(), newCol]);
  syncCollections();
  persistCollections();
}

export function handleDuplicateFolder(folderId: string, collectionId: string) {
  const collections = getCollections();
  const col = collections.find(c => c.id === collectionId);
  if (!col) return;
  const folder = findItemRecursive(col.items, folderId);
  if (!folder || !isFolder(folder)) return;

  const now = new Date().toISOString();
  const duplicate: Folder = {
    ...folder,
    id: generateId(),
    name: `${folder.name} (copy)`,
    children: duplicateItemsRecursive(folder.children),
    createdAt: now,
    updatedAt: now,
  };

  col.items.push(duplicate);
  col.updatedAt = now;
  syncCollections();
  persistCollections();
}

export async function handleBulkDelete(itemIds: string[], _collectionId: string) {
  for (const id of itemIds) {
    const found = findItemById(id);
    if (found) {
      if (isFolder(found.item)) {
        storeDeleteFolder(id);
      } else {
        storeDeleteRequest(id);
      }
    }
  }
  syncCollections();
  persistCollections();
}

export async function handleBulkMovePickTarget(itemIds: string[], _sourceCollectionId: string) {
  const excludeIds = new Set(itemIds);
  const targets = buildMoveTargetItems(excludeIds);
  if (targets.length === 0) {
    showNotification('info', 'No valid move targets available.');
    return;
  }

  const selected = await showLocalQuickPick('Move to...', targets);
  if (!selected) return;

  let targetCollectionId: string;
  let targetFolderId: string | undefined;

  if (selected.startsWith('collection:')) {
    targetCollectionId = selected.replace('collection:', '');
  } else if (selected.startsWith('folder:')) {
    targetFolderId = selected.replace('folder:', '');
    const folderCol = findCollectionForItem(targetFolderId);
    if (!folderCol) return;
    targetCollectionId = folderCol.id;
  } else {
    return;
  }

  for (const id of itemIds) {
    moveItem(id, targetCollectionId, targetFolderId);
  }
  syncCollections();
}

export function handleCreateRequest(data: { collectionId: string; parentFolderId?: string; openInPanel?: boolean; requestKind?: string }) {
  const collections = getCollections();
  const defaults = getDefaultsForRequestKind((data.requestKind || 'http') as RequestKind);
  const savedRequest = addRequestToCollection(data.collectionId, {
    name: defaults.name,
    method: defaults.method,
    url: defaults.url,
    params: [],
    headers: [],
    auth: { type: 'none' },
    body: defaults.body,
    connectionMode: defaults.connectionMode,
    grpc: defaults.grpc,
  }, data.parentFolderId);
  syncCollections();

  if (data.openInPanel) {
    loadNewRequestIntoForm(defaults, savedRequest, data.collectionId, collections.find(c => c.id === data.collectionId)?.name || null);
  }
}

export function handleOpenCollectionRequest(data: { requestId: string; collectionId: string }) {
  const collections = getCollections();
  const col = collections.find(c => c.id === data.collectionId);
  if (!col) return;
  const item = findItemRecursive(col.items, data.requestId);
  if (!item || !isRequest(item)) return;

  const existingTab = findTabByRequestId(data.requestId);
  if (existingTab) {
    switchTabFn(existingTab.id);
    setCurrentView('main');
    return;
  }

  const tab = createRequestTab(item.name, data.requestId, data.collectionId, col.name);
  tab.icon = item.method || 'GET';
  const connMode = (item as any)._connectionMode || (item as any).connectionMode || 'http';
  tab.connectionMode = connMode;
  tab.method = item.method || 'GET';
  tab.url = item.url || '';
  tab.params = Array.isArray(item.params) ? item.params : [];
  tab.pathParams = Array.isArray((item as any).pathParams) ? (item as any).pathParams : [];
  tab.headers = Array.isArray(item.headers) ? item.headers : [];
  tab.auth = item.auth || { type: 'none' };
  tab.body = item.body || { type: 'none', content: '' };
  tab.assertions = (item as any).assertions || [];
  tab.authInheritance = (item as any).authInheritance;
  tab.scriptInheritance = (item as any).scriptInheritance;
  tab.scripts = (item as any).scripts || { preRequest: '', postResponse: '' };
  tab.description = (item as any).description || '';
  tab.ssl = (item as any).ssl;
  tab.proxy = (item as any).proxy;
  tab.timeout = (item as any).timeout;
  tab.followRedirects = (item as any).followRedirects;
  tab.maxRedirects = (item as any).maxRedirects;
  tab.grpc = (item as any).grpc;
  tab.context = { panelId: getPanelId() || 'desktop-main', requestId: data.requestId, collectionId: data.collectionId, collectionName: col.name };
  tab.originalSnapshot = JSON.parse(JSON.stringify({
    method: tab.method, url: tab.url, params: tab.params, pathParams: tab.pathParams,
    headers: tab.headers, auth: tab.auth, body: tab.body, assertions: tab.assertions,
    scripts: tab.scripts, description: tab.description, ssl: tab.ssl, proxy: tab.proxy,
    timeout: tab.timeout, followRedirects: tab.followRedirects, maxRedirects: tab.maxRedirects,
    authInheritance: tab.authInheritance, scriptInheritance: tab.scriptInheritance, grpc: tab.grpc,
  }));

  setCollectionId(data.collectionId);
  setCollectionName(col.name);
  setRequestId(data.requestId);

  openTab(tab);
  setCurrentView('main');
}

export function handleRunCollectionRequest(data: { requestId: string; collectionId: string }) {
  handleOpenCollectionRequest(data);
}

export async function handleClearDrafts() {
  const confirmed = await showLocalConfirm(
    'Clear all draft requests? This cannot be undone.',
    'Clear',
    'danger'
  );
  if (!confirmed) return;

  const cols = collectionsStore();
  const drafts = cols.find(c => c.builtin === 'drafts');
  if (drafts) {
    drafts.items = [];
    drafts.updatedAt = new Date().toISOString();
    syncCollections();
    persistCollections();
  }
}

export async function handleRenameCollection(id: string, currentName?: string) {
  const collections = getCollections();
  const col = collections.find(c => c.id === id);
  if (!col) return;
  const newName = await showLocalInputBox('Rename collection', 'Collection name', currentName || col.name);
  if (!newName || newName === col.name) return;
  storeRenameCollection(id, newName);
  syncCollections();
  persistCollections();
}

export async function handleRenameFolder(folderId: string, currentName?: string) {
  const newName = await showLocalInputBox('Rename folder', 'Folder name', currentName || '');
  if (!newName) return;
  storeRenameFolder(folderId, newName);
  syncCollections();
  persistCollections();
}

export async function handleCreateFolder(data: { collectionId: string; parentFolderId?: string }) {
  const name = await showLocalInputBox('Folder name', 'New Folder');
  if (!name) return;
  addFolder(data.collectionId, name, data.parentFolderId);
  syncCollections();
}

export function handleOpenCollectionSettings(colId: string) {
  const collections = getCollections();
  const col = collections.find(c => c.id === colId);
  if (!col) {
    showNotification('error', 'Collection not found.');
    return;
  }
  setCollectionSettingsDialogData($state.snapshot({
    entityType: 'collection' as const,
    entityName: col.name,
    collectionId: col.id,
    initialAuth: col.auth,
    initialHeaders: col.headers,
    initialVariables: col.variables,
    initialScripts: col.scripts,
    initialAssertions: col.assertions,
    initialNotes: col.description,
  }) as SettingsInitData);
}

export function handleOpenFolderSettings(colId: string, folderId: string) {
  const collections = getCollections();
  const col = collections.find(c => c.id === colId);
  if (!col) {
    showNotification('error', 'Collection not found.');
    return;
  }
  const folder = findItemRecursive(col.items, folderId);
  if (!folder || !isFolder(folder)) {
    showNotification('error', 'Folder not found.');
    return;
  }
  setCollectionSettingsDialogData($state.snapshot({
    entityType: 'folder' as const,
    entityName: folder.name,
    collectionId: colId,
    folderId,
    initialAuth: folder.auth,
    initialHeaders: folder.headers,
    initialVariables: folder.variables,
    initialScripts: folder.scripts,
    initialAssertions: folder.assertions,
    initialNotes: folder.description,
  }) as SettingsInitData);
}

export function handleSaveCollectionSettings(data: any) {
  const cols = collectionsStore();
  const col = cols.find(c => c.id === data.collectionId);
  if (!col) return;

  if (data.folderId) {
    const folder = findItemRecursive(col.items, data.folderId);
    if (folder && isFolder(folder)) {
      if (data.auth !== undefined) (folder as any).auth = data.auth;
      if (data.headers !== undefined) (folder as any).headers = data.headers;
      if (data.variables !== undefined) (folder as any).variables = data.variables;
      if (data.scripts !== undefined) (folder as any).scripts = data.scripts;
      if (data.assertions !== undefined) (folder as any).assertions = data.assertions;
      if (data.notes !== undefined) (folder as any).description = data.notes;
    }
  } else {
    if (data.auth !== undefined) col.auth = data.auth;
    if (data.headers !== undefined) col.headers = data.headers;
    if (data.variables !== undefined) col.variables = data.variables;
    if (data.scripts !== undefined) (col as any).scripts = data.scripts;
    if (data.assertions !== undefined) (col as any).assertions = data.assertions;
    if (data.notes !== undefined) col.description = data.notes;
  }

  setCollections([...cols]);
  syncCollections();
  persistCollections();
  notifySettingsSaved();
  showNotification('info', 'Settings saved.');
}

export function handleSaveCollectionRequest(data: { requestId: string; collectionId: string; request: SavedRequest }) {
  if (!data.requestId || !data.collectionId) return;
  const { method, url, params, pathParams, headers, auth, body, assertions, authInheritance, scriptInheritance, scripts, description, ssl, proxy, timeout, followRedirects, maxRedirects, connectionMode, grpc } = data.request;
  updateRequest(data.requestId, { method, url, params, pathParams, headers, auth, body, assertions, authInheritance, scriptInheritance, scripts, description, ssl, proxy, timeout, followRedirects, maxRedirects, connectionMode, grpc });
  syncCollections();
  persistCollections();
  setOriginalSnapshot($state.snapshot(requestStore));
}

export function handleRevertRequest(data: { requestId: string; collectionId: string }, loadRequest: (item: SavedRequest) => void) {
  if (!data.requestId || !data.collectionId) return;
  const collections = getCollections();
  const col = collections.find(c => c.id === data.collectionId);
  if (!col) return;
  const item = findItemRecursive(col.items, data.requestId);
  if (!item || !isRequest(item)) return;
  loadRequest(item);
  setOriginalSnapshot($state.snapshot(requestStore));
}
