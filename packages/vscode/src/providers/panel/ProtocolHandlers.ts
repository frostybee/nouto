import * as vscode from 'vscode';
import { WebSocketService, SSEService } from '@hivefetch/core/services';
import type { GraphQLSchemaService, CookieJarService } from '@hivefetch/core/services';
import type { StorageService } from '../../services/StorageService';
import type { FileService } from '../../services/FileService';
import type { PanelInfo, IPanelContext } from './PanelTypes';

export class ProtocolHandlers {
  constructor(
    private readonly ctx: IPanelContext,
    private readonly graphqlSchemaService: GraphQLSchemaService,
    private readonly cookieJarService: CookieJarService,
    private readonly storageService: StorageService,
    private readonly fileService: FileService
  ) {}

  // --- WebSocket ---

  async handleWsConnect(webview: vscode.Webview, panelId: string, data: any): Promise<void> {
    const panelInfo = this.ctx.panels.get(panelId);
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
    const headers = await this.injectCookieHeader(data.url, data.headers || []);
    await wsService.connect({
      url: data.url, protocols: data.protocols, headers,
      autoReconnect: data.autoReconnect || false, reconnectIntervalMs: data.reconnectIntervalMs || 3000,
    });
  }

  handleWsSend(panelId: string, data: any): void {
    this.ctx.panels.get(panelId)?.wsService?.send(data.message, data.type || 'text');
  }

  handleWsDisconnect(panelId: string): void {
    this.ctx.panels.get(panelId)?.wsService?.disconnect();
  }

  // --- SSE ---

  async handleSseConnect(webview: vscode.Webview, panelId: string, data: any): Promise<void> {
    const panelInfo = this.ctx.panels.get(panelId);
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
    const headers = await this.injectCookieHeader(data.url, data.headers || []);
    sseService.connect({
      url: data.url, headers,
      autoReconnect: data.autoReconnect || false, withCredentials: data.withCredentials || false,
    });
  }

  handleSseDisconnect(panelId: string): void {
    this.ctx.panels.get(panelId)?.sseService?.disconnect();
  }

  // --- GraphQL ---

  async handleIntrospectGraphQL(webview: vscode.Webview, data: { url: string; headers: any[]; auth: any }): Promise<void> {
    try {
      const schema = await this.graphqlSchemaService.introspect(data.url, data.headers || [], data.auth || { type: 'none' });
      webview.postMessage({ type: 'graphqlSchema', data: schema });
    } catch (error: any) {
      webview.postMessage({ type: 'graphqlSchemaError', data: { message: error.message } });
    }
  }

  // --- Cookie Jar ---

  async handleGetCookieJar(webview: vscode.Webview): Promise<void> {
    const cookies = await this.cookieJarService.getAllByDomain();
    webview.postMessage({ type: 'cookieJarData', data: cookies });
  }

  async handleDeleteCookie(webview: vscode.Webview, data: { name: string; domain: string; path: string }): Promise<void> {
    await this.cookieJarService.deleteCookie(data.name, data.domain, data.path);
    await this.handleGetCookieJar(webview);
  }

  async handleDeleteCookieDomain(webview: vscode.Webview, data: { domain: string }): Promise<void> {
    await this.cookieJarService.deleteDomain(data.domain);
    await this.handleGetCookieJar(webview);
  }

  async handleClearCookieJar(webview: vscode.Webview): Promise<void> {
    await this.cookieJarService.clearAll();
    await this.handleGetCookieJar(webview);
  }

  async handleGetCookieJars(webview: vscode.Webview): Promise<void> {
    const jars = await this.cookieJarService.listJars();
    const activeJarId = this.cookieJarService.getActiveJarId();
    webview.postMessage({ type: 'cookieJarsList', data: { jars, activeJarId } });
  }

  async handleCreateCookieJar(_webview: vscode.Webview, data: { name: string }): Promise<void> {
    await this.cookieJarService.createJar(data.name);
    await this.broadcastCookieJarState();
  }

