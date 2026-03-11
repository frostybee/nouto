// Mock @hivefetch/core/services: WebSocketService and SSEService are instantiated inside handlers
const mockWsConnect = jest.fn();
const mockWsDisconnect = jest.fn();
const mockWsSend = jest.fn();
const mockSseConnect = jest.fn();
const mockSseDisconnect = jest.fn();

let capturedWsInstance: any;
let capturedSseInstance: any;

jest.mock('@hivefetch/core/services', () => ({
  WebSocketService: jest.fn().mockImplementation(() => {
    const instance = {
      connect: mockWsConnect,
      disconnect: mockWsDisconnect,
      send: mockWsSend,
      onMessage: undefined as any,
      onStatusChange: undefined as any,
    };
    capturedWsInstance = instance;
    return instance;
  }),
  SSEService: jest.fn().mockImplementation(() => {
    const instance = {
      connect: mockSseConnect,
      disconnect: mockSseDisconnect,
      onEvent: undefined as any,
      onStatusChange: undefined as any,
    };
    capturedSseInstance = instance;
    return instance;
  }),
}));

import * as vscode from 'vscode';
import { ProtocolHandlers } from './ProtocolHandlers';
import type { IPanelContext, PanelInfo } from './PanelTypes';

// --- Helpers ---

function createMockWebview(): vscode.Webview {
  return {
    postMessage: jest.fn().mockResolvedValue(true),
    html: '',
    options: {},
    onDidReceiveMessage: jest.fn(),
    asWebviewUri: jest.fn(),
    cspSource: '',
  } as any;
}

function createMockPanel(webview?: vscode.Webview): vscode.WebviewPanel {
  return {
    webview: webview || createMockWebview(),
    dispose: jest.fn(),
    onDidDispose: jest.fn(),
    onDidChangeViewState: jest.fn(),
    reveal: jest.fn(),
    visible: true,
    active: true,
    viewType: 'test',
    title: 'Test',
  } as any;
}

function createMockPanelInfo(overrides: Partial<PanelInfo> = {}): PanelInfo {
  return {
    panel: createMockPanel(),
    requestId: null,
    collectionId: null,
    abortController: null,
    ...overrides,
  };
}

function createMockGraphQLSchemaService() {
  return {
    introspect: jest.fn(),
  };
}

function createMockCookieJarService() {
  return {
    getAllByDomain: jest.fn().mockResolvedValue([]),
    deleteCookie: jest.fn().mockResolvedValue(undefined),
    deleteDomain: jest.fn().mockResolvedValue(undefined),
    clearAll: jest.fn().mockResolvedValue(undefined),
    listJars: jest.fn().mockResolvedValue([]),
    getActiveJarId: jest.fn().mockReturnValue(null),
    createJar: jest.fn().mockResolvedValue(undefined),
    renameJar: jest.fn().mockResolvedValue(undefined),
    deleteJar: jest.fn().mockResolvedValue(undefined),
    setActiveJar: jest.fn().mockResolvedValue(undefined),
    addCookie: jest.fn().mockResolvedValue(undefined),
    updateCookie: jest.fn().mockResolvedValue(undefined),
    buildCookieHeader: jest.fn().mockResolvedValue(null),
  };
}

function createMockStorageService() {
  return {
    loadCollections: jest.fn().mockResolvedValue([]),
    getStorageMode: jest.fn().mockReturnValue('global'),
    hasWorkspace: jest.fn().mockReturnValue(false),
    switchStorageMode: jest.fn().mockResolvedValue(true),
  };
}

function createMockFileService() {
  return {
    selectFile: jest.fn().mockResolvedValue(null),
  };
}

function createMockContext(panels?: Map<string, PanelInfo>): IPanelContext {
  return {
    panels: panels || new Map(),
    extensionContext: {
      globalState: {
        get: jest.fn().mockReturnValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
      },
    } as any,
    sidebarProvider: {
      getCollections: jest.fn().mockReturnValue([]),
      addRequest: jest.fn(),
      addToDraftsCollection: jest.fn(),
      removeFromDraftsCollection: jest.fn(),
      updateRequestResponse: jest.fn(),
      createCollectionAndAddRequest: jest.fn(),
      whenReady: jest.fn(),
      notifyCollectionsUpdated: jest.fn().mockResolvedValue(undefined),
      logHistory: jest.fn(),
      searchHistory: jest.fn(),
      getHistoryEntry: jest.fn(),
      deleteHistoryEntryById: jest.fn(),
      clearAllHistory: jest.fn(),
    },
    generateId: jest.fn().mockReturnValue('test-id'),
    getCollectionName: jest.fn().mockReturnValue('Test Collection'),
    isWebviewAlive: jest.fn().mockReturnValue(true),
  };
}

function createHandlers(overrides: {
  ctx?: IPanelContext;
  graphql?: any;
  cookieJar?: any;
  storage?: any;
  file?: any;
} = {}) {
  const ctx = overrides.ctx || createMockContext();
  const graphql = overrides.graphql || createMockGraphQLSchemaService();
  const cookieJar = overrides.cookieJar || createMockCookieJarService();
  const storage = overrides.storage || createMockStorageService();
  const file = overrides.file || createMockFileService();
  const handlers = new ProtocolHandlers(ctx, graphql, cookieJar, storage, file);
  return { handlers, ctx, graphql, cookieJar, storage, file };
}

// --- Tests ---

