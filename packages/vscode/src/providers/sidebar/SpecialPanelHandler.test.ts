jest.mock('@nouto/core/services', () => ({
  MockStorageService: {
    collectionToRoutes: jest.fn().mockReturnValue([
      { path: '/users', method: 'GET', status: 200, body: '[]' },
    ]),
  },
}));

import * as vscode from 'vscode';
import { SpecialPanelHandler, type ISpecialPanelContext } from './SpecialPanelHandler';
import { MockStorageService as MockStorageServiceClass } from '@nouto/core/services';

// --- Mock webview panel factory ---

type MessageHandler = (message: any) => Promise<void> | void;
type DisposeHandler = () => void;

function createMockWebviewPanel() {
  let messageHandler: MessageHandler | undefined;
  let disposeHandler: DisposeHandler | undefined;

  const webview = {
    html: '',
    postMessage: jest.fn().mockResolvedValue(true),
    onDidReceiveMessage: jest.fn((handler: MessageHandler) => {
      messageHandler = handler;
      return { dispose: jest.fn() };
    }),
    asWebviewUri: jest.fn((uri: any) => ({ toString: () => uri?.fsPath || String(uri) })),
    cspSource: 'mock-csp-source',
  };

  const panel = {
    webview,
    dispose: jest.fn(),
    onDidDispose: jest.fn((handler: DisposeHandler) => {
      disposeHandler = handler;
      return { dispose: jest.fn() };
    }),
  };

  return {
    panel,
    webview,
    /** Simulate a message from the webview */
    sendMessage: (msg: any) => messageHandler?.(msg),
    /** Simulate the panel being disposed */
    triggerDispose: () => disposeHandler?.(),
  };
}

// --- Helpers ---

function createMockContext(overrides: Partial<ISpecialPanelContext> = {}): ISpecialPanelContext {
  return {
    collections: [],
    storageService: {
      saveCollections: jest.fn().mockResolvedValue(undefined),
      loadEnvironments: jest.fn().mockResolvedValue({ activeEnvironmentId: null, environments: [] }),
    },
    extensionUri: vscode.Uri.file('/mock/extension'),
    getNonce: jest.fn().mockReturnValue('test-nonce'),
    notifyCollectionsUpdated: jest.fn(),
    uiService: undefined,
    ...overrides,
  };
}

function createMockBenchmarkService() {
  return {
    run: jest.fn().mockResolvedValue({ totalTime: 1000, iterations: 10, avgTime: 100 }),
    cancel: jest.fn(),
  };
}

function createMockMockServerService() {
  return {
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    getStatus: jest.fn().mockReturnValue('stopped'),
    updateRoutes: jest.fn(),
    clearLogs: jest.fn(),
    setStatusChangeHandler: jest.fn(),
    setLogHandler: jest.fn(),
  };
}

function createMockMockStorageService() {
  return {
    load: jest.fn().mockResolvedValue({ port: 3000, routes: [] }),
    save: jest.fn().mockResolvedValue(undefined),
  };
}

function createMockUIService() {
  return {
    showError: jest.fn(),
    showInfo: jest.fn(),
    showQuickPick: jest.fn(),
  } as any;
}

function createHandler(overrides: {
  ctx?: Partial<ISpecialPanelContext>;
  benchmarkService?: any;
  mockServerService?: any;
  mockStorageService?: any;
} = {}) {
  const ctx = createMockContext(overrides.ctx);
  const benchmarkService = overrides.benchmarkService ?? createMockBenchmarkService();
  const mockServerService = overrides.mockServerService ?? createMockMockServerService();
  const mockStorageService = overrides.mockStorageService ?? createMockMockStorageService();

  const handler = new SpecialPanelHandler(ctx, benchmarkService, mockServerService, mockStorageService);
  return { handler, ctx, benchmarkService, mockServerService, mockStorageService };
}

function makeCollection(id: string, name: string, items: any[] = [], extra: any = {}) {
  return { id, name, items, createdAt: '2026-01-01', updatedAt: '2026-01-01', ...extra };
}

function makeFolder(id: string, name: string, children: any[] = [], extra: any = {}) {
  return { type: 'folder' as const, id, name, children, ...extra };
}

function makeRequest(id: string, name: string, extra: any = {}) {
  return {
    type: 'request' as const,
    id,
    name,
    method: 'GET',
    url: 'https://example.com/api',
    params: [],
    headers: [],
    body: { type: 'none' },
    ...extra,
  };
}