  async handleRenameCookieJar(_webview: vscode.Webview, data: { id: string; name: string }): Promise<void> {
    await this.cookieJarService.renameJar(data.id, data.name);
    await this.broadcastCookieJarState();
  }

  async handleDeleteCookieJar(_webview: vscode.Webview, data: { id: string }): Promise<void> {
    await this.cookieJarService.deleteJar(data.id);
    await this.broadcastCookieJarState();
  }

  async handleSetActiveCookieJar(_webview: vscode.Webview, data: { id: string | null }): Promise<void> {
    await this.cookieJarService.setActiveJar(data.id);
    await this.broadcastCookieJarState();
  }

  async handleAddCookie(_webview: vscode.Webview, data: any): Promise<void> {
    await this.cookieJarService.addCookie({
      ...data,
      createdAt: Date.now(),
    });
    await this.broadcastCookieJarState();
  }

  async handleUpdateCookie(_webview: vscode.Webview, data: { oldName: string; oldDomain: string; oldPath: string; cookie: any }): Promise<void> {
    await this.cookieJarService.updateCookie(data.oldName, data.oldDomain, data.oldPath, {
      ...data.cookie,
      createdAt: Date.now(),
    });
    await this.broadcastCookieJarState();
  }

  /**
   * Broadcast cookie jar state to ALL request panels.
   * Called after any jar mutation so all webviews stay in sync.
   * External webviews (e.g. EnvironmentsPanelHandler) can register
   * via addExternalWebview() to also receive broadcasts.
   */
  private externalWebviews: vscode.Webview[] = [];

  addExternalWebview(webview: vscode.Webview): void {
    if (!this.externalWebviews.includes(webview)) {
      this.externalWebviews.push(webview);
    }
  }

  removeExternalWebview(webview: vscode.Webview): void {
    this.externalWebviews = this.externalWebviews.filter(w => w !== webview);
  }

  async broadcastCookieJarState(): Promise<void> {
    const jars = await this.cookieJarService.listJars();
    const activeJarId = this.cookieJarService.getActiveJarId();
    const cookies = await this.cookieJarService.getAllByDomain();
    const jarsMessage = { type: 'cookieJarsList', data: { jars, activeJarId } };
    const dataMessage = { type: 'cookieJarData', data: cookies };

    // Send to all request panels
    for (const [, info] of this.ctx.panels) {
      info.panel.webview.postMessage(jarsMessage);
      info.panel.webview.postMessage(dataMessage);
    }

    // Send to external webviews (e.g. Environments panel)
    for (const webview of this.externalWebviews) {
      webview.postMessage(jarsMessage);
      webview.postMessage(dataMessage);
    }
  }

  // --- Command Palette ---

