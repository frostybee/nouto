import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { StorageService } from '../services/StorageService';
import { EnvFileService } from '../services/EnvFileService';
import {
  CollectionRunnerService, BenchmarkService, MockServerService,
  MockStorageService, RecentCollectionService,
} from '@hivefetch/core/services';
import { HistoryStorageService } from '../services/HistoryStorageService';
import { FetchmanWatcher } from '../services/FetchmanWatcher';
import type { Collection, SavedRequest, EnvironmentsData, RequestKind, HttpMethod, KeyValue, AuthState, BodyState } from '../services/types';
import { REQUEST_KIND } from '../services/types';
import { confirmAction } from './confirmAction';
import type { RequestPanelManager } from './RequestPanelManager';

// Extracted modules
import {
  findRequestInCollection, updateItemInTree,
} from './sidebar/CollectionTreeOps';
import { CollectionCrudHandler, type ISidebarContext } from './sidebar/CollectionCrudHandler';
import { RunnerPanelHandler, type IRunnerContext } from './sidebar/RunnerPanelHandler';
import { EnvironmentHandler, type IEnvironmentContext } from './sidebar/EnvironmentHandler';
import { SpecialPanelHandler, type ISpecialPanelContext } from './sidebar/SpecialPanelHandler';

export class SidebarViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = 'hivefetch.sidebar';

  private _view?: vscode.WebviewView;
  private _storageService: StorageService;
  private _envFileService: EnvFileService;
  private _runnerService: CollectionRunnerService;
  private _benchmarkService: BenchmarkService;
  private _mockServerService: MockServerService;
  private _mockStorageService: MockStorageService;
  private _historyService: HistoryStorageService;
  private _fetchmanWatcher: FetchmanWatcher | null = null;

  // Data caches
  private _collections: Collection[] = [];
  private _environments: EnvironmentsData = { environments: [], activeId: null };
  private _dataLoaded: Promise<void>;
  private _panelManager?: RequestPanelManager;

  // Extracted handlers
  private _crudHandler: CollectionCrudHandler;
  private _runnerHandler: RunnerPanelHandler;
  private _envHandler: EnvironmentHandler;
  private _specialPanelHandler: SpecialPanelHandler;

  constructor(private readonly _extensionUri: vscode.Uri, private readonly _globalStorageDir?: string) {
    this._storageService = new StorageService(vscode.workspace.workspaceFolders?.[0], _globalStorageDir);
    this._envFileService = new EnvFileService();
    this._runnerService = new CollectionRunnerService();
    this._benchmarkService = new BenchmarkService();
    this._mockServerService = new MockServerService();
    this._mockStorageService = new MockStorageService(this._storageService.getStorageDir());
    this._historyService = new HistoryStorageService(_globalStorageDir || this._storageService.getStorageDir());
    this._historyService.load().catch(err => console.error('[HiveFetch] History load failed:', err));

    // Wire up extracted handlers
    const self = this;
    const sidebarCtx: ISidebarContext = {
      get collections() { return self._collections; },
      storageService: this._storageService,
      get panelManager() { return self._panelManager; },
      extensionUri: this._extensionUri,
      notifyCollectionsUpdated: () => this._notifyCollectionsUpdated(),
    };
    this._crudHandler = new CollectionCrudHandler(sidebarCtx);

    const runnerCtx: IRunnerContext = {
      get collections() { return self._collections; },
      storageService: this._storageService,
      extensionUri: this._extensionUri,
      getNonce: () => this._getNonce(),
    };
    this._runnerHandler = new RunnerPanelHandler(runnerCtx, this._runnerService);

    const envCtx: IEnvironmentContext = {
      get environments() { return self._environments; },
      storageService: this._storageService,
      envFileService: this._envFileService,
      postToWebview: (msg) => self._view?.webview.postMessage(msg),
      notifyEnvironmentsUpdated: () => self._notifyEnvironmentsUpdated(),
      setEnvironments: (data) => { self._environments = data; },
    };
    this._envHandler = new EnvironmentHandler(envCtx);

    const specialCtx: ISpecialPanelContext = {
      get collections() { return self._collections; },
      storageService: this._storageService,
      extensionUri: this._extensionUri,
      getNonce: () => self._getNonce(),
      notifyCollectionsUpdated: () => self._notifyCollectionsUpdated(),
    };
    this._specialPanelHandler = new SpecialPanelHandler(specialCtx, this._benchmarkService, this._mockServerService, this._mockStorageService);

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

    // Set up workspace collection file watcher if needed
    const collectionMode = this._storageService.getCollectionMode();
    const workspaceRoot = this._storageService.getWorkspaceRoot();
    if (collectionMode !== 'global' && workspaceRoot) {
      this._fetchmanWatcher = new FetchmanWatcher(workspaceRoot);
      this._fetchmanWatcher.onDidChange((uris) => this._handleExternalCollectionChanges(uris));
      this._fetchmanWatcher.start();
    }

    this._dataLoaded = this._loadInitialData();
  }

  private async _loadInitialData(): Promise<void> {
    this._collections = await this._storageService.loadCollections();
    this._environments = await this._storageService.loadEnvironments();

    if (this._environments.envFilePath) {
      try {
        await fs.access(this._environments.envFilePath);
        await this._envFileService.setFilePath(this._environments.envFilePath);
      } catch {
        this._environments.envFilePath = null;
        await this._storageService.saveEnvironments(this._environments);
      }
    }
  }

  /**
   * Handle external changes to .fetchman/ files (git pull, manual edits).
   * If a dirty panel is affected, prompt the user; otherwise silently reload.
   */
  private async _handleExternalCollectionChanges(_changedUris: vscode.Uri[]): Promise<void> {
    // Reload collections from disk
    const freshCollections = await this._storageService.loadCollections();

    // Check if any open dirty panel is affected
    if (this._panelManager) {
      // Collect all request IDs from the freshly loaded workspace collections
      const allRequestIds = new Set<string>();
      const collectIds = (items: any[]) => {
        for (const item of items) {
          if (item.type === 'folder' && item.children) {
            collectIds(item.children);
          } else if (item.id) {
            allRequestIds.add(item.id);
          }
        }
      };
      for (const col of freshCollections) {
        collectIds(col.items);
      }

      const dirtyPanels = this._panelManager.getDirtyPanelsForRequests(allRequestIds);

      if (dirtyPanels.length > 0) {
        const names = dirtyPanels.map(p => p.requestName || 'Untitled').join(', ');
        const choice = await vscode.window.showWarningMessage(
          `Collection files changed on disk. You have unsaved changes in: ${names}`,
          'Reload from Disk',
          'Keep Your Changes'
        );

        if (choice === 'Keep Your Changes') {
          // Still update sidebar with fresh data (non-dirty requests reflect disk changes)
          this._collections = freshCollections;
          this._notifyCollectionsUpdated();
          return;
        }
        // 'Reload from Disk' or dismissed — reload everything
      }
    }

    this._collections = freshCollections;
    this._notifyCollectionsUpdated();

    // Also notify all open panels with fresh collections
    if (this._panelManager) {
      for (const [, info] of this._panelManager.panels) {
        info.panel.webview.postMessage({
          type: 'collectionsLoaded',
          data: this._collections,
        });
      }
    }
  }

  public whenReady(): Promise<void> {
    return this._dataLoaded;
  }

  public setPanelManager(panelManager: RequestPanelManager): void {
    this._panelManager = panelManager;
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
        vscode.Uri.joinPath(this._extensionUri, 'webview-dist'),
      ],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      try {
        await this._handleMessage(message);
      } catch (error) {
        console.error('[HiveFetch] Error handling sidebar message:', message.type, error);
      }
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

      case 'newRequest':
        await vscode.commands.executeCommand('hivefetch.newRequest');
        break;

      case 'openCommandPalette':
        await vscode.commands.executeCommand('hivefetch.openCommandPalette');
        break;

      // ============================================
      // Recent Collection Operations
      // ============================================
      case 'clearRecent':
        await this._clearRecentCollection();
        break;

      // ============================================
      // Collection Operations (delegated to CollectionCrudHandler)
      // ============================================
      case 'openCollectionRequest':
        await this._openCollectionRequest(message.data.requestId, message.data.collectionId, message.data.newTab);
        break;

      case 'runCollectionRequest':
        await this._openCollectionRequest(message.data.requestId, message.data.collectionId);
        break;

      case 'createRequest':
        await this._crudHandler.createRequest(message.data.collectionId, message.data.parentFolderId, message.data.openInPanel, message.data.requestKind);
        break;

      case 'createRequestFromUrl':
        await this._crudHandler.createRequestFromUrl(message.data.url);
        break;

      case 'createFolder':
        await this._crudHandler.createCollection(message.data?.name);
        break;

      case 'renameCollection':
        await this._crudHandler.renameCollection(message.data.id, message.data.name);
        break;

      case 'deleteCollection':
        await this._crudHandler.deleteCollection(message.data.id);
        break;

      case 'duplicateCollection':
        await this._crudHandler.duplicateCollection(message.data.id);
        break;

      case 'saveCollections':
        this._collections = message.data || [];
        await this._storageService.saveCollections(this._collections);
        break;

      case 'closePanelsForRequests':
        if (message.data?.requestIds?.length > 0) {
          this._panelManager?.closePanelsByRequestIds(new Set(message.data.requestIds));
        }
        break;

      case 'showWarning':
        if (message.data?.message) {
          vscode.window.showWarningMessage(message.data.message);
        }
        break;

      case 'deleteRequest':
        await this._crudHandler.deleteRequest(message.data.requestId);
        break;

      case 'duplicateRequest':
        await this._crudHandler.duplicateRequest(message.data.requestId);
        break;

      case 'runAllInCollection':
        await this._runnerHandler.openCollectionRunner(message.data.collectionId);
        break;

      case 'runAllInFolder':
        await this._runnerHandler.openCollectionRunner(message.data.collectionId, message.data.folderId);
        break;

      case 'exportCollection':
        await vscode.commands.executeCommand('hivefetch.exportPostman', message.data.collectionId);
        break;

      case 'exportNative':
        await vscode.commands.executeCommand('hivefetch.exportNative', message.data.collectionId);
        break;

      case 'importNative':
        await vscode.commands.executeCommand('hivefetch.importNative');
        break;

      case 'duplicateFolder':
        await this._crudHandler.duplicateFolder(message.data.folderId, message.data.collectionId);
        break;

      case 'exportFolder':
        await this._crudHandler.exportFolder(message.data.folderId, message.data.collectionId);
        break;

      case 'deleteFolder':
        await this._crudHandler.deleteFolder(message.data.folderId, message.data.collectionId);
        break;

      // ============================================
      // Environment Operations (delegated to EnvironmentHandler)
      // ============================================
      case 'createEnvironment':
        await this._envHandler.createEnvironment(message.data?.name);
        break;

      case 'renameEnvironment':
        await this._envHandler.renameEnvironment(message.data.id, message.data.name);
        break;

      case 'deleteEnvironment':
        await this._envHandler.deleteEnvironment(message.data.id);
        break;

      case 'duplicateEnvironment':
        await this._envHandler.duplicateEnvironment(message.data.id);
        break;

      case 'setActiveEnvironment':
        await this._envHandler.setActiveEnvironment(message.data.id);
        break;

      case 'saveEnvironments':
        await this._envHandler.saveEnvironments(message.data);
        break;

      case 'linkEnvFile':
        await this._envHandler.linkEnvFile();
        break;

      case 'unlinkEnvFile':
        await this._envHandler.unlinkEnvFile();
        break;

      case 'exportEnvironment':
        await this._envHandler.exportEnvironment(message.data.id);
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

      // ============================================
      // Special Panels (delegated to SpecialPanelHandler)
      // ============================================
      case 'openCollectionSettings':
        await this._specialPanelHandler.openSettingsPanel('collection', message.data.collectionId);
        break;

      case 'openFolderSettings':
        await this._specialPanelHandler.openSettingsPanel('folder', message.data.collectionId, message.data.folderId);
        break;

      case 'openCollectionRunner':
        await this._runnerHandler.openCollectionRunner(message.data?.collectionId, message.data?.folderId);
        break;

      case 'openMockServer':
        await this._specialPanelHandler.openMockServerPanel();
        break;

      case 'benchmarkRequest':
        await this._specialPanelHandler.openBenchmarkPanel(message.data.requestId, message.data.collectionId);
        break;

      // ============================================
      // History Operations (sidebar history tab)
      // ============================================
      case 'getHistory': {
        const result = await this._historyService.search(message.data);
        this._view?.webview.postMessage({ type: 'historyLoaded', data: result });
        break;
      }

      case 'getHistoryEntry': {
        const entry = await this._historyService.getEntry(message.data.id);
        if (entry) {
          this._view?.webview.postMessage({ type: 'historyEntryLoaded', data: entry });
        }
        break;
      }

      case 'deleteHistoryEntry':
        await this.deleteHistoryEntryById(message.data.id);
        break;

      case 'clearHistory':
        await this.clearAllHistory();
        break;

      case 'openHistoryEntry': {
        const histEntry = await this._historyService.getEntry(message.data.id);
        if (histEntry && this._panelManager) {
          this._panelManager.openHistoryEntryAsPanel(histEntry);
        }
        break;
      }

      case 'saveHistoryToCollection':
        await this.saveHistoryEntryToCollection(message.data.historyId);
        break;

      case 'exportHistory':
        await vscode.commands.executeCommand('hivefetch.exportHistory');
        break;

      case 'importHistory':
        await vscode.commands.executeCommand('hivefetch.importHistory');
        break;

      case 'getHistoryStats': {
        const stats = await this._historyService.getStats(message.data?.days);
        this._view?.webview.postMessage({ type: 'historyStatsLoaded', data: stats });
        break;
      }

    }
  }

  public async saveHistoryEntryToCollection(historyId: string): Promise<void> {
    const entry = await this._historyService.getEntry(historyId);
    if (!entry) {
      vscode.window.showErrorMessage('History entry not found.');
      return;
    }

    // Build QuickPick items for user collections
    const userCollections = this._collections.filter((c: any) => !c.builtin);
    if (userCollections.length === 0) {
      const createNew = await vscode.window.showInformationMessage(
        'No collections found. Create one first?',
        'Create Collection'
      );
      if (createNew === 'Create Collection') {
        const name = await vscode.window.showInputBox({ prompt: 'Collection name', value: 'New Collection' });
        if (name) {
          await this._crudHandler.createEmptyCollection(name);
        }
      }
      return;
    }

    const picked = await vscode.window.showQuickPick(
      userCollections.map(c => ({ label: c.name, id: c.id })),
      { placeHolder: 'Select a collection to save to' }
    );
    if (!picked) return;

    const defaultName = entry.requestName || this._extractPathName(entry.url);
    const name = await vscode.window.showInputBox({
      prompt: 'Request name',
      value: defaultName,
    });
    if (name === undefined) return;

    const request: Omit<SavedRequest, 'id' | 'createdAt' | 'updatedAt'> = {
      type: 'request',
      name: name || defaultName,
      method: entry.method as any,
      url: entry.url,
      params: entry.params || [],
      headers: entry.headers || [],
      auth: entry.auth || { type: 'none' },
      body: entry.body || { type: 'none', content: '' },
    };

    await this._crudHandler.addRequest(picked.id, request);
    await this._historyService.updateEntryCollectionId(historyId, picked.id, name || defaultName);

    vscode.window.showInformationMessage(`Saved "${name || defaultName}" to ${picked.label}`);
    await this.broadcastHistoryUpdate();
  }

  private _extractPathName(url: string): string {
    try {
      const u = new URL(url);
      const segments = u.pathname.split('/').filter(Boolean);
      return segments.length > 0 ? segments[segments.length - 1] : u.hostname;
    } catch {
      return url.substring(0, 30);
    }
  }

  // ============================================
  // Data Sending
  // ============================================
  private async _sendInitialData(): Promise<void> {
    await this._loadInitialData();

    // One-time seed: migrate Recent collection entries into History
    if (this._historyService.getTotal() === 0) {
      const recent = this._collections.find((c: any) => c.builtin === 'recent');
      if (recent && recent.items && recent.items.length > 0) {
        const requests = recent.items.filter((i: any) => i.type !== 'folder');
        await this._historyService.seedFromRecent(requests).catch(err =>
          console.error('[HiveFetch] History seed failed:', err)
        );
      }
    }

    const historyResult = await this._historyService.search({ limit: 50 });
    this._view?.webview.postMessage({
      type: 'initialData',
      data: {
        collections: this._collections,
        environments: this._environments,
        envFileVariables: this._envFileService.getVariables(),
        envFilePath: this._envFileService.getFilePath(),
        history: historyResult,
      },
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
    this._panelManager?.broadcastEnvironments(this._environments);
  }

  public async broadcastHistoryUpdate(): Promise<void> {
    const result = await this._historyService.search({ limit: 50 });
    this._view?.webview.postMessage({ type: 'historyUpdated', data: result });
    // Broadcast to all open main panels so their history drawers update
    if (this._panelManager) {
      for (const [, info] of this._panelManager.panels) {
        info.panel.webview.postMessage({ type: 'historyUpdated', data: result });
      }
    }
  }

  public async logHistory(entry: any): Promise<void> {
    await this._historyService.append(entry);
    await this.broadcastHistoryUpdate();
  }

  // Public history API — used by RequestPanelManager for main panel drawer
  public async searchHistory(params?: any): Promise<any> {
    return this._historyService.search(params);
  }

  public async getHistoryEntry(id: string): Promise<any> {
    return this._historyService.getEntry(id);
  }

  public async deleteHistoryEntryById(id: string): Promise<void> {
    await this._historyService.deleteEntry(id);
    await this.broadcastHistoryUpdate();
  }

  public async clearAllHistory(): Promise<void> {
    await this._historyService.clear();
    await this.broadcastHistoryUpdate();
  }

  public async getHistoryStats(days?: number): Promise<any> {
    return this._historyService.getStats(days);
  }

  // ============================================
  // Recent Collection Operations
  // ============================================
  public async addToRecentCollection(
    requestData: {
      method: HttpMethod;
      url: string;
      params: KeyValue[];
      headers: KeyValue[];
      auth: AuthState;
      body: BodyState;
      connectionMode?: 'http' | 'websocket' | 'sse';
    },
    responseData: {
      status: number;
      duration: number;
      size: number;
    }
  ): Promise<void> {
    this._collections = RecentCollectionService.addToRecent(
      this._collections,
      requestData,
      responseData
    );
    await this._storageService.saveCollections(this._collections);
    this._notifyCollectionsUpdated();
  }

  public async removeFromRecentCollection(url: string, method: string): Promise<void> {
    this._collections = RecentCollectionService.removeFromRecent(this._collections, url, method);
    await this._storageService.saveCollections(this._collections);
    this._notifyCollectionsUpdated();
  }

  public async updateRequestResponse(
    requestId: string,
    collectionId: string,
    status: number,
    duration: number
  ): Promise<void> {
    const collection = this._collections.find(c => c.id === collectionId);
    if (!collection) return;

    collection.items = updateItemInTree<SavedRequest>(
      collection.items,
      requestId,
      (request) => ({
        ...request,
        lastResponseStatus: status,
        lastResponseDuration: duration,
        updatedAt: new Date().toISOString(),
      })
    );

    collection.updatedAt = new Date().toISOString();
    await this._storageService.saveCollections(this._collections);
    this._notifyCollectionsUpdated();
  }

  private async _clearRecentCollection(): Promise<void> {
    const confirmed = await confirmAction('Clear all recent requests?', 'Clear');
    if (!confirmed) return;

    this._collections = RecentCollectionService.clearRecent(this._collections);
    await this._storageService.saveCollections(this._collections);
    this._notifyCollectionsUpdated();
  }

  // ============================================
  // Collection Request Open (kept here — uses commands)
  // ============================================
  private async _openCollectionRequest(requestId: string, collectionId: string, newTab?: boolean): Promise<void> {
    const collection = this._collections.find(c => c.id === collectionId);
    if (!collection) return;

    const request = findRequestInCollection(collection, requestId);
    if (!request) return;

    const connectionMode = request.connectionMode
      || (request.url.startsWith('ws://') || request.url.startsWith('wss://') ? 'websocket' : undefined);
    await vscode.commands.executeCommand('hivefetch.openRequest', request, collectionId, connectionMode, newTab);
  }

  // ============================================
  // Public Methods for External Use
  // ============================================
  public getCollections(): Collection[] {
    return this._collections;
  }

  public getStorageService(): StorageService {
    return this._storageService;
  }

  public getEnvFileService(): EnvFileService {
    return this._envFileService;
  }

  public getHistoryService(): HistoryStorageService {
    return this._historyService;
  }

  public async _openMockServerPanel(): Promise<void> {
    return this._specialPanelHandler.openMockServerPanel();
  }

  public async _openBenchmarkPanel(requestId: string, collectionId?: string): Promise<void> {
    return this._specialPanelHandler.openBenchmarkPanel(requestId, collectionId);
  }

  public async stopMockServer(): Promise<void> {
    await this._mockServerService.stop();
  }

  public cancelBenchmark(): void {
    this._benchmarkService.cancel();
  }

  public async notifyCollectionsUpdated(): Promise<void> {
    this._collections = await this._storageService.loadCollections();
    this._notifyCollectionsUpdated();
  }

  public setDirtyRequestIds(ids: string[]): void {
    this._view?.webview.postMessage({
      type: 'dirtyRequestIds',
      data: ids,
    });
  }

  // Delegate to CrudHandler for public API
  public async createEmptyCollection(name: string): Promise<void> {
    return this._crudHandler.createEmptyCollection(name);
  }

  public async createRequestInCollection(collectionId: string, folderId?: string, requestKind: RequestKind = REQUEST_KIND.HTTP): Promise<{ request: SavedRequest; collectionId: string; connectionMode: string }> {
    return this._crudHandler.createRequestInCollection(collectionId, folderId, requestKind);
  }

  public async createCollectionAndAddRequest(name: string, requestKind: RequestKind = REQUEST_KIND.HTTP): Promise<{ collectionId: string; request: SavedRequest; connectionMode: string }> {
    return this._crudHandler.createCollectionAndAddRequest(name, requestKind);
  }

  public async addRequest(
    collectionId: string,
    request: Omit<SavedRequest, 'id' | 'createdAt' | 'updatedAt'>,
    parentFolderId?: string
  ): Promise<SavedRequest> {
    return this._crudHandler.addRequest(collectionId, request, parentFolderId);
  }

  public async createRequestFromUrl(url: string): Promise<void> {
    return this._crudHandler.createRequestFromUrl(url);
  }

  public dispose(): void {
    this._envFileService.dispose();
    this._fetchmanWatcher?.dispose();
    this._mockServerService.stop().catch((err) => {
      console.error('[HiveFetch] Error stopping mock server on dispose:', err);
    });
  }

  // ============================================
  // HTML Generator (sidebar only — settings/mock/benchmark moved to SpecialPanelHandler)
  // ============================================
  private _getHtmlForWebview(webview: vscode.Webview): string {
    const distPath = vscode.Uri.joinPath(this._extensionUri, 'webview-dist');

    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'sidebar.js'));
    const themeUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'theme.css'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'sidebar.css'));
    const kvEditorUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'KeyValueEditor.css'));
    const tooltipUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'Tooltip.css'));
    const methodBadgeUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'MethodBadge.css'));

    const nonce = this._getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src ${webview.cspSource}; font-src ${webview.cspSource};">
  <link href="${themeUri}" rel="stylesheet">
  <link href="${styleUri}" rel="stylesheet">
  <link href="${kvEditorUri}" rel="stylesheet">
  <link href="${tooltipUri}" rel="stylesheet">
  <link href="${methodBadgeUri}" rel="stylesheet">
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
    return require('crypto').randomBytes(24).toString('base64url');
  }
}