// --- Tests ---

describe('SpecialPanelHandler', () => {
  let mockPanel: ReturnType<typeof createMockWebviewPanel>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPanel = createMockWebviewPanel();
    (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockPanel.panel);
  });

  // ==================== Settings Panel ====================

  describe('openSettingsPanel', () => {
    it('does nothing when collection is not found', async () => {
      const { handler } = createHandler();
      await handler.openSettingsPanel('collection', 'nonexistent');

      expect(vscode.window.createWebviewPanel).not.toHaveBeenCalled();
    });

    it('creates a settings panel for a collection', async () => {
      const collection = makeCollection('col-1', 'My Collection', [], {
        auth: { type: 'bearer', token: 'abc' },
        headers: [{ key: 'X-Custom', value: 'val', enabled: true }],
        variables: [{ key: 'host', value: 'localhost', enabled: true }],
        scripts: { pre: 'console.log("pre")', post: '' },
        description: 'Collection notes',
      });
      const { handler } = createHandler({ ctx: { collections: [collection] } });

      await handler.openSettingsPanel('collection', 'col-1');

      expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
        'nouto.settings',
        'Settings: My Collection',
        vscode.ViewColumn.Active,
        expect.objectContaining({
          enableScripts: true,
          retainContextWhenHidden: true,
        }),
      );
    });

    it('sends initSettings on ready message for collection', async () => {
      const collection = makeCollection('col-1', 'Test Col', [], {
        auth: { type: 'none' },
        headers: [],
        variables: [],
        scripts: undefined,
        description: 'notes here',
      });
      const { handler } = createHandler({ ctx: { collections: [collection] } });

      await handler.openSettingsPanel('collection', 'col-1');
      await mockPanel.sendMessage({ type: 'ready' });

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
        type: 'initSettings',
        data: expect.objectContaining({
          entityType: 'collection',
          entityName: 'Test Col',
          collectionId: 'col-1',
          folderId: undefined,
          initialNotes: 'notes here',
        }),
      });
    });

    it('does nothing for folder settings when folder is not found', async () => {
      const collection = makeCollection('col-1', 'Col', []);
      const { handler } = createHandler({ ctx: { collections: [collection] } });

      await handler.openSettingsPanel('folder', 'col-1', 'nonexistent-folder');

      expect(vscode.window.createWebviewPanel).not.toHaveBeenCalled();
    });

    it('creates a settings panel for a folder', async () => {
      const folder = makeFolder('folder-1', 'My Folder', [], {
        auth: { type: 'basic', username: 'u', password: 'p' },
        headers: [],
        variables: [],
        scripts: undefined,
        description: 'folder desc',
      });
      const collection = makeCollection('col-1', 'Col', [folder]);
      const { handler } = createHandler({ ctx: { collections: [collection] } });

      await handler.openSettingsPanel('folder', 'col-1', 'folder-1');

      expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
        'nouto.settings',
        'Settings: My Folder',
        expect.anything(),
        expect.anything(),
      );
    });

    it('sends initSettings on ready message for folder', async () => {
      const folder = makeFolder('folder-1', 'Test Folder', [], {
        auth: { type: 'none' },
        headers: [{ key: 'h', value: 'v', enabled: true }],
        variables: [{ key: 'k', value: 'v', enabled: true }],
        scripts: { pre: '', post: '' },
        description: undefined,
      });
      const collection = makeCollection('col-1', 'Col', [folder]);
      const { handler } = createHandler({ ctx: { collections: [collection] } });

      await handler.openSettingsPanel('folder', 'col-1', 'folder-1');
      await mockPanel.sendMessage({ type: 'ready' });

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
        type: 'initSettings',
        data: expect.objectContaining({
          entityType: 'folder',
          entityName: 'Test Folder',
          collectionId: 'col-1',
          folderId: 'folder-1',
          initialNotes: '',
        }),
      });
    });

    it('saves collection settings and notifies', async () => {
      const collection = makeCollection('col-1', 'Col', []);
      const { handler, ctx } = createHandler({ ctx: { collections: [collection] } });

      await handler.openSettingsPanel('collection', 'col-1');
      await mockPanel.sendMessage({
        type: 'saveCollectionSettings',
        data: {
          collectionId: 'col-1',
          auth: { type: 'bearer', token: 'new' },
          headers: [{ key: 'X-New', value: 'v', enabled: true }],
          variables: [],
          scripts: { pre: 'test', post: '' },
          notes: 'updated notes',
        },
      });

      expect(collection.auth).toEqual({ type: 'bearer', token: 'new' });
      expect(collection.headers).toEqual([{ key: 'X-New', value: 'v', enabled: true }]);
      expect(collection.description).toBe('updated notes');
      expect(ctx.storageService.saveCollections).toHaveBeenCalledWith(ctx.collections);
      expect(ctx.notifyCollectionsUpdated).toHaveBeenCalled();
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({ type: 'settingsSaved' });
    });

    it('saves collection settings with null notes as empty string', async () => {
      const collection = makeCollection('col-1', 'Col', []);
      const { handler } = createHandler({ ctx: { collections: [collection] } });

      await handler.openSettingsPanel('collection', 'col-1');
      await mockPanel.sendMessage({
        type: 'saveCollectionSettings',
        data: {
          collectionId: 'col-1',
          auth: undefined,
          headers: undefined,
          variables: undefined,
          scripts: undefined,
          notes: null,
        },
      });

      expect(collection.description).toBe('');
    });

    it('does nothing for saveCollectionSettings with unknown collectionId', async () => {
      const collection = makeCollection('col-1', 'Col', []);
      const { handler, ctx } = createHandler({ ctx: { collections: [collection] } });

      await handler.openSettingsPanel('collection', 'col-1');
      await mockPanel.sendMessage({
        type: 'saveCollectionSettings',
        data: { collectionId: 'unknown' },
      });

      expect(ctx.storageService.saveCollections).not.toHaveBeenCalled();
    });

    it('saves folder settings and notifies', async () => {
      const folder = makeFolder('folder-1', 'Folder', []);
      const collection = makeCollection('col-1', 'Col', [folder]);
      const { handler, ctx } = createHandler({ ctx: { collections: [collection] } });

      await handler.openSettingsPanel('folder', 'col-1', 'folder-1');
      await mockPanel.sendMessage({
        type: 'saveFolderSettings',
        data: {
          collectionId: 'col-1',
          folderId: 'folder-1',
          auth: { type: 'none' },
          headers: [],
          variables: [{ key: 'var1', value: 'val1', enabled: true }],
          scripts: { pre: '', post: 'done' },
          notes: 'folder notes',
        },
      });

      expect(folder.auth).toEqual({ type: 'none' });
      expect(folder.variables).toEqual([{ key: 'var1', value: 'val1', enabled: true }]);
      expect(folder.description).toBe('folder notes');
      expect(ctx.storageService.saveCollections).toHaveBeenCalled();
      expect(ctx.notifyCollectionsUpdated).toHaveBeenCalled();
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({ type: 'settingsSaved' });
    });

    it('does nothing for saveFolderSettings with unknown collection', async () => {
      const folder = makeFolder('folder-1', 'Folder', []);
      const collection = makeCollection('col-1', 'Col', [folder]);
      const { handler, ctx } = createHandler({ ctx: { collections: [collection] } });

      await handler.openSettingsPanel('folder', 'col-1', 'folder-1');
      await mockPanel.sendMessage({
        type: 'saveFolderSettings',
        data: { collectionId: 'unknown', folderId: 'folder-1' },
      });

      expect(ctx.storageService.saveCollections).not.toHaveBeenCalled();
    });

    it('does nothing for saveFolderSettings with unknown folder', async () => {
      const collection = makeCollection('col-1', 'Col', []);
      const { handler, ctx } = createHandler({ ctx: { collections: [collection] } });

      await handler.openSettingsPanel('collection', 'col-1');
      await mockPanel.sendMessage({
        type: 'saveFolderSettings',
        data: { collectionId: 'col-1', folderId: 'nonexistent' },
      });

      expect(ctx.storageService.saveCollections).not.toHaveBeenCalled();
    });

    it('disposes panel on closeSettingsPanel message', async () => {
      const collection = makeCollection('col-1', 'Col', []);
      const { handler } = createHandler({ ctx: { collections: [collection] } });

      await handler.openSettingsPanel('collection', 'col-1');
      await mockPanel.sendMessage({ type: 'closeSettingsPanel' });

      expect(mockPanel.panel.dispose).toHaveBeenCalled();
    });

    it('disposes message listener when panel is disposed', async () => {
      const collection = makeCollection('col-1', 'Col', []);
      const { handler } = createHandler({ ctx: { collections: [collection] } });

      await handler.openSettingsPanel('collection', 'col-1');
      const disposable = (mockPanel.webview.onDidReceiveMessage as jest.Mock).mock.results[0].value;

      mockPanel.triggerDispose();

      expect(disposable.dispose).toHaveBeenCalled();
    });

    it('generates correct HTML with nonce and resource URIs', async () => {
      const collection = makeCollection('col-1', 'Col', []);
      const { handler } = createHandler({ ctx: { collections: [collection] } });

      await handler.openSettingsPanel('collection', 'col-1');

      const html = mockPanel.webview.html;
      expect(html).toContain('test-nonce');
      expect(html).toContain('settings.js');
      expect(html).toContain('theme.css');
      expect(html).toContain('style.css');
      expect(html).toContain('Settings');
    });

    it('sets updatedAt on collection when saving collection settings', async () => {
      const collection = makeCollection('col-1', 'Col', [], { updatedAt: '2020-01-01' });
      const { handler } = createHandler({ ctx: { collections: [collection] } });

      await handler.openSettingsPanel('collection', 'col-1');
      await mockPanel.sendMessage({
        type: 'saveCollectionSettings',
        data: { collectionId: 'col-1', auth: null, headers: null, variables: null, scripts: null, notes: '' },
      });

      expect(collection.updatedAt).not.toBe('2020-01-01');
    });
  });

  // ==================== Mock Server Panel ====================

  describe('openMockServerPanel', () => {
    it('creates a mock server panel and loads config', async () => {
      const mockStorageService = createMockMockStorageService();
      mockStorageService.load.mockResolvedValue({ port: 4000, routes: [{ path: '/test' }] });
      const { handler } = createHandler({ mockStorageService });

      await handler.openMockServerPanel();

      expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
        'nouto.mockServer',
        'Mock Server',
        vscode.ViewColumn.Active,
        expect.objectContaining({ enableScripts: true }),
      );
      expect(mockStorageService.load).toHaveBeenCalled();
    });

    it('sets status change and log handlers on mockServerService', async () => {
      const mockServerService = createMockMockServerService();
      const { handler } = createHandler({ mockServerService });

      await handler.openMockServerPanel();

      expect(mockServerService.setStatusChangeHandler).toHaveBeenCalledWith(expect.any(Function));
      expect(mockServerService.setLogHandler).toHaveBeenCalledWith(expect.any(Function));
    });

    it('forwards status changes to the webview', async () => {
      const mockServerService = createMockMockServerService();
      const { handler } = createHandler({ mockServerService });

      await handler.openMockServerPanel();

      const statusHandler = mockServerService.setStatusChangeHandler.mock.calls[0][0];
      statusHandler('running');

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
        type: 'mockStatusChanged',
        data: { status: 'running' },
      });
    });

    it('forwards log entries to the webview', async () => {
      const mockServerService = createMockMockServerService();
      const { handler } = createHandler({ mockServerService });

      await handler.openMockServerPanel();

      const logHandler = mockServerService.setLogHandler.mock.calls[0][0];
      const logEntry = { method: 'GET', path: '/test', status: 200, timestamp: Date.now() };
      logHandler(logEntry);

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
        type: 'mockLogAdded',
        data: logEntry,
      });
    });

    it('sends initMockServer on ready message', async () => {
      const mockStorageService = createMockMockStorageService();
      mockStorageService.load.mockResolvedValue({ port: 5000, routes: [] });
      const mockServerService = createMockMockServerService();
      mockServerService.getStatus.mockReturnValue('running');
      const { handler } = createHandler({ mockServerService, mockStorageService });

      await handler.openMockServerPanel();
      await mockPanel.sendMessage({ type: 'ready' });

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
        type: 'initMockServer',
        data: {
          config: { port: 5000, routes: [] },
          status: 'running',
        },
      });
    });

    it('starts mock server and saves config on startMockServer message', async () => {
      const mockServerService = createMockMockServerService();
      const mockStorageService = createMockMockStorageService();
      const { handler } = createHandler({ mockServerService, mockStorageService });

      await handler.openMockServerPanel();
      const config = { port: 8080, routes: [{ path: '/api', method: 'GET', status: 200, body: '{}' }] };
      await mockPanel.sendMessage({ type: 'startMockServer', data: { config } });

      expect(mockServerService.start).toHaveBeenCalledWith(config);
      expect(mockStorageService.save).toHaveBeenCalledWith(config);
    });

    it('shows error via uiService when mock server fails to start', async () => {
      const mockServerService = createMockMockServerService();
      mockServerService.start.mockRejectedValue(new Error('Port in use'));
      const uiService = createMockUIService();
      const { handler } = createHandler({
        mockServerService,
        ctx: { uiService },
      });

      await handler.openMockServerPanel();
      await mockPanel.sendMessage({ type: 'startMockServer', data: { config: { port: 80, routes: [] } } });

      expect(uiService.showError).toHaveBeenCalledWith('Mock server failed to start: Port in use');
    });

    it('stops mock server on stopMockServer message', async () => {
      const mockServerService = createMockMockServerService();
      const { handler } = createHandler({ mockServerService });

      await handler.openMockServerPanel();
      await mockPanel.sendMessage({ type: 'stopMockServer' });

      expect(mockServerService.stop).toHaveBeenCalled();
    });

    it('updates routes and saves config on updateMockRoutes message', async () => {
      const mockServerService = createMockMockServerService();
      const mockStorageService = createMockMockStorageService();
      const { handler } = createHandler({ mockServerService, mockStorageService });

      await handler.openMockServerPanel();
      const config = { port: 3000, routes: [{ path: '/new', method: 'POST', status: 201, body: '' }] };
      await mockPanel.sendMessage({ type: 'updateMockRoutes', data: { config } });

      expect(mockServerService.updateRoutes).toHaveBeenCalledWith(config.routes);
      expect(mockStorageService.save).toHaveBeenCalledWith(config);
    });

    it('clears logs on clearMockLogs message', async () => {
      const mockServerService = createMockMockServerService();
      const { handler } = createHandler({ mockServerService });

      await handler.openMockServerPanel();
      await mockPanel.sendMessage({ type: 'clearMockLogs' });

      expect(mockServerService.clearLogs).toHaveBeenCalled();
    });

    it('shows info when no collections available for import', async () => {
      const uiService = createMockUIService();
      const { handler } = createHandler({ ctx: { collections: [], uiService } });

      await handler.openMockServerPanel();
      await mockPanel.sendMessage({ type: 'importCollectionAsMocks' });

      expect(uiService.showInfo).toHaveBeenCalledWith('No collections available to import.');
    });

    it('imports collection as mock routes using uiService quick pick', async () => {
      const collection = makeCollection('col-1', 'My API', [
        makeRequest('req-1', 'Get Users', { method: 'GET', url: 'https://api.com/users' }),
      ]);
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({ label: 'My API', id: 'col-1' });
      const mockStorageService = createMockMockStorageService();
      mockStorageService.load.mockResolvedValue({ port: 3000, routes: [] });
      const mockServerService = createMockMockServerService();
      mockServerService.getStatus.mockReturnValue('stopped');

      const { handler } = createHandler({
        ctx: { collections: [collection] },
        mockServerService,
        mockStorageService,
      });

      await handler.openMockServerPanel();
      await mockPanel.sendMessage({ type: 'importCollectionAsMocks' });

      expect(vscode.window.showQuickPick).toHaveBeenCalled();
      expect(MockStorageServiceClass.collectionToRoutes).toHaveBeenCalledWith(collection);
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'initMockServer' }),
      );
    });

    it('does nothing when native quick pick is cancelled', async () => {
      const collection = makeCollection('col-1', 'Col', []);
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

      const { handler } = createHandler({ ctx: { collections: [collection] } });

      await handler.openMockServerPanel();
      // Reset postMessage calls from panel creation
      mockPanel.webview.postMessage.mockClear();
      await mockPanel.sendMessage({ type: 'importCollectionAsMocks' });

      expect(MockStorageServiceClass.collectionToRoutes).not.toHaveBeenCalled();
    });

    it('cleans up handlers on panel dispose', async () => {
      const mockServerService = createMockMockServerService();
      const { handler } = createHandler({ mockServerService });

      await handler.openMockServerPanel();
      const disposable = (mockPanel.webview.onDidReceiveMessage as jest.Mock).mock.results[0].value;

      mockPanel.triggerDispose();

      expect(disposable.dispose).toHaveBeenCalled();
      expect(mockServerService.setStatusChangeHandler).toHaveBeenCalledTimes(2);
      expect(mockServerService.setLogHandler).toHaveBeenCalledTimes(2);
    });

    it('generates correct HTML with mock server resources', async () => {
      const { handler } = createHandler();

      await handler.openMockServerPanel();

      const html = mockPanel.webview.html;
      expect(html).toContain('test-nonce');
      expect(html).toContain('mock.js');
      expect(html).toContain('theme.css');
      expect(html).toContain('style.css');
      expect(html).toContain('Mock Server');
    });
  });

  // ==================== Benchmark Panel ====================

  describe('openBenchmarkPanel', () => {
    it('shows error when request is not found', async () => {
      const uiService = createMockUIService();
      const { handler } = createHandler({ ctx: { collections: [], uiService } });

      await handler.openBenchmarkPanel('nonexistent-req');

      expect(uiService.showError).toHaveBeenCalledWith('Request not found for benchmarking.');
      expect(vscode.window.createWebviewPanel).not.toHaveBeenCalled();
    });

    it('does not show error when request is not found and no uiService', async () => {
      const { handler } = createHandler({ ctx: { collections: [], uiService: undefined } });

      await handler.openBenchmarkPanel('nonexistent-req');

      expect(vscode.window.createWebviewPanel).not.toHaveBeenCalled();
    });

    it('creates a benchmark panel for a found request', async () => {
      const request = makeRequest('req-1', 'Test Request', { method: 'POST', url: 'https://api.com/test' });
      const collection = makeCollection('col-1', 'Col', [request]);
      const { handler } = createHandler({ ctx: { collections: [collection] } });

      await handler.openBenchmarkPanel('req-1', 'col-1');

      expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
        'nouto.benchmark',
        'Benchmark: Test Request',
        vscode.ViewColumn.Active,
        expect.objectContaining({ enableScripts: true }),
      );
    });

    it('finds request across multiple collections', async () => {
      const request = makeRequest('req-2', 'Deep Request');
      const col1 = makeCollection('col-1', 'Col1', []);
      const col2 = makeCollection('col-2', 'Col2', [request]);
      const { handler } = createHandler({ ctx: { collections: [col1, col2] } });

      await handler.openBenchmarkPanel('req-2');

      expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
        'nouto.benchmark',
        'Benchmark: Deep Request',
        expect.anything(),
        expect.anything(),
      );
    });

    it('finds request inside nested folders', async () => {
      const request = makeRequest('req-nested', 'Nested Req');
      const innerFolder = makeFolder('f-inner', 'Inner', [request]);
      const outerFolder = makeFolder('f-outer', 'Outer', [innerFolder]);
      const collection = makeCollection('col-1', 'Col', [outerFolder]);
      const { handler } = createHandler({ ctx: { collections: [collection] } });

      await handler.openBenchmarkPanel('req-nested');

      expect(vscode.window.createWebviewPanel).toHaveBeenCalled();
    });

    it('sends initBenchmark on ready message', async () => {
      const request = makeRequest('req-1', 'My Request', { method: 'PUT', url: 'https://api.com/data' });
      const collection = makeCollection('col-1', 'Col', [request]);
      const { handler } = createHandler({ ctx: { collections: [collection] } });

      await handler.openBenchmarkPanel('req-1', 'col-1');
      await mockPanel.sendMessage({ type: 'ready' });

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
        type: 'initBenchmark',
        data: {
          requestId: 'req-1',
          requestName: 'My Request',
          requestMethod: 'PUT',
          requestUrl: 'https://api.com/data',
          collectionId: 'col-1',
        },
      });
    });

    it('sends initBenchmark with undefined collectionId when not provided', async () => {
      const request = makeRequest('req-1', 'Req');
      const collection = makeCollection('col-1', 'Col', [request]);
      const { handler } = createHandler({ ctx: { collections: [collection] } });

      await handler.openBenchmarkPanel('req-1');
      await mockPanel.sendMessage({ type: 'ready' });

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
        type: 'initBenchmark',
        data: expect.objectContaining({ collectionId: undefined }),
      });
    });

    it('starts benchmark and sends progress and completion messages', async () => {
      const request = makeRequest('req-1', 'Req');
      const collection = makeCollection('col-1', 'Col', [request]);
      const benchmarkService = createMockBenchmarkService();

      let progressCallback: any;
      let iterationCallback: any;
      const runResult = { totalTime: 500, iterations: 5, avgTime: 100 };

      benchmarkService.run.mockImplementation((_req: any, _config: any, _env: any, onProgress: any, onIteration: any) => {
        progressCallback = onProgress;
        iterationCallback = onIteration;
        // Simulate progress
        onProgress(1, 5);
        onIteration({ index: 0, time: 100, status: 200 });
        return Promise.resolve(runResult);
      });

      const { handler, ctx } = createHandler({ ctx: { collections: [collection] }, benchmarkService });

      await handler.openBenchmarkPanel('req-1', 'col-1');
      await mockPanel.sendMessage({
        type: 'startBenchmark',
        data: { config: { iterations: 5, concurrency: 1 } },
      });

      // Allow promises to resolve
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(ctx.storageService.loadEnvironments).toHaveBeenCalled();
      expect(benchmarkService.run).toHaveBeenCalledWith(
        request,
        { iterations: 5, concurrency: 1 },
        expect.anything(),
        expect.any(Function),
        expect.any(Function),
      );

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
        type: 'benchmarkProgress',
        data: { current: 1, total: 5 },
      });
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
        type: 'benchmarkIterationComplete',
        data: { index: 0, time: 100, status: 200 },
      });
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
        type: 'benchmarkComplete',
        data: runResult,
      });
    });

    it('sends benchmarkCancelled when benchmark run is rejected', async () => {
      const request = makeRequest('req-1', 'Req');
      const collection = makeCollection('col-1', 'Col', [request]);
      const benchmarkService = createMockBenchmarkService();
      benchmarkService.run.mockRejectedValue(new Error('Cancelled'));

      const { handler } = createHandler({ ctx: { collections: [collection] }, benchmarkService });

      await handler.openBenchmarkPanel('req-1', 'col-1');
      await mockPanel.sendMessage({
        type: 'startBenchmark',
        data: { config: { iterations: 10 } },
      });

      // Allow the rejection to propagate
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({ type: 'benchmarkCancelled' });
    });

    it('cancels benchmark on cancelBenchmark message', async () => {
      const request = makeRequest('req-1', 'Req');
      const collection = makeCollection('col-1', 'Col', [request]);
      const benchmarkService = createMockBenchmarkService();
      const { handler } = createHandler({ ctx: { collections: [collection] }, benchmarkService });

      await handler.openBenchmarkPanel('req-1', 'col-1');
      await mockPanel.sendMessage({ type: 'cancelBenchmark' });

      expect(benchmarkService.cancel).toHaveBeenCalled();
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({ type: 'benchmarkCancelled' });
    });

    it('shows info for exportBenchmarkResults message', async () => {
      const request = makeRequest('req-1', 'Req');
      const collection = makeCollection('col-1', 'Col', [request]);
      const uiService = createMockUIService();
      const { handler } = createHandler({ ctx: { collections: [collection], uiService } });

      await handler.openBenchmarkPanel('req-1', 'col-1');
      await mockPanel.sendMessage({
        type: 'exportBenchmarkResults',
        data: { format: 'csv' },
      });

      expect(uiService.showInfo).toHaveBeenCalledWith(
        'Benchmark export (csv) - use the iteration data shown in the panel.',
      );
    });

    it('cancels benchmark and disposes message listener on panel dispose', async () => {
      const request = makeRequest('req-1', 'Req');
      const collection = makeCollection('col-1', 'Col', [request]);
      const benchmarkService = createMockBenchmarkService();
      const { handler } = createHandler({ ctx: { collections: [collection] }, benchmarkService });

      await handler.openBenchmarkPanel('req-1', 'col-1');
      const disposable = (mockPanel.webview.onDidReceiveMessage as jest.Mock).mock.results[0].value;

      mockPanel.triggerDispose();

      expect(disposable.dispose).toHaveBeenCalled();
      expect(benchmarkService.cancel).toHaveBeenCalled();
    });

    it('generates correct HTML with benchmark resources', async () => {
      const request = makeRequest('req-1', 'Req');
      const collection = makeCollection('col-1', 'Col', [request]);
      const { handler } = createHandler({ ctx: { collections: [collection] } });

      await handler.openBenchmarkPanel('req-1', 'col-1');

      const html = mockPanel.webview.html;
      expect(html).toContain('test-nonce');
      expect(html).toContain('benchmark.js');
      expect(html).toContain('theme.css');
      expect(html).toContain('style.css');
      expect(html).toContain('Performance Benchmark');
    });
  });
});
