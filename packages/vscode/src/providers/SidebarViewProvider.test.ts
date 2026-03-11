import * as vscode from 'vscode';

// Mock all heavy dependencies
const mockLoadCollections = jest.fn().mockResolvedValue([]);
const mockSaveCollections = jest.fn().mockResolvedValue(true);
const mockLoadEnvironments = jest.fn().mockResolvedValue({ environments: [], activeId: null });
const mockSaveEnvironments = jest.fn().mockResolvedValue(true);
const mockGetStorageDir = jest.fn().mockReturnValue('/mock/storage');
const mockGetWorkspaceRoot = jest.fn().mockReturnValue(null);
const mockGetStorageMode = jest.fn().mockReturnValue('global');

jest.mock('../services/StorageService', () => ({
  StorageService: jest.fn().mockImplementation(() => ({
    loadCollections: mockLoadCollections,
    saveCollections: mockSaveCollections,
    loadEnvironments: mockLoadEnvironments,
    saveEnvironments: mockSaveEnvironments,
    getStorageDir: mockGetStorageDir,
    getWorkspaceRoot: mockGetWorkspaceRoot,
    getStorageMode: mockGetStorageMode,
  })),
}));

jest.mock('../services/EnvFileService', () => ({
  EnvFileService: jest.fn().mockImplementation(() => ({
    onDidChange: jest.fn(),
    getVariables: jest.fn().mockReturnValue([]),
    getFilePath: jest.fn().mockReturnValue(null),
    dispose: jest.fn(),
    setFilePath: jest.fn(),
  })),
}));

