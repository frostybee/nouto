import * as vscode from 'vscode';
import { SidebarViewProvider } from './SidebarViewProvider';
import { StorageService } from '../services/StorageService';
import { DraftService } from '../services/DraftService';
import { FileService } from '../services/FileService';
import { SecretStorageService } from '../services/SecretStorageService';
import {
  OAuthService, ScriptEngine, GraphQLSchemaService,
  AwsSignatureService, CookieJarService,
} from '@hivefetch/core/services';
import type { SavedRequest, EnvironmentsData, RequestKind } from '../services/types';
import { getDefaultsForRequestKind, REQUEST_KIND } from '../services/types';

// Extracted modules
import type { PanelInfo } from './panel/PanelTypes';
import { RequestBodyBuilder } from './panel/RequestBodyBuilder';
import { RequestAuthHandler } from './panel/RequestAuthHandler';
import { ScriptRunner } from './panel/ScriptRunner';
import { RequestExecutor } from './panel/RequestExecutor';
import { CollectionSaveHandler } from './panel/CollectionSaveHandler';
import { ProtocolHandlers } from './panel/ProtocolHandlers';

export type { PanelInfo } from './panel/PanelTypes';
export type { OpenPanelOptions } from './panel/PanelTypes';

export class RequestPanelManager {
  private static instance: RequestPanelManager | null = null;

  public readonly panels: Map<string, PanelInfo> = new Map();
  private currentPanelId: string | null = null;
  private storageService: StorageService;
  private draftService: DraftService;
  private oauthService: OAuthService;
  private secretStorageService: SecretStorageService;

  // Extracted handlers
  private bodyBuilder: RequestBodyBuilder;
  private authHandler: RequestAuthHandler;
  private scriptRunner: ScriptRunner;
  private requestExecutor: RequestExecutor;
  private saveHandler: CollectionSaveHandler;
  private protocolHandlers: ProtocolHandlers;

