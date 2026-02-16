import * as vscode from 'vscode';
import * as fs from 'fs';
import { SidebarViewProvider } from './SidebarViewProvider';
import { StorageService } from '../services/StorageService';
import { DraftService } from '../services/DraftService';
import { FileService } from '../services/FileService';
import { SecretStorageService } from '../services/SecretStorageService';
import {
  OAuthService, ScriptEngine, GraphQLSchemaService, WebSocketService, SSEService,
  resolveScriptsForRequest, executeRequest, evaluateAssertions,
  resolveRequestWithInheritance, AwsSignatureService, CookieJarService,
} from '@hivefetch/core/services';
import type { HttpRequestConfig } from '@hivefetch/core/services';
import type { SavedRequest, EnvironmentsData, OAuth2Config, OAuthToken, ScriptResult, RequestKind, ConnectionMode, TimelineEvent } from '../services/types';
import { isRequest, isFolder, getDefaultsForRequestKind, REQUEST_KIND } from '../services/types';

interface PanelInfo {
  panel: vscode.WebviewPanel;
  requestId: string | null;
  collectionId: string | null;
  abortController: AbortController | null;
  messageDisposable?: vscode.Disposable;
  url?: string;
  method?: string;
  isDirty?: boolean;
  collectionName?: string;
  requestName?: string;
  wsService?: WebSocketService;
  sseService?: SSEService;
  connectionMode?: string;
  saveTimer?: ReturnType<typeof setTimeout>;
}

export interface OpenPanelOptions {
  newTab?: boolean;
  autoRun?: boolean;
  viewColumn?: vscode.ViewColumn;
}

export class RequestPanelManager {
  private static instance: RequestPanelManager | null = null;

