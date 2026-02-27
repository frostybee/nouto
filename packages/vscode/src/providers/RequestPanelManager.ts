import * as vscode from 'vscode';
import { SidebarViewProvider } from './SidebarViewProvider';
import { StorageService } from '../services/StorageService';
import { DraftService } from '../services/DraftService';
import { FileService } from '../services/FileService';
import { SecretStorageService } from '../services/SecretStorageService';
import {
  OAuthService, ScriptEngine, GraphQLSchemaService, WebSocketService, SSEService,
  AwsSignatureService, CookieJarService,
} from '@hivefetch/core/services';
import type { SavedRequest, EnvironmentsData, RequestKind } from '../services/types';
import { isRequest, isFolder, getDefaultsForRequestKind, REQUEST_KIND } from '../services/types';

// Extracted modules
import type { PanelInfo } from './panel/PanelTypes';
import { RequestBodyBuilder } from './panel/RequestBodyBuilder';
import { RequestAuthHandler } from './panel/RequestAuthHandler';
import { ScriptRunner } from './panel/ScriptRunner';
import { RequestExecutor } from './panel/RequestExecutor';

export type { PanelInfo } from './panel/PanelTypes';
export type { OpenPanelOptions } from './panel/PanelTypes';

export class RequestPanelManager {
  private static instance: RequestPanelManager | null = null;

  public readonly panels: Map<string, PanelInfo> = new Map();
  private currentPanelId: string | null = null;
  private storageService: StorageService;
  private draftService: DraftService;
  private oauthService: OAuthService;
  private fileService: FileService;
  private scriptEngine: ScriptEngine;
  private graphqlSchemaService: GraphQLSchemaService;
  private awsSignatureService: AwsSignatureService;
  private cookieJarService: CookieJarService;
  private secretStorageService: SecretStorageService;

  // Extracted handlers
  private bodyBuilder: RequestBodyBuilder;
  private authHandler: RequestAuthHandler;
  private scriptRunner: ScriptRunner;
  private requestExecutor: RequestExecutor;

  private constructor(
    private readonly context: vscode.ExtensionContext,
    public readonly sidebarProvider: SidebarViewProvider
  ) {
    this.storageService = new StorageService(vscode.workspace.workspaceFolders?.[0], context.globalStorageUri.fsPath);
    this.draftService = new DraftService(this.storageService.getStorageDir());
    this.oauthService = new OAuthService();
    this.fileService = new FileService();
    this.scriptEngine = new ScriptEngine();
    this.graphqlSchemaService = new GraphQLSchemaService();
    this.awsSignatureService = new AwsSignatureService();
    this.cookieJarService = new CookieJarService(this.storageService.getStorageDir());
    this.secretStorageService = new SecretStorageService(context);

    // Wire up extracted modules
    this.bodyBuilder = new RequestBodyBuilder(this.fileService);
    this.authHandler = new RequestAuthHandler(this.oauthService, this.awsSignatureService);
    this.scriptRunner = new ScriptRunner(
      this.scriptEngine, this.storageService, this.secretStorageService,
      () => this.sidebarProvider.getCollections(),
      (id) => this.panels.has(id)
    );
    this.requestExecutor = new RequestExecutor(this, this.bodyBuilder, this.authHandler, this.scriptRunner, this.cookieJarService);
  }

  public static getInstance(
    context: vscode.ExtensionContext,
    sidebarProvider: SidebarViewProvider
  ): RequestPanelManager {
    if (!RequestPanelManager.instance) {
      RequestPanelManager.instance = new RequestPanelManager(context, sidebarProvider);
    }
    return RequestPanelManager.instance;
  }

  public static getExistingInstance(): RequestPanelManager | null {
    return RequestPanelManager.instance;
  }

  // --- IPanelContext implementation ---

  public generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  public getCollectionName(collectionId: string): string {
    const collections = this.sidebarProvider.getCollections();
    const collection = collections.find((c: any) => c.id === collectionId);
    return collection?.name || '';
  }

  public isWebviewAlive(panelId: string): boolean {
    return this.panels.has(panelId);
  }

  // --- Public API ---

  public getActivePanel(): { panel: vscode.WebviewPanel; requestId: string | null } | null {
    if (!this.currentPanelId) return null;
    const panelInfo = this.panels.get(this.currentPanelId);
    if (!panelInfo) return null;
    return { panel: panelInfo.panel, requestId: panelInfo.requestId };
  }

