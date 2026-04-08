import * as vscode from 'vscode';
import { SidebarViewProvider } from './SidebarViewProvider';
import { StorageService } from '../services/StorageService';
import { DraftService } from '../services/DraftService';
import { FileService } from '../services/FileService';
import { SecretStorageService } from '../services/SecretStorageService';
import {
  OAuthService, ScriptEngine, GraphQLSchemaService,
  AwsSignatureService, CookieJarService,
} from '@nouto/core/services';
import type { SavedRequest, EnvironmentsData, EnvironmentVariable, RequestKind } from '../services/types';
import { getDefaultsForRequestKind, REQUEST_KIND } from '../services/types';
import { generateId } from '@nouto/core';

// Extracted modules
import type { PanelInfo } from './panel/PanelTypes';
import { RequestBodyBuilder } from './panel/RequestBodyBuilder';
import { RequestAuthHandler } from './panel/RequestAuthHandler';
import { ScriptRunner } from './panel/ScriptRunner';
import { RequestExecutor } from './panel/RequestExecutor';
import { CollectionSaveHandler } from './panel/CollectionSaveHandler';
import { ProtocolHandlers } from './panel/ProtocolHandlers';
import { JsonExplorerPanelHandler, type IJsonExplorerContext } from './panel/JsonExplorerPanelHandler';
import { UIService } from '../services/UIService';

export type { PanelInfo } from './panel/PanelTypes';
export type { OpenPanelOptions } from './panel/PanelTypes';

export class RequestPanelManager {
  private static instance: RequestPanelManager | null = null;
  private _disposing = false;

  public readonly panels: Map<string, PanelInfo> = new Map();
  private currentPanelId: string | null = null;
  private storageService: StorageService;
  private draftService: DraftService;
  private oauthService: OAuthService;
  private secretStorageService: SecretStorageService;
  private lastEnvironmentsData: EnvironmentsData | null = null;

