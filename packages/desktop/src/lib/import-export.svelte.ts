import { save as saveDialog, open as openDialog } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import {
  collections as collectionsStore, addCollection, setCollections, findItemRecursive,
} from '@nouto/ui/stores/collections.svelte';
import { addEnvironment, updateEnvironmentVariables, environments as environmentsList, activeEnvironmentId, substituteVariables } from '@nouto/ui/stores/environment.svelte';
import { setMethod, setUrl, setParams, setHeaders, setAuth, setBody, request as requestStore } from '@nouto/ui/stores';
import { showNotification } from '@nouto/ui/stores/notifications.svelte';
import { benchmarkState } from '@nouto/ui/stores/benchmark.svelte';
import { mockServerState, initMockServer as initMockStore } from '@nouto/ui/stores/mockServer.svelte';
import {
  isFolder, isRequest, generateId, deriveNameFromUrl, parseCurl, isCurlCommand,
  type Collection, type CollectionItem, type SavedRequest, type Folder,
} from '@nouto/core';
import { InsomniaImportService } from '@nouto/core/services/InsomniaImportService';
import { HoppscotchImportService } from '@nouto/core/services/HoppscotchImportService';
import { HarImportService } from '@nouto/core/services/HarImportService';
import { ThunderClientImportService } from '@nouto/core/services/ThunderClientImportService';
import { BrunoImportService } from '@nouto/core/services/BrunoImportService';
import { PostmanImportService } from '@nouto/core/services/PostmanImportService';
import { OpenApiImportService } from '@nouto/core/services/OpenApiImportService';
import { HarExportService } from '@nouto/core/services/HarExportService';
import { showLocalQuickPick, showLocalInputBox } from './modal-store.svelte';
import type { IMessageBus } from '@nouto/transport';
import type { IncomingMessage } from '@nouto/transport';

const insomniaImportService = new InsomniaImportService();
const hoppscotchImportService = new HoppscotchImportService();
const harImportService = new HarImportService();
const thunderClientImportService = new ThunderClientImportService();
const brunoImportService = new BrunoImportService();
const postmanImportService = new PostmanImportService();
const openApiImportService = new OpenApiImportService();
const harExportService = new HarExportService();

let bus: IMessageBus;
let getCollections: () => Collection[];
let setCollectionsLocal: (c: Collection[]) => void;

export function initImportExport(deps: {
  messageBus: IMessageBus;
  getCollections: () => Collection[];
  setCollections: (c: Collection[]) => void;
}) {
  bus = deps.messageBus;
  getCollections = deps.getCollections;
  setCollectionsLocal = deps.setCollections;
}

function syncCollections() {
  setCollectionsLocal(collectionsStore());
}

function persistCollections() {
  bus.send({ type: 'saveCollections', data: $state.snapshot(collectionsStore()) } as any);
}