  public broadcastEnvironments(data: EnvironmentsData): void {
    for (const [, info] of this.panels) {
      info.panel.webview.postMessage({ type: 'loadEnvironments', data });
    }
  }

  public openNewRequest(options?: import('./panel/PanelTypes').OpenPanelOptions & { requestKind?: RequestKind; initialUrl?: string }): void {
    const kind = options?.requestKind || REQUEST_KIND.HTTP;
    const defaults = getDefaultsForRequestKind(kind);
    const request = this.getDefaultRequest(kind, options?.initialUrl);
    const { panelId, panel } = this.createPanel(`* ${defaults.name}`, options);

    this.panels.set(panelId, {
      panel,
      requestId: null,
      collectionId: null,
      abortController: null,
      connectionMode: defaults.connectionMode,
    });

    this.setupMessageHandler(panelId, request);
  }

  public openSavedRequest(request: SavedRequest, collectionId: string, options?: import('./panel/PanelTypes').OpenPanelOptions & { connectionMode?: string }): void {
    const existingPanelId = this.findPanelByRequestId(request.id);
    if (existingPanelId) {
      const panelInfo = this.panels.get(existingPanelId);
      if (panelInfo) {
        panelInfo.collectionId = collectionId;
        panelInfo.collectionName = this.getCollectionName(collectionId);
        panelInfo.requestName = request.name || `${request.method} Request`;
        const title = panelInfo.collectionName
          ? `${panelInfo.collectionName} / ${panelInfo.requestName}`
          : panelInfo.requestName;
        panelInfo.panel.title = title;
        panelInfo.panel.webview.postMessage({
          type: 'updateRequestIdentity',
          data: { requestId: request.id, collectionId, collectionName: panelInfo.collectionName },
        });
        panelInfo.panel.reveal();
        return;
      }
    }

    const collectionName = this.getCollectionName(collectionId);
    const requestName = request.name || `${request.method} Request`;
    const title = collectionName ? `${collectionName} / ${requestName}` : requestName;
    const { panelId, panel } = this.createPanel(title, options);

    this.panels.set(panelId, {
      panel,
      requestId: request.id,
      collectionId,
      abortController: null,
      collectionName,
      requestName,
      connectionMode: options?.connectionMode,
    });

    this.setupMessageHandler(panelId, request, options?.autoRun);
  }