  // Extracted handlers
  private bodyBuilder: RequestBodyBuilder;
  private authHandler: RequestAuthHandler;
  private scriptRunner: ScriptRunner;
  private requestExecutor: RequestExecutor;
  private saveHandler: CollectionSaveHandler;
  private protocolHandlers: ProtocolHandlers;
  private jsonExplorerHandler: JsonExplorerPanelHandler;

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
      (id) => this.panels.has(id),
      cookieJarService
    );
    this.requestExecutor = new RequestExecutor(this, this.bodyBuilder, this.authHandler, this.scriptRunner, cookieJarService);
    this.saveHandler = new CollectionSaveHandler(this, this.draftService, this.storageService, (id) => this.getCollectionName(id));
    this.protocolHandlers = new ProtocolHandlers(this, graphqlSchemaService, cookieJarService, this.storageService, fileService);

    const jsonExplorerCtx: IJsonExplorerContext = {
      focusRequest: (requestId: string) => {
        const panelId = this.findPanelByRequestId(requestId);
        if (panelId) {
          const panelInfo = this.panels.get(panelId);
          panelInfo?.panel.reveal();
        }
      },
      createAssertion: (data) => {
        // Forward assertion to the originating request panel
        const panelId = data.requestId ? this.findPanelByRequestId(data.requestId) : null;
        if (panelId) {
          const panelInfo = this.panels.get(panelId);
          panelInfo?.panel.webview.postMessage({
            type: 'addAssertionFromExplorer',
            data: { path: data.path, operator: data.operator, expected: data.expected },
          });
        }
      },
      saveToEnvironment: (data) => {
        // Delegate to sidebar to save the environment variable
        this.sidebarProvider.addEnvironmentVariable(data.key, data.value);
      },
    };
    this.jsonExplorerHandler = new JsonExplorerPanelHandler(context.extensionUri, () => this.getNonce(), jsonExplorerCtx);

    // Wire cookie jar handler into the environments panel
    this.sidebarProvider.setCookieJarHandler(this.protocolHandlers);
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

  public get extensionContext(): vscode.ExtensionContext {
    return this.context;
  }

  public generateId(): string {
    return generateId();
  }

  public getCollectionName(collectionId: string): string {
    const collections = this.sidebarProvider.getCollections();
    const collection = collections.find((c: any) => c.id === collectionId);
    return collection?.name || '';
  }

  public isWebviewAlive(panelId: string): boolean {
    return this.panels.has(panelId);
  }

  public refreshJsonExplorer(panelId: string, json: any, contentType?: string): void {
    this.jsonExplorerHandler.refreshPanel(panelId, json, contentType);
  }

  /** Broadcast current settings to all open request panels. */
  public broadcastSettings(): void {
    this.protocolHandlers.broadcastSettings();
  }

  // --- Public API ---

  public getActivePanel(): { panel: vscode.WebviewPanel; requestId: string | null } | null {
    if (!this.currentPanelId) return null;
    const panelInfo = this.panels.get(this.currentPanelId);
    if (!panelInfo) return null;
    return { panel: panelInfo.panel, requestId: panelInfo.requestId };
  }

  public async broadcastEnvironments(data: EnvironmentsData): Promise<void> {
    // Deep-clone so hydration doesn't leak secret values into the caller's object
    const clone: EnvironmentsData = JSON.parse(JSON.stringify(data));
    await this.hydrateSecrets(clone);
    for (const [, info] of this.panels) {
      info.panel.webview.postMessage({ type: 'loadEnvironments', data: clone });
    }
  }

  public broadcastCollections(data: any[]): void {
    for (const [, info] of this.panels) {
      info.panel.webview.postMessage({ type: 'collections', data });
    }
  }

  /**
   * Hydrate secret variable values from SecretStorage into in-memory environment data.
   * Called before sending environments to the webview so users can see/edit secret values.
   */
  public async hydrateSecrets(data: EnvironmentsData): Promise<EnvironmentsData> {
    const hydrate = async (envId: string, vars: EnvironmentVariable[]): Promise<void> => {
      for (const v of vars) {
        if (v.isSecret) {
          const secretVal = await this.secretStorageService.get(envId, v.secretRef || v.key);
          v.value = secretVal || '';
        }
      }
    };

    if (data.globalVariables) {
      await hydrate('__global__', data.globalVariables);
    }
    for (const env of data.environments) {
      await hydrate(env.id, env.variables);
    }
    return data;
  }

  /**
   * Persist secret variable values to SecretStorage and clean up removed secrets.
   * Called before saving environments to disk.
   */
  public async persistSecrets(data: EnvironmentsData): Promise<void> {
    // Store current secrets (does not mutate data)
    const store = async (envId: string, vars: EnvironmentVariable[]): Promise<void> => {
      for (const v of vars) {
        if (v.isSecret && v.value) {
          await this.secretStorageService.store(envId, v.key, v.value);
        }
      }
    };

    if (data.globalVariables) {
      await store('__global__', data.globalVariables);
    }
    for (const env of data.environments) {
      await store(env.id, env.variables);
    }

    // Clean up deleted or un-secreted variables
    if (this.lastEnvironmentsData) {
      const oldSecrets = this.collectSecretKeys(this.lastEnvironmentsData);
      const newSecrets = this.collectSecretKeys(data);
      for (const key of oldSecrets) {
        if (!newSecrets.has(key)) {
          const [envId, varKey] = key.split('\0');
          await this.secretStorageService.delete(envId, varKey);
        }
      }
    }

    this.lastEnvironmentsData = JSON.parse(JSON.stringify(data));
  }

  /**
   * Collect all secret variable keys as "envId\0varKey" strings for diffing.
   */
  private collectSecretKeys(data: EnvironmentsData): Set<string> {
    const keys = new Set<string>();
    if (data.globalVariables) {
      for (const v of data.globalVariables) {
        if (v.isSecret) keys.add(`__global__\0${v.key}`);
      }
    }
    for (const env of data.environments) {
      for (const v of env.variables) {
        if (v.isSecret) keys.add(`${env.id}\0${v.key}`);
      }
    }
    return keys;
  }

  public async broadcastCookieJarState(): Promise<void> {
    await this.protocolHandlers.broadcastCookieJarState();
  }

  public addExternalCookieWebview(webview: vscode.Webview): void {
    this.protocolHandlers.addExternalWebview(webview);
  }

  public removeExternalCookieWebview(webview: vscode.Webview): void {
    this.protocolHandlers.removeExternalWebview(webview);
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
        || state?.request?.connectionMode,
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
    const connMode = histEntry.connectionMode || 'http';
    const histRequest: SavedRequest = {
      id: this.generateId(),
      name: histEntry.requestName || '',
      method: histEntry.method,
      url: histEntry.url,
      params: histEntry.params || [],
      pathParams: histEntry.pathParams || [],
      headers: histEntry.headers || [],
      auth: histEntry.auth || { type: 'none' },
      body: histEntry.body || { type: 'none', content: '' },
      connectionMode: connMode,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    // Restore gRPC config from history entry
    if (connMode === 'grpc') {
      if (histEntry.grpc) {
        // New format: grpc config stored separately
        histRequest.grpc = {
          serviceName: histEntry.grpc.serviceName,
          methodName: histEntry.grpc.methodName,
          useReflection: histEntry.grpc.useReflection ?? true,
          protoPaths: histEntry.grpc.protoPaths || [],
          protoImportDirs: histEntry.grpc.protoImportDirs || [],
          tls: histEntry.grpc.tls,
        };
        // Extract address from combined URL (address/service/method)
        const grpcUrl = histEntry.url || '';
        const serviceMethod = `${histEntry.grpc.serviceName}/${histEntry.grpc.methodName}`;
        if (grpcUrl.endsWith(serviceMethod)) {
          histRequest.url = grpcUrl.slice(0, -(serviceMethod.length + 1));
        }
      } else {
        // Legacy format: parse address/service/method from URL
        const parts = (histEntry.url || '').split('/');
        if (parts.length >= 3) {
          histRequest.url = parts[0];
          histRequest.grpc = {
            serviceName: parts.slice(1, -1).join('/'),
            methodName: parts[parts.length - 1],
            useReflection: true,
            protoPaths: [],
            protoImportDirs: [],
          };
        }
      }
    }
    const modeLabels: Record<string, string> = { websocket: 'WS', sse: 'SSE', grpc: 'gRPC', 'graphql-ws': 'GQL-S' };
    const tabLabel = modeLabels[connMode]
      ? `${modeLabels[connMode]} ${histRequest.url}`
      : `${histRequest.method} ${histRequest.url}`;
    const { panelId: newPanelId, panel: newPanel } = this.createPanel(
      tabLabel,
      { viewColumn: vscode.ViewColumn.Active }
    );
    this.panels.set(newPanelId, {
      panel: newPanel,
      requestId: null,
      collectionId: null,
      abortController: null,
      connectionMode: histRequest.connectionMode,
    });
    this.setupMessageHandler(newPanelId, histRequest);
  }

  private duplicateCurrentPanel(_panelId: string): void {
    // No-op in VS Code - use the right-click context menu in the sidebar instead
  }

  public async loadDrafts(): Promise<void> { await this.draftService.load(); }

  public restoreDrafts(): void {
    const drafts = this.draftService.getAll();
    for (const draft of drafts) { this.openDraft(draft); }
  }

  public async flushDrafts(): Promise<void> { await this.draftService.flush(); }

  /**
   * Open a JSON file in the JSON Explorer panel.
   * Used by the "Open in JSON Explorer" command for workspace .json files.
   */
  public openJsonFile(json: any, fileName: string): void {
    this.jsonExplorerHandler.openJsonExplorer({
      json,
      contentType: 'application/json',
      requestName: fileName,
    });
  }

  public dispose(): void {
    this._disposing = true;
    this.oauthService.dispose();
    for (const [panelId, panelInfo] of this.panels) {
      if (panelInfo.saveTimer) clearTimeout(panelInfo.saveTimer);
      panelInfo.abortController?.abort();
      panelInfo.wsRecorder?.cancelReplay();
      panelInfo.wsService?.disconnect();
      panelInfo.sseService?.disconnect();
      panelInfo.gqlSubService?.disconnect();
      this.protocolHandlers.disposeGrpcService(panelId);
      panelInfo.messageDisposable?.dispose();
      panelInfo.panel.dispose();
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
      'nouto.requestPanel',
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
    if (this._disposing) {
      this.panels.delete(panelId);
      return;
    }
    const panelInfo = this.panels.get(panelId);

    // If closing a dirty collection request, show notification
    if (panelInfo?.isDirty && panelInfo.requestId && panelInfo.collectionId) {
      const reqName = panelInfo.requestName || 'Request';
      const reqId = panelInfo.requestId;
      const collId = panelInfo.collectionId;
      // Capture draft ID at close time to avoid matching a different panel's draft later
      const draftAtClose = this.draftService.getAll().find(d => d.requestId === reqId);
      const draftIdAtClose = draftAtClose?.id;
      // Draft is already persisted by handleDraftUpdated
      vscode.window.showInformationMessage(
        `Unsaved changes to '${reqName}' preserved as draft`,
        'Restore', 'Save to Collection', 'Discard'
      ).then(async (choice) => {
        if (this._disposing) return;
        try {
          // Re-lookup by the captured draft ID to avoid acting on a different panel's draft
          const draft = draftIdAtClose ? this.draftService.getAll().find(d => d.id === draftIdAtClose) : undefined;
          if (choice === 'Restore') {
            if (draft) {
              this.openDraft(draft);
            }
          } else if (choice === 'Save to Collection') {
            if (draft) {
              await this.saveHandler.saveDirectToCollection(reqId, collId, draft.request);
              this.draftService.remove(draft.id);
            }
          } else if (choice === 'Discard') {
            if (draft) {
              this.draftService.remove(draft.id);
            }
          }
        } catch (err) {
          console.error('[Nouto] Error handling panel close action:', err);
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
    panelInfo?.wsRecorder?.cancelReplay();
    panelInfo?.wsService?.disconnect();
    panelInfo?.sseService?.disconnect();
    panelInfo?.gqlSubService?.disconnect();
    this.protocolHandlers.disposeGrpcService(panelId);
    panelInfo?.uiService?.dispose();
    panelInfo?.messageDisposable?.dispose();
    if (panelInfo) {
      panelInfo.wsRecorder = undefined;
      panelInfo.wsService = undefined;
      panelInfo.sseService = undefined;
      panelInfo.uiService = undefined;
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

    // Create UIService for this panel
    const panelUiService = new UIService((msg) => webview.postMessage(msg));
    panelInfo.uiService = panelUiService;

    panelInfo.messageDisposable = webview.onDidReceiveMessage(async (message) => {
      try {
      // Route UI response messages first
      if (panelUiService.handleResponseMessage(message)) return;

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
          await this.hydrateSecrets(envData);
          this.lastEnvironmentsData = JSON.parse(JSON.stringify(envData));
          webview.postMessage({ type: 'loadEnvironments', data: envData });
          this.protocolHandlers.broadcastSettings();
          break;

        case 'sendRequest': {
          const completed = await this.requestExecutor.handleSendRequest(webview, panelId, message.data);
          if (completed) this.draftService.remove(panelId);
          break;
        }

        case 'cancelRequest':
          this.requestExecutor.handleCancelRequest(panelId);
          this.protocolHandlers.cancelGrpcCall(panelId);
          break;

        // Save/Draft - delegated to CollectionSaveHandler
        case 'saveToCollection':
          await this.saveHandler.handleSaveToCollection(panelId, message.data);
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

        case 'addResponseExample':
          await this.saveHandler.handleAddResponseExample(panelId, message.data);
          break;

        case 'deleteResponseExample':
          await this.saveHandler.handleDeleteResponseExample(panelId, message.data);
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
          await this.persistSecrets(message.data);
          await this.storageService.saveEnvironments(message.data);
          this.sidebarProvider.updateEnvironments(message.data);
          break;

        case 'openExternal':
          if (message.url) { vscode.env.openExternal(vscode.Uri.parse(message.url)); }
          break;

        case 'createRequestFromUrl':
          await vscode.commands.executeCommand('nouto.createRequestFromUrl', message.data.url);
          break;

        // OAuth - delegated to RequestAuthHandler
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

        // Protocol/file handlers - delegated to ProtocolHandlers
        case 'pickSslFile':
          await this.protocolHandlers.handlePickSslFile(webview, message.data);
          break;

        case 'selectFile':
          await this.protocolHandlers.handleSelectFile(webview, message.data);
          break;

        case 'openInNewTab':
          await this.protocolHandlers.handleOpenInNewTab(message.data);
          break;

        case 'openJsonExplorer': {
          const panelInfo = this.panels.get(panelId);
          this.jsonExplorerHandler.openJsonExplorer({
            ...message.data,
            requestId: panelInfo?.requestId || undefined,
            panelId,
          });
          break;
        }

        case 'wsConnect':
          await this.protocolHandlers.handleWsConnect(webview, panelId, message.data);
          break;

        case 'wsSend':
          this.protocolHandlers.handleWsSend(panelId, message.data);
          break;

        case 'wsDisconnect':
          this.protocolHandlers.handleWsDisconnect(panelId);
          break;

        case 'wsStartRecording':
          this.protocolHandlers.handleWsStartRecording(webview, panelId);
          break;

        case 'wsStopRecording':
          await this.protocolHandlers.handleWsStopRecording(webview, panelId, message.data || {});
          break;

        case 'wsSaveSession':
          await this.protocolHandlers.handleWsSaveSession(message.data);
          await this.protocolHandlers.handleWsListSessions(webview);
          break;

        case 'wsExportSession':
          await this.protocolHandlers.handleWsExportSession(message.data);
          break;

        case 'wsLoadSession':
          await this.protocolHandlers.handleWsLoadSession(webview);
          break;

        case 'wsLoadSessionById':
          await this.protocolHandlers.handleWsLoadSessionById(webview, message.data);
          break;

        case 'wsListSessions':
          await this.protocolHandlers.handleWsListSessions(webview);
          break;

        case 'wsDeleteSession':
          await this.protocolHandlers.handleWsDeleteSession(message.data);
          await this.protocolHandlers.handleWsListSessions(webview);
          break;

        case 'wsStartReplay':
          this.protocolHandlers.handleWsStartReplay(webview, panelId, message.data);
          break;

        case 'wsCancelReplay':
          this.protocolHandlers.handleWsCancelReplay(panelId);
          break;

        case 'sseConnect':
          await this.protocolHandlers.handleSseConnect(webview, panelId, message.data);
          break;

        case 'sseDisconnect':
          this.protocolHandlers.handleSseDisconnect(panelId);
          break;

        case 'gqlSubSubscribe':
          await this.protocolHandlers.handleGqlSubSubscribe(webview, panelId, message.data);
          break;

        case 'gqlSubUnsubscribe':
          this.protocolHandlers.handleGqlSubUnsubscribe(panelId);
          break;

        case 'grpcReflect':
          await this.protocolHandlers.handleGrpcReflect(webview, panelId, message.data);
          break;

        case 'grpcLoadProto':
          await this.protocolHandlers.handleGrpcLoadProto(webview, panelId, message.data);
          break;

        case 'grpcInvoke':
          await this.protocolHandlers.handleGrpcInvoke(webview, panelId, message.data);
          break;

        case 'grpcSendMessage':
          this.protocolHandlers.sendGrpcMessage(webview, panelId, message.data);
          break;

        case 'grpcEndStream':
          this.protocolHandlers.endGrpcStream(panelId);
          break;

        case 'grpcCommitStream':
          this.protocolHandlers.commitGrpcStream(panelId);
          break;

        case 'grpcInvalidatePool':
          // No-op in VS Code extension (pool caching is desktop-only)
          break;

        case 'pickProtoFile':
          await this.protocolHandlers.handlePickProtoFile(webview);
          break;

        case 'pickProtoImportDir':
          await this.protocolHandlers.handlePickProtoImportDir(webview);
          break;

        case 'scanProtoDir':
          await this.protocolHandlers.handleScanProtoDir(webview, message.data.dir);
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

        case 'downloadBinaryResponse':
          await this.protocolHandlers.handleDownloadBinaryResponse(message.data);
          break;

        case 'openBinaryResponse':
          await this.protocolHandlers.handleOpenBinaryResponse(message.data);
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

        case 'getCookieJars':
          await this.protocolHandlers.handleGetCookieJars(webview);
          break;

        case 'createCookieJar':
          await this.protocolHandlers.handleCreateCookieJar(webview, message.data);
          break;

        case 'renameCookieJar':
          await this.protocolHandlers.handleRenameCookieJar(webview, message.data);
          break;

        case 'deleteCookieJar':
          await this.protocolHandlers.handleDeleteCookieJar(webview, message.data);
          break;

        case 'setActiveCookieJar':
          await this.protocolHandlers.handleSetActiveCookieJar(webview, message.data);
          break;

        case 'addCookie':
          await this.protocolHandlers.handleAddCookie(webview, message.data);
          break;

        case 'updateCookie':
          await this.protocolHandlers.handleUpdateCookie(webview, message.data);
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

        case 'openCommandPalette':
          await vscode.commands.executeCommand('nouto.openCommandPalette');
          break;

        case 'revealActiveRequest':
          this.sidebarProvider.revealActiveRequest(panelInfo.requestId || undefined);
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

        // getDrawerHistory disabled - drawer is disabled, history is in sidebar tab
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
          await vscode.commands.executeCommand('nouto.exportHistory');
          break;

        case 'importHistory':
          await vscode.commands.executeCommand('nouto.importHistory');
          break;

        case 'getHistoryStats': {
          const histStats = await this.sidebarProvider.getHistoryStats(message.data?.days);
          webview.postMessage({ type: 'historyStatsLoaded', data: histStats });
          break;
        }

        case 'openEnvironmentsPanel':
          await this.sidebarProvider._openEnvironmentsPanel(message.data?.tab);
          break;

        case 'newRequest': {
          vscode.commands.executeCommand('nouto.newRequest');
          break;
        }

        case 'duplicateRequest': {
          this.duplicateCurrentPanel(panelId);
          break;
        }
      }
      } catch (error) {
        console.error('[Nouto] Error handling panel message:', message.type, error);
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
      headers: [{ id: this.generateId(), key: 'User-Agent', value: 'Nouto', enabled: true }],
      auth: { type: 'none' },
      body: defaults.body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const distPath = vscode.Uri.joinPath(this.context.extensionUri, 'webview-dist');

    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'bundle.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'style.css'));

    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline' https: http:; script-src 'nonce-${nonce}'; connect-src ${webview.cspSource} https: http:; img-src blob: data: ${webview.cspSource} https: http:; font-src ${webview.cspSource} https: http:; frame-src blob: https: http: data:;">
  <link href="${styleUri}" rel="stylesheet">
  <title>Nouto Request</title>
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
