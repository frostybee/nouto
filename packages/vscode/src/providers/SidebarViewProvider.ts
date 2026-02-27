import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { StorageService } from '../services/StorageService';
import { EnvFileService } from '../services/EnvFileService';
import {
  CollectionRunnerService, BenchmarkService, MockServerService,
  MockStorageService, RecentCollectionService,
} from '@hivefetch/core/services';
import type { Collection, SavedRequest, EnvironmentsData, RequestKind, HttpMethod, KeyValue, AuthState, BodyState } from '../services/types';
import { REQUEST_KIND } from '../services/types';
import { confirmAction } from './confirmAction';
import type { RequestPanelManager } from './RequestPanelManager';

// Extracted modules
import {
  generateId, findRequestInCollection,
  findRequestAcrossCollections, updateItemInTree,
  findFolderRecursive,
} from './sidebar/CollectionTreeOps';
import { CollectionCrudHandler, type ISidebarContext } from './sidebar/CollectionCrudHandler';
import { RunnerPanelHandler, type IRunnerContext } from './sidebar/RunnerPanelHandler';

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
  private _collections: Collection[] = [];
  private _environments: EnvironmentsData = { environments: [], activeId: null };
  private _dataLoaded: Promise<void>;
  private _panelManager?: RequestPanelManager;

  // Extracted handlers
  private _crudHandler: CollectionCrudHandler;
  private _runnerHandler: RunnerPanelHandler;

  constructor(private readonly _extensionUri: vscode.Uri, private readonly _globalStorageDir?: string) {
    this._storageService = new StorageService(vscode.workspace.workspaceFolders?.[0], _globalStorageDir);
    this._envFileService = new EnvFileService();
    this._runnerService = new CollectionRunnerService();
    this._benchmarkService = new BenchmarkService();
    this._mockServerService = new MockServerService();
    this._mockStorageService = new MockStorageService(this._storageService.getStorageDir());

    // Wire up extracted handlers
    const sidebarCtx: ISidebarContext = {
      get collections() { return self._collections; },
      storageService: this._storageService,
      get panelManager() { return self._panelManager; },
      extensionUri: this._extensionUri,
      notifyCollectionsUpdated: () => this._notifyCollectionsUpdated(),
    };
    const self = this;
    this._crudHandler = new CollectionCrudHandler(sidebarCtx);

    const runnerCtx: IRunnerContext = {
      get collections() { return self._collections; },
      storageService: this._storageService,
      extensionUri: this._extensionUri,
      getNonce: () => this._getNonce(),
    };
    this._runnerHandler = new RunnerPanelHandler(runnerCtx, this._runnerService);

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

      case 'exportEnvironment':
        await this._exportEnvironment(message.data.id);
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

      case 'openCollectionSettings':
        await this._openSettingsPanel('collection', message.data.collectionId);
        break;

      case 'openFolderSettings':
        await this._openSettingsPanel('folder', message.data.collectionId, message.data.folderId);
        break;

      // ============================================
      // Collection Runner Operations (delegated to RunnerPanelHandler)
      // ============================================
      case 'openCollectionRunner':
        await this._runnerHandler.openCollectionRunner(message.data?.collectionId, message.data?.folderId);
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
  // Data Sending
  // ============================================
  private async _sendInitialData(): Promise<void> {
    await this._loadInitialData();
    this._view?.webview.postMessage({
      type: 'initialData',
      data: {
        collections: this._collections,
        environments: this._environments,
        envFileVariables: this._envFileService.getVariables(),
        envFilePath: this._envFileService.getFilePath(),
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
  // Collection/Folder Settings Panel
  // ============================================
  private async _openSettingsPanel(entityType: 'collection' | 'folder', collectionId: string, folderId?: string): Promise<void> {
    const collection = this._collections.find(c => c.id === collectionId);
    if (!collection) return;

    let entityName: string;
    let initialAuth: any;
    let initialHeaders: any;
    let initialVariables: any;
    let initialScripts: any;
    let initialNotes: string;

    if (entityType === 'folder' && folderId) {
      const folder = findFolderRecursive(collection.items, folderId);
      if (!folder) return;
      entityName = folder.name;
      initialAuth = folder.auth;
      initialHeaders = folder.headers;
      initialVariables = folder.variables;
      initialScripts = folder.scripts;
      initialNotes = folder.description ?? '';
    } else {
      entityName = collection.name;
      initialAuth = collection.auth;
      initialHeaders = collection.headers;
      initialVariables = collection.variables;
      initialScripts = collection.scripts;
      initialNotes = collection.description ?? '';
    }

    const panel = vscode.window.createWebviewPanel(
      'hivefetch.settings',
      `Settings: ${entityName}`,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this._extensionUri, 'webview-dist'),
        ],
      }
    );

    panel.webview.html = this._getSettingsHtml(panel.webview);

    const settingsMsgDisposable = panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready':
          panel.webview.postMessage({
            type: 'initSettings',
            data: {
              entityType,
              entityName,
              collectionId,
              folderId,
              initialAuth,
              initialHeaders,
              initialVariables,
              initialScripts,
              initialNotes,
            },
          });
          break;

        case 'saveCollectionSettings': {
          const col = this._collections.find(c => c.id === message.data.collectionId);
          if (!col) break;
          col.auth = message.data.auth;
          col.headers = message.data.headers;
          col.variables = message.data.variables;
          col.scripts = message.data.scripts;
          col.description = message.data.notes ?? '';
          col.updatedAt = new Date().toISOString();
          await this._storageService.saveCollections(this._collections);
          this._notifyCollectionsUpdated();
          panel.dispose();
          break;
        }

        case 'saveFolderSettings': {
          const col = this._collections.find(c => c.id === message.data.collectionId);
          if (!col) break;
          const folder = findFolderRecursive(col.items, message.data.folderId);
          if (!folder) break;
          folder.auth = message.data.auth;
          folder.headers = message.data.headers;
          folder.variables = message.data.variables;
          folder.scripts = message.data.scripts;
          folder.description = message.data.notes ?? '';
          col.updatedAt = new Date().toISOString();
          await this._storageService.saveCollections(this._collections);
          this._notifyCollectionsUpdated();
          panel.dispose();
          break;
        }

        case 'closeSettingsPanel':
          panel.dispose();
          break;
      }
    });

    panel.onDidDispose(() => settingsMsgDisposable.dispose());
  }

  private _getSettingsHtml(webview: vscode.Webview): string {
    const distPath = vscode.Uri.joinPath(this._extensionUri, 'webview-dist');

    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'settings.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'settings.css'));
    const themeUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'theme.css'));
    const kvEditorUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'KeyValueEditor.css'));
    const scriptEditorUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'ScriptEditor.css'));
    const notesEditorUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'NotesEditor.css'));
    const tooltipUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'Tooltip.css'));

    const nonce = this._getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src ${webview.cspSource} https: http:; font-src ${webview.cspSource};">
  <link href="${themeUri}" rel="stylesheet">
  <link href="${styleUri}" rel="stylesheet">
  <link href="${kvEditorUri}" rel="stylesheet">
  <link href="${scriptEditorUri}" rel="stylesheet">
  <link href="${notesEditorUri}" rel="stylesheet">
  <link href="${tooltipUri}" rel="stylesheet">
  <title>Settings</title>
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
      id: generateId(),
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

    const confirmed = await confirmAction(`Delete environment "${env.name}"?`, 'Delete');
    if (!confirmed) return;

    this._environments.environments = this._environments.environments.filter(e => e.id !== id);
    if (this._environments.activeId === id) {
      this._environments.activeId = null;
    }
    await this._storageService.saveEnvironments(this._environments);
    this._notifyEnvironmentsUpdated();
  }

  private async _duplicateEnvironment(id: string): Promise<void> {
    const env = this._environments.environments.find(e => e.id === id);
    if (!env) return;

    this._environments.environments.push({
      id: generateId(),
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

    this._environments.envFilePath = filePath;
    await this._storageService.saveEnvironments(this._environments);

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

    this._environments.envFilePath = null;
    await this._storageService.saveEnvironments(this._environments);

    this._view?.webview.postMessage({
      type: 'envFileVariablesUpdated',
      data: {
        variables: [],
        filePath: null,
      },
    });
  }

  private async _exportEnvironment(id: string): Promise<void> {
    let name: string;
    let variables: { key: string; value: string; enabled: boolean }[];

    if (id === '__global__') {
      name = 'Global Variables';
      variables = (this._environments.globalVariables || []).map(v => ({ key: v.key, value: v.value, enabled: v.enabled }));
    } else {
      const env = this._environments.environments.find(e => e.id === id);
      if (!env) {
        vscode.window.showErrorMessage('Environment not found');
        return;
      }
      name = env.name;
      variables = env.variables.map(v => ({ key: v.key, value: v.value, enabled: v.enabled }));
    }

    const exportData = {
      name,
      variables,
      exportedAt: new Date().toISOString(),
      _type: 'hivefetch-environment',
    };

    const safeName = name.replace(/[^a-zA-Z0-9]/g, '_');
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(safeName + '.env.json'),
      filters: { 'JSON Files': ['json'] },
      title: `Export Environment: ${name}`,
    });

    if (uri) {
      await fs.writeFile(uri.fsPath, JSON.stringify(exportData, null, 2), 'utf8');
      vscode.window.showInformationMessage(`Environment "${name}" exported successfully.`);
    }
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
          vscode.Uri.joinPath(this._extensionUri, 'webview-dist'),
        ],
      }
    );

    panel.webview.html = this._getMockHtml(panel.webview);

    this._mockServerService.setStatusChangeHandler((status) => {
      panel.webview.postMessage({ type: 'mockStatusChanged', data: { status } });
    });

    this._mockServerService.setLogHandler((log) => {
      panel.webview.postMessage({ type: 'mockLogAdded', data: log });
    });

    const mockMsgDisposable = panel.webview.onDidReceiveMessage(async (message) => {
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
      mockMsgDisposable.dispose();
      this._mockServerService.setStatusChangeHandler(undefined as any);
      this._mockServerService.setLogHandler(undefined as any);
    });
  }

  // ============================================
  // Benchmark Panel
  // ============================================
  public async _openBenchmarkPanel(requestId: string, collectionId?: string): Promise<void> {
    const found = findRequestAcrossCollections(this._collections, requestId);
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
          vscode.Uri.joinPath(this._extensionUri, 'webview-dist'),
        ],
      }
    );

    panel.webview.html = this._getBenchmarkHtml(panel.webview);

    const benchMsgDisposable = panel.webview.onDidReceiveMessage(async (message) => {
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
          vscode.window.showInformationMessage(`Benchmark export (${format}) — use the iteration data shown in the panel.`);
          break;
        }
      }
    });

    panel.onDidDispose(() => {
      benchMsgDisposable.dispose();
      this._benchmarkService.cancel();
    });
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
    this._mockServerService.stop().catch((err) => {
      console.error('[HiveFetch] Error stopping mock server on dispose:', err);
    });
  }

  // ============================================
  // HTML Generators
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

  private _getMockHtml(webview: vscode.Webview): string {
    const distPath = vscode.Uri.joinPath(this._extensionUri, 'webview-dist');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'mock.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'mock.css'));
    const themeUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'theme.css'));
    const nonce = this._getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src ${webview.cspSource} https: http:; font-src ${webview.cspSource};">
  <link href="${themeUri}" rel="stylesheet">
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
    const distPath = vscode.Uri.joinPath(this._extensionUri, 'webview-dist');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'benchmark.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'benchmark.css'));
    const themeUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'theme.css'));
    const nonce = this._getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src ${webview.cspSource} https: http:; font-src ${webview.cspSource};">
  <link href="${themeUri}" rel="stylesheet">
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

  // ============================================
  // Utility Methods
  // ============================================
  private _getNonce(): string {
    return require('crypto').randomBytes(24).toString('base64url');
  }
}