  public revivePanel(panel: vscode.WebviewPanel, state: any): void {
    const panelId = this.generateId();

    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'webview-dist'),
      ],
    };

    panel.webview.html = this.getHtmlForWebview(panel.webview);

    this.panels.set(panelId, {
      panel,
      requestId: state?.requestId || null,
      collectionId: state?.collectionId || null,
      abortController: null,
      connectionMode: state?.connectionMode
        || state?.request?.connectionMode
        || (state?.request?.url?.startsWith('ws://') || state?.request?.url?.startsWith('wss://') ? 'websocket' : undefined),
    });

    panel.onDidChangeViewState((e) => {
      if (e.webviewPanel.active) { this.currentPanelId = panelId; }
    });

    panel.onDidDispose(() => { this.handlePanelDispose(panelId); });

    const request = state?.request || this.getDefaultRequest();
    this.setupMessageHandler(panelId, request, false);
  }

  public closePanelsByRequestIds(requestIds: Set<string>): void {
    for (const [panelId, info] of this.panels) {
      if (info.requestId && requestIds.has(info.requestId)) {
        info.panel.dispose();
      }
    }
  }

  public async loadDrafts(): Promise<void> { await this.draftService.load(); }

  public restoreDrafts(): void {
    const drafts = this.draftService.getAll();
    for (const draft of drafts) { this.openDraft(draft); }
  }

  public async flushDrafts(): Promise<void> { await this.draftService.flush(); }

  public dispose(): void {
    this.oauthService.dispose();
    for (const [, panelInfo] of this.panels) {
      if (panelInfo.saveTimer) clearTimeout(panelInfo.saveTimer);
      panelInfo.abortController?.abort();
      panelInfo.wsService?.disconnect();
      panelInfo.sseService?.disconnect();
      panelInfo.messageDisposable?.dispose();
    }
    this.panels.clear();
  }

  // --- Private: Panel lifecycle ---

  private findPanelByRequestId(requestId: string): string | null {
    for (const [panelId, info] of this.panels) {
      if (info.requestId === requestId) return panelId;
    }
    return null;
  }

  private getExistingPanelViewColumn(): vscode.ViewColumn | undefined {
    for (const [, info] of this.panels) {
      if (info.panel.visible && info.panel.viewColumn) return info.panel.viewColumn;
    }
    for (const [, info] of this.panels) {
      if (info.panel.viewColumn) return info.panel.viewColumn;
    }
    return undefined;
  }

  private createPanel(title: string, options?: import('./panel/PanelTypes').OpenPanelOptions): { panelId: string; panel: vscode.WebviewPanel } {
    const panelId = this.generateId();

    let viewColumn: vscode.ViewColumn;
    if (options?.viewColumn) {
      viewColumn = options.viewColumn;
    } else {
      const existingPanelColumn = this.getExistingPanelViewColumn();
      viewColumn = existingPanelColumn ?? vscode.ViewColumn.Active;
    }

    const panel = vscode.window.createWebviewPanel(
      'hivefetch.requestPanel',
      title,
      viewColumn,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, 'webview-dist'),
        ],
      }
    );

    panel.webview.html = this.getHtmlForWebview(panel.webview);

    panel.onDidChangeViewState((e) => {
      if (e.webviewPanel.active) { this.currentPanelId = panelId; }
    });

    panel.onDidDispose(() => { this.handlePanelDispose(panelId); });

    this.currentPanelId = panelId;
    return { panelId, panel };
  }

  private handlePanelDispose(panelId: string): void {
    const panelInfo = this.panels.get(panelId);
    if (panelInfo?.abortController) {
      panelInfo.abortController.abort();
      panelInfo.abortController = null;
    }
    if (panelInfo?.saveTimer) {
      clearTimeout(panelInfo.saveTimer);
      panelInfo.saveTimer = undefined;
    }
    panelInfo?.wsService?.disconnect();
    panelInfo?.sseService?.disconnect();
    panelInfo?.messageDisposable?.dispose();
    if (panelInfo) {
      panelInfo.wsService = undefined;
      panelInfo.sseService = undefined;
      panelInfo.messageDisposable = undefined;
    }
    this.panels.delete(panelId);

    if (this.currentPanelId === panelId) {
      this.currentPanelId = null;
    }
  }

  // --- Message handler (thin router) ---

  private setupMessageHandler(panelId: string, initialRequest: SavedRequest, autoRun?: boolean): void {
    const panelInfo = this.panels.get(panelId);
    if (!panelInfo) return;

    panelInfo.messageDisposable?.dispose();

    const { panel } = panelInfo;
    const webview = panel.webview;

    panelInfo.messageDisposable = webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready':
          webview.postMessage({
            type: 'loadRequest',
            data: {
              ...initialRequest,
              autoRun,
              _panelId: panelId,
              _requestId: panelInfo.requestId,
              _collectionId: panelInfo.collectionId,
              _collectionName: panelInfo.collectionName || null,
              _connectionMode: panelInfo.connectionMode || null,
            },
          });
          const envData = await this.storageService.loadEnvironments();
          webview.postMessage({ type: 'loadEnvironments', data: envData });
          const config = vscode.workspace.getConfiguration('hivefetch');
          webview.postMessage({
            type: 'loadSettings',
            data: {
              autoCorrectUrls: config.get<boolean>('autoCorrectUrls', false),
              shortcuts: config.get<Record<string, string>>('shortcuts', {}),
              minimap: config.get<string>('minimap', 'auto'),
            },
          });
          break;

        case 'sendRequest':
          await this.requestExecutor.handleSendRequest(webview, panelId, message.data);
          this.draftService.remove(panelId);
          break;

        case 'cancelRequest':
          this.requestExecutor.handleCancelRequest(panelId);
          break;

        case 'saveToCollection':
          await this.handleSaveToCollection(message.data);
          this.draftService.remove(panelId);
          break;

        case 'draftUpdated':
          await this.handleDraftUpdated(panelId, message.data);
          break;

        case 'saveToCollectionWithLink':
          await this.handleSaveToCollectionWithLink(webview, panelId, message.data);
          break;

        case 'saveToNewCollectionWithLink':
          await this.handleSaveToNewCollectionWithLink(webview, panelId, message.data);
          break;

        case 'getCollections':
          await this.sidebarProvider.whenReady();
          webview.postMessage({ type: 'collections', data: this.sidebarProvider.getCollections() });
          break;

        case 'saveEnvironments':
          await this.storageService.saveEnvironments(message.data);
          break;

        case 'openExternal':
          if (message.url) { vscode.env.openExternal(vscode.Uri.parse(message.url)); }
          break;

        case 'createRequestFromUrl':
          await vscode.commands.executeCommand('hivefetch.createRequestFromUrl', message.data.url);
          break;

        case 'startOAuthFlow':
          await this.authHandler.startOAuthFlow(
            message.data,
            (token) => webview.postMessage({ type: 'oauthTokenReceived', data: token }),
            (error) => webview.postMessage({ type: 'oauthFlowError', data: { message: error } }),
            (url) => vscode.env.openExternal(vscode.Uri.parse(url))
          );
          break;

        case 'refreshOAuthToken':
          try {
            const token = await this.authHandler.refreshOAuthToken(message.data);
            webview.postMessage({ type: 'oauthTokenReceived', data: token });
          } catch (error: any) {
            webview.postMessage({ type: 'oauthFlowError', data: { message: error.message } });
          }
          break;

        case 'clearOAuthToken':
          webview.postMessage({ type: 'oauthTokenReceived', data: null });
          break;

        case 'pickSslFile':
          await this.handlePickSslFile(webview, message.data);
          break;

        case 'selectFile':
          await this.handleSelectFile(webview, message.data);
          break;

        case 'openInNewTab':
          await this.handleOpenInNewTab(message.data);
          break;

        case 'openHtmlViewer':
          this.handleOpenHtmlViewer(message.data);
          break;

        case 'wsConnect':
          await this.handleWsConnect(webview, panelId, message.data);
          break;

        case 'wsSend':
          this.handleWsSend(panelId, message.data);
          break;

        case 'wsDisconnect':
          this.handleWsDisconnect(panelId);
          break;

        case 'sseConnect':
          this.handleSseConnect(webview, panelId, message.data);
          break;

        case 'sseDisconnect':
          this.handleSseDisconnect(panelId);
          break;

        case 'introspectGraphQL':
          await this.handleIntrospectGraphQL(webview, message.data);
          break;

        case 'updateSettings':
          await this.handleUpdateSettings(message.data);
          break;

        case 'downloadResponse':
          await this.handleDownloadResponse(message.data);
          break;

        case 'getCookieJar':
          await this.handleGetCookieJar(webview);
          break;

        case 'deleteCookie':
          await this.cookieJarService.deleteCookie(message.data.name, message.data.domain, message.data.path);
          await this.handleGetCookieJar(webview);
          break;

        case 'deleteCookieDomain':
          await this.cookieJarService.deleteDomain(message.data.domain);
          await this.handleGetCookieJar(webview);
          break;

        case 'clearCookieJar':
          await this.cookieJarService.clearAll();
          await this.handleGetCookieJar(webview);
          break;

        case 'storeSecret':
          await this.secretStorageService.store(message.data.envId, message.data.key, message.data.value);
          break;

        case 'getSecret': {
          const secretValue = await this.secretStorageService.get(message.data.envId, message.data.key);
          webview.postMessage({
            type: 'secretValue',
            data: { envId: message.data.envId, key: message.data.key, value: secretValue || '' },
          });
          break;
        }

        case 'deleteSecret':
          await this.secretStorageService.delete(message.data.envId, message.data.key);
          break;

        case 'selectRequest':
          await this.handlePaletteRequestSelection(message.data.requestId, message.data.collectionId);
          break;
      }
    });
  }

  // --- Save/Draft handlers (kept here — they interact with panel state) ---

  private async handleSaveToCollection(data: {
    collectionId: string;
    request: Omit<SavedRequest, 'id' | 'createdAt' | 'updatedAt'>;
  }): Promise<void> {
    try {
      await this.sidebarProvider.addRequest(data.collectionId, data.request);
      vscode.window.showInformationMessage('Request saved to collection');
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to save request: ${(error as Error).message}`);
    }
  }

  private async handleSaveToCollectionWithLink(webview: vscode.Webview, panelId: string, data: {
    collectionId: string;
    folderId?: string;
    request?: Partial<SavedRequest>;
  }): Promise<void> {
    const panelInfo = this.panels.get(panelId);
    if (!panelInfo) return;

    try {
      const req = data.request || {};
      const method = (req.method as SavedRequest['method']) || (panelInfo.method as SavedRequest['method']) || 'GET';
      const url = req.url || panelInfo.url || '';
      const requestData: Omit<SavedRequest, 'id' | 'createdAt' | 'updatedAt'> = {
        type: 'request',
        name: this.deriveRequestName(method, url),
        method, url,
        params: req.params || [],
        headers: req.headers || [],
        auth: req.auth || { type: 'none' },
        body: req.body || { type: 'none', content: '' },
        assertions: req.assertions,
        authInheritance: req.authInheritance,
        scripts: req.scripts,
      };

      const newRequest = await this.sidebarProvider.addRequest(data.collectionId, requestData, data.folderId);

      await this.sidebarProvider.removeFromRecentCollection(url, method);

      panelInfo.requestId = newRequest.id;
      panelInfo.collectionId = data.collectionId;
      const collectionName = this.getCollectionName(data.collectionId);
      panelInfo.collectionName = collectionName;
      panelInfo.requestName = newRequest.name;
      panelInfo.isDirty = false;
      panelInfo.panel.title = collectionName ? `${collectionName} / ${newRequest.name}` : newRequest.name;

      this.draftService.remove(panelId);

      webview.postMessage({
        type: 'requestLinkedToCollection',
        data: { requestId: newRequest.id, collectionId: data.collectionId, collectionName },
      });
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to save: ${(error as Error).message}`);
    }
  }

  private async handleSaveToNewCollectionWithLink(webview: vscode.Webview, panelId: string, data: {
    name: string;
    request?: Partial<SavedRequest>;
  }): Promise<void> {
    const panelInfo = this.panels.get(panelId);
    if (!panelInfo) return;

    try {
      const { collectionId, request: newRequest } = await this.sidebarProvider.createCollectionAndAddRequest(data.name);

      if (data.request) {
        const collections = this.sidebarProvider.getCollections();
        const collection = collections.find((c: any) => c.id === collectionId);
        if (collection) {
          const fullRequest: SavedRequest = {
            ...newRequest,
            method: (data.request.method as SavedRequest['method']) || newRequest.method,
            url: data.request.url || newRequest.url,
            params: data.request.params || newRequest.params,
            headers: data.request.headers || newRequest.headers,
            auth: data.request.auth || newRequest.auth,
            body: data.request.body || newRequest.body,
            assertions: data.request.assertions,
            authInheritance: data.request.authInheritance,
            scripts: data.request.scripts,
          };
          this.updateRequestInItems(collection.items, newRequest.id, fullRequest);
          await this.storageService.saveCollections(collections);
          this.sidebarProvider.notifyCollectionsUpdated();
        }
      }

      await this.sidebarProvider.removeFromRecentCollection(
        data.request?.url || '', data.request?.method || 'GET'
      );

      panelInfo.requestId = newRequest.id;
      panelInfo.collectionId = collectionId;
      panelInfo.collectionName = data.name;
      const derivedName = data.request?.url
        ? this.deriveRequestName(data.request.method || newRequest.method, data.request.url)
        : newRequest.name;
      panelInfo.requestName = derivedName;
      panelInfo.isDirty = false;
      panelInfo.panel.title = `${data.name} / ${derivedName}`;

      this.draftService.remove(panelId);

      webview.postMessage({
        type: 'requestLinkedToCollection',
        data: { requestId: newRequest.id, collectionId, collectionName: data.name },
      });
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to save: ${(error as Error).message}`);
    }
  }

  private async handleDraftUpdated(panelId: string, data: {
    panelId: string;
    requestId: string | null;
    collectionId: string | null;
    request: SavedRequest;
  }): Promise<void> {
    const { requestId, collectionId, request } = data;
    const panelInfo = this.panels.get(panelId);

    if (requestId && collectionId) {
      if (panelInfo && request.url) {
        panelInfo.requestName = this.deriveRequestName(request.method, request.url);
      }
      if (panelInfo && !panelInfo.isDirty) {
        panelInfo.isDirty = true;
      }
      if (panelInfo) {
        const baseName = panelInfo.collectionName
          ? `${panelInfo.collectionName} / ${panelInfo.requestName || 'Request'}`
          : (panelInfo.requestName || 'Request');
        panelInfo.panel.title = `${baseName} *`;
      }
      this.autoSaveCollectionRequest(requestId, collectionId, request, panelId);
    } else {
      if (panelInfo && request.url) {
        const pathname = this.extractPathname(request.url);
        panelInfo.panel.title = `* ${request.method} ${pathname}`;
      }
      this.draftService.upsert(panelId, requestId, collectionId, request);
    }
  }

  private autoSaveCollectionRequest(requestId: string, collectionId: string, requestData: SavedRequest, panelId?: string): void {
    const panelInfo = panelId ? this.panels.get(panelId) : undefined;
    if (panelInfo?.saveTimer) clearTimeout(panelInfo.saveTimer);
    const timer = setTimeout(async () => {
      if (panelId && !this.panels.has(panelId)) return;
      try {
        const collections = this.sidebarProvider.getCollections();
        const collection = collections.find((c: any) => c.id === collectionId);
        if (!collection) {
          console.warn(`[HiveFetch] Auto-save failed: collection ${collectionId} not found`);
          return;
        }

        const updated = this.updateRequestInItems(collection.items, requestId, requestData);
        if (updated) {
          collection.updatedAt = new Date().toISOString();
          await this.storageService.saveCollections(collections);
          this.sidebarProvider.notifyCollectionsUpdated();

          if (panelId) {
            const panelInfo = this.panels.get(panelId);
            if (panelInfo && panelInfo.isDirty) {
              panelInfo.isDirty = false;
              const collName = panelInfo.collectionName || this.getCollectionName(collectionId);
              const reqName = panelInfo.requestName || 'Request';
              panelInfo.panel.title = collName ? `${collName} / ${reqName}` : reqName;
            }
          }
        } else {
          console.warn(`[HiveFetch] Auto-save failed: request ${requestId} not found in collection "${collection.name}". The request may have been moved or deleted.`);
          if (panelId) {
            const pi = this.panels.get(panelId);
            if (pi) {
              pi.requestId = null;
              pi.collectionId = null;
              pi.isDirty = false;
              pi.panel.title = `* ${requestData.method} ${this.extractPathname(requestData.url)}`;
              pi.panel.webview.postMessage({
                type: 'requestUnlinked',
                data: { message: 'Request was moved or deleted from its collection. Changes are no longer auto-saved.' },
              });
            }
          }
        }
      } catch (error) {
        console.error('[HiveFetch] Auto-save collection request failed:', error);
      }
    }, 2000);
    if (panelInfo) panelInfo.saveTimer = timer;
  }

  private updateRequestInItems(items: any[], requestId: string, requestData: SavedRequest): boolean {
    for (const item of items) {
      if (isRequest(item) && item.id === requestId) {
        if (requestData.url) {
          item.name = this.deriveRequestName(requestData.method, requestData.url);
        }
        item.method = requestData.method;
        item.url = requestData.url;
        item.params = requestData.params;
        item.headers = requestData.headers;
        item.auth = requestData.auth;
        item.body = requestData.body;
        item.scripts = requestData.scripts;
        item.assertions = requestData.assertions;
        item.authInheritance = requestData.authInheritance;
        item.updatedAt = new Date().toISOString();
        return true;
      }
      if (isFolder(item)) {
        if (this.updateRequestInItems(item.children, requestId, requestData)) {
          return true;
        }
      }
    }
    return false;
  }

  // --- Remaining handlers (protocol, settings, etc. — kept inline for Phase 1) ---

  private async handleUpdateSettings(data: { autoCorrectUrls: boolean; shortcuts: Record<string, string>; minimap: string }): Promise<void> {
    const config = vscode.workspace.getConfiguration('hivefetch');
    await config.update('autoCorrectUrls', data.autoCorrectUrls, vscode.ConfigurationTarget.Workspace);
    await config.update('shortcuts', data.shortcuts, vscode.ConfigurationTarget.Workspace);
    await config.update('minimap', data.minimap, vscode.ConfigurationTarget.Workspace);
    this.broadcastSettings();
  }

  private async handleDownloadResponse(data: { content: string; filename: string }): Promise<void> {
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(data.filename),
      filters: { 'All Files': ['*'] }
    });
    if (uri) {
      const buffer = Buffer.from(data.content, 'utf8');
      await vscode.workspace.fs.writeFile(uri, buffer);
      vscode.window.showInformationMessage(`Response saved to ${uri.fsPath}`);
    }
  }

  private broadcastSettings(): void {
    const config = vscode.workspace.getConfiguration('hivefetch');
    const data = {
      autoCorrectUrls: config.get<boolean>('autoCorrectUrls', false),
      shortcuts: config.get<Record<string, string>>('shortcuts', {}),
      minimap: config.get<string>('minimap', 'auto'),
    };
    for (const [, info] of this.panels) {
      info.panel.webview.postMessage({ type: 'loadSettings', data });
    }
  }

  private async handlePickSslFile(webview: vscode.Webview, data: { field: 'cert' | 'key' }): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: data.field === 'cert' ? 'Select Certificate File' : 'Select Key File',
      filters: {
        'Certificate/Key files': ['pem', 'crt', 'cer', 'key', 'p12', 'pfx'],
        'All files': ['*'],
      },
    });
    if (uris && uris.length > 0) {
      webview.postMessage({ type: 'sslFilePicked', data: { field: data.field, path: uris[0].fsPath } });
    }
  }

  private async handleSelectFile(webview: vscode.Webview, data?: { fieldId?: string }): Promise<void> {
    const fileInfo = await this.fileService.selectFile();
    if (fileInfo) {
      webview.postMessage({ type: 'fileSelected', data: { fieldId: data?.fieldId, ...fileInfo } });
    }
  }

  // --- WebSocket handlers ---

  private async handleWsConnect(webview: vscode.Webview, panelId: string, data: any): Promise<void> {
    const panelInfo = this.panels.get(panelId);
    if (!panelInfo) return;
    panelInfo.wsService?.disconnect();
    const wsService = new WebSocketService();
    panelInfo.wsService = wsService;
    wsService.onStatusChange = (status, error) => {
      webview.postMessage({ type: 'wsStatus', data: { status, error } });
    };
    wsService.onMessage = (msg) => {
      webview.postMessage({ type: 'wsMessage', data: msg });
    };
    await wsService.connect({
      url: data.url, protocols: data.protocols, headers: data.headers || [],
      autoReconnect: data.autoReconnect || false, reconnectIntervalMs: data.reconnectIntervalMs || 3000,
    });
  }

  private handleWsSend(panelId: string, data: any): void {
    this.panels.get(panelId)?.wsService?.send(data.message, data.type || 'text');
  }

  private handleWsDisconnect(panelId: string): void {
    this.panels.get(panelId)?.wsService?.disconnect();
  }

  // --- SSE handlers ---

  private handleSseConnect(webview: vscode.Webview, panelId: string, data: any): void {
    const panelInfo = this.panels.get(panelId);
    if (!panelInfo) return;
    panelInfo.sseService?.disconnect();
    const sseService = new SSEService();
    panelInfo.sseService = sseService;
    sseService.onStatusChange = (status, error) => {
      webview.postMessage({ type: 'sseStatus', data: { status, error } });
    };
    sseService.onEvent = (event) => {
      webview.postMessage({ type: 'sseEvent', data: event });
    };
    sseService.connect({
      url: data.url, headers: data.headers || [],
      autoReconnect: data.autoReconnect || false, withCredentials: data.withCredentials || false,
    });
  }

  private handleSseDisconnect(panelId: string): void {
    this.panels.get(panelId)?.sseService?.disconnect();
  }

  // --- GraphQL / Cookie Jar / Palette ---

  private async handleIntrospectGraphQL(webview: vscode.Webview, data: { url: string; headers: any[]; auth: any }): Promise<void> {
    try {
      const schema = await this.graphqlSchemaService.introspect(data.url, data.headers || [], data.auth || { type: 'none' });
      webview.postMessage({ type: 'graphqlSchema', data: schema });
    } catch (error: any) {
      webview.postMessage({ type: 'graphqlSchemaError', data: { message: error.message } });
    }
  }

  private async handleGetCookieJar(webview: vscode.Webview): Promise<void> {
    const cookies = await this.cookieJarService.getAllByDomain();
    webview.postMessage({ type: 'cookieJarData', data: cookies });
  }

  private async handlePaletteRequestSelection(requestId: string, collectionId: string): Promise<void> {
    try {
      const collections = await this.storageService.loadCollections();
      let foundRequest: any = null;
      const searchInItems = (items: any[]): boolean => {
        for (const item of items) {
          if (item.type === 'request' && item.id === requestId) {
            foundRequest = item;
            return true;
          }
          if (item.type === 'folder' && item.children) {
            if (searchInItems(item.children)) return true;
          }
        }
        return false;
      };
      for (const collection of collections) {
        if (collection.id === collectionId && collection.items) {
          if (searchInItems(collection.items)) break;
        }
      }
      if (foundRequest) {
        await vscode.commands.executeCommand('hivefetch.openRequest', foundRequest, collectionId);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open request: ${error}`);
    }
  }

  private async handleOpenInNewTab(data: { content: string; language: string }): Promise<void> {
    const doc = await vscode.workspace.openTextDocument({ content: data.content, language: data.language });
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
  }

  private handleOpenHtmlViewer(data: { content: string }): void {
    const panel = vscode.window.createWebviewPanel(
      'hivefetch.htmlViewer', 'HTML Response', vscode.ViewColumn.Beside, { enableScripts: false },
    );
    const escaped = data.content.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    panel.webview.html = `<!DOCTYPE html><html><head>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src 'none';">
    </head><body style="margin:0;padding:0;">
    <iframe srcdoc="${escaped}" style="width:100%;height:100vh;border:none;" sandbox=""></iframe>
    </body></html>`;
    panel.onDidDispose(() => {});
  }

  // --- Utility methods ---

  private openDraft(draft: import('../services/types').DraftEntry): void {
    const { id: draftPanelId, request, requestId, collectionId } = draft;
    const title = request.url ? `${request.method} ${request.url}` : 'New Request';
    const { panelId, panel } = this.createPanel(title, { viewColumn: vscode.ViewColumn.Active });
    this.panels.set(panelId, { panel, requestId, collectionId, abortController: null });
    this.draftService.remove(draftPanelId);
    this.setupMessageHandler(panelId, request);
  }

  private deriveRequestName(method: string, url: string): string {
    if (!url) return 'New Request';
    const pathname = this.extractPathname(url);
    return `${method} ${pathname}`;
  }

  private extractPathname(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname || '/';
    } catch {
      const match = url.match(/\/[^\s?#]*/);
      return match ? match[0] : url;
    }
  }

  private getDefaultRequest(kind: RequestKind = REQUEST_KIND.HTTP, initialUrl?: string): SavedRequest {
    const defaults = getDefaultsForRequestKind(kind);
    return {
      id: this.generateId(),
      name: defaults.name,
      method: defaults.method,
      url: initialUrl || defaults.url,
      params: [],
      headers: [],
      auth: { type: 'none' },
      body: defaults.body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const distPath = vscode.Uri.joinPath(this.context.extensionUri, 'webview-dist');

    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'bundle.js'));
    const themeUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'theme.css'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'bundle.css'));
    const keyValueEditorStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'KeyValueEditor.css'));
    const scriptEditorStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'ScriptEditor.css'));
    const tooltipStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'Tooltip.css'));
    const commandPaletteStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'CommandPaletteApp.css'));
    const notesEditorStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'NotesEditor.css'));

    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline' https: http:; script-src 'nonce-${nonce}'; connect-src ${webview.cspSource} https: http:; img-src blob: data: ${webview.cspSource} https: http:; font-src ${webview.cspSource} https: http:; frame-src blob: https: http: data:;">
  <link href="${themeUri}" rel="stylesheet">
  <link href="${styleUri}" rel="stylesheet">
  <link href="${keyValueEditorStyleUri}" rel="stylesheet">
  <link href="${scriptEditorStyleUri}" rel="stylesheet">
  <link href="${tooltipStyleUri}" rel="stylesheet">
  <link href="${commandPaletteStyleUri}" rel="stylesheet">
  <link href="${notesEditorStyleUri}" rel="stylesheet">
  <title>HiveFetch Request</title>
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

  private getNonce(): string {
    return require('crypto').randomBytes(24).toString('base64url');
  }
}
