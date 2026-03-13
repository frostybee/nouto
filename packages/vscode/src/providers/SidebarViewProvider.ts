import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { StorageService } from '../services/StorageService';
import { EnvFileService } from '../services/EnvFileService';
import {
  CollectionRunnerService, BenchmarkService, MockServerService,
  MockStorageService, DraftsCollectionService, CookieJarService,
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
import { extractPathname } from '@hivefetch/core';
import { CollectionCrudHandler, type ISidebarContext } from './sidebar/CollectionCrudHandler';
import { RunnerPanelHandler, type IRunnerContext } from './sidebar/RunnerPanelHandler';
import { EnvironmentHandler, type IEnvironmentContext } from './sidebar/EnvironmentHandler';
import { SpecialPanelHandler, type ISpecialPanelContext } from './sidebar/SpecialPanelHandler';
import { EnvironmentsPanelHandler, type IEnvironmentsPanelContext, type ICookieJarHandler } from './sidebar/EnvironmentsPanelHandler';
import { GlobalSettingsPanelHandler, type IGlobalSettingsPanelContext } from './sidebar/GlobalSettingsPanelHandler';
import { UIService } from '../services/UIService';

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
  private _workspaceWatcher: FetchmanWatcher | null = null;

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
  private _envPanelHandler: EnvironmentsPanelHandler;
  private _envPanelCtx!: IEnvironmentsPanelContext;
  private _globalSettingsHandler: GlobalSettingsPanelHandler;
  private _cookieJarService: CookieJarService;
  private _uiService?: UIService;

  /** UIService for sending platform-agnostic UI interactions through the sidebar webview. */
  get uiService(): UIService | undefined { return this._uiService; }

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
      get uiService() { return self._uiService; },
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
      get uiService() { return self._uiService; },
    };
    this._envHandler = new EnvironmentHandler(envCtx);

    const specialCtx: ISpecialPanelContext = {
      get collections() { return self._collections; },
      storageService: this._storageService,
      extensionUri: this._extensionUri,
      getNonce: () => self._getNonce(),
      notifyCollectionsUpdated: () => self._notifyCollectionsUpdated(),
      get uiService() { return self._uiService; },
    };
    this._specialPanelHandler = new SpecialPanelHandler(specialCtx, this._benchmarkService, this._mockServerService, this._mockStorageService);

    this._cookieJarService = new CookieJarService(this._storageService.getStorageDir());

    this._envPanelCtx = {
      get environments() { return self._environments; },
      storageService: this._storageService,
      envFileService: this._envFileService,
      extensionUri: this._extensionUri,
      getNonce: () => self._getNonce(),
      notifyEnvironmentsUpdated: () => self._notifyEnvironmentsUpdated(),
      setEnvironments: (data) => { self._environments = data; },
      hydrateSecrets: (data) => self._panelManager ? self._panelManager.hydrateSecrets(data) : Promise.resolve(),
      persistSecrets: (data) => self._panelManager ? self._panelManager.persistSecrets(data) : Promise.resolve(),
    };
    this._envPanelHandler = new EnvironmentsPanelHandler(this._envPanelCtx);

    const globalSettingsCtx: IGlobalSettingsPanelContext = {
      extensionUri: this._extensionUri,
      get extensionContext() { return self._panelManager!.extensionContext; },
      getNonce: () => self._getNonce(),
      onSettingsUpdated: () => self._panelManager?.broadcastSettings(),
      getStorageMode: () => self._storageService.getStorageMode(),
      hasWorkspace: () => self._storageService.hasWorkspace(),
      switchStorageMode: (mode) => self._storageService.switchStorageMode(mode),
      notifyCollectionsUpdated: () => self._notifyCollectionsUpdated(),
      openEnvironmentsPanel: (tab) => self._openEnvironmentsPanel(tab),
    };
    this._globalSettingsHandler = new GlobalSettingsPanelHandler(globalSettingsCtx);

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

    // Set up workspace collection file watcher when in workspace storage mode
    const workspaceRoot = this._storageService.getWorkspaceRoot();
    if (this._storageService.getStorageMode() === 'workspace' && workspaceRoot) {
      this._workspaceWatcher = new FetchmanWatcher(workspaceRoot);
      this._workspaceWatcher.onDidChange((uris) => this._handleExternalCollectionChanges(uris));
      this._workspaceWatcher.start();
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
   * Handle external changes to .hivefetch/ files (git pull, manual edits).
   * Dirty panels get an in-webview conflict banner; clean panels silently reload.
   */
  private async _handleExternalCollectionChanges(_changedUris: vscode.Uri[]): Promise<void> {
    const freshCollections = await this._storageService.loadCollections();

    // Build a map of requestId → fresh SavedRequest for quick lookup
    const freshRequestMap = new Map<string, any>();
    const collectRequests = (items: any[]) => {
      for (const item of items) {
        if (item.type === 'folder' && item.children) {
          collectRequests(item.children);
        } else if (item.id) {
          freshRequestMap.set(item.id, item);
        }
      }
    };
    for (const col of freshCollections) {
      collectRequests(col.items);
    }

    // Notify each open panel individually
    if (this._panelManager) {
      for (const [, info] of this._panelManager.panels) {
        if (!info.requestId) continue;

        const freshRequest = freshRequestMap.get(info.requestId);
        if (!freshRequest) continue;

        if (info.isDirty) {
          // Dirty panel: show in-webview conflict banner instead of VS Code popup
          info.panel.webview.postMessage({
            type: 'externalFileChanged',
            data: { requestId: info.requestId, updatedRequest: freshRequest },
          });
        } else {
          // Clean panel: silently reload with fresh data
          info.panel.webview.postMessage({
            type: 'loadRequest',
            data: {
              ...freshRequest,
              _panelId: info.requestId,
              _requestId: info.requestId,
              _collectionId: info.collectionId,
              _collectionName: info.collectionName,
            },
          });
        }
      }
    }

    this._collections = freshCollections;
    this._notifyCollectionsUpdated();
  }

  public whenReady(): Promise<void> {
    return this._dataLoaded;
  }

  public setPanelManager(panelManager: RequestPanelManager): void {
    this._panelManager = panelManager;
  }

  /** Save collections with watcher suppression to prevent self-triggered reloads. */
  private async _suppressedSave(): Promise<void> {
    const save = async () => { await this._storageService.saveCollections(this._collections); };
    if (this._workspaceWatcher) {
      await this._workspaceWatcher.suppressChanges(save);
    } else {
      await save();
    }
  }

  /** Save arbitrary collections with watcher suppression (used by panel save handlers). */
  public async suppressedSaveCollections(collections: any[]): Promise<void> {
    const save = async () => { await this._storageService.saveCollections(collections); };
    if (this._workspaceWatcher) {
      await this._workspaceWatcher.suppressChanges(save);
    } else {
      await save();
    }
  }

  /** Open the global settings panel in a dedicated tab. */
  public async openGlobalSettings(): Promise<void> {
    await this._globalSettingsHandler.open();
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

    // Create UIService targeting the sidebar webview
    this._uiService = new UIService((msg) => webviewView.webview.postMessage(msg));

    webviewView.webview.onDidReceiveMessage(async (message) => {
      try {
        // Route UI interaction responses before main handler
        if (this._uiService?.handleResponseMessage(message)) return;
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
        await vscode.commands.executeCommand('hivefetch.newRequest', message.data?.requestKind);
        break;

      case 'openSettings': {
        await this._globalSettingsHandler.open();
        break;
      }

      case 'openCommandPalette':
        await vscode.commands.executeCommand('hivefetch.openCommandPalette');
        break;

      // ============================================
      // Drafts Collection Operations
      // ============================================
      case 'clearDrafts':
        await this._clearDraftsCollection();
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
        await vscode.commands.executeCommand('hivefetch.createRequestFromUrl', message.data.url);
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
        await this._suppressedSave();
        break;

      case 'closePanelsForRequests':
        if (message.data?.requestIds?.length > 0) {
          this._panelManager?.closePanelsByRequestIds(new Set(message.data.requestIds));
        }
        break;

      case 'showWarning':
        if (message.data?.message) {
          this._uiService?.showWarning(message.data.message);
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

      case 'exportAllPostman':
        await vscode.commands.executeCommand('hivefetch.bulkExport', message.data?.collectionIds);
        break;

      case 'exportAllNative':
        await vscode.commands.executeCommand('hivefetch.bulkExportNative', message.data?.collectionIds);
        break;

      case 'deleteFolder':
        await this._crudHandler.deleteFolder(message.data.folderId, message.data.collectionId);
        break;

      case 'bulkDelete':
        await this._crudHandler.bulkDelete(message.data.itemIds, message.data.collectionId);
        break;

      case 'bulkMovePickTarget':
        await this._crudHandler.bulkMovePickTarget(message.data.itemIds, message.data.sourceCollectionId);
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

      case 'exportAllEnvironments':
        await this._envHandler.exportAllEnvironments();
        break;

      // ============================================
      // Import/Export Operations
      // ============================================
      case 'importAuto':
        await vscode.commands.executeCommand('hivefetch.importAuto');
        break;

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

      case 'openEnvironmentsPanel':
        await this._envPanelHandler.open(message.data?.tab);
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
      this._uiService?.showError('History entry not found.');
      return;
    }

    // Build QuickPick items for user collections
    const userCollections = this._collections.filter((c: any) => !c.builtin);
    if (userCollections.length === 0) {
      const create = await vscode.window.showInformationMessage(
        'No collections found. Create one first?',
        'Create Collection'
      );
      if (create) {
        const name = await vscode.window.showInputBox({ prompt: 'Collection name', value: 'New Collection' });
        if (name) {
          await this._crudHandler.createEmptyCollection(name);
        }
      }
      return;
    }

    const collectionItems = userCollections.map(c => ({ label: c.name, id: c.id }));
    const picked = await vscode.window.showQuickPick(collectionItems, {
      placeHolder: 'Select a collection to save to',
    });
    if (!picked) return;
    const pickedId = picked.id;
    const pickedLabel = picked.label;
    if (!pickedId) return;

    const defaultName = entry.requestName || this._extractPathName(entry.url);
    const name = await vscode.window.showInputBox({ prompt: 'Request name', value: defaultName });
    if (name === undefined || name === null) return;

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

    await this._crudHandler.addRequest(pickedId, request);
    await this._historyService.updateEntryCollectionId(historyId, pickedId, name || defaultName);

    this._uiService?.showInfo(`Saved "${name || defaultName}" to ${pickedLabel}`);
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

    // One-time seed: migrate Drafts collection entries into History
    if (this._historyService.getTotal() === 0) {
      const drafts = this._collections.find((c: any) => c.builtin === 'drafts');
      if (drafts && drafts.items && drafts.items.length > 0) {
        const requests = drafts.items.filter((i: any) => i.type !== 'folder');
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
    this._panelManager?.broadcastCollections(this._collections);
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
    // Drawer is disabled - no per-panel broadcasts needed
  }

  public async logHistory(entry: any): Promise<void> {
    await this._historyService.append(entry);
    await this.broadcastHistoryUpdate();
  }

  // Public history API - used by RequestPanelManager for main panel drawer
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
  // Drafts Collection Operations
  // ============================================
  public async addToDraftsCollection(
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
    this._collections = DraftsCollectionService.addToDrafts(
      this._collections,
      requestData,
      responseData
    );
    await this._suppressedSave();
    this._notifyCollectionsUpdated();
  }

  public async removeFromDraftsCollection(url: string, method: string): Promise<void> {
    this._collections = DraftsCollectionService.removeFromDrafts(this._collections, url, method);
    await this._suppressedSave();
    this._notifyCollectionsUpdated();
  }

  public async updateRequestResponse(
    requestId: string,
    collectionId: string,
    status: number,
    duration: number,
    sentUrl?: string,
    sentMethod?: string
  ): Promise<void> {
    const collection = this._collections.find(c => c.id === collectionId);
    if (!collection) return;

    const DEFAULT_NAMES = new Set(['New Request', 'New GraphQL Request', 'New WebSocket', 'New SSE Connection']);

    collection.items = updateItemInTree<SavedRequest>(
      collection.items,
      requestId,
      (request) => {
        const updates: Partial<SavedRequest> = {
          lastResponseStatus: status,
          lastResponseDuration: duration,
          updatedAt: new Date().toISOString(),
        };
        if (sentUrl && sentUrl !== request.url) {
          updates.url = sentUrl;
        }
        if (sentMethod && sentMethod !== request.method) {
          updates.method = sentMethod as HttpMethod;
        }
        const effectiveUrl = updates.url ?? request.url;
        const effectiveMethod = updates.method ?? request.method;
        if ((updates.url || updates.method) && DEFAULT_NAMES.has(request.name) && effectiveUrl) {
          const pathname = extractPathname(effectiveUrl);
          updates.name = `${effectiveMethod} ${pathname}`;
        }
        return { ...request, ...updates };
      }
    );

    collection.updatedAt = new Date().toISOString();
    await this._suppressedSave();
    this._notifyCollectionsUpdated();
  }

  private async _clearDraftsCollection(): Promise<void> {
    const confirmed = await confirmAction('Clear all draft requests?', 'Clear');
    if (!confirmed) return;

    this._collections = DraftsCollectionService.clearDrafts(this._collections);
    await this._suppressedSave();
    this._notifyCollectionsUpdated();
  }

  // ============================================
  // Collection Request Open (kept here - uses commands)
  // ============================================
  private async _openCollectionRequest(requestId: string, collectionId: string, newTab?: boolean): Promise<void> {
    const collection = this._collections.find(c => c.id === collectionId);
    if (!collection) return;

    const request = findRequestInCollection(collection, requestId);
    if (!request) return;

    await vscode.commands.executeCommand('hivefetch.openRequest', request, collectionId, request.connectionMode, newTab);
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

  public getEnvironments(): EnvironmentsData {
    return this._environments;
  }

  public updateEnvironments(data: EnvironmentsData): void {
    this._environments = data;
    this._notifyEnvironmentsUpdated();
  }

  public getEnvFileService(): EnvFileService {
    return this._envFileService;
  }

  public getHistoryService(): HistoryStorageService {
    return this._historyService;
  }

  public async _openEnvironmentsPanel(tab?: string): Promise<void> {
    return this._envPanelHandler.open(tab);
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
    this._restartWorkspaceWatcher();
    this._collections = await this._storageService.loadCollections();
    this._notifyCollectionsUpdated();
  }

  /**
   * Restart the workspace file watcher to match the current storage mode.
   * Must be called after every storage mode switch.
   */
  private _restartWorkspaceWatcher(): void {
    this._workspaceWatcher?.dispose();
    this._workspaceWatcher = null;

    const workspaceRoot = this._storageService.getWorkspaceRoot();
    if (this._storageService.getStorageMode() === 'workspace' && workspaceRoot) {
      this._workspaceWatcher = new FetchmanWatcher(workspaceRoot);
      this._workspaceWatcher.onDidChange((uris) => this._handleExternalCollectionChanges(uris));
      this._workspaceWatcher.start();
    }
  }

  public triggerDuplicateSelected(): void {
    this._view?.webview.postMessage({ type: 'triggerDuplicateSelected' });
  }

  public setDirtyRequestIds(ids: string[]): void {
    this._view?.webview.postMessage({
      type: 'dirtyRequestIds',
      data: ids,
    });
  }

  public revealActiveRequest(requestId?: string): void {
    this._view?.webview.postMessage({ type: 'revealActiveRequest', data: { requestId } });
  }

  public setCookieJarHandler(handler: ICookieJarHandler): void {
    this._envPanelCtx.cookieJarHandler = handler;
  }

  // Delegate to CrudHandler for public API
  public async createEmptyCollection(name: string): Promise<void> {
    return this._crudHandler.createEmptyCollection(name);
  }

  public async createRequestInCollection(collectionId: string, folderId?: string, requestKind: RequestKind = REQUEST_KIND.HTTP, options?: { initialUrl?: string }): Promise<{ request: SavedRequest; collectionId: string; connectionMode: string }> {
    return this._crudHandler.createRequestInCollection(collectionId, folderId, requestKind, options);
  }

  public async createCollectionAndAddRequest(name: string, requestKind: RequestKind = REQUEST_KIND.HTTP, color?: string, icon?: string, options?: { initialUrl?: string }): Promise<{ collectionId: string; request: SavedRequest; connectionMode: string }> {
    return this._crudHandler.createCollectionAndAddRequest(name, requestKind, color, icon, options);
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
    this._workspaceWatcher?.dispose();
    this._mockServerService.stop().catch((err) => {
      console.error('[HiveFetch] Error stopping mock server on dispose:', err);
    });
  }

  // ============================================
  // HTML Generator (sidebar only - settings/mock/benchmark moved to SpecialPanelHandler)
  // ============================================
  private _getHtmlForWebview(webview: vscode.Webview): string {
    const distPath = vscode.Uri.joinPath(this._extensionUri, 'webview-dist');

    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'sidebar.js'));
    const themeUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'theme.css'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'style.css'));

    const nonce = this._getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src ${webview.cspSource}; font-src ${webview.cspSource};">
  <link href="${themeUri}" rel="stylesheet">
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
    return require('crypto').randomBytes(24).toString('base64url');
  }
}
