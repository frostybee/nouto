import * as vscode from 'vscode';
import { WebSocketService, SSEService, GraphQLSubscriptionService, GrpcService, WsSessionRecorder } from '@hivefetch/core/services';
import type { GraphQLSchemaService, CookieJarService } from '@hivefetch/core/services';
import type { KeyValue } from '@hivefetch/core';
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
    panelInfo.url = data.url;

    // Track connection lifecycle for history/drafts logging
    let connectStartTime = 0;
    let hasActiveAttempt = false;
    let wasConnected = false;
    let lastError: string | undefined;

    wsService.onStatusChange = (status, error) => {
      webview.postMessage({ type: 'wsStatus', data: { status, error } });

      if (status === 'connecting') {
        connectStartTime = Date.now();
        hasActiveAttempt = true;
        wasConnected = false;
        lastError = undefined;
      } else if (status === 'connected') {
        wasConnected = true;
      } else if (status === 'error') {
        lastError = error;
      } else if (status === 'disconnected' && hasActiveAttempt) {
        hasActiveAttempt = false;
        const duration = Date.now() - connectStartTime;
        this.logWsHistory(panelInfo, data, wasConnected, lastError, duration);
        this.addWsToDrafts(panelInfo, data, wasConnected, duration);
      }
    };
    wsService.onMessage = (msg) => {
      webview.postMessage({ type: 'wsMessage', data: msg });
      if (panelInfo.wsRecorder?.getState() === 'recording') {
        panelInfo.wsRecorder.recordMessage(msg);
      }
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

  // --- WebSocket Session Recording ---

  handleWsStartRecording(webview: vscode.Webview, panelId: string): void {
    const panelInfo = this.ctx.panels.get(panelId);
    if (!panelInfo) return;

    if (!panelInfo.wsRecorder) {
      panelInfo.wsRecorder = new WsSessionRecorder();
    }

    const config = panelInfo.wsService ?
      { url: panelInfo.url || '', protocols: undefined } :
      { url: '', protocols: undefined };

    panelInfo.wsRecorder.startRecording(config);
    webview.postMessage({ type: 'wsRecordingState', data: { state: 'recording' } });
  }

  handleWsStopRecording(webview: vscode.Webview, panelId: string, data: { name?: string }): void {
    const panelInfo = this.ctx.panels.get(panelId);
    if (!panelInfo?.wsRecorder) return;

    const session = panelInfo.wsRecorder.stopRecording(data.name);
    webview.postMessage({ type: 'wsRecordingState', data: { state: 'idle' } });
    webview.postMessage({ type: 'wsSessionSaved', data: { session } });
  }

  async handleWsSaveSession(data: { session: any }): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!workspaceRoot) return;

    const sessionsDir = vscode.Uri.joinPath(workspaceRoot, '.hivefetch', 'ws-sessions');
    try { await vscode.workspace.fs.createDirectory(sessionsDir); } catch {}

    const fileUri = vscode.Uri.joinPath(sessionsDir, `${data.session.id}.ws-session.json`);
    const content = Buffer.from(JSON.stringify(data.session, null, 2), 'utf8');
    await vscode.workspace.fs.writeFile(fileUri, content);
  }

  async handleWsExportSession(data: { session: any }): Promise<void> {
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(`${data.session.name || 'session'}.ws-session.json`),
      filters: { 'WebSocket Session': ['ws-session.json', 'json'] },
    });
    if (uri) {
      const content = Buffer.from(JSON.stringify(data.session, null, 2), 'utf8');
      await vscode.workspace.fs.writeFile(uri, content);
    }
  }

  async handleWsLoadSession(webview: vscode.Webview): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: 'Load WebSocket Session',
      filters: { 'WebSocket Session': ['json'] },
    });
    if (uris && uris.length > 0) {
      const content = await vscode.workspace.fs.readFile(uris[0]);
      try {
        const session = JSON.parse(Buffer.from(content).toString('utf8'));
        webview.postMessage({ type: 'wsSessionLoaded', data: { session } });
      } catch {
        webview.postMessage({ type: 'error', message: 'Invalid session file' });
      }
    }
  }

  async handleWsLoadSessionById(webview: vscode.Webview, data: { sessionId: string }): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!workspaceRoot) return;

    const fileUri = vscode.Uri.joinPath(workspaceRoot, '.hivefetch', 'ws-sessions', `${data.sessionId}.ws-session.json`);
    try {
      const content = await vscode.workspace.fs.readFile(fileUri);
      const session = JSON.parse(Buffer.from(content).toString('utf8'));
      webview.postMessage({ type: 'wsSessionLoaded', data: { session } });
    } catch {
      webview.postMessage({ type: 'error', message: 'Failed to load session' });
    }
  }

  async handleWsListSessions(webview: vscode.Webview): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!workspaceRoot) {
      webview.postMessage({ type: 'wsSessionsList', data: { sessions: [] } });
      return;
    }

    const sessionsDir = vscode.Uri.joinPath(workspaceRoot, '.hivefetch', 'ws-sessions');
    try {
      const entries = await vscode.workspace.fs.readDirectory(sessionsDir);
      const sessions: any[] = [];
      for (const [name, type] of entries) {
        if (type !== vscode.FileType.File || !name.endsWith('.ws-session.json')) continue;
        try {
          const fileUri = vscode.Uri.joinPath(sessionsDir, name);
          const content = await vscode.workspace.fs.readFile(fileUri);
          const session = JSON.parse(Buffer.from(content).toString('utf8'));
          sessions.push({
            id: session.id,
            name: session.name,
            createdAt: session.createdAt,
            url: session.config?.url || '',
            messageCount: session.messageCount || 0,
            durationMs: session.durationMs || 0,
          });
        } catch { /* skip invalid files */ }
      }
      webview.postMessage({ type: 'wsSessionsList', data: { sessions } });
    } catch {
      webview.postMessage({ type: 'wsSessionsList', data: { sessions: [] } });
    }
  }

  async handleWsDeleteSession(data: { sessionId: string }): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!workspaceRoot) return;

    const fileUri = vscode.Uri.joinPath(workspaceRoot, '.hivefetch', 'ws-sessions', `${data.sessionId}.ws-session.json`);
    try { await vscode.workspace.fs.delete(fileUri); } catch {}
  }

  handleWsStartReplay(webview: vscode.Webview, panelId: string, data: { session: any; speedMultiplier: number }): void {
    const panelInfo = this.ctx.panels.get(panelId);
    if (!panelInfo?.wsService) return;

    if (!panelInfo.wsRecorder) {
      panelInfo.wsRecorder = new WsSessionRecorder();
    }

    panelInfo.wsRecorder.onReplayMessage = (index: number, total: number) => {
      webview.postMessage({ type: 'wsReplayProgress', data: { index, total, state: 'replaying' } });
    };
    panelInfo.wsRecorder.onReplayComplete = () => {
      webview.postMessage({ type: 'wsReplayProgress', data: { index: 0, total: 0, state: 'complete' } });
      webview.postMessage({ type: 'wsRecordingState', data: { state: 'idle' } });
    };
    panelInfo.wsRecorder.onStateChange = (state: string) => {
      webview.postMessage({ type: 'wsRecordingState', data: { state } });
    };

    // Cancel replay if WebSocket disconnects
    const originalOnStatusChange = panelInfo.wsService.onStatusChange;
    panelInfo.wsService.onStatusChange = (status, error) => {
      originalOnStatusChange?.(status, error);
      if (status === 'disconnected' || status === 'error') {
        panelInfo.wsRecorder?.cancelReplay();
      }
    };

    panelInfo.wsRecorder.startReplay(
      data.session,
      panelInfo.wsService.send.bind(panelInfo.wsService),
      data.speedMultiplier
    );
  }

  handleWsCancelReplay(panelId: string): void {
    this.ctx.panels.get(panelId)?.wsRecorder?.cancelReplay();
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

  // --- GraphQL Subscription ---

  async handleGqlSubSubscribe(webview: vscode.Webview, panelId: string, data: any): Promise<void> {
    const panelInfo = this.ctx.panels.get(panelId);
    if (!panelInfo) return;
    panelInfo.gqlSubService?.disconnect();
    const service = new GraphQLSubscriptionService();
    panelInfo.gqlSubService = service;
    service.onStatusChange = (status: string, error?: string) => {
      webview.postMessage({ type: 'gqlSubStatus', data: { status, error } });
    };
    service.onEvent = (event: any) => {
      webview.postMessage({ type: 'gqlSubEvent', data: event });
    };
    const headers = await this.injectCookieHeader(data.url, data.headers || []);
    service.subscribe({
      url: data.url, headers,
      query: data.query, variables: data.variables, operationName: data.operationName,
    });
  }

  handleGqlSubUnsubscribe(panelId: string): void {
    this.ctx.panels.get(panelId)?.gqlSubService?.unsubscribe();
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
      console.error('[HiveFetch] Failed to open request:', error);
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
      // Notification sent through webview postMessage is not possible here since we don't have panelId context
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
    }
  }

  async handleOpenBinaryResponse(data: { base64: string; filename: string; contentType: string }): Promise<void> {
    const os = await import('os');
    const path = await import('path');
    const tmpDir = os.tmpdir();
    const safeName = path.basename(data.filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    const tmpPath = path.join(tmpDir, `hivefetch-${Date.now()}-${safeName}`);
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
      const switched = await this.storageService.switchStorageMode(data.storageMode as 'global' | 'workspace');
      if (!switched) {
        // Mode switch failed, revert the storageMode in data so we persist the actual mode
        data.storageMode = currentStorageMode;
      } else {
        await this.ctx.sidebarProvider.notifyCollectionsUpdated();
      }
    }

    // Persist settings with the authoritative storage mode from VS Code config
    data.storageMode = this.storageService.getStorageMode();
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
      storageMode: this.storageService.getStorageMode(),
      hasWorkspace: this.storageService.hasWorkspace(),
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

  // --- gRPC ---

  private grpcServices = new Map<string, GrpcService>();
  private activeGrpcConnectionIds = new Map<string, string>();

  private getWorkspaceRoot(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  private toWorkspaceRelative(absolutePath: string): string {
    const root = this.getWorkspaceRoot();
    if (!root) return absolutePath;
    const path = require('path') as typeof import('path');
    const normalized = path.normalize(absolutePath);
    const normalizedRoot = path.normalize(root);
    if (normalized.startsWith(normalizedRoot + path.sep) || normalized.startsWith(normalizedRoot + '/')) {
      return path.relative(normalizedRoot, normalized);
    }
    return absolutePath;
  }

  private resolveProtoPath(storedPath: string): string {
    const path = require('path') as typeof import('path');
    if (path.isAbsolute(storedPath)) return storedPath;
    const root = this.getWorkspaceRoot();
    if (!root) return storedPath;
    return path.resolve(root, storedPath);
  }

  private resolveProtoPaths(paths: string[] | undefined): string[] | undefined {
    return paths?.map(p => this.resolveProtoPath(p));
  }

  private getOrCreateGrpcService(panelId: string): GrpcService {
    let service = this.grpcServices.get(panelId);
    if (!service) {
      service = new GrpcService();
      this.grpcServices.set(panelId, service);
    }
    return service;
  }

  async handleGrpcReflect(webview: vscode.Webview, panelId: string, data: any): Promise<void> {
    const service = this.getOrCreateGrpcService(panelId);
    try {
      const descriptor = await service.reflect(data.address, data.metadata, data.tls, data.tlsCertPath, data.tlsKeyPath, data.tlsCaCertPath);
      webview.postMessage({ type: 'grpcProtoLoaded', data: descriptor });
    } catch (err: any) {
      webview.postMessage({ type: 'grpcProtoError', data: { message: err.message || String(err) } });
    }
  }

  async handleGrpcLoadProto(webview: vscode.Webview, panelId: string, data: any): Promise<void> {
    const service = this.getOrCreateGrpcService(panelId);
    try {
      const descriptor = await service.loadProto(this.resolveProtoPaths(data.protoPaths) || [], this.resolveProtoPaths(data.importDirs));
      webview.postMessage({ type: 'grpcProtoLoaded', data: descriptor });
    } catch (err: any) {
      webview.postMessage({ type: 'grpcProtoError', data: { message: err.message || String(err) } });
    }
  }

  async handleGrpcInvoke(webview: vscode.Webview, panelId: string, data: any): Promise<void> {
    const service = this.getOrCreateGrpcService(panelId);
    const metadata: Record<string, string> = {};
    if (data.metadata && Array.isArray(data.metadata)) {
      for (const kv of data.metadata) {
        if (kv.enabled && kv.key) metadata[kv.key] = kv.value || '';
      }
    }
    // Apply auth as metadata (auth entries take precedence over explicit metadata)
    const auth = data.auth;
    if (auth) {
      if (auth.type === 'bearer' && auth.token) {
        metadata['Authorization'] = `Bearer ${auth.token}`;
      } else if (auth.type === 'basic' && auth.username) {
        const encoded = Buffer.from(`${auth.username}:${auth.password || ''}`).toString('base64');
        metadata['Authorization'] = `Basic ${encoded}`;
      } else if (auth.type === 'apikey' && auth.apiKeyName && auth.apiKeyValue && auth.apiKeyIn !== 'query') {
        metadata[auth.apiKeyName] = auth.apiKeyValue;
      } else if (auth.type === 'oauth2' && auth.oauthToken) {
        metadata['Authorization'] = `Bearer ${auth.oauthToken}`;
      }
    }
    await service.invoke({
      address: data.address,
      serviceName: data.serviceName,
      methodName: data.methodName,
      metadata,
      body: data.body || '{}',
      useReflection: data.useReflection,
      protoPaths: this.resolveProtoPaths(data.protoPaths),
      importDirs: this.resolveProtoPaths(data.importDirs),
      tls: data.tls,
      tlsCertPath: data.tlsCertPath,
      tlsKeyPath: data.tlsKeyPath,
      tlsCaCertPath: data.tlsCaCertPath,
      tlsPassphrase: data.tlsPassphrase,
      timeout: data.timeout,
    }, {
      onConnectionStart: (conn) => {
        this.activeGrpcConnectionIds.set(panelId, conn.id);
        webview.postMessage({ type: 'grpcConnectionStart', data: conn });
      },
      onEvent: (event) => webview.postMessage({ type: 'grpcEvent', data: event }),
      onConnectionEnd: (conn) => {
        this.activeGrpcConnectionIds.delete(panelId);
        webview.postMessage({ type: 'grpcConnectionEnd', data: conn });
        // Log to history
        const panelInfo = this.ctx.panels.get(panelId);
        this.ctx.sidebarProvider.logHistory({
          id: this.ctx.generateId(),
          timestamp: new Date().toISOString(),
          method: 'POST',
          url: `${data.address}/${data.serviceName}/${data.methodName}`,
          headers: data.metadata || [],
          body: { type: 'json', content: data.body || '{}' },
          connectionMode: 'grpc',
          grpc: {
            serviceName: data.serviceName,
            methodName: data.methodName,
            useReflection: data.useReflection ?? true,
            protoPaths: data.protoPaths || [],
            protoImportDirs: data.importDirs || [],
            tls: data.tls,
          },
          responseStatus: conn.status === 0 ? 200 : 500 + (conn.status || 0),
          responseDuration: conn.elapsed,
          workspaceName: vscode.workspace.name,
          collectionId: panelInfo?.collectionId || undefined,
          requestId: panelInfo?.requestId || undefined,
          requestName: panelInfo?.requestName || `${data.serviceName}/${data.methodName}`,
        }).catch(err => console.error('[HiveFetch] gRPC history log failed:', err));
        // Save to drafts for unsaved requests
        const grpcCollectionId = panelInfo?.collectionId;
        if (!grpcCollectionId || grpcCollectionId === '__drafts__') {
          this.ctx.sidebarProvider.addToDraftsCollection(
            {
              method: 'GET',
              url: data.address,
              params: [],
              headers: data.metadata || [],
              auth: { type: 'none' },
              body: { type: 'json', content: data.body || '{}' },
              connectionMode: 'grpc',
              grpc: {
                serviceName: data.serviceName,
                methodName: data.methodName,
                useReflection: data.useReflection ?? true,
                protoPaths: data.protoPaths || [],
                protoImportDirs: data.importDirs || [],
                tls: data.tls,
              },
            },
            {
              status: conn.status === 0 ? 200 : 500 + (conn.status || 0),
              duration: conn.elapsed || 0,
              size: 0,
            }
          ).catch(err => console.error('[HiveFetch] gRPC drafts save failed:', err));
        } else if (panelInfo?.requestId) {
          this.ctx.sidebarProvider.updateRequestResponse(
            panelInfo.requestId,
            grpcCollectionId,
            conn.status === 0 ? 200 : 500 + (conn.status || 0),
            conn.elapsed || 0,
            data.address,
            'GET'
          ).catch(err => console.error('[HiveFetch] gRPC response update failed:', err));
        }
      },
    });
  }

  async handlePickProtoFile(webview: vscode.Webview): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: true,
      openLabel: 'Select Proto Files',
      filters: { 'Protocol Buffer': ['proto'] },
    });
    if (uris && uris.length > 0) {
      webview.postMessage({ type: 'protoFilesPicked', data: { paths: uris.map(u => this.toWorkspaceRelative(u.fsPath)) } });
    }
  }

  async handlePickProtoImportDir(webview: vscode.Webview): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: true,
      canSelectFolders: true,
      canSelectFiles: false,
      openLabel: 'Select Import Directory',
    });
    if (uris && uris.length > 0) {
      webview.postMessage({ type: 'protoImportDirsPicked', data: { paths: uris.map(u => this.toWorkspaceRelative(u.fsPath)) } });
    }
  }

  async handleScanProtoDir(webview: vscode.Webview, dir: string): Promise<void> {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const resolvedDir = this.resolveProtoPath(dir);

    function scanDir(dirPath: string): string[] {
      const results: string[] = [];
      try {
        for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
          const full = path.join(dirPath, entry.name);
          if (entry.isDirectory()) {
            results.push(...scanDir(full));
          } else if (entry.isFile() && entry.name.endsWith('.proto')) {
            results.push(full);
          }
        }
      } catch { /* skip unreadable dirs */ }
      return results;
    }

    const files = scanDir(resolvedDir).map(f => this.toWorkspaceRelative(f));
    webview.postMessage({ type: 'protoDirScanned', data: { dir, files } });
  }

  disposeGrpcService(panelId: string): void {
    this.activeGrpcConnectionIds.delete(panelId);
    const service = this.grpcServices.get(panelId);
    if (service) {
      service.dispose();
      this.grpcServices.delete(panelId);
    }
  }

  sendGrpcMessage(webview: vscode.Webview, panelId: string, data: any): void {
    const connectionId = this.activeGrpcConnectionIds.get(panelId);
    if (!connectionId) return;
    const service = this.grpcServices.get(panelId);
    if (!service) return;
    try {
      service.sendMessage(connectionId, data.body || '{}');
      webview.postMessage({ type: 'grpcEvent', data: {
        id: Date.now().toString(36),
        connectionId,
        eventType: 'client_message',
        content: data.body || '{}',
        createdAt: new Date().toISOString(),
      }});
    } catch (err: any) {
      webview.postMessage({ type: 'grpcEvent', data: {
        id: Date.now().toString(36),
        connectionId,
        eventType: 'error',
        content: '',
        error: err.message,
        createdAt: new Date().toISOString(),
      }});
    }
  }

  endGrpcStream(panelId: string): void {
    const connectionId = this.activeGrpcConnectionIds.get(panelId);
    if (!connectionId) return;
    const service = this.grpcServices.get(panelId);
    service?.endStream(connectionId);
  }

  cancelGrpcCall(panelId: string): void {
    const connectionId = this.activeGrpcConnectionIds.get(panelId);
    if (connectionId) {
      const service = this.grpcServices.get(panelId);
      service?.cancel(connectionId);
      this.activeGrpcConnectionIds.delete(panelId);
    }
  }

  // --- WebSocket history/drafts helpers ---

  private logWsHistory(panelInfo: PanelInfo, data: any, wasConnected: boolean, lastError: string | undefined, duration: number): void {
    this.ctx.sidebarProvider.logHistory({
      id: this.ctx.generateId(),
      timestamp: new Date().toISOString(),
      method: 'GET',
      url: data.url,
      headers: data.headers || [],
      connectionMode: 'websocket',
      responseStatus: wasConnected ? 101 : 0,
      responseBody: lastError || undefined,
      responseDuration: duration,
      workspaceName: vscode.workspace.name,
      collectionId: panelInfo.collectionId || undefined,
      requestId: panelInfo.requestId || undefined,
      requestName: panelInfo.requestName || undefined,
    }).catch(err => console.error('[HiveFetch] WebSocket history log failed:', err));
  }

  private addWsToDrafts(panelInfo: PanelInfo, data: any, wasConnected: boolean, duration: number): void {
    const panelCollectionId = panelInfo.collectionId;
    if (!panelCollectionId || panelCollectionId === '__drafts__') {
      this.ctx.sidebarProvider.addToDraftsCollection(
        {
          method: 'GET',
          url: data.url,
          params: [],
          headers: data.headers || [],
          auth: { type: 'none' },
          body: { type: 'none', content: '' },
          connectionMode: 'websocket' as const,
        },
        {
          status: wasConnected ? 101 : 0,
          duration,
          size: 0,
        }
      ).catch(err => console.error('[HiveFetch] WebSocket drafts save failed:', err));
    } else if (panelInfo.requestId) {
      this.ctx.sidebarProvider.updateRequestResponse(
        panelInfo.requestId,
        panelCollectionId,
        wasConnected ? 101 : 0,
        duration,
        data.url,
        'GET'
      ).catch(err => console.error('[HiveFetch] WebSocket response update failed:', err));
    }
  }

  // --- Private helpers ---

  /**
   * Inject a Cookie header from the active cookie jar into a headers array,
   * only if no explicit Cookie header already exists.
   */
  private async injectCookieHeader(
    url: string,
    headers: KeyValue[]
  ): Promise<KeyValue[]> {
    const hasExplicitCookie = headers.some(
      (h) => h.enabled && h.key.toLowerCase() === 'cookie'
    );
    if (hasExplicitCookie) return headers;

    const cookieHeader = await this.cookieJarService.buildCookieHeader(url);
    if (!cookieHeader) return headers;

    return [...headers, { id: `cookie-${Date.now()}`, key: 'Cookie', value: cookieHeader, enabled: true }];
  }
}
