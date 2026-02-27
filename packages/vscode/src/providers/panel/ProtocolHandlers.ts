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
    await wsService.connect({
      url: data.url, protocols: data.protocols, headers: data.headers || [],
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

  handleSseConnect(webview: vscode.Webview, panelId: string, data: any): void {
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
    sseService.connect({
      url: data.url, headers: data.headers || [],
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

  async handlePickSslFile(webview: vscode.Webview, data: { field: 'cert' | 'key' }): Promise<void> {
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

  handleOpenHtmlViewer(data: { content: string }): void {
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

  async handleUpdateSettings(data: { autoCorrectUrls: boolean; shortcuts: Record<string, string>; minimap: string }): Promise<void> {
    const config = vscode.workspace.getConfiguration('hivefetch');
    await config.update('autoCorrectUrls', data.autoCorrectUrls, vscode.ConfigurationTarget.Workspace);
    await config.update('shortcuts', data.shortcuts, vscode.ConfigurationTarget.Workspace);
    await config.update('minimap', data.minimap, vscode.ConfigurationTarget.Workspace);
    this.broadcastSettings();
  }

  broadcastSettings(): void {
    const config = vscode.workspace.getConfiguration('hivefetch');
    const data = {
      autoCorrectUrls: config.get<boolean>('autoCorrectUrls', false),
      shortcuts: config.get<Record<string, string>>('shortcuts', {}),
      minimap: config.get<string>('minimap', 'auto'),
    };
    for (const [, info] of this.ctx.panels) {
      info.panel.webview.postMessage({ type: 'loadSettings', data });
    }
  }
}