  private panels: Map<string, PanelInfo> = new Map();
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
  // Per-panel save timers are stored in PanelInfo.saveTimer

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly sidebarProvider: SidebarViewProvider
  ) {
    this.storageService = new StorageService(vscode.workspace.workspaceFolders?.[0]);
    this.draftService = new DraftService(this.storageService.getStorageDir());
    this.oauthService = new OAuthService();
    this.fileService = new FileService();
    this.scriptEngine = new ScriptEngine();
    this.graphqlSchemaService = new GraphQLSchemaService();
    this.awsSignatureService = new AwsSignatureService();
    this.cookieJarService = new CookieJarService(this.storageService.getStorageDir());
    this.secretStorageService = new SecretStorageService(context);
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

  /**
   * Broadcast updated environment data to all open request panels.
   */
  public broadcastEnvironments(data: EnvironmentsData): void {
    for (const [, info] of this.panels) {
      info.panel.webview.postMessage({
        type: 'loadEnvironments',
        data,
      });
    }
  }

  /**
   * Open a new empty request panel
   */
  public openNewRequest(options?: OpenPanelOptions & { requestKind?: RequestKind; initialUrl?: string }): void {
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

  /**
   * Open a saved request from a collection
   */
  public openSavedRequest(request: SavedRequest, collectionId: string, options?: OpenPanelOptions & { connectionMode?: string }): void {
    // Check if this request is already open
    const existingPanelId = this.findPanelByRequestId(request.id);
    if (existingPanelId) {
      const panelInfo = this.panels.get(existingPanelId);
      if (panelInfo) {
        // Update collection identity in case request was moved (e.g. drag-drop from Recent)
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

  /**
   * Revive a panel from a previous session (for WebviewPanelSerializer)
   */
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

    // Track panel lifecycle
    panel.onDidChangeViewState((e) => {
      if (e.webviewPanel.active) {
        this.currentPanelId = panelId;
      }
    });

    panel.onDidDispose(() => {
      this.handlePanelDispose(panelId);
    });

    // Setup message handling - request data will be restored from state
    const request = state?.request || this.getDefaultRequest();
    this.setupMessageHandler(panelId, request, false);
  }

  private findPanelByRequestId(requestId: string): string | null {
    for (const [panelId, info] of this.panels) {
      if (info.requestId === requestId) {
        return panelId;
      }
    }
    return null;
  }

  private findPanelByUrlAndMethod(url: string, method: string): string | null {
    for (const [panelId, info] of this.panels) {
      if (info.url === url && info.method === method) {
        return panelId;
      }
    }
    return null;
  }

  private getExistingPanelViewColumn(): vscode.ViewColumn | undefined {
    // Find the first visible HiveFetch panel's view column
    for (const [, info] of this.panels) {
      if (info.panel.visible && info.panel.viewColumn) {
        return info.panel.viewColumn;
      }
    }
    // Fall back to any panel's view column
    for (const [, info] of this.panels) {
      if (info.panel.viewColumn) {
        return info.panel.viewColumn;
      }
    }
    return undefined;
  }

  private createPanel(title: string, options?: OpenPanelOptions): { panelId: string; panel: vscode.WebviewPanel } {
    const panelId = this.generateId();

    // Determine view column - try to position next to existing HiveFetch panels
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

    // Track current active panel
    panel.onDidChangeViewState((e) => {
      if (e.webviewPanel.active) {
        this.currentPanelId = panelId;
      }
    });

    // Handle panel disposal
    panel.onDidDispose(() => {
      this.handlePanelDispose(panelId);
    });

    this.currentPanelId = panelId;
    return { panelId, panel };
  }

  private setupMessageHandler(panelId: string, initialRequest: SavedRequest, autoRun?: boolean): void {
    const panelInfo = this.panels.get(panelId);
    if (!panelInfo) return;

    // Dispose old handler before creating new one (prevents leak on panel revival)
    panelInfo.messageDisposable?.dispose();

    const { panel } = panelInfo;
    const webview = panel.webview;

    panelInfo.messageDisposable = webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'ready':
          // Send initial request data with panel identity metadata
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
          // Send environments
          const envData = await this.storageService.loadEnvironments();
          webview.postMessage({
            type: 'loadEnvironments',
            data: envData,
          });
          // Send user settings
          const config = vscode.workspace.getConfiguration('hivefetch');
          const autoCorrectUrls = config.get<boolean>('autoCorrectUrls', false);
          const shortcuts = config.get<Record<string, string>>('shortcuts', {});
          const minimap = config.get<string>('minimap', 'auto');
          webview.postMessage({
            type: 'loadSettings',
            data: { autoCorrectUrls, shortcuts, minimap },
          });
          break;

        case 'sendRequest':
          await this.handleSendRequest(webview, panelId, message.data);
          // Request sent — draft is no longer needed (will be in history)
          this.draftService.remove(panelId);
          break;

        case 'cancelRequest':
          this.handleCancelRequest(panelId);
          break;

        case 'saveToCollection':
          await this.handleSaveToCollection(message.data);
          // Saved to collection — draft is no longer needed
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
          webview.postMessage({
            type: 'collections',
            data: this.sidebarProvider.getCollections(),
          });
          break;

        case 'saveEnvironments':
          await this.storageService.saveEnvironments(message.data);
          break;

        case 'openExternal':
          if (message.url) {
            vscode.env.openExternal(vscode.Uri.parse(message.url));
          }
          break;

        case 'createRequestFromUrl':
          // Forward to sidebar to create a new request from URL
          await vscode.commands.executeCommand('hivefetch.createRequestFromUrl', message.data.url);
          break;

        case 'startOAuthFlow':
          await this.handleStartOAuthFlow(webview, message.data);
          break;

        case 'refreshOAuthToken':
          await this.handleRefreshOAuthToken(webview, message.data);
          break;

        case 'clearOAuthToken':
          webview.postMessage({ type: 'oauthTokenReceived', data: null });
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
          await this.secretStorageService.store(
            message.data.envId, message.data.key, message.data.value
          );
          break;

        case 'getSecret': {
          const secretValue = await this.secretStorageService.get(
            message.data.envId, message.data.key
          );
          webview.postMessage({
            type: 'secretValue',
            data: { envId: message.data.envId, key: message.data.key, value: secretValue || '' },
          });
          break;
        }

        case 'deleteSecret':
          await this.secretStorageService.delete(
            message.data.envId, message.data.key
          );
          break;
      }
    });
  }

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
      filters: {
        'All Files': ['*']
      }
    });

    if (uri) {
      const buffer = Buffer.from(data.content, 'utf8');
      await vscode.workspace.fs.writeFile(uri, buffer);
      vscode.window.showInformationMessage(`Response saved to ${uri.fsPath}`);
    }
  }

  private broadcastSettings(): void {
    const config = vscode.workspace.getConfiguration('hivefetch');
    const autoCorrectUrls = config.get<boolean>('autoCorrectUrls', false);
    const shortcuts = config.get<Record<string, string>>('shortcuts', {});
    const minimap = config.get<string>('minimap', 'auto');
    const data = { autoCorrectUrls, shortcuts, minimap };
    for (const [, info] of this.panels) {
      info.panel.webview.postMessage({ type: 'loadSettings', data });
    }
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

  private async handleSendRequest(webview: vscode.Webview, panelId: string, requestData: any): Promise<void> {
    const panelInfo = this.panels.get(panelId);

    // Cancel any existing request for this panel
    if (panelInfo?.abortController) {
      panelInfo.abortController.abort();
    }

    // Create new abort controller for this request
    const abortController = new AbortController();
    if (panelInfo) {
      panelInfo.abortController = abortController;
    }

    const timeline: TimelineEvent[] = [];
    const startTime = Date.now();

    try {

      // Build headers from array format
      const headers: Record<string, string> = {};
      if (requestData.headers && Array.isArray(requestData.headers)) {
        for (const h of requestData.headers) {
          if (h.enabled && h.key) {
            headers[h.key] = h.value;
          }
        }
      } else if (requestData.headers) {
        Object.assign(headers, requestData.headers);
      }

      // Build params from array format
      const params: Record<string, string> = {};
      if (requestData.params && Array.isArray(requestData.params)) {
        for (const p of requestData.params) {
          if (p.enabled && p.key) {
            params[p.key] = p.value;
          }
        }
      } else if (requestData.params) {
        Object.assign(params, requestData.params);
      }

      const config: any = {
        method: requestData.method || 'GET',
        url: requestData.url,
        headers,
        params,
        timeout: 30000,
        signal: abortController.signal,
      };

      if (
        requestData.body &&
        requestData.body.type !== 'none' &&
        ['POST', 'PUT', 'PATCH'].includes(config.method.toUpperCase())
      ) {
        if (requestData.body.type === 'json' && requestData.body.content) {
          try {
            config.data = JSON.parse(requestData.body.content);
            headers['Content-Type'] = headers['Content-Type'] || 'application/json';
          } catch {
            // Send raw content but set content-type to text since JSON parsing failed
            config.data = requestData.body.content;
            headers['Content-Type'] = headers['Content-Type'] || 'text/plain';
          }
        } else if (requestData.body.type === 'text' && requestData.body.content) {
          config.data = requestData.body.content;
          headers['Content-Type'] = headers['Content-Type'] || 'text/plain';
        } else if (requestData.body.type === 'x-www-form-urlencoded' && requestData.body.content) {
          try {
            const formItems = JSON.parse(requestData.body.content);
            const formData = new URLSearchParams();
            for (const item of formItems) {
              if (item.enabled && item.key) {
                formData.append(item.key, item.value || '');
              }
            }
            config.data = formData.toString();
            headers['Content-Type'] = headers['Content-Type'] || 'application/x-www-form-urlencoded';
          } catch {
            webview.postMessage({
              type: 'requestResponse',
              data: {
                status: 0, statusText: 'Validation Error', headers: {}, data: '', duration: 0, size: 0, error: true,
                errorInfo: { category: 'validation', message: 'Invalid form data format', suggestion: 'The form data could not be parsed. Please check the format of your form fields.' },
              },
            });
            return;
          }
        } else if (requestData.body.type === 'form-data' && requestData.body.content) {
          try {
            const formItems = JSON.parse(requestData.body.content);
            const hasFileFields = formItems.some((item: any) => item.fieldType === 'file');

            if (hasFileFields) {
              // Use form-data package style: build multipart with file streams
              const FormData = (await import('form-data')).default;
              const formData = new FormData();
              for (const item of formItems) {
                if (!item.enabled || !item.key) continue;
                if (item.fieldType === 'file' && item.value) {
                  if (this.fileService.fileExists(item.value)) {
                    formData.append(item.key, this.fileService.createReadStream(item.value), {
                      filename: item.fileName || undefined,
                      contentType: item.fileMimeType || undefined,
                    });
                  }
                } else {
                  formData.append(item.key, item.value || '');
                }
              }
              config.data = formData;
              config.formData = formData;
              // form-data package sets its own Content-Type with boundary
              Object.assign(headers, formData.getHeaders());
            } else {
              const formData: Record<string, string> = {};
              for (const item of formItems) {
                if (item.enabled && item.key) {
                  formData[item.key] = item.value || '';
                }
              }
              config.data = formData;
              headers['Content-Type'] = headers['Content-Type'] || 'multipart/form-data';
            }
          } catch {
            webview.postMessage({
              type: 'requestResponse',
              data: {
                status: 0, statusText: 'Validation Error', headers: {}, data: '', duration: 0, size: 0, error: true,
                errorInfo: { category: 'validation', message: 'Invalid form data format', suggestion: 'The form data could not be parsed. Please check the format of your form fields.' },
              },
            });
            return;
          }
        } else if (requestData.body.type === 'graphql' && requestData.body.content) {
          const payload: Record<string, any> = { query: requestData.body.content };
          if (requestData.body.graphqlVariables) {
            try { payload.variables = JSON.parse(requestData.body.graphqlVariables); } catch {}
          }
          if (requestData.body.graphqlOperationName) {
            payload.operationName = requestData.body.graphqlOperationName;
          }
          config.data = payload;
          headers['Content-Type'] = headers['Content-Type'] || 'application/json';
        } else if (requestData.body.type === 'binary' && requestData.body.content) {
          // Binary file upload
          const filePath = requestData.body.content;
          if (this.fileService.fileExists(filePath)) {
            config.data = this.fileService.readFileAsBuffer(filePath);
            headers['Content-Type'] = headers['Content-Type'] || requestData.body.fileMimeType || 'application/octet-stream';
          } else {
            webview.postMessage({
              type: 'requestResponse',
              data: {
                status: 0, statusText: 'File Not Found', headers: {}, data: `File not found: ${filePath}`, duration: 0, size: 0, error: true,
                errorInfo: { category: 'validation', message: 'File not found', suggestion: 'The selected file no longer exists. Please select a new file.' },
              },
            });
            return;
          }
        } else if (requestData.body.content) {
          config.data = requestData.body.content;
        }
      }

      if (requestData.auth) {
        if (requestData.auth.type === 'oauth2' && requestData.auth.oauthToken) {
          // OAuth2 token passed from webview
          headers['Authorization'] = `Bearer ${requestData.auth.oauthToken}`;
        } else if (requestData.auth.type === 'bearer' && requestData.auth.token) {
          headers['Authorization'] = `Bearer ${requestData.auth.token}`;
        } else if (
          requestData.auth.type === 'basic' &&
          requestData.auth.username
        ) {
          config.auth = {
            username: requestData.auth.username,
            password: requestData.auth.password || '',
          };
        } else if (
          requestData.auth.type === 'apikey' &&
          requestData.auth.apiKeyName &&
          requestData.auth.apiKeyValue
        ) {
          if (requestData.auth.apiKeyIn === 'query') {
            params[requestData.auth.apiKeyName] = requestData.auth.apiKeyValue;
            config.params = params;
          } else {
            headers[requestData.auth.apiKeyName] = requestData.auth.apiKeyValue;
          }
        } else if (
          requestData.auth.type === 'aws' &&
          requestData.auth.awsAccessKey &&
          requestData.auth.awsSecretKey
        ) {
          const bodyStr = typeof config.data === 'string' ? config.data
            : config.data ? JSON.stringify(config.data) : '';
          const awsHeaders = this.awsSignatureService.sign(
            { method: config.method, url: config.url, headers: { ...headers }, body: bodyStr },
            {
              accessKey: requestData.auth.awsAccessKey,
              secretKey: requestData.auth.awsSecretKey,
              region: requestData.auth.awsRegion || 'us-east-1',
              service: requestData.auth.awsService || 's3',
              sessionToken: requestData.auth.awsSessionToken || undefined,
            }
          );
          Object.assign(headers, awsHeaders);
        }
      }

      config.headers = headers;

      // --- Pre-request script execution ---
      await this.runPreRequestScripts(webview, panelId, panelInfo, requestData, config, headers);

      // Warn if sending credentials over unencrypted HTTP
      if (
        config.url?.startsWith('http://') &&
        !config.url.includes('localhost') &&
        !config.url.includes('127.0.0.1') &&
        (headers['Authorization'] || config.auth || requestData.auth?.type === 'apikey')
      ) {
        webview.postMessage({
          type: 'securityWarning',
          data: { message: 'Sending credentials over unencrypted HTTP connection' },
        });
      }

      // Auto-inject cookies from cookie jar
      const cookieHeader = await this.cookieJarService.buildCookieHeader(config.url);
      if (cookieHeader && !headers['Cookie'] && !headers['cookie']) {
        headers['Cookie'] = cookieHeader;
      }

      // Build pre-request timeline events
      const now = () => Date.now();
      timeline.push({ category: 'config', text: `redirects = ${config.maxRedirects !== 0}`, timestamp: now() });
      timeline.push({ category: 'config', text: `timeout = ${config.timeout || 'Infinity'}`, timestamp: now() });

      // Request line
      let pathname = config.url || '';
      try {
        const urlObj = new URL(config.url!);
        pathname = urlObj.pathname + urlObj.search;
      } catch { /* keep full url */ }
      timeline.push({ category: 'request', text: `${(config.method || 'GET').toUpperCase()} ${pathname}`, timestamp: now() });

      // Request headers
      for (const [key, value] of Object.entries(config.headers || {})) {
        if (value !== undefined && value !== null) {
          timeline.push({ category: 'request', text: `${key}: ${value}`, timestamp: now() });
        }
      }

      timeline.push({ category: 'info', text: 'Sending request to server', timestamp: now() });

      // Execute with HTTP/2 support (falls back to HTTP/1.1 automatically)
      const result = await executeRequest({
        method: config.method,
        url: config.url,
        headers: config.headers,
        params: config.params,
        data: config.data,
        timeout: config.timeout,
        signal: abortController.signal,
        auth: config.auth,
      });

      const duration = Date.now() - startTime;
      const size = this.calculateSize(result.data);
      const timing = result.timing;
      // Override total with wall-clock duration for consistency
      timing.total = duration;

      // Store Set-Cookie headers in cookie jar
      this.cookieJarService.storeFromResponse(result.headers, config.url).catch(() => {});

      // Merge network-level timeline events from HttpClient
      timeline.push(...result.timeline);

      // Response status line
      const httpVersion = `HTTP/${result.httpVersion}`;
      timeline.push({ category: 'response', text: `${httpVersion} ${result.status} ${result.statusText}`, timestamp: now() });

      // Response headers
      for (const [key, value] of Object.entries(result.headers || {})) {
        if (value !== undefined && value !== null) {
          timeline.push({ category: 'response', text: `${key}: ${value}`, timestamp: now() });
        }
      }

      // Data received
      timeline.push({ category: 'data', text: `${this.formatBytes(size)} chunk received`, timestamp: now() });

      // Detect content category for binary/image/html previews
      const rawContentType = (result.headers['content-type'] || '') as string;
      const contentCategory = this.categorizeContentType(rawContentType);

      const responseData: any = {
        status: result.status,
        statusText: result.statusText,
        headers: result.headers,
        data: contentCategory === 'image'
          ? Buffer.from(result.data).toString('base64')
          : result.data,
        duration,
        size,
        timing,
        contentCategory,
        timeline,
      };

      // Evaluate assertions if present
      if (requestData.assertions && requestData.assertions.length > 0) {
        const assertionResponse = {
          status: result.status,
          statusText: result.statusText,
          headers: result.headers as Record<string, string>,
          data: result.data,
          duration,
        };
        const { results: assertionResults, variablesToSet } = evaluateAssertions(requestData.assertions, assertionResponse);
        responseData.assertionResults = assertionResults;

        // Handle setVariable results
        if (variablesToSet.length > 0) {
          webview.postMessage({
            type: 'setVariables',
            data: variablesToSet,
          });
        }
      }

      // --- Post-response script execution ---
      await this.runPostResponseScripts(webview, panelId, panelInfo, requestData, config, result, duration);

      // Resolve auth inheritance if needed
      if (requestData.authInheritance === 'inherit' && panelInfo?.collectionId) {
        const collections = this.sidebarProvider.getCollections();
        const collection = collections.find(c => c.id === panelInfo.collectionId);
        if (collection) {
          const resolved = resolveRequestWithInheritance(collection, requestData.id || '');
          if (resolved?.inheritedFrom) {
            responseData.inheritedAuthFrom = resolved.inheritedFrom;
          }
        }
      }

      // Send response to webview
      webview.postMessage({
        type: 'requestResponse',
        data: responseData,
      });

      // Send response context for request chaining
      webview.postMessage({
        type: 'storeResponseContext',
        data: {
          requestId: requestData.id || this.generateId(),
          requestName: requestData.name || undefined,
          response: responseData,
        },
      });

      // Only add to Recent for unsaved requests or requests already in Recent
      const panelCollectionId = panelInfo?.collectionId;
      if (!panelCollectionId || panelCollectionId === '__recent__') {
        await this.sidebarProvider.addToRecentCollection(
          {
            method: requestData.method,
            url: requestData.url,
            params: requestData.params || [],
            headers: requestData.headers || [],
            auth: requestData.auth || { type: 'none' },
            body: requestData.body || { type: 'none', content: '' },
            connectionMode: panelInfo?.connectionMode as ConnectionMode | undefined,
          },
          {
            status: result.status,
            duration,
            size,
          }
        );
      } else if (panelInfo?.requestId) {
        // Update saved request's response metadata
        await this.sidebarProvider.updateRequestResponse(
          panelInfo.requestId,
          panelCollectionId,
          result.status,
          duration
        );
      }
    } catch (error) {
      // Check if request was cancelled
      if ((error as Error).name === 'AbortError') {
        webview.postMessage({
          type: 'requestCancelled',
        });
        return;
      }

      const duration = Date.now() - startTime;

      const errorMessage = (error as Error).message || '';
      const errorData: any = {
        status: 0,
        statusText: 'Error',
        headers: {},
        data: errorMessage,
        duration,
        size: 0,
        error: true,
        errorInfo: this.categorizeError(errorMessage),
        timeline,
      };

      webview.postMessage({
        type: 'requestResponse',
        data: errorData,
      });

      // Update saved request's response metadata (even for errors)
      if (panelInfo?.requestId && panelInfo?.collectionId && panelInfo.collectionId !== '__recent__') {
        await this.sidebarProvider.updateRequestResponse(
          panelInfo.requestId,
          panelInfo.collectionId,
          0,
          duration
        );
      }
    } finally {
      // Clean up abort controller only if it's still the one we created for this request
      const info = this.panels.get(panelId);
      if (info && info.abortController === abortController) {
        info.abortController = null;
      }
    }
  }

  private handleCancelRequest(panelId: string): void {
    const panelInfo = this.panels.get(panelId);
    if (panelInfo?.abortController) {
      panelInfo.abortController.abort();
      panelInfo.abortController = null;
    }
  }

  private async handleSaveToCollection(data: {
    collectionId: string;
    request: Omit<SavedRequest, 'id' | 'createdAt' | 'updatedAt'>;
  }): Promise<void> {
    try {
      await this.sidebarProvider.addRequest(data.collectionId, data.request);
      vscode.window.showInformationMessage('Request saved to collection');
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to save request: ${(error as Error).message}`
      );
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
        method,
        url,
        params: req.params || [],
        headers: req.headers || [],
        auth: req.auth || { type: 'none' },
        body: req.body || { type: 'none', content: '' },
        assertions: req.assertions,
        authInheritance: req.authInheritance,
        scripts: req.scripts,
      };

      const newRequest = await this.sidebarProvider.addRequest(data.collectionId, requestData, data.folderId);

      // Remove from Recent since it's now saved to a real collection
      await this.sidebarProvider.removeFromRecentCollection(url, method);

      // Update panel identity
      panelInfo.requestId = newRequest.id;
      panelInfo.collectionId = data.collectionId;
      const collectionName = this.getCollectionName(data.collectionId);
      panelInfo.collectionName = collectionName;
      panelInfo.requestName = newRequest.name;
      panelInfo.isDirty = false;
      panelInfo.panel.title = collectionName ? `${collectionName} / ${newRequest.name}` : newRequest.name;

      // Remove draft
      this.draftService.remove(panelId);

      // Notify webview of the link
      webview.postMessage({
        type: 'requestLinkedToCollection',
        data: {
          requestId: newRequest.id,
          collectionId: data.collectionId,
          collectionName,
        },
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

      // Immediately update the request with actual data from the webview
      if (data.request) {
        const collections = this.sidebarProvider.getCollections();
        const collection = collections.find(c => c.id === collectionId);
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

      // Remove from Recent since it's now saved to a real collection
      await this.sidebarProvider.removeFromRecentCollection(
        data.request?.url || '', data.request?.method || 'GET'
      );

      // Update panel identity
      panelInfo.requestId = newRequest.id;
      panelInfo.collectionId = collectionId;
      panelInfo.collectionName = data.name;
      const derivedName = data.request?.url
        ? this.deriveRequestName(data.request.method || newRequest.method, data.request.url)
        : newRequest.name;
      panelInfo.requestName = derivedName;
      panelInfo.isDirty = false;
      panelInfo.panel.title = `${data.name} / ${derivedName}`;

      // Remove draft
      this.draftService.remove(panelId);

      // Notify webview of the link
      webview.postMessage({
        type: 'requestLinkedToCollection',
        data: {
          requestId: newRequest.id,
          collectionId,
          collectionName: data.name,
        },
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
      // Collection request — derive name from method + URL path
      if (panelInfo && request.url) {
        panelInfo.requestName = this.deriveRequestName(request.method, request.url);
      }

      // Mark dirty and update title
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
      // New/unsaved request — update title to show method + pathname
      if (panelInfo && request.url) {
        const pathname = this.extractPathname(request.url);
        panelInfo.panel.title = `* ${request.method} ${pathname}`;
      }
      this.draftService.upsert(panelId, requestId, collectionId, request);
    }
  }

  private autoSaveCollectionRequest(requestId: string, collectionId: string, requestData: SavedRequest, panelId?: string): void {
    // Debounce collection saves per-panel (2s)
    const panelInfo = panelId ? this.panels.get(panelId) : undefined;
    if (panelInfo?.saveTimer) clearTimeout(panelInfo.saveTimer);
    const timer = setTimeout(async () => {
      try {
        const collections = this.sidebarProvider.getCollections();
        const collection = collections.find(c => c.id === collectionId);
        if (!collection) return;

        const updated = this.updateRequestInItems(collection.items, requestId, requestData);
        if (updated) {
          collection.updatedAt = new Date().toISOString();
          await this.storageService.saveCollections(collections);
          this.sidebarProvider.notifyCollectionsUpdated();

          // Clear dirty flag and restore clean title
          if (panelId) {
            const panelInfo = this.panels.get(panelId);
            if (panelInfo && panelInfo.isDirty) {
              panelInfo.isDirty = false;
              const collName = panelInfo.collectionName || this.getCollectionName(collectionId);
              const reqName = panelInfo.requestName || 'Request';
              panelInfo.panel.title = collName ? `${collName} / ${reqName}` : reqName;
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
        // Auto-derive name from method + URL path
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

  /**
   * Load drafts from disk (call during activation)
   */
  public async loadDrafts(): Promise<void> {
    await this.draftService.load();
  }

  /**
   * Restore all saved drafts as panels (call on startup)
   */
  public restoreDrafts(): void {
    const drafts = this.draftService.getAll();
    for (const draft of drafts) {
      this.openDraft(draft);
    }
  }

  /**
   * Open a panel from a saved draft
   */
  private openDraft(draft: import('../services/types').DraftEntry): void {
    const { id: draftPanelId, request, requestId, collectionId } = draft;
    const title = request.url
      ? `${request.method} ${request.url}`
      : 'New Request';

    const { panelId, panel } = this.createPanel(title, {
      viewColumn: vscode.ViewColumn.Active,
    });

    this.panels.set(panelId, {
      panel,
      requestId: requestId,
      collectionId: collectionId,
      abortController: null,
    });

    // Remove old draft entry, new panelId will get a new draft on next edit
    this.draftService.remove(draftPanelId);

    this.setupMessageHandler(panelId, request);
  }

  /**
   * Flush pending draft writes (call on deactivation)
   */
  public async flushDrafts(): Promise<void> {
    await this.draftService.flush();
  }

  /**
   * Dispose all resources (call on deactivation)
   */
  public dispose(): void {
    this.oauthService.dispose();
    for (const [panelId, panelInfo] of this.panels) {
      if (panelInfo.saveTimer) clearTimeout(panelInfo.saveTimer);
      panelInfo.abortController?.abort();
      panelInfo.wsService?.disconnect();
      panelInfo.sseService?.disconnect();
      panelInfo.messageDisposable?.dispose();
    }
    this.panels.clear();
  }

  private async handleStartOAuthFlow(webview: vscode.Webview, config: OAuth2Config): Promise<void> {
    try {
      if (config.grantType === 'client_credentials') {
        const token = await this.oauthService.clientCredentialsFlow(config);
        webview.postMessage({ type: 'oauthTokenReceived', data: token });
      } else if (config.grantType === 'password') {
        const token = await this.oauthService.passwordFlow(config);
        webview.postMessage({ type: 'oauthTokenReceived', data: token });
      } else {
        // Authorization Code or Implicit — opens browser
        const authUrl = await this.oauthService.startAuthorizationCodeFlow(
          config,
          (token) => webview.postMessage({ type: 'oauthTokenReceived', data: token }),
          (error) => webview.postMessage({ type: 'oauthFlowError', data: { message: error } })
        );
        vscode.env.openExternal(vscode.Uri.parse(authUrl));
      }
    } catch (error: any) {
      webview.postMessage({ type: 'oauthFlowError', data: { message: error.message } });
    }
  }

  private async handleRefreshOAuthToken(webview: vscode.Webview, data: {
    tokenUrl: string; clientId: string; clientSecret?: string; refreshToken: string;
  }): Promise<void> {
    try {
      const token = await this.oauthService.refreshToken(data.tokenUrl, data.clientId, data.clientSecret, data.refreshToken);
      webview.postMessage({ type: 'oauthTokenReceived', data: token });
    } catch (error: any) {
      webview.postMessage({ type: 'oauthFlowError', data: { message: error.message } });
    }
  }

  private async handleSelectFile(webview: vscode.Webview, data?: { fieldId?: string }): Promise<void> {
    const fileInfo = await this.fileService.selectFile();
    if (fileInfo) {
      webview.postMessage({
        type: 'fileSelected',
        data: { fieldId: data?.fieldId, ...fileInfo },
      });
    }
  }

  // --- Script execution helpers ---

  private async getEnvData(): Promise<{ variables: Record<string, string>; globals: Record<string, string> }> {
    const envData = await this.storageService.loadEnvironments();
    const variables: Record<string, string> = {};
    const globals: Record<string, string> = {};
    const activeEnv = envData.environments.find(e => e.id === envData.activeId);
    if (activeEnv) {
      const resolved = await this.secretStorageService.resolveSecrets(activeEnv.id, activeEnv.variables);
      for (const v of resolved) {
        if (v.enabled) variables[v.key] = v.value;
      }
    }
    if (envData.globalVariables) {
      const resolvedGlobals = await this.secretStorageService.resolveSecrets('__global__', envData.globalVariables);
      for (const v of resolvedGlobals) {
        if (v.enabled) globals[v.key] = v.value;
      }
    }
    return { variables, globals };
  }

  private collectScriptSources(
    panelInfo: PanelInfo | undefined,
    requestData: any,
    phase: 'pre' | 'post'
  ): { source: string; level: string }[] {
    const sources: { source: string; level: string }[] = [];

    // Collect inherited scripts from collection/folder chain
    if (panelInfo?.collectionId) {
      const collections = this.sidebarProvider.getCollections();
      const collection = collections.find(c => c.id === panelInfo.collectionId);
      if (collection && requestData.id) {
        const resolved = resolveScriptsForRequest(collection, requestData.id);
        const chain = phase === 'pre' ? resolved.preRequestScripts : resolved.postResponseScripts;
        sources.push(...chain);
      }
    }

    // Add request-level scripts
    const scripts = requestData.scripts;
    if (scripts) {
      const src = phase === 'pre' ? scripts.preRequest : scripts.postResponse;
      if (src?.trim()) {
        sources.push({ source: src, level: 'request' });
      }
    }

    return sources;
  }

  private async runPreRequestScripts(
    webview: vscode.Webview,
    panelId: string,
    panelInfo: PanelInfo | undefined,
    requestData: any,
    config: any,
    headers: Record<string, string>
  ): Promise<void> {
    const scripts = this.collectScriptSources(panelInfo, requestData, 'pre');
    if (scripts.length === 0) return;

    const envData = await this.getEnvData();
    const requestContext = {
      url: config.url,
      method: config.method,
      headers: { ...headers },
      body: config.data,
    };

    for (const { source, level } of scripts) {
      const result = this.scriptEngine.executePreRequestScript(source, requestContext, envData);

      webview.postMessage({
        type: 'scriptOutput',
        data: { phase: 'preRequest', result },
      });

      // Apply modifications from pre-request script
      if (result.modifiedRequest) {
        if (result.modifiedRequest.url) config.url = result.modifiedRequest.url;
        if (result.modifiedRequest.method) config.method = result.modifiedRequest.method;
        if (result.modifiedRequest.headers) {
          Object.assign(headers, result.modifiedRequest.headers);
          config.headers = headers;
        }
        if (result.modifiedRequest.body !== undefined) config.data = result.modifiedRequest.body;
      }

      // Handle variable setting
      if (result.variablesToSet.length > 0) {
        webview.postMessage({
          type: 'setVariables',
          data: result.variablesToSet,
        });
      }

      if (!result.success) break;
    }
  }

  private async runPostResponseScripts(
    webview: vscode.Webview,
    panelId: string,
    panelInfo: PanelInfo | undefined,
    requestData: any,
    config: any,
    result: any,
    duration: number
  ): Promise<void> {
    const scripts = this.collectScriptSources(panelInfo, requestData, 'post');
    if (scripts.length === 0) return;

    const envData = await this.getEnvData();
    const requestContext = {
      url: config.url,
      method: config.method,
      headers: config.headers || {},
      body: config.data,
    };
    const responseContext = {
      status: result.status,
      statusText: result.statusText,
      headers: result.headers as Record<string, string>,
      body: result.data,
      duration,
    };

    for (const { source, level } of scripts) {
      const scriptResult = this.scriptEngine.executePostResponseScript(
        source,
        requestContext,
        responseContext,
        envData
      );

      webview.postMessage({
        type: 'scriptOutput',
        data: { phase: 'postResponse', result: scriptResult },
      });

      // Handle variable setting
      if (scriptResult.variablesToSet.length > 0) {
        webview.postMessage({
          type: 'setVariables',
          data: scriptResult.variablesToSet,
        });
      }

      if (!scriptResult.success) break;
    }
  }

  // --- WebSocket handlers ---

  private async handleWsConnect(webview: vscode.Webview, panelId: string, data: any): Promise<void> {
    const panelInfo = this.panels.get(panelId);
    if (!panelInfo) return;

    // Disconnect existing connection
    panelInfo.wsService?.disconnect();

    const wsService = new WebSocketService();
    panelInfo.wsService = wsService;

    wsService.onStatusChange = (status, error) => {
      webview.postMessage({
        type: 'wsStatus',
        data: { status, error },
      });
    };

    wsService.onMessage = (msg) => {
      webview.postMessage({
        type: 'wsMessage',
        data: msg,
      });
    };

    await wsService.connect({
      url: data.url,
      protocols: data.protocols,
      headers: data.headers || [],
      autoReconnect: data.autoReconnect || false,
      reconnectIntervalMs: data.reconnectIntervalMs || 3000,
    });
  }

  private handleWsSend(panelId: string, data: any): void {
    const panelInfo = this.panels.get(panelId);
    panelInfo?.wsService?.send(data.message, data.type || 'text');
  }

  private handleWsDisconnect(panelId: string): void {
    const panelInfo = this.panels.get(panelId);
    panelInfo?.wsService?.disconnect();
  }

  // --- SSE handlers ---

  private handleSseConnect(webview: vscode.Webview, panelId: string, data: any): void {
    const panelInfo = this.panels.get(panelId);
    if (!panelInfo) return;

    // Disconnect existing connection
    panelInfo.sseService?.disconnect();

    const sseService = new SSEService();
    panelInfo.sseService = sseService;

    sseService.onStatusChange = (status, error) => {
      webview.postMessage({
        type: 'sseStatus',
        data: { status, error },
      });
    };

    sseService.onEvent = (event) => {
      webview.postMessage({
        type: 'sseEvent',
        data: event,
      });
    };

    sseService.connect({
      url: data.url,
      headers: data.headers || [],
      autoReconnect: data.autoReconnect || false,
      withCredentials: data.withCredentials || false,
    });
  }

  private handleSseDisconnect(panelId: string): void {
    const panelInfo = this.panels.get(panelId);
    panelInfo?.sseService?.disconnect();
  }

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

  private async handleOpenInNewTab(data: { content: string; language: string }): Promise<void> {
    const doc = await vscode.workspace.openTextDocument({
      content: data.content,
      language: data.language,
    });
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
  }

  private handleOpenHtmlViewer(data: { content: string }): void {
    const panel = vscode.window.createWebviewPanel(
      'hivefetch.htmlViewer',
      'HTML Response',
      vscode.ViewColumn.Beside,
      { enableScripts: false },
    );
    panel.webview.html = data.content;
  }

  private categorizeContentType(contentType: string): string {
    const ct = contentType.toLowerCase();
    if (ct.includes('application/json') || ct.includes('+json')) return 'json';
    if (ct.includes('image/')) return 'image';
    if (ct.includes('text/html')) return 'html';
    if (ct.includes('application/pdf')) return 'pdf';
    if (ct.includes('text/xml') || ct.includes('application/xml') || ct.includes('+xml')) return 'xml';
    if (ct.includes('text/')) return 'text';
    if (ct.includes('application/octet-stream')) return 'binary';
    return 'text';
  }

  private calculateSize(data: any): number {
    if (typeof data === 'string') {
      return Buffer.byteLength(data, 'utf8');
    }
    return Buffer.byteLength(JSON.stringify(data), 'utf8');
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) { return `${bytes} B`; }
    if (bytes < 1024 * 1024) { return `${(bytes / 1024).toFixed(1)} KB`; }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private categorizeError(errorMessage: string, statusCode?: number): {
    category: string;
    message: string;
    suggestion: string;
  } {
    const lowerMessage = errorMessage.toLowerCase();

    if (lowerMessage.includes('timeout') || lowerMessage.includes('etimedout') || lowerMessage.includes('timed out')) {
      return {
        category: 'timeout',
        message: 'Request timed out',
        suggestion: 'The server took too long to respond. Try increasing the timeout or check if the server is under heavy load.',
      };
    }

    if (lowerMessage.includes('enotfound') || lowerMessage.includes('getaddrinfo') || lowerMessage.includes('dns')) {
      return {
        category: 'dns',
        message: 'Could not resolve hostname',
        suggestion: 'Check if the URL is correct. The domain name could not be resolved to an IP address.',
      };
    }

    if (lowerMessage.includes('ssl') || lowerMessage.includes('certificate') || lowerMessage.includes('cert') ||
        lowerMessage.includes('self signed') || lowerMessage.includes('unable to verify')) {
      return {
        category: 'ssl',
        message: 'SSL/TLS certificate error',
        suggestion: 'The server has an invalid or self-signed certificate. For development, you may need to configure certificate trust.',
      };
    }

    if (lowerMessage.includes('econnrefused') || lowerMessage.includes('connection refused')) {
      return {
        category: 'connection',
        message: 'Connection refused',
        suggestion: 'The server is not accepting connections. Check if the server is running and listening on the correct port.',
      };
    }

    if (lowerMessage.includes('econnreset') || lowerMessage.includes('connection reset')) {
      return {
        category: 'connection',
        message: 'Connection was reset',
        suggestion: 'The connection was unexpectedly closed by the server. This might be a firewall issue or server crash.',
      };
    }

    if (lowerMessage.includes('enetunreach') || lowerMessage.includes('network unreachable')) {
      return {
        category: 'network',
        message: 'Network unreachable',
        suggestion: 'Check your internet connection. The target network cannot be reached.',
      };
    }

    if (lowerMessage.includes('network') || lowerMessage.includes('socket') || lowerMessage.includes('epipe')) {
      return {
        category: 'network',
        message: 'Network error',
        suggestion: 'A network error occurred. Check your internet connection and firewall settings.',
      };
    }

    if (statusCode && statusCode >= 500) {
      return {
        category: 'server',
        message: `Server error (${statusCode})`,
        suggestion: 'The server encountered an error. This is typically a server-side issue that needs to be fixed by the API provider.',
      };
    }

    return {
      category: 'unknown',
      message: errorMessage || 'An unknown error occurred',
      suggestion: 'An unexpected error occurred. Check the error details for more information.',
    };
  }

  private getCollectionName(collectionId: string): string {
    const collections = this.sidebarProvider.getCollections();
    const collection = collections.find(c => c.id === collectionId);
    return collection?.name || '';
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
      // If URL is incomplete, try to extract path portion
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
    const distPath = vscode.Uri.joinPath(
      this.context.extensionUri,
      'webview-dist'
    );

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(distPath, 'bundle.js')
    );
    const themeUri = webview.asWebviewUri(
      vscode.Uri.joinPath(distPath, 'theme.css')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(distPath, 'bundle.css')
    );
    const keyValueEditorStyleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(distPath, 'KeyValueEditor.css')
    );
    const scriptEditorStyleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(distPath, 'ScriptEditor.css')
    );
    const tooltipStyleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(distPath, 'Tooltip.css')
    );

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
    let text = '';
    const possible =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
