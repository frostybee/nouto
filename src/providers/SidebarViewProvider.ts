import * as vscode from 'vscode';
import { StorageService } from '../services/StorageService';
import type { Collection, HistoryEntry, SavedRequest, EnvironmentsData, CollectionItem, Folder } from '../services/types';
import { isFolder, isRequest } from '../services/types';

export class SidebarViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'hivefetch.sidebar';

  private _view?: vscode.WebviewView;
  private _storageService: StorageService;

  // Data caches
  private _history: HistoryEntry[] = [];
  private _collections: Collection[] = [];
  private _environments: EnvironmentsData = { environments: [], activeId: null };

  constructor(private readonly _extensionUri: vscode.Uri) {
    this._storageService = new StorageService(vscode.workspace.workspaceFolders?.[0]);
    this._loadInitialData();
  }

  private async _loadInitialData(): Promise<void> {
    this._history = await this._storageService.loadHistory();
    this._collections = await this._storageService.loadCollections();
    this._environments = await this._storageService.loadEnvironments();
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'dist'),
      ],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (message) => {
      await this._handleMessage(message);
    });
  }

  private async _handleMessage(message: any): Promise<void> {
    switch (message.type) {
      // ============================================
      // Initialization
      // ============================================
      case 'ready':
        await this._sendInitialData();
        break;

      // ============================================
      // History Operations
      // ============================================
      case 'openHistoryEntry':
        await this._openHistoryEntry(message.data.id, message.data.newTab);
        break;

      case 'runHistoryEntry':
        await this._runHistoryEntry(message.data.id);
        break;

      case 'saveHistoryToCollection':
        await this._saveHistoryToCollection(message.data.historyId, message.data.collectionId);
        break;

      case 'deleteHistoryEntry':
        await this._deleteHistoryEntry(message.data.id);
        break;

      case 'clearHistory':
        await this._clearHistory();
        break;

      // ============================================
      // Collection Operations
      // ============================================
      case 'openCollectionRequest':
        await this._openCollectionRequest(message.data.requestId, message.data.collectionId);
        break;

      case 'runCollectionRequest':
        await this._runCollectionRequest(message.data.requestId, message.data.collectionId);
        break;

      case 'createRequest':
        await this._createRequest(message.data.collectionId, message.data.parentFolderId);
        break;

      case 'createFolder':
        await this._createCollection(message.data?.name);
        break;

      case 'renameCollection':
        await this._renameCollection(message.data.id, message.data.name);
        break;

      case 'deleteCollection':
        await this._deleteCollection(message.data.id);
        break;

      case 'duplicateCollection':
        await this._duplicateCollection(message.data.id);
        break;

      case 'deleteRequest':
        await this._deleteRequest(message.data.requestId);
        break;

      case 'duplicateRequest':
        await this._duplicateRequest(message.data.requestId);
        break;

      case 'runAllInCollection':
        await this._runAllInCollection(message.data.collectionId);
        break;

      case 'runAllInFolder':
        await this._runAllInFolder(message.data.folderId, message.data.collectionId);
        break;

      case 'exportCollection':
        await vscode.commands.executeCommand('hivefetch.exportPostman', message.data.collectionId);
        break;

      case 'duplicateFolder':
        await this._duplicateFolder(message.data.folderId, message.data.collectionId);
        break;

      case 'exportFolder':
        await this._exportFolder(message.data.folderId, message.data.collectionId);
        break;

      // ============================================
      // Environment Operations
      // ============================================
      case 'createEnvironment':
        await this._createEnvironment(message.data?.name);
        break;

      case 'renameEnvironment':
        await this._renameEnvironment(message.data.id, message.data.name);
        break;

      case 'deleteEnvironment':
        await this._deleteEnvironment(message.data.id);
        break;

      case 'duplicateEnvironment':
        await this._duplicateEnvironment(message.data.id);
        break;

      case 'setActiveEnvironment':
        await this._setActiveEnvironment(message.data.id);
        break;

      case 'saveEnvironments':
        await this._saveEnvironments(message.data);
        break;

      // ============================================
      // Import/Export Operations
      // ============================================
      case 'importPostman':
        await vscode.commands.executeCommand('hivefetch.importPostman');
        break;

      case 'exportPostman':
        await vscode.commands.executeCommand('hivefetch.exportPostman', message.data?.collectionId);
        break;
    }
  }

  // ============================================
  // Recursive Helpers for Nested Items
  // ============================================
  private _findRequestRecursive(items: CollectionItem[], requestId: string): SavedRequest | null {
    for (const item of items) {
      if (isRequest(item) && item.id === requestId) {
        return item;
      }
      if (isFolder(item)) {
        const found = this._findRequestRecursive(item.children, requestId);
        if (found) return found;
      }
    }
    return null;
  }

  private _findRequestInCollection(collection: Collection, requestId: string): SavedRequest | null {
    return this._findRequestRecursive(collection.items, requestId);
  }

  private _findRequestAcrossCollections(requestId: string): { collection: Collection; request: SavedRequest } | null {
    for (const collection of this._collections) {
      const request = this._findRequestInCollection(collection, requestId);
      if (request) {
        return { collection, request };
      }
    }
    return null;
  }

  private _addItemToContainer(
    items: CollectionItem[],
    newItem: CollectionItem,
    targetFolderId?: string
  ): CollectionItem[] {
    if (!targetFolderId) {
      return [...items, newItem];
    }

    return items.map(item => {
      if (isFolder(item) && item.id === targetFolderId) {
        return {
          ...item,
          children: [...item.children, newItem],
          updatedAt: new Date().toISOString(),
        };
      }
      if (isFolder(item)) {
        return {
          ...item,
          children: this._addItemToContainer(item.children, newItem, targetFolderId),
        };
      }
      return item;
    });
  }

  private _removeItemFromTree(items: CollectionItem[], itemId: string): CollectionItem[] {
    return items
      .filter(item => item.id !== itemId)
      .map(item => {
        if (isFolder(item)) {
          return {
            ...item,
            children: this._removeItemFromTree(item.children, itemId),
          };
        }
        return item;
      });
  }

  private _duplicateItemsRecursive(items: CollectionItem[]): CollectionItem[] {
    return items.map(item => {
      if (isFolder(item)) {
        return {
          ...item,
          id: this._generateId(),
          children: this._duplicateItemsRecursive(item.children),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as Folder;
      } else {
        return {
          ...item,
          id: this._generateId(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as SavedRequest;
      }
    });
  }

  // ============================================
  // Data Sending
  // ============================================
  private async _sendInitialData(): Promise<void> {
    await this._loadInitialData();
    this._view?.webview.postMessage({
      type: 'initialData',
      data: {
        history: this._history,
        collections: this._collections,
        environments: this._environments,
      },
    });
  }

  private _notifyHistoryUpdated(): void {
    this._view?.webview.postMessage({
      type: 'historyUpdated',
      data: this._history,
    });
  }

  private _notifyCollectionsUpdated(): void {
    this._view?.webview.postMessage({
      type: 'collectionsUpdated',
      data: this._collections,
    });
  }

  private _notifyEnvironmentsUpdated(): void {
    this._view?.webview.postMessage({
      type: 'environmentsUpdated',
      data: this._environments,
    });
  }

  // ============================================
  // History Operations Implementation
  // ============================================
  private async _openHistoryEntry(id: string, newTab?: boolean): Promise<void> {
    const entry = this._history.find(h => h.id === id);
    if (!entry) {
      vscode.window.showErrorMessage('History entry not found');
      return;
    }
    await vscode.commands.executeCommand('hivefetch.openHistoryEntry', entry, newTab);
  }

  private async _runHistoryEntry(id: string): Promise<void> {
    const entry = this._history.find(h => h.id === id);
    if (!entry) {
      vscode.window.showErrorMessage('History entry not found');
      return;
    }
    // Open and automatically run the request
    await vscode.commands.executeCommand('hivefetch.runHistoryEntry', entry);
  }

  private async _saveHistoryToCollection(entryId: string, collectionId: string): Promise<void> {
    const entry = this._history.find(h => h.id === entryId);
    if (!entry) return;

    const collection = this._collections.find(c => c.id === collectionId);
    if (!collection) return;

    const request: SavedRequest = {
      type: 'request',
      id: this._generateId(),
      name: `${entry.method} ${this._getDisplayUrl(entry.url)}`,
      method: entry.method,
      url: entry.url,
      params: entry.params,
      headers: entry.headers,
      auth: entry.auth,
      body: entry.body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    collection.items.push(request);
    collection.updatedAt = new Date().toISOString();
    await this._storageService.saveCollections(this._collections);
    this._notifyCollectionsUpdated();
    vscode.window.showInformationMessage(`Request saved to "${collection.name}"`);
  }

  private async _deleteHistoryEntry(id: string): Promise<void> {
    this._history = this._history.filter(h => h.id !== id);
    await this._storageService.saveHistory(this._history);
    this._notifyHistoryUpdated();
  }

  private async _clearHistory(): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
      'Clear all history entries?',
      { modal: true },
      'Clear'
    );
    if (confirm === 'Clear') {
      this._history = [];
      await this._storageService.saveHistory([]);
      this._notifyHistoryUpdated();
    }
  }

  // ============================================
  // Collection Operations Implementation
  // ============================================
  private async _openCollectionRequest(requestId: string, collectionId: string): Promise<void> {
    const collection = this._collections.find(c => c.id === collectionId);
    if (!collection) return;

    const request = this._findRequestInCollection(collection, requestId);
    if (!request) return;

    await vscode.commands.executeCommand('hivefetch.openRequest', request, collectionId);
  }

  private async _runCollectionRequest(requestId: string, collectionId: string): Promise<void> {
    await this._openCollectionRequest(requestId, collectionId);
  }

  private async _createRequest(collectionId: string, parentFolderId?: string): Promise<void> {
    const collection = this._collections.find(c => c.id === collectionId);
    if (!collection) {
      vscode.window.showErrorMessage('Collection not found');
      return;
    }

    const request: SavedRequest = {
      type: 'request',
      id: this._generateId(),
      name: 'New Request',
      method: 'GET',
      url: '',
      params: [],
      headers: [],
      auth: { type: 'none' },
      body: { type: 'none', content: '' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    collection.items = this._addItemToContainer(collection.items, request, parentFolderId);
    collection.updatedAt = new Date().toISOString();
    await this._storageService.saveCollections(this._collections);
    this._notifyCollectionsUpdated();

    // Open the new request
    await vscode.commands.executeCommand('hivefetch.openRequest', request, collectionId);
  }

  private async _createCollection(name?: string): Promise<void> {
    const collectionName = name || await vscode.window.showInputBox({
      prompt: 'Collection name',
      placeHolder: 'My Collection',
    });

    if (!collectionName) return;

    const collection: Collection = {
      id: this._generateId(),
      name: collectionName,
      items: [],
      expanded: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this._collections.push(collection);
    await this._storageService.saveCollections(this._collections);
    this._notifyCollectionsUpdated();
  }

  private async _renameCollection(id: string, name: string): Promise<void> {
    const collection = this._collections.find(c => c.id === id);
    if (!collection) return;

    collection.name = name;
    collection.updatedAt = new Date().toISOString();
    await this._storageService.saveCollections(this._collections);
    this._notifyCollectionsUpdated();
  }

  private async _deleteCollection(id: string): Promise<void> {
    const collection = this._collections.find(c => c.id === id);
    if (!collection) return;

    const confirm = await vscode.window.showWarningMessage(
      `Delete collection "${collection.name}"?`,
      { modal: true },
      'Delete'
    );

    if (confirm === 'Delete') {
      this._collections = this._collections.filter(c => c.id !== id);
      await this._storageService.saveCollections(this._collections);
      this._notifyCollectionsUpdated();
    }
  }

  private async _duplicateCollection(id: string): Promise<void> {
    const collection = this._collections.find(c => c.id === id);
    if (!collection) return;

    const duplicate: Collection = {
      ...collection,
      id: this._generateId(),
      name: `${collection.name} (copy)`,
      items: this._duplicateItemsRecursive(collection.items),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this._collections.push(duplicate);
    await this._storageService.saveCollections(this._collections);
    this._notifyCollectionsUpdated();
  }

  private async _deleteRequest(requestId: string): Promise<void> {
    const found = this._findRequestAcrossCollections(requestId);
    if (!found) return;

    const { collection, request } = found;
    const confirm = await vscode.window.showWarningMessage(
      `Delete request "${request.name}"?`,
      { modal: true },
      'Delete'
    );

    if (confirm === 'Delete') {
      collection.items = this._removeItemFromTree(collection.items, requestId);
      collection.updatedAt = new Date().toISOString();
      await this._storageService.saveCollections(this._collections);
      this._notifyCollectionsUpdated();
    }
  }

  private async _duplicateRequest(requestId: string): Promise<void> {
    const found = this._findRequestAcrossCollections(requestId);
    if (!found) return;

    const { collection, request } = found;
    const duplicate: SavedRequest = {
      ...request,
      id: this._generateId(),
      name: `${request.name} (copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Add duplicate at root level of collection
    collection.items.push(duplicate);
    collection.updatedAt = new Date().toISOString();
    await this._storageService.saveCollections(this._collections);
    this._notifyCollectionsUpdated();
  }

  private _getAllRequestsFromItems(items: CollectionItem[]): SavedRequest[] {
    const requests: SavedRequest[] = [];
    for (const item of items) {
      if (isRequest(item)) {
        requests.push(item);
      } else if (isFolder(item)) {
        requests.push(...this._getAllRequestsFromItems(item.children));
      }
    }
    return requests;
  }

  private _findFolderRecursive(items: CollectionItem[], folderId: string): Folder | null {
    for (const item of items) {
      if (isFolder(item)) {
        if (item.id === folderId) {
          return item;
        }
        const found = this._findFolderRecursive(item.children, folderId);
        if (found) return found;
      }
    }
    return null;
  }

  private async _runAllInCollection(collectionId: string): Promise<void> {
    const collection = this._collections.find(c => c.id === collectionId);
    if (!collection) return;

    const requests = this._getAllRequestsFromItems(collection.items);
    if (requests.length === 0) {
      vscode.window.showInformationMessage('No requests in this collection');
      return;
    }

    vscode.window.showInformationMessage(`Running ${requests.length} request(s) from "${collection.name}"...`);

    // Execute requests sequentially
    for (const request of requests) {
      await vscode.commands.executeCommand('hivefetch.openRequest', request, collectionId);
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  private async _runAllInFolder(folderId: string, collectionId: string): Promise<void> {
    const collection = this._collections.find(c => c.id === collectionId);
    if (!collection) return;

    const folder = this._findFolderRecursive(collection.items, folderId);
    if (!folder) return;

    const requests = this._getAllRequestsFromItems(folder.children);
    if (requests.length === 0) {
      vscode.window.showInformationMessage('No requests in this folder');
      return;
    }

    vscode.window.showInformationMessage(`Running ${requests.length} request(s) from "${folder.name}"...`);

    // Execute requests sequentially
    for (const request of requests) {
      await vscode.commands.executeCommand('hivefetch.openRequest', request, collectionId);
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  private async _duplicateFolder(folderId: string, collectionId: string): Promise<void> {
    const collection = this._collections.find(c => c.id === collectionId);
    if (!collection) return;

    const folder = this._findFolderRecursive(collection.items, folderId);
    if (!folder) return;

    const duplicate: Folder = {
      ...folder,
      id: this._generateId(),
      name: `${folder.name} (copy)`,
      children: this._duplicateItemsRecursive(folder.children),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Add duplicate at root level of collection
    collection.items.push(duplicate);
    collection.updatedAt = new Date().toISOString();
    await this._storageService.saveCollections(this._collections);
    this._notifyCollectionsUpdated();
  }

  private async _exportFolder(folderId: string, collectionId: string): Promise<void> {
    const collection = this._collections.find(c => c.id === collectionId);
    if (!collection) return;

    const folder = this._findFolderRecursive(collection.items, folderId);
    if (!folder) return;

    // Create a temporary collection with just the folder contents for export
    const tempCollection: Collection = {
      id: this._generateId(),
      name: folder.name,
      items: folder.children,
      expanded: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await vscode.commands.executeCommand('hivefetch.exportPostman', tempCollection.id);
  }

  // ============================================
  // Environment Operations Implementation
  // ============================================
  private async _createEnvironment(name?: string): Promise<void> {
    const envName = name || await vscode.window.showInputBox({
      prompt: 'Environment name',
      placeHolder: 'Development',
    });

    if (!envName) return;

    this._environments.environments.push({
      id: this._generateId(),
      name: envName,
      variables: [],
    });

    await this._storageService.saveEnvironments(this._environments);
    this._notifyEnvironmentsUpdated();
  }

  private async _renameEnvironment(id: string, name: string): Promise<void> {
    const env = this._environments.environments.find(e => e.id === id);
    if (!env) return;

    env.name = name;
    await this._storageService.saveEnvironments(this._environments);
    this._notifyEnvironmentsUpdated();
  }

  private async _deleteEnvironment(id: string): Promise<void> {
    const env = this._environments.environments.find(e => e.id === id);
    if (!env) return;

    const confirm = await vscode.window.showWarningMessage(
      `Delete environment "${env.name}"?`,
      { modal: true },
      'Delete'
    );

    if (confirm === 'Delete') {
      this._environments.environments = this._environments.environments.filter(e => e.id !== id);
      if (this._environments.activeId === id) {
        this._environments.activeId = null;
      }
      await this._storageService.saveEnvironments(this._environments);
      this._notifyEnvironmentsUpdated();
    }
  }

  private async _duplicateEnvironment(id: string): Promise<void> {
    const env = this._environments.environments.find(e => e.id === id);
    if (!env) return;

    this._environments.environments.push({
      id: this._generateId(),
      name: `${env.name} (copy)`,
      variables: [...env.variables.map(v => ({ ...v }))],
    });

    await this._storageService.saveEnvironments(this._environments);
    this._notifyEnvironmentsUpdated();
  }

  private async _setActiveEnvironment(id: string | null): Promise<void> {
    this._environments.activeId = id;
    await this._storageService.saveEnvironments(this._environments);
    this._notifyEnvironmentsUpdated();
  }

  private async _saveEnvironments(data: EnvironmentsData): Promise<void> {
    this._environments = data;
    await this._storageService.saveEnvironments(this._environments);
    this._notifyEnvironmentsUpdated();
  }

  // ============================================
  // Public Methods for External Use
  // ============================================
  public async addHistoryEntry(entry: HistoryEntry): Promise<void> {
    // Check for existing entry with same URL and method (deduplication)
    const existingIndex = this._history.findIndex(
      (h) => h.url === entry.url && h.method === entry.method
    );

    if (existingIndex !== -1) {
      // Remove the existing entry (we'll add the updated one at the top)
      this._history.splice(existingIndex, 1);
    }

    // Add to beginning (most recent first)
    this._history.unshift(entry);

    // Limit to 100 entries
    if (this._history.length > 100) {
      this._history = this._history.slice(0, 100);
    }

    await this._storageService.saveHistory(this._history);
    this._notifyHistoryUpdated();
  }

  public getCollections(): Collection[] {
    return this._collections;
  }

  public getStorageService(): StorageService {
    return this._storageService;
  }

  public async notifyCollectionsUpdated(): Promise<void> {
    this._collections = await this._storageService.loadCollections();
    this._notifyCollectionsUpdated();
  }

  public getHistory(): HistoryEntry[] {
    return this._history;
  }

  public async addRequest(
    collectionId: string,
    request: Omit<SavedRequest, 'id' | 'createdAt' | 'updatedAt'>,
    parentFolderId?: string
  ): Promise<SavedRequest> {
    const collection = this._collections.find(c => c.id === collectionId);
    if (!collection) {
      throw new Error('Collection not found');
    }

    const newRequest: SavedRequest = {
      ...request,
      type: 'request',
      id: this._generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    collection.items = this._addItemToContainer(collection.items, newRequest, parentFolderId);
    collection.updatedAt = new Date().toISOString();
    await this._storageService.saveCollections(this._collections);
    this._notifyCollectionsUpdated();
    return newRequest;
  }

  // ============================================
  // Utility Methods
  // ============================================
  private _generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private _getDisplayUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname + urlObj.pathname;
    } catch {
      return url;
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const distPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'dist');

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(distPath, 'sidebar.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(distPath, 'sidebar.css')
    );

    const nonce = this._getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src ${webview.cspSource}; font-src ${webview.cspSource};">
  <link href="${styleUri}" rel="stylesheet">
  <title>HiveFetch Sidebar</title>
</head>
<body>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    window.vscode = vscode;
  </script>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private _getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