  async handlePaletteRequestSelection(requestId: string, collectionId: string): Promise<void> {
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

  // --- File/Content handlers ---

  async handlePickSslFile(webview: vscode.Webview, data: { field: string }): Promise<void> {
    const isCert = data.field === 'cert' || data.field === 'global-cert';
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: isCert ? 'Select Certificate File' : 'Select Key File',
      filters: {
        'Certificate/Key files': ['pem', 'crt', 'cer', 'key', 'p12', 'pfx'],
        'All files': ['*'],
      },
    });
    if (uris && uris.length > 0) {
      webview.postMessage({ type: 'sslFilePicked', data: { field: data.field, path: uris[0].fsPath } });
    }
  }

  async handleSelectFile(webview: vscode.Webview, data?: { fieldId?: string }): Promise<void> {
    const fileInfo = await this.fileService.selectFile();
    if (fileInfo) {
      webview.postMessage({ type: 'fileSelected', data: { fieldId: data?.fieldId, ...fileInfo } });
    }
  }

  async handleOpenInNewTab(data: { content: string; language: string }): Promise<void> {
    const doc = await vscode.workspace.openTextDocument({ content: data.content, language: data.language });
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
  }

  async handleDownloadResponse(data: { content: string; filename: string }): Promise<void> {
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

  async handleDownloadBinaryResponse(data: { base64: string; filename: string }): Promise<void> {
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(data.filename),
      filters: { 'All Files': ['*'] }
    });
    if (uri) {
      const buffer = Buffer.from(data.base64, 'base64');
      await vscode.workspace.fs.writeFile(uri, buffer);
      vscode.window.showInformationMessage(`Response saved to ${uri.fsPath}`);
    }
  }

  async handleOpenBinaryResponse(data: { base64: string; filename: string; contentType: string }): Promise<void> {
    const os = await import('os');
    const path = await import('path');
    const tmpDir = os.tmpdir();
    const tmpPath = path.join(tmpDir, `hivefetch-${Date.now()}-${data.filename}`);
    const tmpUri = vscode.Uri.file(tmpPath);
    const buffer = Buffer.from(data.base64, 'base64');
    await vscode.workspace.fs.writeFile(tmpUri, buffer);
    await vscode.env.openExternal(tmpUri);
  }

  private static readonly SETTINGS_KEY = 'hivefetch.settings';

  private getStoredSettings(): Record<string, any> {
    return this.ctx.extensionContext.globalState.get<Record<string, any>>(ProtocolHandlers.SETTINGS_KEY) ?? {};
  }

  async handleUpdateSettings(data: {
    autoCorrectUrls: boolean;
    shortcuts: Record<string, string>;
    minimap: string;
    saveResponseBody: boolean;
    sslRejectUnauthorized: boolean;
    storageMode: string;
    globalProxy?: { enabled: boolean; protocol: string; host: string; port: number; username?: string; password?: string; noProxy?: string } | null;
    defaultTimeout?: number | null;
    defaultFollowRedirects?: boolean | null;
    defaultMaxRedirects?: number | null;
    globalClientCert?: { certPath?: string; keyPath?: string; passphrase?: string } | null;
  }): Promise<void> {
    // Storage mode: compare against the actual VS Code config, not globalState
    const currentStorageMode = this.storageService.getStorageMode();
    if (data.storageMode !== currentStorageMode) {
      await this.storageService.switchStorageMode(data.storageMode as 'global' | 'workspace');
      await this.ctx.sidebarProvider.notifyCollectionsUpdated();
    }

    await this.ctx.extensionContext.globalState.update(ProtocolHandlers.SETTINGS_KEY, data);
    this.broadcastSettings();
  }

  broadcastSettings(): void {
    const stored = this.getStoredSettings();
    const data = {
      autoCorrectUrls: (stored.autoCorrectUrls as boolean) ?? false,
      shortcuts: (stored.shortcuts as Record<string, string>) ?? {},
      minimap: (stored.minimap as string) ?? 'auto',
      saveResponseBody: (stored.saveResponseBody as boolean) ?? true,
      sslRejectUnauthorized: (stored.sslRejectUnauthorized as boolean) ?? true,
      storageMode: (stored.storageMode as string) ?? 'global',
      globalProxy: (stored.globalProxy as any) ?? null,
      defaultTimeout: (stored.defaultTimeout as number) ?? null,
      defaultFollowRedirects: (stored.defaultFollowRedirects as boolean) ?? null,
      defaultMaxRedirects: (stored.defaultMaxRedirects as number) ?? null,
      globalClientCert: (stored.globalClientCert as any) ?? null,
    };
    for (const [, info] of this.ctx.panels) {
      info.panel.webview.postMessage({ type: 'loadSettings', data });
    }
  }

  // --- Private helpers ---

  /**
   * Inject a Cookie header from the active cookie jar into a headers array,
   * only if no explicit Cookie header already exists.
   */
  private async injectCookieHeader(
    url: string,
    headers: Array<{ key: string; value: string; enabled: boolean }>
  ): Promise<Array<{ key: string; value: string; enabled: boolean }>> {
    const hasExplicitCookie = headers.some(
      (h) => h.enabled && h.key.toLowerCase() === 'cookie'
    );
    if (hasExplicitCookie) return headers;

    const cookieHeader = await this.cookieJarService.buildCookieHeader(url);
    if (!cookieHeader) return headers;

    return [...headers, { key: 'Cookie', value: cookieHeader, enabled: true }];
  }
}
