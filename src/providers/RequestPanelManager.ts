import * as vscode from 'vscode';
import axios, { AxiosResponse, AxiosError } from 'axios';
import { SidebarViewProvider } from './SidebarViewProvider';
import { StorageService } from '../services/StorageService';
import { createTimedRequest, type TimelineEvent } from '../services/TimingInterceptor';
import type { SavedRequest, HistoryEntry, EnvironmentsData } from '../services/types';

interface PanelInfo {
  panel: vscode.WebviewPanel;
  requestId: string | null;
  abortController: AbortController | null;
  messageDisposable?: vscode.Disposable;
  url?: string;
  method?: string;
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

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly sidebarProvider: SidebarViewProvider
  ) {
    this.storageService = new StorageService(vscode.workspace.workspaceFolders?.[0]);
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

  /**
   * Open a new empty request panel
   */
  public openNewRequest(options?: OpenPanelOptions): void {
    const request = this.getDefaultRequest();
    const { panelId, panel } = this.createPanel('New Request', options);

    this.panels.set(panelId, {
      panel,
      requestId: null,
      abortController: null,
    });

    this.setupMessageHandler(panelId, request);
  }

  /**
   * Open a saved request from a collection
   */
  public openSavedRequest(request: SavedRequest, collectionId: string, options?: OpenPanelOptions): void {
    // Check if this request is already open
    const existingPanelId = this.findPanelByRequestId(request.id);
    if (existingPanelId) {
      const panelInfo = this.panels.get(existingPanelId);
      if (panelInfo) {
        panelInfo.panel.reveal();
        return;
      }
    }

    const title = request.name || `${request.method} Request`;
    const { panelId, panel } = this.createPanel(title, options);

    this.panels.set(panelId, {
      panel,
      requestId: request.id,
      abortController: null,
    });

    this.setupMessageHandler(panelId, request, options?.autoRun);
  }

  /**
   * Open a history entry
   */
  public openHistoryEntry(entry: HistoryEntry, options?: OpenPanelOptions): void {
    // Check if a panel with the same URL and method is already open
    const existingPanelId = this.findPanelByUrlAndMethod(entry.url, entry.method);
    if (existingPanelId) {
      const panelInfo = this.panels.get(existingPanelId);
      if (panelInfo) {
        panelInfo.panel.reveal();
        return;
      }
    }

    // Convert history entry to SavedRequest format
    let pathname = entry.url;
    try {
      pathname = new URL(entry.url).pathname;
    } catch {
      // Keep the full URL if parsing fails
    }

    const request: SavedRequest = {
      id: `history-${entry.id}`,
      name: `${entry.method} ${pathname}`,
      method: entry.method,
      url: entry.url,
      params: entry.params,
      headers: entry.headers,
      auth: entry.auth,
      body: entry.body,
      createdAt: entry.timestamp,
      updatedAt: new Date().toISOString(),
    };

    const title = `${entry.method} ${pathname}`;
    const { panelId, panel } = this.createPanel(title, options);

    this.panels.set(panelId, {
      panel,
      requestId: null, // History entries don't have persistent IDs
      abortController: null,
      url: entry.url,
      method: entry.method,
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
        vscode.Uri.joinPath(this.context.extensionUri, 'src', 'webview', 'dist'),
      ],
    };

    panel.webview.html = this.getHtmlForWebview(panel.webview);

    this.panels.set(panelId, {
      panel,
      requestId: state?.requestId || null,
      abortController: null,
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
          vscode.Uri.joinPath(this.context.extensionUri, 'src', 'webview', 'dist'),
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

    const { panel } = panelInfo;
    const webview = panel.webview;

    panelInfo.messageDisposable = webview.onDidReceiveMessage(async (message) => {
      console.log('[HiveFetch] Message received:', message.type);
      switch (message.type) {
        case 'ready':
          // Send initial request data
          webview.postMessage({
            type: 'loadRequest',
            data: { ...initialRequest, autoRun },
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
          webview.postMessage({
            type: 'loadSettings',
            data: { autoCorrectUrls },
          });
          break;

        case 'sendRequest':
          await this.handleSendRequest(webview, panelId, message.data);
          break;

        case 'cancelRequest':
          this.handleCancelRequest(panelId);
          break;

        case 'saveToCollection':
          await this.handleSaveToCollection(message.data);
          break;

        case 'getCollections':
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
      }
    });
  }

  private handlePanelDispose(panelId: string): void {
    const panelInfo = this.panels.get(panelId);
    if (panelInfo?.abortController) {
      panelInfo.abortController.abort();
    }
    panelInfo?.messageDisposable?.dispose();
    this.panels.delete(panelId);

    if (this.currentPanelId === panelId) {
      this.currentPanelId = null;
    }
  }

  private async handleSendRequest(webview: vscode.Webview, panelId: string, requestData: any): Promise<void> {
    console.log('[HiveFetch] handleSendRequest called', { panelId, url: requestData?.url });
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

    let getTimings: (() => import('../services/TimingInterceptor').TimingData) | null = null;
    let getTimeline: (() => TimelineEvent[]) | null = null;
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
        validateStatus: () => true,
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
            const formData: Record<string, string> = {};
            for (const item of formItems) {
              if (item.enabled && item.key) {
                formData[item.key] = item.value || '';
              }
            }
            config.data = formData;
            headers['Content-Type'] = headers['Content-Type'] || 'multipart/form-data';
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
        } else if (requestData.body.content) {
          config.data = requestData.body.content;
        }
      }

      if (requestData.auth) {
        if (requestData.auth.type === 'bearer' && requestData.auth.token) {
          headers['Authorization'] = `Bearer ${requestData.auth.token}`;
        } else if (
          requestData.auth.type === 'basic' &&
          requestData.auth.username
        ) {
          config.auth = {
            username: requestData.auth.username,
            password: requestData.auth.password || '',
          };
        }
      }

      config.headers = headers;

      // Warn if sending credentials over unencrypted HTTP
      if (
        config.url?.startsWith('http://') &&
        !config.url.includes('localhost') &&
        !config.url.includes('127.0.0.1') &&
        (headers['Authorization'] || config.auth)
      ) {
        webview.postMessage({
          type: 'securityWarning',
          data: { message: 'Sending credentials over unencrypted HTTP connection' },
        });
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

      // Wrap with timing instrumentation
      const { config: timedConfig, getTimings: _getTimings, getTimeline: _getTimeline } = createTimedRequest(config);
      getTimings = _getTimings;
      getTimeline = _getTimeline;
      const response: AxiosResponse = await axios(timedConfig);
      const duration = Date.now() - startTime;
      const size = this.calculateSize(response.data);
      const timing = getTimings();
      // Override total with wall-clock duration for consistency
      timing.total = duration;

      // Merge network-level timeline events from interceptor
      timeline.push(...getTimeline());

      // Response status line
      const httpVersion = response.request?.res?.httpVersion ? `HTTP/${response.request.res.httpVersion}` : 'HTTP/1.1';
      timeline.push({ category: 'response', text: `${httpVersion} ${response.status} ${response.statusText}`, timestamp: now() });

      // Response headers
      for (const [key, value] of Object.entries(response.headers || {})) {
        if (value !== undefined && value !== null) {
          timeline.push({ category: 'response', text: `${key}: ${value}`, timestamp: now() });
        }
      }

      // Data received
      timeline.push({ category: 'data', text: `${this.formatBytes(size)} chunk received`, timestamp: now() });

      // Detect content category for binary/image/html previews
      const rawContentType = (response.headers['content-type'] || '') as string;
      const contentCategory = this.categorizeContentType(rawContentType);

      const responseData: any = {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: contentCategory === 'image'
          ? Buffer.from(response.data).toString('base64')
          : response.data,
        duration,
        size,
        timing,
        contentCategory,
        timeline,
      };

      // Send response to webview
      console.log('[HiveFetch] Sending response:', { status: responseData.status, duration: responseData.duration });
      webview.postMessage({
        type: 'requestResponse',
        data: responseData,
      });

      // Send response context for request chaining
      webview.postMessage({
        type: 'storeResponseContext',
        data: {
          requestId: requestData.id || this.generateId(),
          response: responseData,
        },
      });

      // Add to history
      const historyEntry: HistoryEntry = {
        id: this.generateId(),
        method: requestData.method,
        url: requestData.url,
        params: requestData.params || [],
        headers: requestData.headers || [],
        auth: requestData.auth || { type: 'none' },
        body: requestData.body || { type: 'none', content: '' },
        status: response.status,
        statusText: response.statusText,
        duration,
        size,
        timestamp: new Date().toISOString(),
      };
      await this.sidebarProvider.addHistoryEntry(historyEntry);
    } catch (error) {
      console.log('[HiveFetch] Request error caught:', {
        name: (error as Error).name,
        message: (error as Error).message,
        isCancel: axios.isCancel(error)
      });
      // Check if request was cancelled
      if (axios.isCancel(error) || (error as Error).name === 'CanceledError' || (error as Error).name === 'AbortError') {
        console.log('[HiveFetch] Request was cancelled, sending requestCancelled');
        webview.postMessage({
          type: 'requestCancelled',
        });
        return;
      }

      const duration = Date.now() - startTime;
      const timing = getTimings ? getTimings() : undefined;
      if (timing) {
        timing.total = duration;
      }

      // Merge any network events captured before the error
      if (getTimeline) {
        timeline.push(...getTimeline());
      }

      let errorData: any = {
        status: 0,
        statusText: 'Error',
        headers: {},
        data: '',
        duration,
        size: 0,
        error: true,
        errorInfo: null,
        timing,
        timeline,
      };

      let errorMessage = '';

      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        errorMessage = axiosError.message || '';
        const statusCode = axiosError.response?.status;

        errorData = {
          ...errorData,
          status: statusCode || 0,
          statusText: axiosError.response?.statusText || 'Network Error',
          headers: axiosError.response?.headers || {},
          data: axiosError.response?.data || axiosError.message,
          errorInfo: this.categorizeError(errorMessage, statusCode),
        };
      } else {
        errorMessage = (error as Error).message;
        errorData.data = errorMessage;
        errorData.statusText = 'Error';
        errorData.errorInfo = this.categorizeError(errorMessage);
      }

      webview.postMessage({
        type: 'requestResponse',
        data: errorData,
      });
    } finally {
      // Clean up abort controller only if it's still the one we created for this request
      const info = this.panels.get(panelId);
      if (info && info.abortController === abortController) {
        info.abortController = null;
      }
    }
  }

  private handleCancelRequest(panelId: string): void {
    console.log('[HiveFetch] handleCancelRequest called', { panelId });
    const panelInfo = this.panels.get(panelId);
    console.log('[HiveFetch] panelInfo:', { hasAbortController: !!panelInfo?.abortController });
    if (panelInfo?.abortController) {
      console.log('[HiveFetch] Aborting request...');
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

  private getDefaultRequest(): SavedRequest {
    return {
      id: this.generateId(),
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
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const distPath = vscode.Uri.joinPath(
      this.context.extensionUri,
      'src',
      'webview',
      'dist'
    );

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(distPath, 'bundle.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(distPath, 'bundle.css')
    );

    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src ${webview.cspSource} https: http:; img-src blob: data: ${webview.cspSource}; font-src ${webview.cspSource}; frame-src blob:;">
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
    let text = '';
    const possible =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