  private constructor(
    private readonly context: vscode.ExtensionContext,
    public readonly sidebarProvider: SidebarViewProvider
  ) {
    this.storageService = new StorageService(vscode.workspace.workspaceFolders?.[0], context.globalStorageUri.fsPath);
    this.draftService = new DraftService(this.storageService.getStorageDir());
    this.oauthService = new OAuthService();
    const fileService = new FileService();
    const scriptEngine = new ScriptEngine();
    const graphqlSchemaService = new GraphQLSchemaService();
    const awsSignatureService = new AwsSignatureService();
    const cookieJarService = new CookieJarService(this.storageService.getStorageDir());
    this.secretStorageService = new SecretStorageService(context);

    // Wire up extracted modules
    this.bodyBuilder = new RequestBodyBuilder(fileService);
    this.authHandler = new RequestAuthHandler(this.oauthService, awsSignatureService);
    this.scriptRunner = new ScriptRunner(
      scriptEngine, this.storageService, this.secretStorageService,
      () => this.sidebarProvider.getCollections(),
      (id) => this.panels.has(id)
    );
    this.requestExecutor = new RequestExecutor(this, this.bodyBuilder, this.authHandler, this.scriptRunner, cookieJarService);
    this.saveHandler = new CollectionSaveHandler(this, this.draftService, this.storageService, (id) => this.getCollectionName(id));
    this.protocolHandlers = new ProtocolHandlers(this, graphqlSchemaService, cookieJarService, this.storageService, fileService);
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

  /**
   * Returns dirty panel info for panels whose requestId matches any in the given set.
   * Used by FetchmanWatcher to detect conflicts with externally changed files.
   */
  public getDirtyPanelsForRequests(requestIds: Set<string>): PanelInfo[] {
    const results: PanelInfo[] = [];
    for (const [, info] of this.panels) {
      if (info.requestId && info.isDirty && requestIds.has(info.requestId)) {
        results.push(info);
      }
    }
    return results;
  }

  public openHistoryEntryAsPanel(histEntry: any): void {
    const histRequest: SavedRequest = {
      id: this.generateId(),
      name: histEntry.requestName || '',
      method: histEntry.method,
      url: histEntry.url,
      params: histEntry.params || [],
      headers: histEntry.headers || [],
      auth: histEntry.auth || { type: 'none' },
      body: histEntry.body || { type: 'none', content: '' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const { panelId: newPanelId, panel: newPanel } = this.createPanel(
      `${histRequest.method} ${histRequest.url}`,
      { viewColumn: vscode.ViewColumn.Active }
    );
    this.panels.set(newPanelId, {
      panel: newPanel,
      requestId: null,
      collectionId: null,
      abortController: null,
    });
    this.setupMessageHandler(newPanelId, histRequest);
  }

  private duplicateCurrentPanel(panelId: string): void {
    const panelInfo = this.panels.get(panelId);
    if (!panelInfo) return;

    // Request the current state from the webview - we'll clone whatever it sends back
    // For now, open a new blank request (the webview shortcut handler can refine this)
    this.openNewRequest();
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
    RequestPanelManager.instance = null;
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

    // If closing a dirty collection request, show notification
    if (panelInfo?.isDirty && panelInfo.requestId && panelInfo.collectionId) {
      const reqName = panelInfo.requestName || 'Request';
      const reqId = panelInfo.requestId;
      const collId = panelInfo.collectionId;
      // Draft is already persisted by handleDraftUpdated
      vscode.window.showInformationMessage(
        `Unsaved changes to '${reqName}' preserved as draft`,
        'Restore', 'Save to Collection', 'Discard'
      ).then(async (choice) => {
        try {
          if (choice === 'Restore') {
            const drafts = this.draftService.getAll();
            const draft = drafts.find(d => d.requestId === reqId);
            if (draft) {
              this.openDraft(draft);
            }
          } else if (choice === 'Save to Collection') {
            const drafts = this.draftService.getAll();
            const draft = drafts.find(d => d.requestId === reqId);
            if (draft) {
              await this.saveHandler.saveDirectToCollection(reqId, collId, draft.request);
              this.draftService.remove(draft.id);
            }
          } else if (choice === 'Discard') {
            const drafts = this.draftService.getAll();
            const draft = drafts.find(d => d.requestId === reqId);
            if (draft) {
              this.draftService.remove(draft.id);
            }
          }
        } catch (err) {
          console.error('[HiveFetch] Error handling panel close action:', err);
        } finally {
          this.broadcastDirtyRequestIds();
        }
      });
    }

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

    this.broadcastDirtyRequestIds();
  }

  private broadcastDirtyRequestIds(): void {
    const dirtyIds: string[] = [];
    for (const [, info] of this.panels) {
      if (info.isDirty && info.requestId) {
        dirtyIds.push(info.requestId);
      }
    }
    this.sidebarProvider.setDirtyRequestIds(dirtyIds);
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
              saveResponseBody: config.get<boolean>('history.saveResponseBody', true),
              sslRejectUnauthorized: config.get<boolean>('ssl.rejectUnauthorized', true),
              storageMode: config.get<string>('storage.mode', 'monolithic'),
              collectionMode: config.get<string>('storage.collectionMode', 'global'),
              collectionFormat: config.get<string>('storage.collectionFormat', 'json'),
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

        // Save/Draft — delegated to CollectionSaveHandler
        case 'saveToCollection':
          await this.saveHandler.handleSaveToCollection(message.data);
          this.draftService.remove(panelId);
          break;

        case 'draftUpdated':
          await this.saveHandler.handleDraftUpdated(panelId, message.data);
          break;

        case 'saveCollectionRequest':
          await this.saveHandler.handleSaveCollectionRequest(webview, panelId, message.data);
          this.broadcastDirtyRequestIds();
          break;

        case 'revertRequest':
          await this.saveHandler.handleRevertRequest(webview, panelId, message.data);
          this.broadcastDirtyRequestIds();
          break;

        case 'dirtyStateChanged': {
          const pi = this.panels.get(panelId);
          if (pi) {
            pi.isDirty = message.data.isDirty;
            if (pi.collectionId) {
              const baseName = pi.collectionName
                ? `${pi.collectionName} / ${pi.requestName || 'Request'}`
                : (pi.requestName || 'Request');
              pi.panel.title = message.data.isDirty ? `${baseName} \u25CF` : baseName;
            }
          }
          this.broadcastDirtyRequestIds();
          break;
        }

        case 'saveToCollectionWithLink':
          await this.saveHandler.handleSaveToCollectionWithLink(webview, panelId, message.data);
          break;

        case 'saveToNewCollectionWithLink':
          await this.saveHandler.handleSaveToNewCollectionWithLink(webview, panelId, message.data);
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

        // OAuth — delegated to RequestAuthHandler
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

        // Protocol/file handlers — delegated to ProtocolHandlers
        case 'pickSslFile':
          await this.protocolHandlers.handlePickSslFile(webview, message.data);
          break;

        case 'selectFile':
          await this.protocolHandlers.handleSelectFile(webview, message.data);
          break;

        case 'openInNewTab':
          await this.protocolHandlers.handleOpenInNewTab(message.data);
          break;

        case 'openHtmlViewer':
          this.protocolHandlers.handleOpenHtmlViewer(message.data);
          break;

        case 'wsConnect':
          await this.protocolHandlers.handleWsConnect(webview, panelId, message.data);
          break;

        case 'wsSend':
          this.protocolHandlers.handleWsSend(panelId, message.data);
          break;

        case 'wsDisconnect':
          this.protocolHandlers.handleWsDisconnect(panelId);
          break;

        case 'sseConnect':
          this.protocolHandlers.handleSseConnect(webview, panelId, message.data);
          break;

        case 'sseDisconnect':
          this.protocolHandlers.handleSseDisconnect(panelId);
          break;

        case 'introspectGraphQL':
          await this.protocolHandlers.handleIntrospectGraphQL(webview, message.data);
          break;

        case 'updateSettings':
          await this.protocolHandlers.handleUpdateSettings(message.data);
          break;

        case 'downloadResponse':
          await this.protocolHandlers.handleDownloadResponse(message.data);
          break;

        case 'getCookieJar':
          await this.protocolHandlers.handleGetCookieJar(webview);
          break;

        case 'deleteCookie':
          await this.protocolHandlers.handleDeleteCookie(webview, message.data);
          break;

        case 'deleteCookieDomain':
          await this.protocolHandlers.handleDeleteCookieDomain(webview, message.data);
          break;

        case 'clearCookieJar':
          await this.protocolHandlers.handleClearCookieJar(webview);
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
          await this.protocolHandlers.handlePaletteRequestSelection(message.data.requestId, message.data.collectionId);
          break;

        // History Drawer operations
        case 'getHistory': {
          const historyResult = await this.sidebarProvider.searchHistory(message.data);
          webview.postMessage({ type: 'historyLoaded', data: historyResult });
          break;
        }

        // getDrawerHistory disabled — drawer is disabled, history is in sidebar tab
        // case 'getDrawerHistory': { ... }

        case 'deleteHistoryEntry':
          await this.sidebarProvider.deleteHistoryEntryById(message.data.id);
          break;

        case 'clearHistory':
          await this.sidebarProvider.clearAllHistory();
          break;

        case 'openHistoryEntry': {
          const histEntry = await this.sidebarProvider.getHistoryEntry(message.data.id);
          if (histEntry) {
            this.openHistoryEntryAsPanel(histEntry);
          }
          break;
        }

        case 'saveHistoryToCollection':
          // Delegate to sidebar provider which has the QuickPick flow
          await this.sidebarProvider.saveHistoryEntryToCollection(message.data.historyId);
          break;

        case 'exportHistory':
          await vscode.commands.executeCommand('hivefetch.exportHistory');
          break;

        case 'importHistory':
          await vscode.commands.executeCommand('hivefetch.importHistory');
          break;

        case 'getHistoryStats': {
          const histStats = await this.sidebarProvider.getHistoryStats(message.data?.days);
          webview.postMessage({ type: 'historyStatsLoaded', data: histStats });
          break;
        }

        case 'newRequest': {
          this.openNewRequest();
          break;
        }

        case 'duplicateRequest': {
          this.duplicateCurrentPanel(panelId);
          break;
        }
      }
    });
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
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'style.css'));

    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline' https: http:; script-src 'nonce-${nonce}'; connect-src ${webview.cspSource} https: http:; img-src blob: data: ${webview.cspSource} https: http:; font-src ${webview.cspSource} https: http:; frame-src blob: https: http: data:;">
  <link href="${themeUri}" rel="stylesheet">
  <link href="${styleUri}" rel="stylesheet">
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