function regenerateIds(collection: any): Collection {
  const now = new Date().toISOString();
  function regenItems(items: any[]): any[] {
    return items.map(item => {
      if (item.type === 'folder' && item.children) {
        return { ...item, id: generateId(), children: regenItems(item.children) };
      }
      return { ...item, id: generateId() };
    });
  }
  return {
    ...collection,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
    items: regenItems(collection.items || []),
  };
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// --- Postman conversion ---

function convertToPostmanCollection(col: Collection): any {
  const result: any = {
    info: {
      name: col.name,
      _postman_id: col.id,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: convertItemsToPostman(col.items),
  };
  if (col.auth && col.auth.type !== 'none') {
    result.auth = convertAuthToPostman(col.auth);
  }
  if (col.headers?.length) {
    result.header = (col.headers as any[]).map((h: any) => ({ key: h.key, value: h.value, disabled: !h.enabled }));
  }
  if (col.variables?.length) {
    result.variable = (col.variables as any[]).map((v: any) => ({ key: v.key, value: v.value, disabled: !v.enabled }));
  }
  return result;
}

function convertItemsToPostman(items: CollectionItem[]): any[] {
  return items.map(item => {
    if (isFolder(item)) {
      const folder: any = { name: item.name, id: item.id, item: convertItemsToPostman(item.children) };
      if (item.auth && item.auth.type !== 'none') folder.auth = convertAuthToPostman(item.auth);
      return folder;
    }
    const req = item as SavedRequest;
    const enabledParams = (req.params || []).filter((p: any) => p.enabled);
    const qs = enabledParams.length > 0
      ? '?' + enabledParams.map((p: any) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&')
      : '';
    return {
      name: req.name,
      id: req.id,
      request: {
        method: req.method,
        url: { raw: req.url + qs, query: (req.params || []).map((p: any) => ({ key: p.key, value: p.value, disabled: !p.enabled })) },
        header: (req.headers || []).map((h: any) => ({ key: h.key, value: h.value, disabled: !h.enabled })),
        auth: convertAuthToPostman(req.auth),
        body: convertBodyToPostman(req.body),
        description: req.description,
      },
    };
  });
}

function convertAuthToPostman(auth: any): any {
  if (!auth) return { type: 'noauth' };
  switch (auth.type) {
    case 'basic': return { type: 'basic', basic: [{ key: 'username', value: auth.username || '' }, { key: 'password', value: auth.password || '' }] };
    case 'bearer': return { type: 'bearer', bearer: [{ key: 'token', value: auth.token || '' }] };
    case 'apikey': return { type: 'apikey', apikey: [{ key: 'key', value: auth.apiKeyName || '' }, { key: 'value', value: auth.apiKeyValue || '' }, { key: 'in', value: auth.apiKeyIn || 'header' }] };
    default: return { type: 'noauth' };
  }
}

function convertBodyToPostman(body: any): any {
  if (!body) return { mode: 'none' };
  switch (body.type) {
    case 'json': return { mode: 'raw', raw: body.content, options: { raw: { language: 'json' } } };
    case 'text': return { mode: 'raw', raw: body.content, options: { raw: { language: 'text' } } };
    case 'xml': return { mode: 'raw', raw: body.content, options: { raw: { language: 'xml' } } };
    case 'x-www-form-urlencoded': return { mode: 'urlencoded', urlencoded: (body.formItems || []).map((p: any) => ({ key: p.key, value: p.value, disabled: !p.enabled })) };
    case 'form-data': return { mode: 'formdata', formdata: (body.formItems || []).map((p: any) => ({ key: p.key, value: p.value, disabled: !p.enabled, type: p.type || 'text' })) };
    case 'graphql': return { mode: 'graphql', graphql: { query: body.content, variables: body.graphqlVariables || '' } };
    default: return { mode: 'none' };
  }
}

// --- Export handlers ---

export async function handleExportNative(itemId?: string) {
  const cols = $state.snapshot(collectionsStore()) as Collection[];
  let exportData: any;
  let defaultName: string;

  if (itemId) {
    const col = cols.find(c => c.id === itemId);
    if (!col) {
      showNotification('error', 'Collection not found.');
      return;
    }
    exportData = {
      _format: 'nouto',
      _version: '1.0',
      _exportedAt: new Date().toISOString(),
      collection: col,
    };
    defaultName = `${col.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
  } else {
    if (cols.length === 0) {
      showNotification('info', 'No collections to export.');
      return;
    }
    if (cols.length === 1) {
      exportData = {
        _format: 'nouto',
        _version: '1.0',
        _exportedAt: new Date().toISOString(),
        collection: cols[0],
      };
      defaultName = `${cols[0].name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
    } else {
      exportData = {
        _format: 'nouto',
        _version: '1.0',
        _exportedAt: new Date().toISOString(),
        collections: cols,
      };
      defaultName = 'nouto-collections.json';
    }
  }

  try {
    const filePath = await saveDialog({
      defaultPath: defaultName,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (!filePath) return;
    await writeTextFile(filePath, JSON.stringify(exportData, null, 2));
    showNotification('info', 'Collection exported successfully.');
  } catch (e: any) {
    showNotification('error', `Export failed: ${e.message || e}`);
  }
}

export async function handleExportAllNative() {
  const cols = $state.snapshot(collectionsStore()) as Collection[];
  if (cols.length === 0) {
    showNotification('info', 'No collections to export.');
    return;
  }

  const exportData = {
    _format: 'nouto',
    _version: '1.0',
    _exportedAt: new Date().toISOString(),
    collections: cols,
  };

  try {
    const filePath = await saveDialog({
      defaultPath: 'nouto-collections.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (!filePath) return;
    await writeTextFile(filePath, JSON.stringify(exportData, null, 2));
    showNotification('info', `Exported ${cols.length} collection(s) successfully.`);
  } catch (e: any) {
    showNotification('error', `Export failed: ${e.message || e}`);
  }
}

export async function handleExportFolder(folderId: string, collectionId: string) {
  const cols = $state.snapshot(collectionsStore()) as Collection[];
  const col = cols.find(c => c.id === collectionId);
  if (!col) { showNotification('error', 'Collection not found.'); return; }

  const folder = findItemRecursive(col.items, folderId) as Folder | null;
  if (!folder || !isFolder(folder)) { showNotification('error', 'Folder not found.'); return; }

  const exportData = {
    _format: 'nouto',
    _version: '1.0',
    _exportedAt: new Date().toISOString(),
    collection: {
      id: folder.id,
      name: folder.name,
      items: folder.children,
      expanded: folder.expanded,
      auth: folder.auth,
      headers: folder.headers,
      variables: folder.variables,
      scripts: folder.scripts,
      assertions: folder.assertions,
      description: folder.description,
      color: folder.color,
      icon: folder.icon,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
    } as Collection,
  };

  try {
    const defaultName = `${folder.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
    const filePath = await saveDialog({
      defaultPath: defaultName,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (!filePath) return;
    await writeTextFile(filePath, JSON.stringify(exportData, null, 2));
    showNotification('info', 'Folder exported successfully.');
  } catch (e: any) {
    showNotification('error', `Export failed: ${e.message || e}`);
  }
}

export async function handleExportPostman(collectionIds?: string[]) {
  const cols = $state.snapshot(collectionsStore()) as Collection[];
  const toExport = collectionIds
    ? cols.filter(c => collectionIds.includes(c.id))
    : cols;

  if (toExport.length === 0) {
    showNotification('info', 'No collections to export.');
    return;
  }

  try {
    for (const col of toExport) {
      const postman = convertToPostmanCollection(col);
      const defaultName = `${col.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.postman_collection.json`;
      const filePath = await saveDialog({
        defaultPath: defaultName,
        filters: [{ name: 'Postman Collection', extensions: ['json'] }],
      });
      if (!filePath) continue;
      await writeTextFile(filePath, JSON.stringify(postman, null, 2));
    }
    showNotification('info', `Exported ${toExport.length} collection(s) in Postman v2.1 format.`);
  } catch (e: any) {
    showNotification('error', `Export failed: ${e.message || e}`);
  }
}

export async function handleExportHar(collectionId?: string) {
  const cols = $state.snapshot(collectionsStore()) as Collection[];

  let collection: Collection | undefined;
  if (collectionId) {
    collection = cols.find(c => c.id === collectionId);
  } else {
    const items = cols.map(c => ({ label: c.name, value: c.id }));
    if (items.length === 0) {
      showNotification('info', 'No collections to export.');
      return;
    }
    const picked = await showLocalQuickPick('Export as HAR', items);
    if (!picked) return;
    collection = cols.find(c => c.id === picked);
  }

  if (!collection) {
    showNotification('error', 'Collection not found.');
    return;
  }

  try {
    const harContent = harExportService.exportCollectionItems(collection.items);
    const defaultName = `${collection.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.har`;
    const filePath = await saveDialog({
      defaultPath: defaultName,
      filters: [{ name: 'HAR File', extensions: ['har'] }],
    });
    if (!filePath) return;
    await writeTextFile(filePath, harContent);
    showNotification('info', `Exported "${collection.name}" as HAR.`);
  } catch (e: any) {
    showNotification('error', `HAR export failed: ${e.message || e}`);
  }
}

export function handleExportBackup() {
  const cookieRaw = localStorage.getItem('nouto_cookie_jars');
  const cookies = cookieRaw ? JSON.parse(cookieRaw) : null;
  bus.send({ type: 'exportBackup', data: { cookies } } as any);
}

export function handleImportBackup() {
  bus.send({ type: 'importBackup' } as any);
}

// --- Import handlers ---

export async function handleImportAuto() {
  try {
    const selected = await openDialog({
      multiple: false,
      filters: [{ name: 'Collections', extensions: ['json', 'yaml', 'yml', 'bru'] }],
      title: 'Import Collection',
    });
    if (!selected) return;

    const filePath = selected as string;
    const content = await readTextFile(filePath);
    const isYaml = filePath.endsWith('.yaml') || filePath.endsWith('.yml');
    const isBru = filePath.endsWith('.bru');

    if (isBru) {
      try {
        const fileName = filePath.split(/[/\\]/).pop()?.replace('.bru', '') || 'Bruno Request';
        const result = brunoImportService.importFromString(content, fileName);
        addCollection(result.collection);
        syncCollections();
        persistCollections();
        showNotification('info', `Imported Bruno collection: ${result.collection.name}`);
        return;
      } catch (e: any) {
        showNotification('error', `Failed to parse Bruno file: ${e.message || e}`);
        return;
      }
    }

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      if (isYaml) {
        try {
          const result = openApiImportService.importFromString(content, true);
          addCollection(result.collection);
          syncCollections();
          persistCollections();
          showNotification('info', `Imported OpenAPI collection: ${result.collection.name}`);
          if (result.variables) {
            showNotification('info', `Found ${result.variables.variables.length} variables. Add them manually to an environment.`);
          }
          return;
        } catch {
          try {
            const result = insomniaImportService.importFromString(content);
            if (result.collections.length > 0) {
              for (const col of result.collections) addCollection(col);
              syncCollections();
              persistCollections();
              const names = result.collections.map(c => c.name).join(', ');
              showNotification('info', `Imported ${result.collections.length} Insomnia collection(s): ${names}`);
              return;
            }
          } catch {}
        }
        showNotification('error', 'Failed to parse YAML file as OpenAPI or Insomnia format.');
        return;
      }
      showNotification('error', 'Failed to parse file. Ensure it is valid JSON or YAML.');
      return;
    }

    let importedCollections: Collection[] = [];
    let formatName = 'Unknown';

    if (parsed._format === 'nouto') {
      if (Array.isArray(parsed.collections)) {
        importedCollections = parsed.collections.map((c: any) => regenerateIds(c));
      } else if (parsed.collection) {
        importedCollections = [regenerateIds(parsed.collection)];
      }
      formatName = 'Nouto';
    } else if (parsed.info?.schema?.includes('getpostman.com')) {
      const result = postmanImportService.importFromString(content);
      importedCollections = [result.collection];
      formatName = 'Postman';
    } else if (parsed.openapi && parsed.paths) {
      const result = openApiImportService.importFromString(content, false);
      importedCollections = [result.collection];
      formatName = 'OpenAPI';
      if (result.variables) {
        showNotification('info', `Found ${result.variables.variables.length} server/path variables.`);
      }
    } else if (parsed._type === 'export' && parsed.resources) {
      const result = insomniaImportService.importFromString(content);
      importedCollections = result.collections;
      formatName = 'Insomnia';
    } else if ((parsed.v !== undefined && (parsed.folders || parsed.requests)) ||
               (Array.isArray(parsed) && parsed[0]?.folders !== undefined)) {
      const result = hoppscotchImportService.importFromString(content);
      importedCollections = result.collections;
      formatName = 'Hoppscotch';
    } else if (parsed.log && (parsed.log.entries || parsed.log.version)) {
      const result = harImportService.importFromString(content);
      importedCollections = [result.collection];
      formatName = 'HAR';
    } else if (parsed.client === 'Thunder Client' || parsed.colName || parsed._id ||
               (Array.isArray(parsed) && parsed[0]?.colName)) {
      const result = thunderClientImportService.importFromString(content);
      importedCollections = result.collections;
      formatName = 'Thunder Client';
    } else if (parsed.values && Array.isArray(parsed.values) && !parsed.item) {
      showNotification('info', 'This looks like a Postman Environment file, not a collection.');
      return;
    } else {
      showNotification('error', 'Could not detect collection format. Supported: Nouto, Postman, OpenAPI, Insomnia, Hoppscotch, HAR, Thunder Client, Bruno.');
      return;
    }

    if (importedCollections.length === 0) {
      showNotification('error', 'No collections found in file.');
      return;
    }

    for (const col of importedCollections) {
      addCollection(col);
    }
    syncCollections();
    persistCollections();

    const names = importedCollections.map(c => c.name).join(', ');
    showNotification('info', `Imported ${importedCollections.length} ${formatName} collection(s): ${names}`);
  } catch (e: any) {
    showNotification('error', `Import failed: ${e.message || e}`);
  }
}

export async function handleImportCurl() {
  const curlStr = await showLocalInputBox('Import cURL', 'Paste a cURL command');
  if (!curlStr || !curlStr.trim()) return;

  try {
    if (!isCurlCommand(curlStr)) {
      showNotification('error', 'Input does not appear to be a valid cURL command.');
      return;
    }
    const parsed = parseCurl(curlStr);
    setMethod(parsed.method as any);
    setUrl(parsed.url);
    if (parsed.headers?.length) setHeaders(parsed.headers);
    if (parsed.params?.length) setParams(parsed.params);
    if (parsed.body) setBody(parsed.body);
    if (parsed.auth) setAuth(parsed.auth);
    showNotification('info', 'cURL command imported successfully.');
  } catch (e: any) {
    showNotification('error', `Failed to parse cURL: ${e.message || e}`);
  }
}

export async function handleImportFromUrl() {
  const url = await showLocalInputBox('Import from URL', 'Enter a URL to a collection file');
  if (!url || !url.trim()) return;

  showNotification('info', 'Fetching collection from URL...');

  const importRequestId = crypto.randomUUID();

  const responseHandler = (msg: IncomingMessage) => {
    if (msg.type === 'requestResponse') {
      const resp = (msg as any).data;
      if (resp?.requestId !== importRequestId) return;
      unsub();
      clearTimeout(timeoutId);
      if (resp && resp.data) {
        const bodyStr = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
        try {
          const parsed = JSON.parse(bodyStr);
          let importedCollections: Collection[] = [];

          if (parsed._format === 'nouto') {
            if (Array.isArray(parsed.collections)) {
              importedCollections = parsed.collections.map((c: any) => regenerateIds(c));
            } else if (parsed.collection) {
              importedCollections = [regenerateIds(parsed.collection)];
            }
          } else if (parsed.info?.schema?.includes('getpostman.com')) {
            const result = postmanImportService.importFromString(bodyStr);
            importedCollections = [result.collection];
          } else if (parsed.openapi && parsed.paths) {
            const result = openApiImportService.importFromString(bodyStr, false);
            importedCollections = [result.collection];
          } else if (parsed._type === 'export' && parsed.resources) {
            const result = insomniaImportService.importFromString(bodyStr);
            importedCollections = result.collections;
          } else if ((parsed.v !== undefined && (parsed.folders || parsed.requests)) ||
                     (Array.isArray(parsed) && parsed[0]?.folders !== undefined)) {
            const result = hoppscotchImportService.importFromString(bodyStr);
            importedCollections = result.collections;
          } else if (parsed.log && (parsed.log.entries || parsed.log.version)) {
            const result = harImportService.importFromString(bodyStr);
            importedCollections = [result.collection];
          } else if (parsed.client === 'Thunder Client' || parsed.colName || parsed._id ||
                     (Array.isArray(parsed) && parsed[0]?.colName)) {
            const result = thunderClientImportService.importFromString(bodyStr);
            importedCollections = result.collections;
          } else {
            showNotification('error', 'Could not detect collection format from URL.');
            return;
          }

          for (const col of importedCollections) {
            addCollection(col);
          }
          syncCollections();
          persistCollections();
          showNotification('info', `Imported ${importedCollections.length} collection(s) from URL.`);
        } catch {
          showNotification('error', 'Failed to parse response as a collection file.');
        }
      }
    }
  };

  const unsub = bus.onMessage(responseHandler);
  bus.send({
    type: 'sendRequest',
    data: {
      requestId: importRequestId,
      method: 'GET',
      url,
      headers: [],
      params: [],
      body: { type: 'none', content: '' },
      timeout: 30000,
    },
  } as any);

  const timeoutId = setTimeout(() => {
    unsub();
    showNotification('error', 'Import from URL timed out. Please check the URL and try again.');
  }, 60000);
}

export async function handleExportHistory() {
  try {
    const format = await showLocalQuickPick('Export History', [
      { label: 'JSON', value: 'json' },
      { label: 'CSV', value: 'csv' },
    ]);
    if (!format) return;

    const entries = await new Promise<any[]>((resolve) => {
      const unsub = bus.onMessage((msg: IncomingMessage) => {
        if (msg.type === 'historyLoaded') {
          unsub();
          resolve((msg as any).data || []);
        }
      });
      bus.send({ type: 'getHistory' } as any);
      setTimeout(() => { unsub(); resolve([]); }, 5000);
    });

    if (entries.length === 0) {
      showNotification('info', 'No history entries to export.');
      return;
    }

    let content: string;
    let defaultName: string;
    let filterName: string;

    if (format === 'csv') {
      const header = 'timestamp,method,url,status,duration,size,requestName';
      const rows = entries.map((e: any) => {
        const fields = [
          e.timestamp || '',
          e.method || '',
          csvEscape(e.url || ''),
          e.responseStatus ?? '',
          e.responseDuration ?? '',
          e.responseSize ?? '',
          csvEscape(e.requestName || ''),
        ];
        return fields.join(',');
      });
      content = [header, ...rows].join('\n');
      defaultName = 'nouto-history.csv';
      filterName = 'CSV';
    } else {
      content = JSON.stringify({ _format: 'nouto-history', _version: 1, entries }, null, 2);
      defaultName = 'nouto-history.json';
      filterName = 'JSON';
    }

    const filePath = await saveDialog({
      defaultPath: defaultName,
      filters: [{ name: filterName, extensions: [format === 'csv' ? 'csv' : 'json'] }],
    });
    if (!filePath) return;
    await writeTextFile(filePath, content);
    showNotification('info', `Exported ${entries.length} history entries as ${filterName}.`);
  } catch (e: any) {
    showNotification('error', `History export failed: ${e.message || e}`);
  }
}

export async function handleImportHistory() {
  try {
    const selected = await openDialog({
      multiple: false,
      filters: [{ name: 'Nouto History', extensions: ['json'] }],
      title: 'Import History',
    });
    if (!selected) return;

    const content = await readTextFile(selected as string);
    let data: any;
    try {
      data = JSON.parse(content);
    } catch {
      showNotification('error', 'Invalid JSON file.');
      return;
    }

    if (data._format !== 'nouto-history') {
      showNotification('error', 'Not a Nouto history export file.');
      return;
    }

    if (!Array.isArray(data.entries) || data.entries.length === 0) {
      showNotification('info', 'No history entries found in file.');
      return;
    }

    const existingEntries = await new Promise<any[]>((resolve) => {
      const unsub = bus.onMessage((msg: IncomingMessage) => {
        if (msg.type === 'historyLoaded') {
          unsub();
          const payload = (msg as any).data || {};
          resolve(payload.entries || []);
        }
      });
      bus.send({ type: 'getHistory' });
      setTimeout(() => { unsub(); resolve([]); }, 5000);
    });

    const existingIds = new Set(existingEntries.map((e: any) => e.id));
    const newEntries = data.entries.filter((e: any) =>
      e.id && e.timestamp && e.method && e.url && !existingIds.has(e.id)
    );

    if (newEntries.length === 0) {
      showNotification('info', 'All entries already exist in history (deduplicated).');
      return;
    }

    bus.send({ type: 'importHistory', data: { entries: newEntries } });
    bus.send({ type: 'getHistory' });
    showNotification('info', `Imported ${newEntries.length} history entries (${data.entries.length - newEntries.length} duplicates skipped).`);
  } catch (e: any) {
    showNotification('error', `History import failed: ${e.message || e}`);
  }
}

export async function handleImportPostmanEnvironment() {
  try {
    const selected = await openDialog({
      multiple: true,
      filters: [{ name: 'Postman Environment / Globals', extensions: ['json'] }],
      title: 'Import Postman Environment or Globals',
    });
    if (!selected) return;

    const files = Array.isArray(selected) ? selected : [selected];
    let importedCount = 0;

    for (const filePath of files) {
      const content = await readTextFile(filePath as string);
      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch {
        showNotification('error', `Failed to parse ${filePath} as JSON.`);
        continue;
      }

      if (!parsed.values || !Array.isArray(parsed.values)) {
        showNotification('error', 'Skipped: not a valid Postman environment or globals file.');
        continue;
      }

      const pathStr = filePath as string;
      const fileName = pathStr.split(/[/\\]/).pop() || 'Imported';
      const fallbackName = fileName
        .replace('.json', '')
        .replace('.postman_environment', '')
        .replace('.postman_globals', '');

      const envName = parsed.name || fallbackName;
      const variables = parsed.values.map((v: any) => ({
        key: v.key || '',
        value: v.value || '',
        enabled: v.enabled !== false,
      }));

      const env = addEnvironment(envName);
      updateEnvironmentVariables(env.id, variables);
      importedCount++;
    }

    if (importedCount > 0) {
      showNotification('info', `Imported ${importedCount} environment(s) successfully.`);
    }
  } catch (e: any) {
    showNotification('error', `Environment import failed: ${e.message || e}`);
  }
}

export async function handleExportBenchmarkResults(data: any) {
  const { format } = data;
  const iterations = benchmarkState.iterations;
  const statistics = benchmarkState.statistics;
  const reqStore = requestStore;
  const requestName = benchmarkState.requestName || deriveNameFromUrl(reqStore.url) || 'benchmark';
  const method = benchmarkState.requestMethod || reqStore.method || 'GET';
  const url = benchmarkState.requestUrl || reqStore.url || '';

  let content: string;
  let defaultName: string;

  if (format === 'csv') {
    const header = '#,Status,StatusText,Duration(ms),Size,Success,Error';
    const rows = iterations.map((r: any, i: number) =>
      `${i + 1},${r.status},${r.statusText || ''},${r.duration},${r.size},${r.success ? 'Yes' : 'No'},"${(r.error || '').replace(/"/g, '""')}"`
    );
    content = [header, ...rows].join('\n');
    defaultName = `${requestName.replace(/[^a-zA-Z0-9]/g, '_')}_benchmark.csv`;
  } else {
    content = JSON.stringify({
      requestName,
      method,
      url,
      config: $state.snapshot(benchmarkState.config),
      statistics,
      iterations,
    }, null, 2);
    defaultName = `${requestName.replace(/[^a-zA-Z0-9]/g, '_')}_benchmark.json`;
  }

  try {
    const filePath = await saveDialog({ defaultPath: defaultName, filters: [{ name: 'All Files', extensions: ['*'] }] });
    if (filePath) {
      await writeTextFile(filePath, content);
      showNotification('info', 'Benchmark results exported successfully.');
    }
  } catch (err) {
    showNotification('error', `Failed to export results: ${err}`);
  }
}

export async function handleImportCollectionAsMocks() {
  const collections = getCollections();
  if (collections.length === 0) {
    showNotification('info', 'No collections available to import.');
    return;
  }

  const items = collections.map(c => ({ label: c.name, value: c.id }));
  const picked = await showLocalQuickPick('Select a collection to import as mock routes', items);
  if (!picked) return;

  const col = collections.find(c => c.id === picked);
  if (!col) return;

  function getAllRequests(items: any[]): any[] {
    const requests: any[] = [];
    for (const item of items) {
      if (isRequest(item)) requests.push(item);
      else if (isFolder(item)) requests.push(...getAllRequests(item.children));
    }
    return requests;
  }

  const requests = getAllRequests(col.items);
  const routes = requests.map((r: any) => {
    let path = '/';
    try {
      const url = new URL(r.url.startsWith('http') ? r.url : `http://localhost${r.url}`);
      path = url.pathname || '/';
    } catch { path = r.url || '/'; }

    return {
      id: generateId(),
      enabled: true,
      method: r.method || 'GET',
      path,
      statusCode: 200,
      responseBody: '{}',
      responseHeaders: [],
      latencyMin: 0,
      latencyMax: 0,
      description: r.name || '',
    };
  });

  initMockStore({
    config: { port: mockServerState.config.port, routes },
    status: mockServerState.status,
  });

  showNotification('info', `Imported ${routes.length} routes from "${col.name}".`);
}
