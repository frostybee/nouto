import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { StorageService } from '../services/StorageService';
import { EnvFileService } from '../services/EnvFileService';
import { CollectionRunnerService } from '../services/CollectionRunnerService';
import { BenchmarkService } from '../services/BenchmarkService';
import { MockServerService } from '../services/MockServerService';
import { MockStorageService } from '../services/MockStorageService';
import type { Collection, HistoryEntry, SavedRequest, EnvironmentsData, CollectionItem, Folder } from '../services/types';
import { isFolder, isRequest } from '../services/types';

export class SidebarViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = 'hivefetch.sidebar';

  private _view?: vscode.WebviewView;
  private _storageService: StorageService;
  private _envFileService: EnvFileService;
  private _runnerService: CollectionRunnerService;
  private _benchmarkService: BenchmarkService;
  private _mockServerService: MockServerService;
  private _mockStorageService: MockStorageService;

  // Data caches
  private _history: HistoryEntry[] = [];
  private _collections: Collection[] = [];
  private _environments: EnvironmentsData = { environments: [], activeId: null };
  private _dataLoaded: Promise<void>;

  constructor(private readonly _extensionUri: vscode.Uri) {
    this._storageService = new StorageService(vscode.workspace.workspaceFolders?.[0]);
    this._envFileService = new EnvFileService();
    this._runnerService = new CollectionRunnerService();
    this._benchmarkService = new BenchmarkService();
    this._mockServerService = new MockServerService();
    this._mockStorageService = new MockStorageService(this._storageService.getStorageDir());

    // Subscribe to .env file changes
    this._envFileService.onDidChange((variables) => {
      this._view?.webview.postMessage({
        type: 'envFileVariablesUpdated',
        data: {
          variables,
          filePath: this._envFileService.getFilePath(),
        },
      });
    });

    this._dataLoaded = this._loadInitialData();
  }

  private async _loadInitialData(): Promise<void> {
    this._history = await this._storageService.loadHistory();
    this._collections = await this._storageService.loadCollections();
    this._environments = await this._storageService.loadEnvironments();

    // Initialize .env file watcher if path was previously saved
    if (this._environments.envFilePath) {
      await this._envFileService.setFilePath(this._environments.envFilePath);
    }
  }

  /**
   * Wait for initial data to be loaded from disk
   */
  public whenReady(): Promise<void> {
    return this._dataLoaded;
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

      case 'newRequest':
        await vscode.commands.executeCommand('hivefetch.newRequest');
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
        await this._createRequest(message.data.collectionId, message.data.parentFolderId, message.data.openInPanel);
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

      case 'saveCollections':
        this._collections = message.data || [];
        await this._storageService.saveCollections(this._collections);
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

      case 'linkEnvFile':
        await this._linkEnvFile();
        break;

      case 'unlinkEnvFile':
        await this._unlinkEnvFile();
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

      case 'importOpenApi':
        await vscode.commands.executeCommand('hivefetch.importOpenApi');
        break;

      case 'importInsomnia':
        await vscode.commands.executeCommand('hivefetch.importInsomnia');
        break;

      case 'importHoppscotch':
        await vscode.commands.executeCommand('hivefetch.importHoppscotch');
        break;

      case 'importCurl':
        await vscode.commands.executeCommand('hivefetch.importCurl');
        break;

      case 'importFromUrl':
        await vscode.commands.executeCommand('hivefetch.importFromUrl');
        break;

      case 'setCollectionAuth':
      case 'setCollectionHeaders':
        // These are handled by the sidebar webview itself (future UI)
        // For now, log a message
        vscode.window.showInformationMessage('Collection-level auth and headers can be configured via the collection context menu. This feature will be enhanced in a future update.');
        break;

      // ============================================
      // Collection Runner Operations
      // ============================================
      case 'openCollectionRunner':
        await this._openCollectionRunner(message.data?.collectionId, message.data?.folderId);
        break;

      // ============================================
      // Mock Server & Benchmark Operations
      // ============================================
      case 'openMockServer':
        await this._openMockServerPanel();
        break;

      case 'benchmarkRequest':
        await this._openBenchmarkPanel(message.data.requestId, message.data.collectionId);
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
        envFileVariables: this._envFileService.getVariables(),
        envFilePath: this._envFileService.getFilePath(),
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

  private async _createRequest(collectionId: string, parentFolderId?: string, openInPanel: boolean = true): Promise<void> {
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

    // Open the new request in a linked panel
    if (openInPanel) {
      await vscode.commands.executeCommand('hivefetch.openRequest', request, collectionId);
    }
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
    await this._openCollectionRunner(collectionId);
  }

  private async _runAllInFolder(folderId: string, collectionId: string): Promise<void> {
    await this._openCollectionRunner(collectionId, folderId);
  }

  private async _openCollectionRunner(collectionId: string, folderId?: string): Promise<void> {
    const collection = this._collections.find(c => c.id === collectionId);
    if (!collection) return;

    let requests: SavedRequest[];
    let panelTitle: string;

    if (folderId) {
      const folder = this._findFolderRecursive(collection.items, folderId);
      if (!folder) return;
      requests = this._getAllRequestsFromItems(folder.children);
      panelTitle = `Runner: ${folder.name}`;
    } else {
      requests = this._getAllRequestsFromItems(collection.items);
      panelTitle = `Runner: ${collection.name}`;
    }

    if (requests.length === 0) {
      vscode.window.showInformationMessage('No requests to run');
      return;
    }

    // Create runner webview panel
    const panel = vscode.window.createWebviewPanel(
      'hivefetch.collectionRunner',
      panelTitle,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'dist'),
        ],
      }
    );

    panel.webview.html = this._getRunnerHtml(panel.webview);

    // Handle messages from the runner panel
    panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready':
          panel.webview.postMessage({
            type: 'initRunner',
            data: {
              collectionId,
              collectionName: collection.name,
              folderId,
              requests: requests.map(r => ({ id: r.id, name: r.name, method: r.method, url: r.url })),
            },
          });
          break;

        case 'startCollectionRun': {
          const config = message.data.config;
          const envData = await this._storageService.loadEnvironments();

          this._runnerService.runCollection(
            requests,
            config,
            collection.name,
            envData,
            (progress) => {
              panel.webview.postMessage({ type: 'collectionRunProgress', data: progress });
            },
            (result) => {
              panel.webview.postMessage({ type: 'collectionRunRequestResult', data: result });
            },
          ).then((result) => {
            panel.webview.postMessage({ type: 'collectionRunComplete', data: result });
          }).catch(() => {
            // Cancelled or error — handled inside the service
          });
          break;
        }

        case 'cancelCollectionRun':
          this._runnerService.cancel();
          panel.webview.postMessage({ type: 'collectionRunCancelled' });
          break;

        case 'exportRunResults':
          await this._exportRunResults(message.data);
          break;
      }
    });

    // Clean up on panel close
    panel.onDidDispose(() => {
      this._runnerService.cancel();
    });
  }

  private async _exportRunResults(data: { format: string; results: any[]; summary: any; collectionName: string }): Promise<void> {
    const { format, results, summary, collectionName } = data;

    let content: string;
    let defaultName: string;
    let filters: Record<string, string[]>;

    if (format === 'csv') {
      const header = '#,Name,Method,URL,Status,StatusText,Duration(ms),Pass/Fail,Error';
      const rows = results.map((r: any, i: number) =>
        `${i + 1},"${(r.requestName || '').replace(/"/g, '""')}",${r.method},"${(r.url || '').replace(/"/g, '""')}",${r.status},${r.statusText || ''},${r.duration},${r.passed ? 'Pass' : 'Fail'},"${(r.error || '').replace(/"/g, '""')}"`
      );
      content = [header, ...rows].join('\n');
      defaultName = `${collectionName.replace(/[^a-zA-Z0-9]/g, '_')}_results.csv`;
      filters = { 'CSV Files': ['csv'] };
    } else {
      content = JSON.stringify({ collectionName, summary, results }, null, 2);
      defaultName = `${collectionName.replace(/[^a-zA-Z0-9]/g, '_')}_results.json`;
      filters = { 'JSON Files': ['json'] };
    }

    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(defaultName),
      filters,
      title: `Export Results (${format.toUpperCase()})`,
    });

    if (uri) {
      await fs.writeFile(uri.fsPath, content, 'utf8');
      vscode.window.showInformationMessage(`Results exported to ${uri.fsPath}`);
    }
  }

  private _getRunnerHtml(webview: vscode.Webview): string {
    const distPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'dist');

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(distPath, 'runner.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(distPath, 'runner.css')
    );

    const nonce = this._getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src ${webview.cspSource} https: http:; font-src ${webview.cspSource};">
  <link href="${styleUri}" rel="stylesheet">
  <title>Collection Runner</title>
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
  // .env File Operations
  // ============================================
  private async _linkEnvFile(): Promise<void> {
    const result = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: {
        'Environment Files': ['env'],
        'All Files': ['*'],
      },
      title: 'Select .env File',
    });

    if (!result || result.length === 0) return;

    const filePath = result[0].fsPath;
    await this._envFileService.setFilePath(filePath);

    // Save the path in environments data
    this._environments.envFilePath = filePath;
    await this._storageService.saveEnvironments(this._environments);

    // Notify webview
    this._view?.webview.postMessage({
      type: 'envFileVariablesUpdated',
      data: {
        variables: this._envFileService.getVariables(),
        filePath,
      },
    });
  }

  private async _unlinkEnvFile(): Promise<void> {
    await this._envFileService.setFilePath(null);

    // Clear the path in environments data
    this._environments.envFilePath = null;
    await this._storageService.saveEnvironments(this._environments);

    // Notify webview
    this._view?.webview.postMessage({
      type: 'envFileVariablesUpdated',
      data: {
        variables: [],
        filePath: null,
      },
    });
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

  public getEnvFileService(): EnvFileService {
    return this._envFileService;
  }

  public async stopMockServer(): Promise<void> {
    await this._mockServerService.stop();
  }

  public cancelBenchmark(): void {
    this._benchmarkService.cancel();
  }

  // ============================================
  // Mock Server Panel
  // ============================================
  public async _openMockServerPanel(): Promise<void> {
    const mockConfig = await this._mockStorageService.load();

    const panel = vscode.window.createWebviewPanel(
      'hivefetch.mockServer',
      'Mock Server',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'dist'),
        ],
      }
    );

    panel.webview.html = this._getMockHtml(panel.webview);

    // Wire up status/log callbacks
    this._mockServerService.setStatusChangeHandler((status) => {
      panel.webview.postMessage({ type: 'mockStatusChanged', data: { status } });
    });

    this._mockServerService.setLogHandler((log) => {
      panel.webview.postMessage({ type: 'mockLogAdded', data: log });
    });

    panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready':
          panel.webview.postMessage({
            type: 'initMockServer',
            data: {
              config: mockConfig,
              status: this._mockServerService.getStatus(),
            },
          });
          break;

        case 'startMockServer':
          try {
            await this._mockServerService.start(message.data.config);
            await this._mockStorageService.save(message.data.config);
          } catch (err: any) {
            vscode.window.showErrorMessage(`Mock server failed to start: ${err.message}`);
          }
          break;

        case 'stopMockServer':
          await this._mockServerService.stop();
          break;

        case 'updateMockRoutes':
          this._mockServerService.updateRoutes(message.data.config.routes);
          await this._mockStorageService.save(message.data.config);
          break;

        case 'clearMockLogs':
          this._mockServerService.clearLogs();
          break;

        case 'importCollectionAsMocks': {
          const collections = this._collections;
          if (collections.length === 0) {
            vscode.window.showInformationMessage('No collections available to import.');
            break;
          }
          const items = collections.map(c => ({ label: c.name, id: c.id }));
          const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select a collection to import' });
          if (!picked) break;
          const col = collections.find(c => c.id === picked.id);
          if (!col) break;
          const routes = MockStorageService.collectionToRoutes(col);
          panel.webview.postMessage({
            type: 'initMockServer',
            data: {
              config: { port: mockConfig.port, routes: [...mockConfig.routes, ...routes] },
              status: this._mockServerService.getStatus(),
            },
          });
          break;
        }
      }
    });

    panel.onDidDispose(() => {
      // Don't stop the mock server when panel closes — it runs independently
      this._mockServerService.setStatusChangeHandler(undefined as any);
      this._mockServerService.setLogHandler(undefined as any);
    });
  }

  // ============================================
  // Benchmark Panel
  // ============================================
  public async _openBenchmarkPanel(requestId: string, collectionId?: string): Promise<void> {
    const found = this._findRequestAcrossCollections(requestId);
    if (!found) {
      vscode.window.showErrorMessage('Request not found for benchmarking.');
      return;
    }
    const { request } = found;

    const panel = vscode.window.createWebviewPanel(
      'hivefetch.benchmark',
      `Benchmark: ${request.name}`,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'dist'),
        ],
      }
    );

    panel.webview.html = this._getBenchmarkHtml(panel.webview);

    panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready':
          panel.webview.postMessage({
            type: 'initBenchmark',
            data: {
              requestId,
              requestName: request.name,
              requestMethod: request.method,
              requestUrl: request.url,
              collectionId,
            },
          });
          break;

        case 'startBenchmark': {
          const config = message.data.config;
          const envData = await this._storageService.loadEnvironments();

          this._benchmarkService.run(
            request,
            config,
            envData,
            (current, total) => {
              panel.webview.postMessage({
                type: 'benchmarkProgress',
                data: { current, total },
              });
            },
            (iteration) => {
              panel.webview.postMessage({
                type: 'benchmarkIterationComplete',
                data: iteration,
              });
            },
          ).then((result) => {
            panel.webview.postMessage({ type: 'benchmarkComplete', data: result });
          }).catch(() => {
            panel.webview.postMessage({ type: 'benchmarkCancelled' });
          });
          break;
        }

        case 'cancelBenchmark':
          this._benchmarkService.cancel();
          panel.webview.postMessage({ type: 'benchmarkCancelled' });
          break;

        case 'exportBenchmarkResults': {
          const format = message.data.format;
          // Get latest state from webview
          // For now, export the most recent result from the service
          vscode.window.showInformationMessage(`Benchmark export (${format}) — use the iteration data shown in the panel.`);
          break;
        }
      }
    });

    panel.onDidDispose(() => {
      this._benchmarkService.cancel();
    });
  }

  private _getMockHtml(webview: vscode.Webview): string {
    const distPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'dist');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'mock.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'mock.css'));
    const nonce = this._getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src ${webview.cspSource} https: http:; font-src ${webview.cspSource};">
  <link href="${styleUri}" rel="stylesheet">
  <title>Mock Server</title>
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

  private _getBenchmarkHtml(webview: vscode.Webview): string {
    const distPath = vscode.Uri.joinPath(this._extensionUri, 'src', 'webview', 'dist');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'benchmark.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'benchmark.css'));
    const nonce = this._getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src ${webview.cspSource} https: http:; font-src ${webview.cspSource};">
  <link href="${styleUri}" rel="stylesheet">
  <title>Performance Benchmark</title>
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

  public dispose(): void {
    this._envFileService.dispose();
    this._mockServerService.stop();
  }

  public async notifyCollectionsUpdated(): Promise<void> {
    this._collections = await this._storageService.loadCollections();
    this._notifyCollectionsUpdated();
  }

  public getHistory(): HistoryEntry[] {
    return this._history;
  }

  /**
   * Create an empty request inside a collection/folder and return it
   */
  public async createRequestInCollection(collectionId: string, folderId?: string): Promise<{ request: SavedRequest; collectionId: string }> {
    const collection = this._collections.find(c => c.id === collectionId);
    if (!collection) {
      throw new Error('Collection not found');
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

    collection.items = this._addItemToContainer(collection.items, request, folderId);
    collection.updatedAt = new Date().toISOString();
    await this._storageService.saveCollections(this._collections);
    this._notifyCollectionsUpdated();
    return { request, collectionId };
  }

  /**
   * Create a new collection with an empty request inside it
   */
  public async createCollectionAndAddRequest(name: string): Promise<{ collectionId: string; request: SavedRequest }> {
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

    const collection: Collection = {
      id: this._generateId(),
      name,
      items: [request],
      expanded: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this._collections.push(collection);
    await this._storageService.saveCollections(this._collections);
    this._notifyCollectionsUpdated();
    return { collectionId: collection.id, request };
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