describe('ProtocolHandlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedWsInstance = undefined;
    capturedSseInstance = undefined;
  });

  // ==================== WebSocket ====================

  describe('handleWsConnect', () => {
    it('returns early if panelId not found in panels map', async () => {
      const { handlers } = createHandlers();
      const webview = createMockWebview();

      await handlers.handleWsConnect(webview as any, 'unknown-id', { url: 'ws://test' });

      expect(mockWsConnect).not.toHaveBeenCalled();
    });

    it('disconnects existing wsService before creating a new one', async () => {
      const existingWsService = { disconnect: jest.fn(), connect: jest.fn() };
      const panelInfo = createMockPanelInfo({ wsService: existingWsService as any });
      const panels = new Map([['p1', panelInfo]]);
      const ctx = createMockContext(panels);
      const { handlers } = createHandlers({ ctx });
      const webview = createMockWebview();

      await handlers.handleWsConnect(webview as any, 'p1', { url: 'ws://test' });

      expect(existingWsService.disconnect).toHaveBeenCalled();
    });

    it('creates WebSocketService, sets callbacks, and connects', async () => {
      const panelInfo = createMockPanelInfo();
      const panels = new Map([['p1', panelInfo]]);
      const ctx = createMockContext(panels);
      const cookieJar = createMockCookieJarService();
      const { handlers } = createHandlers({ ctx, cookieJar });
      const webview = createMockWebview();

      await handlers.handleWsConnect(webview as any, 'p1', {
        url: 'ws://localhost:8080',
        protocols: ['proto1'],
        headers: [],
        autoReconnect: true,
        reconnectIntervalMs: 5000,
      });

      expect(capturedWsInstance).toBeDefined();
      expect(panelInfo.wsService).toBe(capturedWsInstance);
      expect(mockWsConnect).toHaveBeenCalledWith({
        url: 'ws://localhost:8080',
        protocols: ['proto1'],
        headers: [],
        autoReconnect: true,
        reconnectIntervalMs: 5000,
      });
    });

    it('posts wsStatus message when onStatusChange fires', async () => {
      const panelInfo = createMockPanelInfo();
      const panels = new Map([['p1', panelInfo]]);
      const ctx = createMockContext(panels);
      const { handlers } = createHandlers({ ctx });
      const webview = createMockWebview();

      await handlers.handleWsConnect(webview as any, 'p1', { url: 'ws://test' });

      capturedWsInstance.onStatusChange('connected', undefined);
      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'wsStatus',
        data: { status: 'connected', error: undefined },
      });
    });

    it('posts wsMessage when onMessage fires', async () => {
      const panelInfo = createMockPanelInfo();
      const panels = new Map([['p1', panelInfo]]);
      const ctx = createMockContext(panels);
      const { handlers } = createHandlers({ ctx });
      const webview = createMockWebview();

      await handlers.handleWsConnect(webview as any, 'p1', { url: 'ws://test' });

      const msg = { id: '1', data: 'hello', timestamp: 123, direction: 'received' as const };
      capturedWsInstance.onMessage(msg);
      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'wsMessage',
        data: msg,
      });
    });

    it('injects cookie header from active jar', async () => {
      const panelInfo = createMockPanelInfo();
      const panels = new Map([['p1', panelInfo]]);
      const ctx = createMockContext(panels);
      const cookieJar = createMockCookieJarService();
      cookieJar.buildCookieHeader.mockResolvedValue('session=abc123');
      const { handlers } = createHandlers({ ctx, cookieJar });
      const webview = createMockWebview();

      await handlers.handleWsConnect(webview as any, 'p1', {
        url: 'ws://example.com',
        headers: [{ id: '1', key: 'Authorization', value: 'Bearer x', enabled: true }],
      });

      const connectCall = mockWsConnect.mock.calls[0][0];
      expect(connectCall.headers).toHaveLength(2);
      expect(connectCall.headers[1].key).toBe('Cookie');
      expect(connectCall.headers[1].value).toBe('session=abc123');
    });

    it('does not inject cookie header when explicit Cookie header exists', async () => {
      const panelInfo = createMockPanelInfo();
      const panels = new Map([['p1', panelInfo]]);
      const ctx = createMockContext(panels);
      const cookieJar = createMockCookieJarService();
      cookieJar.buildCookieHeader.mockResolvedValue('should-not-appear');
      const { handlers } = createHandlers({ ctx, cookieJar });
      const webview = createMockWebview();

      await handlers.handleWsConnect(webview as any, 'p1', {
        url: 'ws://example.com',
        headers: [{ id: '1', key: 'Cookie', value: 'manual=val', enabled: true }],
      });

      const connectCall = mockWsConnect.mock.calls[0][0];
      expect(connectCall.headers).toHaveLength(1);
      expect(connectCall.headers[0].key).toBe('Cookie');
      expect(connectCall.headers[0].value).toBe('manual=val');
    });

    it('uses default values for missing autoReconnect and reconnectIntervalMs', async () => {
      const panelInfo = createMockPanelInfo();
      const panels = new Map([['p1', panelInfo]]);
      const ctx = createMockContext(panels);
      const { handlers } = createHandlers({ ctx });
      const webview = createMockWebview();

      await handlers.handleWsConnect(webview as any, 'p1', { url: 'ws://test' });

      const connectCall = mockWsConnect.mock.calls[0][0];
      expect(connectCall.autoReconnect).toBe(false);
      expect(connectCall.reconnectIntervalMs).toBe(3000);
    });
  });

  describe('handleWsSend', () => {
    it('sends message via wsService', () => {
      const panelInfo = createMockPanelInfo({
        wsService: { send: jest.fn(), disconnect: jest.fn() } as any,
      });
      const panels = new Map([['p1', panelInfo]]);
      const ctx = createMockContext(panels);
      const { handlers } = createHandlers({ ctx });

      handlers.handleWsSend('p1', { message: 'hello', type: 'text' });

      expect((panelInfo.wsService as any).send).toHaveBeenCalledWith('hello', 'text');
    });

    it('defaults to text type when not specified', () => {
      const panelInfo = createMockPanelInfo({
        wsService: { send: jest.fn(), disconnect: jest.fn() } as any,
      });
      const panels = new Map([['p1', panelInfo]]);
      const ctx = createMockContext(panels);
      const { handlers } = createHandlers({ ctx });

      handlers.handleWsSend('p1', { message: 'data' });

      expect((panelInfo.wsService as any).send).toHaveBeenCalledWith('data', 'text');
    });

    it('does nothing if panelId not found', () => {
      const { handlers } = createHandlers();
      // Should not throw
      handlers.handleWsSend('unknown', { message: 'test' });
    });
  });

  describe('handleWsDisconnect', () => {
    it('disconnects wsService for given panel', () => {
      const panelInfo = createMockPanelInfo({
        wsService: { disconnect: jest.fn() } as any,
      });
      const panels = new Map([['p1', panelInfo]]);
      const ctx = createMockContext(panels);
      const { handlers } = createHandlers({ ctx });

      handlers.handleWsDisconnect('p1');

      expect((panelInfo.wsService as any).disconnect).toHaveBeenCalled();
    });

    it('does nothing if panelId not found', () => {
      const { handlers } = createHandlers();
      // Should not throw
      handlers.handleWsDisconnect('unknown');
    });
  });

  // ==================== SSE ====================

  describe('handleSseConnect', () => {
    it('returns early if panelId not found', async () => {
      const { handlers } = createHandlers();
      const webview = createMockWebview();

      await handlers.handleSseConnect(webview as any, 'unknown', { url: 'http://test/sse' });

      expect(mockSseConnect).not.toHaveBeenCalled();
    });

    it('disconnects existing sseService before creating new one', async () => {
      const existingSse = { disconnect: jest.fn() };
      const panelInfo = createMockPanelInfo({ sseService: existingSse as any });
      const panels = new Map([['p1', panelInfo]]);
      const ctx = createMockContext(panels);
      const { handlers } = createHandlers({ ctx });
      const webview = createMockWebview();

      await handlers.handleSseConnect(webview as any, 'p1', { url: 'http://test/sse' });

      expect(existingSse.disconnect).toHaveBeenCalled();
    });

    it('creates SSEService, sets callbacks, and connects', async () => {
      const panelInfo = createMockPanelInfo();
      const panels = new Map([['p1', panelInfo]]);
      const ctx = createMockContext(panels);
      const { handlers } = createHandlers({ ctx });
      const webview = createMockWebview();

      await handlers.handleSseConnect(webview as any, 'p1', {
        url: 'http://test/sse',
        headers: [],
        autoReconnect: true,
        withCredentials: true,
      });

      expect(capturedSseInstance).toBeDefined();
      expect(panelInfo.sseService).toBe(capturedSseInstance);
      expect(mockSseConnect).toHaveBeenCalledWith({
        url: 'http://test/sse',
        headers: [],
        autoReconnect: true,
        withCredentials: true,
      });
    });

    it('posts sseStatus when onStatusChange fires', async () => {
      const panelInfo = createMockPanelInfo();
      const panels = new Map([['p1', panelInfo]]);
      const ctx = createMockContext(panels);
      const { handlers } = createHandlers({ ctx });
      const webview = createMockWebview();

      await handlers.handleSseConnect(webview as any, 'p1', { url: 'http://test/sse' });

      capturedSseInstance.onStatusChange('connected', undefined);
      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'sseStatus',
        data: { status: 'connected', error: undefined },
      });
    });

    it('posts sseEvent when onEvent fires', async () => {
      const panelInfo = createMockPanelInfo();
      const panels = new Map([['p1', panelInfo]]);
      const ctx = createMockContext(panels);
      const { handlers } = createHandlers({ ctx });
      const webview = createMockWebview();

      await handlers.handleSseConnect(webview as any, 'p1', { url: 'http://test/sse' });

      const event = { id: '1', type: 'message', data: 'hello' };
      capturedSseInstance.onEvent(event);
      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'sseEvent',
        data: event,
      });
    });

    it('injects cookie header for SSE connections', async () => {
      const panelInfo = createMockPanelInfo();
      const panels = new Map([['p1', panelInfo]]);
      const ctx = createMockContext(panels);
      const cookieJar = createMockCookieJarService();
      cookieJar.buildCookieHeader.mockResolvedValue('token=xyz');
      const { handlers } = createHandlers({ ctx, cookieJar });
      const webview = createMockWebview();

      await handlers.handleSseConnect(webview as any, 'p1', {
        url: 'http://example.com/sse',
        headers: [],
      });

      const connectCall = mockSseConnect.mock.calls[0][0];
      expect(connectCall.headers).toHaveLength(1);
      expect(connectCall.headers[0].key).toBe('Cookie');
    });
  });

  describe('handleSseDisconnect', () => {
    it('disconnects sseService for given panel', () => {
      const panelInfo = createMockPanelInfo({
        sseService: { disconnect: jest.fn() } as any,
      });
      const panels = new Map([['p1', panelInfo]]);
      const ctx = createMockContext(panels);
      const { handlers } = createHandlers({ ctx });

      handlers.handleSseDisconnect('p1');

      expect((panelInfo.sseService as any).disconnect).toHaveBeenCalled();
    });

    it('does nothing if panelId not found', () => {
      const { handlers } = createHandlers();
      handlers.handleSseDisconnect('unknown');
    });
  });

  // ==================== GraphQL ====================

  describe('handleIntrospectGraphQL', () => {
    it('introspects and posts schema on success', async () => {
      const mockSchema = { queryType: { name: 'Query' }, types: [] };
      const graphql = createMockGraphQLSchemaService();
      graphql.introspect.mockResolvedValue(mockSchema);
      const { handlers } = createHandlers({ graphql });
      const webview = createMockWebview();

      await handlers.handleIntrospectGraphQL(webview as any, {
        url: 'http://api/graphql',
        headers: [{ id: '1', key: 'Auth', value: 'Bearer x', enabled: true }],
        auth: { type: 'bearer', token: 'x' },
      });

      expect(graphql.introspect).toHaveBeenCalledWith(
        'http://api/graphql',
        [{ id: '1', key: 'Auth', value: 'Bearer x', enabled: true }],
        { type: 'bearer', token: 'x' },
      );
      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'graphqlSchema',
        data: mockSchema,
      });
    });

    it('posts error message on introspection failure', async () => {
      const graphql = createMockGraphQLSchemaService();
      graphql.introspect.mockRejectedValue(new Error('Network error'));
      const { handlers } = createHandlers({ graphql });
      const webview = createMockWebview();

      await handlers.handleIntrospectGraphQL(webview as any, {
        url: 'http://api/graphql',
        headers: [],
        auth: { type: 'none' },
      });

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'graphqlSchemaError',
        data: { message: 'Network error' },
      });
    });

    it('defaults headers to empty array and auth to none', async () => {
      const graphql = createMockGraphQLSchemaService();
      graphql.introspect.mockResolvedValue({});
      const { handlers } = createHandlers({ graphql });
      const webview = createMockWebview();

      await handlers.handleIntrospectGraphQL(webview as any, {
        url: 'http://api/graphql',
        headers: null as any,
        auth: null as any,
      });

      expect(graphql.introspect).toHaveBeenCalledWith(
        'http://api/graphql',
        [],
        { type: 'none' },
      );
    });
  });

  // ==================== Cookie Jar ====================

  describe('handleGetCookieJar', () => {
    it('fetches cookies and posts them to webview', async () => {
      const cookies = [{ domain: 'example.com', cookies: [{ name: 'a', value: '1' }] }];
      const cookieJar = createMockCookieJarService();
      cookieJar.getAllByDomain.mockResolvedValue(cookies);
      const { handlers } = createHandlers({ cookieJar });
      const webview = createMockWebview();

      await handlers.handleGetCookieJar(webview as any);

      expect(cookieJar.getAllByDomain).toHaveBeenCalled();
      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'cookieJarData',
        data: cookies,
      });
    });
  });

  describe('handleDeleteCookie', () => {
    it('deletes cookie and refreshes jar data', async () => {
      const cookieJar = createMockCookieJarService();
      const { handlers } = createHandlers({ cookieJar });
      const webview = createMockWebview();

      await handlers.handleDeleteCookie(webview as any, { name: 'sid', domain: '.example.com', path: '/' });

      expect(cookieJar.deleteCookie).toHaveBeenCalledWith('sid', '.example.com', '/');
      expect(cookieJar.getAllByDomain).toHaveBeenCalled();
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'cookieJarData' }),
      );
    });
  });

  describe('handleDeleteCookieDomain', () => {
    it('deletes domain and refreshes jar data', async () => {
      const cookieJar = createMockCookieJarService();
      const { handlers } = createHandlers({ cookieJar });
      const webview = createMockWebview();

      await handlers.handleDeleteCookieDomain(webview as any, { domain: '.example.com' });

      expect(cookieJar.deleteDomain).toHaveBeenCalledWith('.example.com');
      expect(cookieJar.getAllByDomain).toHaveBeenCalled();
    });
  });

  describe('handleClearCookieJar', () => {
    it('clears all cookies and refreshes jar data', async () => {
      const cookieJar = createMockCookieJarService();
      const { handlers } = createHandlers({ cookieJar });
      const webview = createMockWebview();

      await handlers.handleClearCookieJar(webview as any);

      expect(cookieJar.clearAll).toHaveBeenCalled();
      expect(cookieJar.getAllByDomain).toHaveBeenCalled();
    });
  });

  describe('handleGetCookieJars', () => {
    it('lists jars with active jar id', async () => {
      const jars = [{ id: 'j1', name: 'Default', cookieCount: 3 }];
      const cookieJar = createMockCookieJarService();
      cookieJar.listJars.mockResolvedValue(jars);
      cookieJar.getActiveJarId.mockReturnValue('j1');
      const { handlers } = createHandlers({ cookieJar });
      const webview = createMockWebview();

      await handlers.handleGetCookieJars(webview as any);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'cookieJarsList',
        data: { jars, activeJarId: 'j1' },
      });
    });
  });

  describe('handleCreateCookieJar', () => {
    it('creates jar and broadcasts state', async () => {
      const cookieJar = createMockCookieJarService();
      const panelInfo = createMockPanelInfo();
      const panels = new Map([['p1', panelInfo]]);
      const ctx = createMockContext(panels);
      const { handlers } = createHandlers({ ctx, cookieJar });
      const webview = createMockWebview();

      await handlers.handleCreateCookieJar(webview as any, { name: 'My Jar' });

      expect(cookieJar.createJar).toHaveBeenCalledWith('My Jar');
      // broadcastCookieJarState should have been called (posts to all panels)
      expect(cookieJar.listJars).toHaveBeenCalled();
      expect(cookieJar.getAllByDomain).toHaveBeenCalled();
    });
  });

  describe('handleRenameCookieJar', () => {
    it('renames jar and broadcasts state', async () => {
      const cookieJar = createMockCookieJarService();
      const panels = new Map([['p1', createMockPanelInfo()]]);
      const ctx = createMockContext(panels);
      const { handlers } = createHandlers({ ctx, cookieJar });

      await handlers.handleRenameCookieJar(createMockWebview() as any, { id: 'j1', name: 'Renamed' });

      expect(cookieJar.renameJar).toHaveBeenCalledWith('j1', 'Renamed');
    });
  });

  describe('handleDeleteCookieJar', () => {
    it('deletes jar and broadcasts state', async () => {
      const cookieJar = createMockCookieJarService();
      const panels = new Map([['p1', createMockPanelInfo()]]);
      const ctx = createMockContext(panels);
      const { handlers } = createHandlers({ ctx, cookieJar });

      await handlers.handleDeleteCookieJar(createMockWebview() as any, { id: 'j1' });

      expect(cookieJar.deleteJar).toHaveBeenCalledWith('j1');
    });
  });

  describe('handleSetActiveCookieJar', () => {
    it('sets active jar and broadcasts state', async () => {
      const cookieJar = createMockCookieJarService();
      const panels = new Map([['p1', createMockPanelInfo()]]);
      const ctx = createMockContext(panels);
      const { handlers } = createHandlers({ ctx, cookieJar });

      await handlers.handleSetActiveCookieJar(createMockWebview() as any, { id: 'j2' });

      expect(cookieJar.setActiveJar).toHaveBeenCalledWith('j2');
    });

    it('accepts null to deactivate jar', async () => {
      const cookieJar = createMockCookieJarService();
      const panels = new Map([['p1', createMockPanelInfo()]]);
      const ctx = createMockContext(panels);
      const { handlers } = createHandlers({ ctx, cookieJar });

      await handlers.handleSetActiveCookieJar(createMockWebview() as any, { id: null });

      expect(cookieJar.setActiveJar).toHaveBeenCalledWith(null);
    });
  });

  describe('handleAddCookie', () => {
    it('adds cookie with createdAt timestamp and broadcasts', async () => {
      const cookieJar = createMockCookieJarService();
      const panels = new Map([['p1', createMockPanelInfo()]]);
      const ctx = createMockContext(panels);
      const { handlers } = createHandlers({ ctx, cookieJar });
      const now = Date.now();

      await handlers.handleAddCookie(createMockWebview() as any, {
        name: 'sid',
        value: 'abc',
        domain: '.example.com',
        path: '/',
      });

      expect(cookieJar.addCookie).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'sid',
          value: 'abc',
          domain: '.example.com',
          path: '/',
          createdAt: expect.any(Number),
        }),
      );
      const calledWith = cookieJar.addCookie.mock.calls[0][0];
      expect(calledWith.createdAt).toBeGreaterThanOrEqual(now);
    });
  });

  describe('handleUpdateCookie', () => {
    it('updates cookie with createdAt and broadcasts', async () => {
      const cookieJar = createMockCookieJarService();
      const panels = new Map([['p1', createMockPanelInfo()]]);
      const ctx = createMockContext(panels);
      const { handlers } = createHandlers({ ctx, cookieJar });

      await handlers.handleUpdateCookie(createMockWebview() as any, {
        oldName: 'sid',
        oldDomain: '.example.com',
        oldPath: '/',
        cookie: { name: 'sid', value: 'new-value', domain: '.example.com', path: '/' },
      });

      expect(cookieJar.updateCookie).toHaveBeenCalledWith(
        'sid',
        '.example.com',
        '/',
        expect.objectContaining({
          name: 'sid',
          value: 'new-value',
          createdAt: expect.any(Number),
        }),
      );
    });
  });

  // ==================== broadcastCookieJarState ====================

  describe('broadcastCookieJarState', () => {
    it('broadcasts to all request panels and external webviews', async () => {
      const jars = [{ id: 'j1', name: 'Default', cookieCount: 1 }];
      const cookies = [{ domain: 'test.com', cookies: [] }];
      const cookieJar = createMockCookieJarService();
      cookieJar.listJars.mockResolvedValue(jars);
      cookieJar.getActiveJarId.mockReturnValue('j1');
      cookieJar.getAllByDomain.mockResolvedValue(cookies);

      const panel1 = createMockPanelInfo();
      const panel2 = createMockPanelInfo();
      const panels = new Map([['p1', panel1], ['p2', panel2]]);
      const ctx = createMockContext(panels);
      const { handlers } = createHandlers({ ctx, cookieJar });

      const extWebview = createMockWebview();
      handlers.addExternalWebview(extWebview as any);

      await handlers.broadcastCookieJarState();

      // Each panel and external webview should get both messages
      for (const info of [panel1, panel2]) {
        expect(info.panel.webview.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'cookieJarsList' }),
        );
        expect(info.panel.webview.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'cookieJarData' }),
        );
      }
      expect(extWebview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'cookieJarsList' }),
      );
      expect(extWebview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'cookieJarData' }),
      );
    });
  });

  // ==================== External Webviews ====================

  describe('addExternalWebview / removeExternalWebview', () => {
    it('adds and removes external webviews for broadcasting', async () => {
      const cookieJar = createMockCookieJarService();
      const panels = new Map<string, PanelInfo>();
      const ctx = createMockContext(panels);
      const { handlers } = createHandlers({ ctx, cookieJar });
      const extWebview = createMockWebview();

      handlers.addExternalWebview(extWebview as any);
      await handlers.broadcastCookieJarState();
      expect(extWebview.postMessage).toHaveBeenCalled();

      (extWebview.postMessage as jest.Mock).mockClear();
      handlers.removeExternalWebview(extWebview as any);
      await handlers.broadcastCookieJarState();
      expect(extWebview.postMessage).not.toHaveBeenCalled();
    });

    it('does not add duplicate external webviews', async () => {
      const cookieJar = createMockCookieJarService();
      const panels = new Map<string, PanelInfo>();
      const ctx = createMockContext(panels);
      const { handlers } = createHandlers({ ctx, cookieJar });
      const extWebview = createMockWebview();

      handlers.addExternalWebview(extWebview as any);
      handlers.addExternalWebview(extWebview as any);
      await handlers.broadcastCookieJarState();

      // Should only receive 2 messages (jars + data), not 4
      expect(extWebview.postMessage).toHaveBeenCalledTimes(2);
    });
  });

  // ==================== Command Palette ====================

  describe('handlePaletteRequestSelection', () => {
    it('finds request in collection and opens it', async () => {
      const collections = [{
        id: 'c1',
        name: 'Test',
        items: [
          { type: 'request', id: 'r1', method: 'GET', url: 'http://test' },
          {
            type: 'folder', id: 'f1', children: [
              { type: 'request', id: 'r2', method: 'POST', url: 'http://test/post' },
            ],
          },
        ],
      }];
      const storage = createMockStorageService();
      storage.loadCollections.mockResolvedValue(collections);
      const { handlers } = createHandlers({ storage });

      await handlers.handlePaletteRequestSelection('r2', 'c1');

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'hivefetch.openRequest',
        { type: 'request', id: 'r2', method: 'POST', url: 'http://test/post' },
        'c1',
      );
    });

    it('does nothing if request not found', async () => {
      const storage = createMockStorageService();
      storage.loadCollections.mockResolvedValue([{ id: 'c1', items: [] }]);
      const { handlers } = createHandlers({ storage });

      await handlers.handlePaletteRequestSelection('nonexistent', 'c1');

      expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    });

    it('does nothing if collection not found', async () => {
      const storage = createMockStorageService();
      storage.loadCollections.mockResolvedValue([{ id: 'c1', items: [] }]);
      const { handlers } = createHandlers({ storage });

      await handlers.handlePaletteRequestSelection('r1', 'wrong-collection');

      expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    });

    it('handles errors gracefully', async () => {
      const storage = createMockStorageService();
      storage.loadCollections.mockRejectedValue(new Error('load failed'));
      const { handlers } = createHandlers({ storage });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await handlers.handlePaletteRequestSelection('r1', 'c1');

      expect(consoleSpy).toHaveBeenCalledWith(
        '[HiveFetch] Failed to open request:',
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });

  // ==================== File/Content handlers ====================

  describe('handlePickSslFile', () => {
    it('opens dialog for cert file and posts result', async () => {
      const mockUri = { fsPath: '/path/to/cert.pem' };
      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([mockUri]);
      const { handlers } = createHandlers();
      const webview = createMockWebview();

      await handlers.handlePickSslFile(webview as any, { field: 'cert' });

      expect(vscode.window.showOpenDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          canSelectMany: false,
          openLabel: 'Select Certificate File',
        }),
      );
      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'sslFilePicked',
        data: { field: 'cert', path: '/path/to/cert.pem' },
      });
    });

    it('opens dialog for key file with correct label', async () => {
      const mockUri = { fsPath: '/path/to/key.pem' };
      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([mockUri]);
      const { handlers } = createHandlers();
      const webview = createMockWebview();

      await handlers.handlePickSslFile(webview as any, { field: 'key' });

      expect(vscode.window.showOpenDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          openLabel: 'Select Key File',
        }),
      );
    });

    it('treats global-cert as cert type', async () => {
      const mockUri = { fsPath: '/path/to/cert.pem' };
      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([mockUri]);
      const { handlers } = createHandlers();
      const webview = createMockWebview();

      await handlers.handlePickSslFile(webview as any, { field: 'global-cert' });

      expect(vscode.window.showOpenDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          openLabel: 'Select Certificate File',
        }),
      );
    });

    it('does nothing when dialog is cancelled', async () => {
      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue(undefined);
      const { handlers } = createHandlers();
      const webview = createMockWebview();

      await handlers.handlePickSslFile(webview as any, { field: 'cert' });

      expect(webview.postMessage).not.toHaveBeenCalled();
    });

    it('does nothing when dialog returns empty array', async () => {
      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([]);
      const { handlers } = createHandlers();
      const webview = createMockWebview();

      await handlers.handlePickSslFile(webview as any, { field: 'cert' });

      expect(webview.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('handleSelectFile', () => {
    it('selects file and posts result with fieldId', async () => {
      const fileInfo = { filePath: '/f.txt', fileName: 'f.txt', fileSize: 100, fileMimeType: 'text/plain' };
      const file = createMockFileService();
      file.selectFile.mockResolvedValue(fileInfo);
      const { handlers } = createHandlers({ file });
      const webview = createMockWebview();

      await handlers.handleSelectFile(webview as any, { fieldId: 'field-1' });

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'fileSelected',
        data: { fieldId: 'field-1', ...fileInfo },
      });
    });

    it('does nothing when no file selected', async () => {
      const file = createMockFileService();
      file.selectFile.mockResolvedValue(null);
      const { handlers } = createHandlers({ file });
      const webview = createMockWebview();

      await handlers.handleSelectFile(webview as any, { fieldId: 'f1' });

      expect(webview.postMessage).not.toHaveBeenCalled();
    });

    it('handles undefined data parameter', async () => {
      const fileInfo = { filePath: '/f.txt', fileName: 'f.txt', fileSize: 100, fileMimeType: 'text/plain' };
      const file = createMockFileService();
      file.selectFile.mockResolvedValue(fileInfo);
      const { handlers } = createHandlers({ file });
      const webview = createMockWebview();

      await handlers.handleSelectFile(webview as any);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'fileSelected',
        data: { fieldId: undefined, ...fileInfo },
      });
    });
  });

  describe('handleOpenInNewTab', () => {
    it('opens text document in a new tab beside current', async () => {
      const mockDoc = { uri: 'mock-doc' };
      // Add missing workspace/window methods to the mock
      (vscode.workspace as any).openTextDocument = jest.fn().mockResolvedValue(mockDoc);
      (vscode.window as any).showTextDocument = jest.fn().mockResolvedValue(undefined);
      const { handlers } = createHandlers();

      await handlers.handleOpenInNewTab({ content: '{"a":1}', language: 'json' });

      expect(vscode.workspace.openTextDocument).toHaveBeenCalledWith({
        content: '{"a":1}',
        language: 'json',
      });
      expect(vscode.window.showTextDocument).toHaveBeenCalledWith(mockDoc, vscode.ViewColumn.Beside);
    });
  });

  describe('handleDownloadResponse', () => {
    it('saves text content to selected file', async () => {
      const mockUri = { fsPath: '/downloads/response.json' };
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(mockUri);
      (vscode.workspace as any).fs = {
        writeFile: jest.fn().mockResolvedValue(undefined),
      };
      const { handlers } = createHandlers();

      await handlers.handleDownloadResponse({ content: '{"result":true}', filename: 'response.json' });

      expect(vscode.window.showSaveDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultUri: expect.objectContaining({ fsPath: 'response.json' }),
        }),
      );
      expect(vscode.workspace.fs.writeFile).toHaveBeenCalledWith(
        mockUri,
        expect.any(Buffer),
      );
    });

    it('does nothing when save dialog is cancelled', async () => {
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(undefined);
      (vscode.workspace as any).fs = { writeFile: jest.fn() };
      const { handlers } = createHandlers();

      await handlers.handleDownloadResponse({ content: 'data', filename: 'file.txt' });

      expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('handleDownloadBinaryResponse', () => {
    it('saves base64-decoded content to selected file', async () => {
      const mockUri = { fsPath: '/downloads/image.png' };
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(mockUri);
      (vscode.workspace as any).fs = {
        writeFile: jest.fn().mockResolvedValue(undefined),
      };
      const { handlers } = createHandlers();
      const base64 = Buffer.from('binary-data').toString('base64');

      await handlers.handleDownloadBinaryResponse({ base64, filename: 'image.png' });

      expect(vscode.workspace.fs.writeFile).toHaveBeenCalledWith(
        mockUri,
        Buffer.from(base64, 'base64'),
      );
    });

    it('does nothing when save dialog is cancelled', async () => {
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(undefined);
      (vscode.workspace as any).fs = { writeFile: jest.fn() };
      const { handlers } = createHandlers();

      await handlers.handleDownloadBinaryResponse({ base64: 'abc', filename: 'file.bin' });

      expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('handleOpenBinaryResponse', () => {
    it('writes to temp file and opens externally', async () => {
      (vscode.workspace as any).fs = {
        writeFile: jest.fn().mockResolvedValue(undefined),
      };
      (vscode as any).env = {
        openExternal: jest.fn().mockResolvedValue(true),
      };
      const { handlers } = createHandlers();
      const base64 = Buffer.from('pdf-content').toString('base64');

      await handlers.handleOpenBinaryResponse({
        base64,
        filename: 'doc.pdf',
        contentType: 'application/pdf',
      });

      expect(vscode.workspace.fs.writeFile).toHaveBeenCalledWith(
        expect.objectContaining({ fsPath: expect.stringContaining('doc.pdf') }),
        Buffer.from(base64, 'base64'),
      );
      expect(vscode.env.openExternal).toHaveBeenCalled();
    });
  });

  // ==================== Settings ====================

  describe('handleUpdateSettings', () => {
    it('persists settings to globalState', async () => {
      const storage = createMockStorageService();
      const ctx = createMockContext(new Map());
      const { handlers } = createHandlers({ ctx, storage });

      const settings = {
        autoCorrectUrls: true,
        shortcuts: { 'send': 'Ctrl+Enter' },
        minimap: 'always',
        saveResponseBody: false,
        sslRejectUnauthorized: false,
        storageMode: 'global',
      };

      await handlers.handleUpdateSettings(settings as any);

      expect(ctx.extensionContext.globalState.update).toHaveBeenCalledWith(
        'hivefetch.settings',
        expect.objectContaining({ autoCorrectUrls: true, minimap: 'always' }),
      );
    });

    it('switches storage mode when changed', async () => {
      const storage = createMockStorageService();
      storage.getStorageMode.mockReturnValue('global');
      storage.switchStorageMode.mockResolvedValue(true);
      const ctx = createMockContext(new Map());
      const { handlers } = createHandlers({ ctx, storage });

      await handlers.handleUpdateSettings({
        autoCorrectUrls: false,
        shortcuts: {},
        minimap: 'auto',
        saveResponseBody: true,
        sslRejectUnauthorized: true,
        storageMode: 'workspace',
      } as any);

      expect(storage.switchStorageMode).toHaveBeenCalledWith('workspace');
      expect(ctx.sidebarProvider.notifyCollectionsUpdated).toHaveBeenCalled();
    });

    it('reverts storageMode when switch fails', async () => {
      const storage = createMockStorageService();
      storage.getStorageMode.mockReturnValue('global');
      storage.switchStorageMode.mockResolvedValue(false);
      const ctx = createMockContext(new Map());
      const { handlers } = createHandlers({ ctx, storage });

      await handlers.handleUpdateSettings({
        autoCorrectUrls: false,
        shortcuts: {},
        minimap: 'auto',
        saveResponseBody: true,
        sslRejectUnauthorized: true,
        storageMode: 'workspace',
      } as any);

      // Should persist with original mode, not the failed one
      expect(ctx.extensionContext.globalState.update).toHaveBeenCalledWith(
        'hivefetch.settings',
        expect.objectContaining({ storageMode: 'global' }),
      );
    });

    it('does not switch storage mode when unchanged', async () => {
      const storage = createMockStorageService();
      storage.getStorageMode.mockReturnValue('global');
      const ctx = createMockContext(new Map());
      const { handlers } = createHandlers({ ctx, storage });

      await handlers.handleUpdateSettings({
        autoCorrectUrls: false,
        shortcuts: {},
        minimap: 'auto',
        saveResponseBody: true,
        sslRejectUnauthorized: true,
        storageMode: 'global',
      } as any);

      expect(storage.switchStorageMode).not.toHaveBeenCalled();
    });
  });

  describe('broadcastSettings', () => {
    it('broadcasts settings with defaults to all panels', () => {
      const panel1 = createMockPanelInfo();
      const panel2 = createMockPanelInfo();
      const panels = new Map([['p1', panel1], ['p2', panel2]]);
      const ctx = createMockContext(panels);
      const storage = createMockStorageService();
      storage.getStorageMode.mockReturnValue('workspace');
      const { handlers } = createHandlers({ ctx, storage });

      handlers.broadcastSettings();

      const expectedData = {
        autoCorrectUrls: false,
        shortcuts: {},
        minimap: 'auto',
        saveResponseBody: true,
        sslRejectUnauthorized: true,
        storageMode: 'workspace',
        hasWorkspace: false,
        globalProxy: null,
        defaultTimeout: null,
        defaultFollowRedirects: null,
        defaultMaxRedirects: null,
        globalClientCert: null,
      };

      expect(panel1.panel.webview.postMessage).toHaveBeenCalledWith({
        type: 'loadSettings',
        data: expectedData,
      });
      expect(panel2.panel.webview.postMessage).toHaveBeenCalledWith({
        type: 'loadSettings',
        data: expectedData,
      });
    });

    it('uses stored settings when available', () => {
      const panels = new Map([['p1', createMockPanelInfo()]]);
      const ctx = createMockContext(panels);
      (ctx.extensionContext.globalState.get as jest.Mock).mockReturnValue({
        autoCorrectUrls: true,
        shortcuts: { send: 'F5' },
        minimap: 'always',
        saveResponseBody: false,
        sslRejectUnauthorized: false,
        globalProxy: { enabled: true, host: 'proxy.local', port: 8080 },
        defaultTimeout: 30000,
        defaultFollowRedirects: false,
        defaultMaxRedirects: 5,
        globalClientCert: { certPath: '/cert.pem' },
      });
      const storage = createMockStorageService();
      storage.getStorageMode.mockReturnValue('global');
      const { handlers } = createHandlers({ ctx, storage });

      handlers.broadcastSettings();

      const panel = panels.get('p1')!;
      expect(panel.panel.webview.postMessage).toHaveBeenCalledWith({
        type: 'loadSettings',
        data: expect.objectContaining({
          autoCorrectUrls: true,
          minimap: 'always',
          saveResponseBody: false,
          defaultTimeout: 30000,
          globalProxy: expect.objectContaining({ host: 'proxy.local' }),
        }),
      });
    });
  });

  // ==================== Cookie header injection (private, tested via public methods) ====================

  describe('cookie header injection (via handleWsConnect)', () => {
    it('does not inject when buildCookieHeader returns null', async () => {
      const panelInfo = createMockPanelInfo();
      const panels = new Map([['p1', panelInfo]]);
      const ctx = createMockContext(panels);
      const cookieJar = createMockCookieJarService();
      cookieJar.buildCookieHeader.mockResolvedValue(null);
      const { handlers } = createHandlers({ ctx, cookieJar });
      const webview = createMockWebview();

      await handlers.handleWsConnect(webview as any, 'p1', {
        url: 'ws://test',
        headers: [{ id: '1', key: 'X-Custom', value: 'val', enabled: true }],
      });

      const connectCall = mockWsConnect.mock.calls[0][0];
      expect(connectCall.headers).toHaveLength(1);
      expect(connectCall.headers[0].key).toBe('X-Custom');
    });

    it('does not inject when disabled Cookie header exists', async () => {
      const panelInfo = createMockPanelInfo();
      const panels = new Map([['p1', panelInfo]]);
      const ctx = createMockContext(panels);
      const cookieJar = createMockCookieJarService();
      cookieJar.buildCookieHeader.mockResolvedValue('should-inject');
      const { handlers } = createHandlers({ ctx, cookieJar });
      const webview = createMockWebview();

      // Disabled Cookie header should NOT block injection
      await handlers.handleWsConnect(webview as any, 'p1', {
        url: 'ws://test',
        headers: [{ id: '1', key: 'Cookie', value: 'disabled-val', enabled: false }],
      });

      const connectCall = mockWsConnect.mock.calls[0][0];
      expect(connectCall.headers).toHaveLength(2);
      expect(connectCall.headers[1].key).toBe('Cookie');
      expect(connectCall.headers[1].value).toBe('should-inject');
    });

    it('uses empty array when headers not provided', async () => {
      const panelInfo = createMockPanelInfo();
      const panels = new Map([['p1', panelInfo]]);
      const ctx = createMockContext(panels);
      const cookieJar = createMockCookieJarService();
      cookieJar.buildCookieHeader.mockResolvedValue('injected=val');
      const { handlers } = createHandlers({ ctx, cookieJar });
      const webview = createMockWebview();

      await handlers.handleWsConnect(webview as any, 'p1', { url: 'ws://test' });

      const connectCall = mockWsConnect.mock.calls[0][0];
      expect(connectCall.headers).toHaveLength(1);
      expect(connectCall.headers[0].key).toBe('Cookie');
    });
  });
});