jest.mock('../services/HistoryStorageService', () => ({
  HistoryStorageService: jest.fn().mockImplementation(() => ({
    load: jest.fn().mockResolvedValue(undefined),
    search: jest.fn().mockResolvedValue({ entries: [], total: 0 }),
    getEntry: jest.fn().mockResolvedValue(null),
    append: jest.fn().mockResolvedValue(undefined),
    deleteEntry: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
    getStats: jest.fn().mockResolvedValue({}),
    getTotal: jest.fn().mockReturnValue(0),
    seedFromRecent: jest.fn().mockResolvedValue(undefined),
    updateEntryCollectionId: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../services/FetchmanWatcher', () => ({
  FetchmanWatcher: jest.fn().mockImplementation(() => ({
    onDidChange: jest.fn(),
    start: jest.fn(),
    dispose: jest.fn(),
    suppressChanges: jest.fn((fn: any) => fn()),
  })),
}));

jest.mock('@hivefetch/core/services', () => ({
  CollectionRunnerService: jest.fn().mockImplementation(() => ({})),
  BenchmarkService: jest.fn().mockImplementation(() => ({ cancel: jest.fn() })),
  MockServerService: jest.fn().mockImplementation(() => ({ stop: jest.fn().mockResolvedValue(undefined) })),
  MockStorageService: jest.fn().mockImplementation(() => ({})),
  DraftsCollectionService: {
    addToDrafts: jest.fn((_cols: any) => _cols),
    removeFromDrafts: jest.fn((_cols: any) => _cols),
    clearDrafts: jest.fn((_cols: any) => []),
  },
  CookieJarService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@hivefetch/core', () => ({
  extractPathname: jest.fn((url: string) => {
    try { return new URL(url).pathname; } catch { return url; }
  }),
  isFolder: jest.fn((item: any) => item?.type === 'folder'),
  isRequest: jest.fn((item: any) => item?.type === 'request'),
  generateId: jest.fn(() => `mock-id-${Date.now()}`),
  REQUEST_KIND: { HTTP: 'http', GRAPHQL: 'graphql', WEBSOCKET: 'websocket', SSE: 'sse' },
  getDefaultsForRequestKind: jest.fn(() => ({ url: '', method: 'GET', body: { type: 'none', content: '' }, connectionMode: 'http' })),
}));

jest.mock('./sidebar/CollectionTreeOps', () => ({
  findRequestInCollection: jest.fn(),
  updateItemInTree: jest.fn((items: any[], _id: string, updater: any) => {
    return items.map((item: any) => {
      if (item.id === _id) return updater(item);
      return item;
    });
  }),
}));

jest.mock('./sidebar/CollectionCrudHandler', () => ({
  CollectionCrudHandler: jest.fn().mockImplementation(() => ({
    createRequest: jest.fn(),
    createRequestFromUrl: jest.fn(),
    createCollection: jest.fn(),
    renameCollection: jest.fn(),
    deleteCollection: jest.fn(),
    duplicateCollection: jest.fn(),
    deleteRequest: jest.fn(),
    duplicateRequest: jest.fn(),
    duplicateFolder: jest.fn(),
    exportFolder: jest.fn(),
    deleteFolder: jest.fn(),
    bulkDelete: jest.fn(),
    bulkMovePickTarget: jest.fn(),
    createEmptyCollection: jest.fn(),
    createRequestInCollection: jest.fn(),
    createCollectionAndAddRequest: jest.fn(),
    addRequest: jest.fn(),
  })),
}));

jest.mock('./sidebar/RunnerPanelHandler', () => ({
  RunnerPanelHandler: jest.fn().mockImplementation(() => ({
    openCollectionRunner: jest.fn(),
  })),
}));

jest.mock('./sidebar/EnvironmentHandler', () => ({
  EnvironmentHandler: jest.fn().mockImplementation(() => ({
    createEnvironment: jest.fn(),
    renameEnvironment: jest.fn(),
    deleteEnvironment: jest.fn(),
    duplicateEnvironment: jest.fn(),
    setActiveEnvironment: jest.fn(),
    saveEnvironments: jest.fn(),
    linkEnvFile: jest.fn(),
    unlinkEnvFile: jest.fn(),
    exportEnvironment: jest.fn(),
    exportAllEnvironments: jest.fn(),
  })),
}));

jest.mock('./sidebar/SpecialPanelHandler', () => ({
  SpecialPanelHandler: jest.fn().mockImplementation(() => ({
    openSettingsPanel: jest.fn(),
    openMockServerPanel: jest.fn(),
    openBenchmarkPanel: jest.fn(),
  })),
}));

jest.mock('./sidebar/EnvironmentsPanelHandler', () => ({
  EnvironmentsPanelHandler: jest.fn().mockImplementation(() => ({
    open: jest.fn(),
  })),
}));

jest.mock('./confirmAction', () => ({
  confirmAction: jest.fn().mockResolvedValue(false),
}));

jest.mock('../services/UIService', () => ({
  UIService: jest.fn().mockImplementation(() => ({
    handleResponseMessage: jest.fn().mockReturnValue(false),
    showInfo: jest.fn(),
    showWarning: jest.fn(),
    showError: jest.fn(),
    showInputBox: jest.fn(),
    showQuickPick: jest.fn(),
    confirm: jest.fn(),
  })),
}));

jest.mock('crypto', () => ({
  randomBytes: jest.fn().mockReturnValue({ toString: jest.fn().mockReturnValue('mock-nonce') }),
}));

jest.mock('fs/promises', () => ({
  access: jest.fn().mockResolvedValue(undefined),
}));

import { SidebarViewProvider } from './SidebarViewProvider';
import { confirmAction } from './confirmAction';

describe('SidebarViewProvider', () => {
  let provider: SidebarViewProvider;
  const extensionUri: any = { fsPath: '/mock/ext', path: '/mock/ext' };

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new SidebarViewProvider(extensionUri, '/mock/global');
  });

  describe('static viewType', () => {
    it('should have correct view type', () => {
      expect(SidebarViewProvider.viewType).toBe('hivefetch.sidebar');
    });
  });

  describe('whenReady', () => {
    it('should resolve after initial data loads', async () => {
      await expect(provider.whenReady()).resolves.toBeUndefined();
    });
  });

  describe('getCollections / getEnvironments', () => {
    it('should return loaded collections', async () => {
      await provider.whenReady();
      expect(provider.getCollections()).toEqual([]);
    });

    it('should return loaded environments', async () => {
      await provider.whenReady();
      expect(provider.getEnvironments()).toEqual({ environments: [], activeId: null });
    });
  });

  describe('updateEnvironments', () => {
    it('should update environments cache', () => {
      const newEnv = { environments: [{ id: 'e1', name: 'Prod', variables: [] }], activeId: 'e1' } as any;
      provider.updateEnvironments(newEnv);
      expect(provider.getEnvironments()).toEqual(newEnv);
    });
  });

  describe('setPanelManager', () => {
    it('should set panel manager without error', () => {
      const mockPM: any = { broadcastCollections: jest.fn() };
      expect(() => provider.setPanelManager(mockPM)).not.toThrow();
    });
  });

  describe('resolveWebviewView', () => {
    it('should configure webview and set HTML', () => {
      const mockWebview: any = {
        options: {},
        html: '',
        onDidReceiveMessage: jest.fn(),
        postMessage: jest.fn(),
        asWebviewUri: jest.fn((uri: any) => uri.fsPath),
        cspSource: 'csp',
      };
      const mockView: any = { webview: mockWebview };

      provider.resolveWebviewView(mockView, {} as any, {} as any);

      expect(mockWebview.options.enableScripts).toBe(true);
      expect(mockWebview.html).toContain('<!DOCTYPE html>');
      expect(mockWebview.html).toContain('mock-nonce');
      expect(mockWebview.onDidReceiveMessage).toHaveBeenCalled();
    });

    it('should create UIService', () => {
      const mockWebview: any = {
        options: {},
        html: '',
        onDidReceiveMessage: jest.fn(),
        postMessage: jest.fn(),
        asWebviewUri: jest.fn((uri: any) => uri.fsPath),
        cspSource: 'csp',
      };
      const mockView: any = { webview: mockWebview };

      provider.resolveWebviewView(mockView, {} as any, {} as any);
      expect(provider.uiService).toBeDefined();
    });
  });

  describe('triggerDuplicateSelected', () => {
    it('should post message to webview', () => {
      const mockPostMessage = jest.fn();
      const mockWebview: any = {
        options: {},
        html: '',
        onDidReceiveMessage: jest.fn(),
        postMessage: mockPostMessage,
        asWebviewUri: jest.fn((uri: any) => uri.fsPath),
        cspSource: 'csp',
      };
      (provider as any)._view = { webview: mockWebview };

      provider.triggerDuplicateSelected();
      expect(mockPostMessage).toHaveBeenCalledWith({ type: 'triggerDuplicateSelected' });
    });

    it('should not throw when view is not set', () => {
      expect(() => provider.triggerDuplicateSelected()).not.toThrow();
    });
  });

  describe('setDirtyRequestIds', () => {
    it('should post dirtyRequestIds message', () => {
      const mockPostMessage = jest.fn();
      (provider as any)._view = { webview: { postMessage: mockPostMessage } };

      provider.setDirtyRequestIds(['req-1', 'req-2']);
      expect(mockPostMessage).toHaveBeenCalledWith({
        type: 'dirtyRequestIds',
        data: ['req-1', 'req-2'],
      });
    });
  });

  describe('logHistory', () => {
    it('should append and broadcast', async () => {
      const entry = { id: 'h-1', method: 'GET', url: '/test' };
      await provider.logHistory(entry);
      // Should not throw
    });
  });

  describe('deleteHistoryEntryById', () => {
    it('should delete and broadcast', async () => {
      await provider.deleteHistoryEntryById('h-1');
      // Should not throw
    });
  });

  describe('clearAllHistory', () => {
    it('should clear and broadcast', async () => {
      await provider.clearAllHistory();
      // Should not throw
    });
  });

  describe('dispose', () => {
    it('should dispose services', () => {
      expect(() => provider.dispose()).not.toThrow();
    });
  });

  describe('delegation methods', () => {
    it('createEmptyCollection should delegate to crudHandler', async () => {
      await provider.createEmptyCollection('Test');
      // Delegates to mock
    });

    it('createRequestInCollection should delegate', async () => {
      const mockCrud = (provider as any)._crudHandler;
      mockCrud.createRequestInCollection.mockResolvedValue({
        request: { id: 'r1' },
        collectionId: 'c1',
        connectionMode: 'http',
      });

      const result = await provider.createRequestInCollection('c1');
      expect(result.request.id).toBe('r1');
    });

    it('createCollectionAndAddRequest should delegate', async () => {
      const mockCrud = (provider as any)._crudHandler;
      mockCrud.createCollectionAndAddRequest.mockResolvedValue({
        collectionId: 'c-new',
        request: { id: 'r-new' },
        connectionMode: 'http',
      });

      const result = await provider.createCollectionAndAddRequest('New API');
      expect(result.collectionId).toBe('c-new');
    });

    it('addRequest should delegate', async () => {
      const mockCrud = (provider as any)._crudHandler;
      mockCrud.addRequest.mockResolvedValue({ id: 'new-req', name: 'Test' });

      const result = await provider.addRequest('c1', { type: 'request', name: 'Test', method: 'GET', url: '/test', params: [], headers: [], auth: { type: 'none' }, body: { type: 'none', content: '' } } as any);
      expect(result.id).toBe('new-req');
    });

    it('createRequestFromUrl should delegate', async () => {
      await provider.createRequestFromUrl('https://example.com');
      expect((provider as any)._crudHandler.createRequestFromUrl).toHaveBeenCalledWith('https://example.com');
    });
  });

  describe('getStorageService', () => {
    it('should return the storage service', () => {
      expect(provider.getStorageService()).toBeDefined();
    });
  });

  describe('getEnvFileService', () => {
    it('should return the env file service', () => {
      expect(provider.getEnvFileService()).toBeDefined();
    });
  });

  describe('getHistoryService', () => {
    it('should return the history service', () => {
      expect(provider.getHistoryService()).toBeDefined();
    });
  });
});
