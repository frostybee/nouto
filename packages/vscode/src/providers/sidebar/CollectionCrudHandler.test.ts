import * as vscode from 'vscode';
import type { Collection, SavedRequest, Folder, CollectionItem } from '../../services/types';
import { CollectionCrudHandler, type ISidebarContext } from './CollectionCrudHandler';

// Helper to generate mock core exports
function createCoreMock() {
  return {
    extractPathname: jest.fn((url: string) => {
      const protoEnd = url.indexOf('://');
      if (protoEnd !== -1) {
        const pathStart = url.indexOf('/', protoEnd + 3);
        if (pathStart === -1) return '/';
        const queryStart = url.indexOf('?', pathStart);
        return queryStart !== -1 ? url.substring(pathStart, queryStart) : url.substring(pathStart);
      }
      return '/';
    }),
    isFolder: jest.fn((item: any) => item?.type === 'folder'),
    isRequest: jest.fn((item: any) => item?.type === 'request'),
    generateId: jest.fn(() => `mock-id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    REQUEST_KIND: { HTTP: 'http', GRAPHQL: 'graphql', WEBSOCKET: 'websocket', SSE: 'sse' },
    getDefaultsForRequestKind: jest.fn((kind: string) => {
      switch (kind) {
        case 'graphql': return { name: 'New GraphQL Request', url: '', method: 'POST', body: { type: 'graphql', content: '' }, connectionMode: 'http' };
        case 'websocket': return { name: 'New WebSocket', url: 'ws://', method: 'GET', body: { type: 'none', content: '' }, connectionMode: 'websocket' };
        case 'sse': return { name: 'New SSE Connection', url: '', method: 'GET', body: { type: 'none', content: '' }, connectionMode: 'sse' };
        default: return { name: 'New Request', url: '', method: 'GET', body: { type: 'none', content: '' }, connectionMode: 'http' };
      }
    }),
  };
}

// Mock external dependencies
jest.mock('@hivefetch/core/services', () => ({
  DraftsCollectionService: {
    isDraftsCollection: jest.fn((col: any) => col.builtin === 'drafts'),
  },
}));

jest.mock('@hivefetch/core', () => ({
  __esModule: true,
  ...createCoreMock(),
}));

// ── Helpers ─────────────────────────────────────────────────────────

function makeRequest(id: string, name = 'Test Request'): SavedRequest {
  return {
    type: 'request',
    id,
    name,
    method: 'GET',
    url: 'https://api.example.com',
    params: [],
    headers: [],
    auth: { type: 'none' },
    body: { type: 'none', content: '' },
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

function makeFolder(id: string, name: string, children: CollectionItem[] = []): Folder {
  return {
    type: 'folder',
    id,
    name,
    children,
    expanded: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

function makeCollection(id: string, name: string, items: CollectionItem[] = [], builtin?: string): Collection {
  return {
    id,
    name,
    items,
    expanded: true,
    ...(builtin ? { builtin } : {}),
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  } as Collection;
}

function createMockUIService() {
  return {
    showInputBox: jest.fn(),
    showQuickPick: jest.fn(),
    showInfo: jest.fn(),
    showWarning: jest.fn(),
    showError: jest.fn(),
  };
}

function createMockContext(overrides?: Partial<ISidebarContext>): ISidebarContext {
  return {
    collections: [],
    storageService: { saveCollections: jest.fn().mockResolvedValue(undefined) },
    panelManager: {
      closePanelsByRequestIds: jest.fn(),
      openNewRequest: jest.fn(),
    },
    extensionUri: vscode.Uri.file('/mock/extension'),
    notifyCollectionsUpdated: jest.fn(),
    uiService: undefined,
    ...overrides,
  };
}

// =====================================================================
// Tests
// =====================================================================

describe('CollectionCrudHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── createCollection ────────────────────────────────────────────

  describe('createCollection', () => {
    it('should create a collection with the provided name', async () => {
      const ctx = createMockContext();
      const handler = new CollectionCrudHandler(ctx);

      await handler.createCollection('My API');

      expect(ctx.collections).toHaveLength(1);
      expect(ctx.collections[0].name).toBe('My API');
      expect(ctx.collections[0].items).toEqual([]);
      expect(ctx.collections[0].expanded).toBe(true);
      expect(ctx.storageService.saveCollections).toHaveBeenCalledWith(ctx.collections);
      expect(ctx.notifyCollectionsUpdated).toHaveBeenCalled();
    });

    it('should prompt for name via vscode.window when no name and no UIService', async () => {
      const ctx = createMockContext();
      const handler = new CollectionCrudHandler(ctx);
      (vscode.window.showInputBox as jest.Mock).mockResolvedValue('Prompted Name');

      await handler.createCollection();

      expect(vscode.window.showInputBox).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: 'Collection name' }),
      );
      expect(ctx.collections).toHaveLength(1);
      expect(ctx.collections[0].name).toBe('Prompted Name');
    });

    it('should always use native vscode InputBox even when UIService is available', async () => {
      const ui = createMockUIService();
      const ctx = createMockContext({ uiService: ui as any });
      const handler = new CollectionCrudHandler(ctx);
      (vscode.window.showInputBox as jest.Mock).mockResolvedValue('Native Name');

      await handler.createCollection();

      expect(vscode.window.showInputBox).toHaveBeenCalled();
      expect(ui.showInputBox).not.toHaveBeenCalled();
      expect(ctx.collections[0].name).toBe('Native Name');
    });

    it('should do nothing if user cancels input', async () => {
      const ctx = createMockContext();
      const handler = new CollectionCrudHandler(ctx);
      (vscode.window.showInputBox as jest.Mock).mockResolvedValue(undefined);

      await handler.createCollection();

      expect(ctx.collections).toHaveLength(0);
      expect(ctx.storageService.saveCollections).not.toHaveBeenCalled();
    });
  });

  // ── renameCollection ────────────────────────────────────────────

  describe('renameCollection', () => {
    it('should rename an existing collection', async () => {
      const col = makeCollection('c1', 'Old Name');
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.renameCollection('c1', 'New Name');

      expect(col.name).toBe('New Name');
      expect(ctx.storageService.saveCollections).toHaveBeenCalled();
      expect(ctx.notifyCollectionsUpdated).toHaveBeenCalled();
    });

    it('should update the updatedAt timestamp', async () => {
      const col = makeCollection('c1', 'Test');
      const originalUpdatedAt = col.updatedAt;
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.renameCollection('c1', 'Renamed');

      expect(col.updatedAt).not.toBe(originalUpdatedAt);
    });

    it('should do nothing if collection not found', async () => {
      const ctx = createMockContext({ collections: [] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.renameCollection('nonexistent', 'Name');

      expect(ctx.storageService.saveCollections).not.toHaveBeenCalled();
    });
  });

  // ── deleteCollection ────────────────────────────────────────────

  describe('deleteCollection', () => {
    it('should delete an existing collection', async () => {
      const col = makeCollection('c1', 'To Delete', [makeRequest('r1')]);
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.deleteCollection('c1');

      expect(ctx.collections).toHaveLength(0);
      expect(ctx.storageService.saveCollections).toHaveBeenCalled();
      expect(ctx.notifyCollectionsUpdated).toHaveBeenCalled();
    });

    it('should close panels for requests in deleted collection', async () => {
      const col = makeCollection('c1', 'Test', [makeRequest('r1'), makeRequest('r2')]);
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.deleteCollection('c1');

      expect(ctx.panelManager!.closePanelsByRequestIds).toHaveBeenCalledWith(
        new Set(['r1', 'r2']),
      );
    });

    it('should not close panels if collection had no requests', async () => {
      const col = makeCollection('c1', 'Empty', []);
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.deleteCollection('c1');

      expect(ctx.panelManager!.closePanelsByRequestIds).not.toHaveBeenCalled();
    });

    it('should prevent deleting the Drafts collection', async () => {
      const ui = createMockUIService();
      const drafts = makeCollection('drafts-id', 'Drafts', [], 'drafts');
      const ctx = createMockContext({ collections: [drafts], uiService: ui as any });
      const handler = new CollectionCrudHandler(ctx);

      await handler.deleteCollection('drafts-id');

      expect(ctx.collections).toHaveLength(1);
      expect(ui.showWarning).toHaveBeenCalledWith(
        expect.stringContaining('Cannot delete the Drafts collection'),
      );
      expect(ctx.storageService.saveCollections).not.toHaveBeenCalled();
    });

    it('should do nothing if collection not found', async () => {
      const ctx = createMockContext({ collections: [] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.deleteCollection('nonexistent');

      expect(ctx.storageService.saveCollections).not.toHaveBeenCalled();
    });

    it('should collect request IDs from nested folders', async () => {
      const folder = makeFolder('f1', 'Folder', [makeRequest('r2')]);
      const col = makeCollection('c1', 'Test', [makeRequest('r1'), folder]);
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.deleteCollection('c1');

      expect(ctx.panelManager!.closePanelsByRequestIds).toHaveBeenCalledWith(
        new Set(['r1', 'r2']),
      );
    });
  });

  // ── duplicateCollection ─────────────────────────────────────────

  describe('duplicateCollection', () => {
    it('should duplicate a collection with new ID and "(copy)" suffix', async () => {
      const col = makeCollection('c1', 'My API', [makeRequest('r1')]);
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.duplicateCollection('c1');

      expect(ctx.collections).toHaveLength(2);
      const dup = ctx.collections[1];
      expect(dup.name).toBe('My API (copy)');
      expect(dup.id).not.toBe('c1');
      expect(dup.items).toHaveLength(1);
      expect(dup.items[0].id).not.toBe('r1');
    });

    it('should clear builtin flag on duplicate', async () => {
      const col = makeCollection('c1', 'Builtin', [], 'drafts');
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.duplicateCollection('c1');

      const dup = ctx.collections[1];
      expect(dup.builtin).toBeUndefined();
    });

    it('should do nothing if collection not found', async () => {
      const ctx = createMockContext({ collections: [] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.duplicateCollection('nonexistent');

      expect(ctx.storageService.saveCollections).not.toHaveBeenCalled();
    });

    it('should save and notify after duplication', async () => {
      const col = makeCollection('c1', 'Test');
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.duplicateCollection('c1');

      expect(ctx.storageService.saveCollections).toHaveBeenCalled();
      expect(ctx.notifyCollectionsUpdated).toHaveBeenCalled();
    });
  });

  // ── createRequest ───────────────────────────────────────────────

  describe('createRequest', () => {
    it('should create a request in the specified collection', async () => {
      const col = makeCollection('c1', 'Test');
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.createRequest('c1');

      expect(col.items).toHaveLength(1);
      const req = col.items[0] as SavedRequest;
      expect(req.type).toBe('request');
      expect(req.name).toBe('New Request');
      expect(req.method).toBe('GET');
      expect(req.headers).toHaveLength(1);
      expect(req.headers[0].key).toBe('User-Agent');
    });

    it('should open the request in a panel by default', async () => {
      const col = makeCollection('c1', 'Test');
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.createRequest('c1');

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'hivefetch.openRequest',
        expect.objectContaining({ type: 'request' }),
        'c1',
        'http',
      );
    });

    it('should not open panel when openInPanel is false', async () => {
      const col = makeCollection('c1', 'Test');
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.createRequest('c1', undefined, false);

      expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    });

    it('should create request in a specific folder', async () => {
      const folder = makeFolder('f1', 'Folder', []);
      const col = makeCollection('c1', 'Test', [folder]);
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.createRequest('c1', 'f1');

      const updatedFolder = col.items[0] as Folder;
      expect(updatedFolder.children).toHaveLength(1);
    });

    it('should show error when collection not found', async () => {
      const ui = createMockUIService();
      const ctx = createMockContext({ collections: [], uiService: ui as any });
      const handler = new CollectionCrudHandler(ctx);

      await handler.createRequest('nonexistent');

      expect(ui.showError).toHaveBeenCalledWith('Collection not found');
      expect(ctx.storageService.saveCollections).not.toHaveBeenCalled();
    });

    it('should create a WebSocket request when requestKind is websocket', async () => {
      const col = makeCollection('c1', 'Test');
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.createRequest('c1', undefined, true, 'websocket' as any);

      const req = col.items[0] as SavedRequest;
      expect(req.name).toBe('New WebSocket');
      expect(req.connectionMode).toBe('websocket');
    });

    it('should create a GraphQL request when requestKind is graphql', async () => {
      const col = makeCollection('c1', 'Test');
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.createRequest('c1', undefined, true, 'graphql' as any);

      const req = col.items[0] as SavedRequest;
      expect(req.name).toBe('New GraphQL Request');
      expect(req.method).toBe('POST');
    });

    it('should save and notify after creation', async () => {
      const col = makeCollection('c1', 'Test');
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.createRequest('c1', undefined, false);

      expect(ctx.storageService.saveCollections).toHaveBeenCalled();
      expect(ctx.notifyCollectionsUpdated).toHaveBeenCalled();
    });
  });

  // ── createRequestFromUrl ────────────────────────────────────────

  describe('createRequestFromUrl', () => {
    it('should create a request in a selected collection', async () => {
      const col = makeCollection('c1', 'My API');
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
        value: 'collection:c1',
      });

      await handler.createRequestFromUrl('https://api.example.com/users');

      expect(col.items).toHaveLength(1);
      const req = col.items[0] as SavedRequest;
      expect(req.url).toBe('https://api.example.com/users');
      expect(req.name).toBe('Request from api.example.com/users');
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'hivefetch.openRequest',
        expect.objectContaining({ url: 'https://api.example.com/users' }),
        'c1',
        'http',
      );
    });

    it('should detect WebSocket URLs and set requestKind accordingly', async () => {
      const col = makeCollection('c1', 'My API');
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
        value: 'collection:c1',
      });

      await handler.createRequestFromUrl('ws://localhost:8080/socket');

      const req = col.items[0] as SavedRequest;
      expect(req.connectionMode).toBe('websocket');
    });

    it('should detect wss:// URLs as WebSocket', async () => {
      const col = makeCollection('c1', 'My API');
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
        value: 'collection:c1',
      });

      await handler.createRequestFromUrl('wss://secure.example.com/ws');

      const req = col.items[0] as SavedRequest;
      expect(req.connectionMode).toBe('websocket');
    });

    it('should open as quick request when "no-collection" is selected', async () => {
      const ctx = createMockContext({ collections: [] });
      const handler = new CollectionCrudHandler(ctx);

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
        value: 'no-collection',
      });

      await handler.createRequestFromUrl('https://api.example.com/test');

      expect(ctx.panelManager!.openNewRequest).toHaveBeenCalledWith(
        expect.objectContaining({ requestKind: 'http', initialUrl: 'https://api.example.com/test' }),
      );
    });

    it('should show error when no-collection selected but panelManager is missing', async () => {
      const ui = createMockUIService();
      const ctx = createMockContext({ collections: [], panelManager: undefined, uiService: ui as any });
      const handler = new CollectionCrudHandler(ctx);

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({ value: 'no-collection' });

      await handler.createRequestFromUrl('https://api.example.com/test');

      expect(ui.showError).toHaveBeenCalledWith('Panel manager not initialized');
    });

    it('should do nothing when user cancels target selection', async () => {
      const ctx = createMockContext({ collections: [] });
      const handler = new CollectionCrudHandler(ctx);

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

      await handler.createRequestFromUrl('https://api.example.com/test');

      expect(ctx.storageService.saveCollections).not.toHaveBeenCalled();
    });

    it('should create a new collection when "new-collection" is selected', async () => {
      const ctx = createMockContext({ collections: [] });
      const handler = new CollectionCrudHandler(ctx);

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
        value: 'new-collection',
      });
      (vscode.window.showInputBox as jest.Mock).mockResolvedValue('Brand New');

      await handler.createRequestFromUrl('https://api.example.com/users');

      // A new collection should have been created, then the request added to it
      expect(ctx.collections.length).toBeGreaterThanOrEqual(1);
      const newCol = ctx.collections.find(c => c.name === 'Brand New');
      expect(newCol).toBeDefined();
      expect(newCol!.items).toHaveLength(1);
      const req = newCol!.items[0] as SavedRequest;
      expect(req.url).toBe('https://api.example.com/users');
    });

    it('should show info message after creating request in collection', async () => {
      const ui = createMockUIService();
      const col = makeCollection('c1', 'My API');
      const ctx = createMockContext({ collections: [col], uiService: ui as any });
      const handler = new CollectionCrudHandler(ctx);

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({ value: 'collection:c1' });

      await handler.createRequestFromUrl('https://api.example.com/users');

      expect(ui.showInfo).toHaveBeenCalledWith(
        expect.stringContaining('My API'),
      );
    });

    it('should return null when user cancels new collection name input', async () => {
      const ctx = createMockContext({ collections: [] });
      const handler = new CollectionCrudHandler(ctx);

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
        value: 'new-collection',
      });
      (vscode.window.showInputBox as jest.Mock).mockResolvedValue(undefined);

      await handler.createRequestFromUrl('https://api.example.com/users');

      expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    });
  });

  // ── deleteRequest ───────────────────────────────────────────────

  describe('deleteRequest', () => {
    it('should delete a request from a collection', async () => {
      const req = makeRequest('r1');
      const col = makeCollection('c1', 'Test', [req]);
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.deleteRequest('r1');

      expect(col.items).toHaveLength(0);
      expect(ctx.storageService.saveCollections).toHaveBeenCalled();
      expect(ctx.notifyCollectionsUpdated).toHaveBeenCalled();
    });

    it('should close the panel for the deleted request', async () => {
      const req = makeRequest('r1');
      const col = makeCollection('c1', 'Test', [req]);
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.deleteRequest('r1');

      expect(ctx.panelManager!.closePanelsByRequestIds).toHaveBeenCalledWith(
        new Set(['r1']),
      );
    });

    it('should do nothing if request not found', async () => {
      const ctx = createMockContext({ collections: [makeCollection('c1', 'Test')] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.deleteRequest('nonexistent');

      expect(ctx.storageService.saveCollections).not.toHaveBeenCalled();
    });

    it('should work when panelManager is undefined', async () => {
      const req = makeRequest('r1');
      const col = makeCollection('c1', 'Test', [req]);
      const ctx = createMockContext({ collections: [col], panelManager: undefined });
      const handler = new CollectionCrudHandler(ctx);

      await handler.deleteRequest('r1');

      expect(col.items).toHaveLength(0);
      expect(ctx.storageService.saveCollections).toHaveBeenCalled();
    });
  });

  // ── duplicateRequest ────────────────────────────────────────────

  describe('duplicateRequest', () => {
    it('should duplicate a request with new ID and "(copy)" suffix', async () => {
      const req = makeRequest('r1', 'Login');
      const col = makeCollection('c1', 'Test', [req]);
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.duplicateRequest('r1');

      expect(col.items).toHaveLength(2);
      const dup = col.items[1] as SavedRequest;
      expect(dup.name).toBe('Login (copy)');
      expect(dup.id).not.toBe('r1');
    });

    it('should insert duplicate after the original request', async () => {
      const r1 = makeRequest('r1', 'First');
      const r2 = makeRequest('r2', 'Second');
      const col = makeCollection('c1', 'Test', [r1, r2]);
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.duplicateRequest('r1');

      expect(col.items).toHaveLength(3);
      expect((col.items[0] as SavedRequest).name).toBe('First');
      expect((col.items[1] as SavedRequest).name).toBe('First (copy)');
      expect((col.items[2] as SavedRequest).name).toBe('Second');
    });

    it('should do nothing if request not found', async () => {
      const ctx = createMockContext({ collections: [] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.duplicateRequest('nonexistent');

      expect(ctx.storageService.saveCollections).not.toHaveBeenCalled();
    });

    it('should save and notify after duplication', async () => {
      const req = makeRequest('r1');
      const col = makeCollection('c1', 'Test', [req]);
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.duplicateRequest('r1');

      expect(ctx.storageService.saveCollections).toHaveBeenCalled();
      expect(ctx.notifyCollectionsUpdated).toHaveBeenCalled();
    });
  });

  // ── duplicateFolder ─────────────────────────────────────────────

  describe('duplicateFolder', () => {
    it('should duplicate a folder with new IDs and "(copy)" suffix', async () => {
      const folder = makeFolder('f1', 'Auth', [makeRequest('r1')]);
      const col = makeCollection('c1', 'Test', [folder]);
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.duplicateFolder('f1', 'c1');

      expect(col.items).toHaveLength(2);
      const dup = col.items[1] as Folder;
      expect(dup.name).toBe('Auth (copy)');
      expect(dup.id).not.toBe('f1');
      expect(dup.children).toHaveLength(1);
      expect(dup.children[0].id).not.toBe('r1');
    });

    it('should do nothing if collection not found', async () => {
      const ctx = createMockContext({ collections: [] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.duplicateFolder('f1', 'nonexistent');

      expect(ctx.storageService.saveCollections).not.toHaveBeenCalled();
    });

    it('should do nothing if folder not found in collection', async () => {
      const col = makeCollection('c1', 'Test', [makeRequest('r1')]);
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.duplicateFolder('nonexistent', 'c1');

      expect(ctx.storageService.saveCollections).not.toHaveBeenCalled();
    });

    it('should save and notify after duplication', async () => {
      const folder = makeFolder('f1', 'Folder', []);
      const col = makeCollection('c1', 'Test', [folder]);
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.duplicateFolder('f1', 'c1');

      expect(ctx.storageService.saveCollections).toHaveBeenCalled();
      expect(ctx.notifyCollectionsUpdated).toHaveBeenCalled();
    });
  });

  // ── exportFolder ────────────────────────────────────────────────

  describe('exportFolder', () => {
    it('should create a temp collection from folder and execute export command', async () => {
      const folder = makeFolder('f1', 'Auth Endpoints', [makeRequest('r1')]);
      const col = makeCollection('c1', 'Test', [folder]);
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);
      (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(undefined);

      await handler.exportFolder('f1', 'c1');

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'hivefetch.exportPostman',
        expect.any(String),
      );
      // Temp collection should be removed after export
      expect(ctx.collections).toHaveLength(1);
      expect(ctx.collections[0].id).toBe('c1');
    });

    it('should remove temp collection even if export throws', async () => {
      const folder = makeFolder('f1', 'Folder', []);
      const col = makeCollection('c1', 'Test', [folder]);
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);
      (vscode.commands.executeCommand as jest.Mock).mockRejectedValue(new Error('Export failed'));

      await expect(handler.exportFolder('f1', 'c1')).rejects.toThrow('Export failed');

      // Temp collection still removed via finally block
      expect(ctx.collections).toHaveLength(1);
      expect(ctx.collections[0].id).toBe('c1');
    });

    it('should do nothing if collection not found', async () => {
      const ctx = createMockContext({ collections: [] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.exportFolder('f1', 'nonexistent');

      expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    });

    it('should do nothing if folder not found', async () => {
      const col = makeCollection('c1', 'Test', []);
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.exportFolder('nonexistent', 'c1');

      expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    });

    it('should notify collections updated in finally block', async () => {
      const folder = makeFolder('f1', 'Folder', []);
      const col = makeCollection('c1', 'Test', [folder]);
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);
      (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(undefined);

      await handler.exportFolder('f1', 'c1');

      expect(ctx.notifyCollectionsUpdated).toHaveBeenCalled();
    });
  });

  // ── deleteFolder ────────────────────────────────────────────────

  describe('deleteFolder', () => {
    it('should delete a folder from the collection', async () => {
      const folder = makeFolder('f1', 'Folder', [makeRequest('r1')]);
      const col = makeCollection('c1', 'Test', [folder]);
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.deleteFolder('f1', 'c1');

      expect(col.items).toHaveLength(0);
      expect(ctx.storageService.saveCollections).toHaveBeenCalled();
    });

    it('should close panels for requests in deleted folder', async () => {
      const folder = makeFolder('f1', 'Folder', [makeRequest('r1'), makeRequest('r2')]);
      const col = makeCollection('c1', 'Test', [folder]);
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.deleteFolder('f1', 'c1');

      expect(ctx.panelManager!.closePanelsByRequestIds).toHaveBeenCalledWith(
        new Set(['r1', 'r2']),
      );
    });

    it('should not close panels if folder had no requests', async () => {
      const folder = makeFolder('f1', 'Empty Folder', []);
      const col = makeCollection('c1', 'Test', [folder]);
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.deleteFolder('f1', 'c1');

      expect(ctx.panelManager!.closePanelsByRequestIds).not.toHaveBeenCalled();
    });

    it('should do nothing if collection not found', async () => {
      const ctx = createMockContext({ collections: [] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.deleteFolder('f1', 'nonexistent');

      expect(ctx.storageService.saveCollections).not.toHaveBeenCalled();
    });

    it('should do nothing if folder not found', async () => {
      const col = makeCollection('c1', 'Test', [makeRequest('r1')]);
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.deleteFolder('nonexistent', 'c1');

      expect(ctx.storageService.saveCollections).not.toHaveBeenCalled();
    });
  });

  // ── bulkDelete ──────────────────────────────────────────────────

  describe('bulkDelete', () => {
    it('should delete multiple items by ID', async () => {
      const r1 = makeRequest('r1');
      const r2 = makeRequest('r2');
      const r3 = makeRequest('r3');
      const col = makeCollection('c1', 'Test', [r1, r2, r3]);
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.bulkDelete(['r1', 'r3'], 'c1');

      expect(col.items).toHaveLength(1);
      expect(col.items[0].id).toBe('r2');
    });

    it('should close panels for deleted requests', async () => {
      const r1 = makeRequest('r1');
      const r2 = makeRequest('r2');
      const col = makeCollection('c1', 'Test', [r1, r2]);
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.bulkDelete(['r1', 'r2'], 'c1');

      expect(ctx.panelManager!.closePanelsByRequestIds).toHaveBeenCalledWith(
        new Set(['r1', 'r2']),
      );
    });

    it('should collect request IDs from deleted folder children', async () => {
      const folder = makeFolder('f1', 'Folder', [makeRequest('r2'), makeRequest('r3')]);
      const col = makeCollection('c1', 'Test', [makeRequest('r1'), folder]);
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.bulkDelete(['f1'], 'c1');

      expect(ctx.panelManager!.closePanelsByRequestIds).toHaveBeenCalledWith(
        new Set(['r2', 'r3']),
      );
    });

    it('should do nothing if collection not found', async () => {
      const ctx = createMockContext({ collections: [] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.bulkDelete(['r1'], 'nonexistent');

      expect(ctx.storageService.saveCollections).not.toHaveBeenCalled();
    });

    it('should do nothing if itemIds is empty', async () => {
      const col = makeCollection('c1', 'Test', [makeRequest('r1')]);
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.bulkDelete([], 'c1');

      expect(ctx.storageService.saveCollections).not.toHaveBeenCalled();
    });

    it('should not close panels when no request IDs affected', async () => {
      const folder = makeFolder('f1', 'Empty', []);
      const col = makeCollection('c1', 'Test', [folder]);
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.bulkDelete(['f1'], 'c1');

      expect(ctx.panelManager!.closePanelsByRequestIds).not.toHaveBeenCalled();
    });

    it('should handle mix of requests and folders', async () => {
      const folder = makeFolder('f1', 'Folder', [makeRequest('r2')]);
      const col = makeCollection('c1', 'Test', [makeRequest('r1'), folder, makeRequest('r3')]);
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.bulkDelete(['r1', 'f1'], 'c1');

      expect(col.items).toHaveLength(1);
      expect(col.items[0].id).toBe('r3');
      expect(ctx.panelManager!.closePanelsByRequestIds).toHaveBeenCalledWith(
        new Set(['r1', 'r2']),
      );
    });
  });

  // ── bulkMovePickTarget ──────────────────────────────────────────

  describe('bulkMovePickTarget', () => {
    it('should move items to another collection', async () => {
      const r1 = makeRequest('r1', 'Request 1');
      const source = makeCollection('c1', 'Source', [r1, makeRequest('r2')]);
      const target = makeCollection('c2', 'Target', []);
      const ctx = createMockContext({ collections: [source, target] });
      const handler = new CollectionCrudHandler(ctx);

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
        value: 'collection:c2',
      });

      await handler.bulkMovePickTarget(['r1'], 'c1');

      expect(source.items).toHaveLength(1);
      expect(source.items[0].id).toBe('r2');
      expect(target.items).toHaveLength(1);
      expect(target.items[0].id).toBe('r1');
      expect(ctx.storageService.saveCollections).toHaveBeenCalled();
    });

    it('should move items to a folder in target collection', async () => {
      const r1 = makeRequest('r1');
      const source = makeCollection('c1', 'Source', [r1]);
      const targetFolder = makeFolder('f1', 'Target Folder', []);
      const target = makeCollection('c2', 'Target', [targetFolder]);
      const ctx = createMockContext({ collections: [source, target] });
      const handler = new CollectionCrudHandler(ctx);

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
        value: 'folder:f1',
      });

      await handler.bulkMovePickTarget(['r1'], 'c1');

      expect(source.items).toHaveLength(0);
      expect(targetFolder.children).toHaveLength(1);
      expect(targetFolder.children[0].id).toBe('r1');
    });

    it('should do nothing if user cancels quick pick', async () => {
      const source = makeCollection('c1', 'Source', [makeRequest('r1')]);
      const ctx = createMockContext({ collections: [source] });
      const handler = new CollectionCrudHandler(ctx);

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

      await handler.bulkMovePickTarget(['r1'], 'c1');

      expect(ctx.storageService.saveCollections).not.toHaveBeenCalled();
    });

    it('should do nothing if source collection not found', async () => {
      const ctx = createMockContext({ collections: [] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.bulkMovePickTarget(['r1'], 'nonexistent');

      expect(ctx.storageService.saveCollections).not.toHaveBeenCalled();
    });

    it('should do nothing if itemIds is empty', async () => {
      const source = makeCollection('c1', 'Source', []);
      const ctx = createMockContext({ collections: [source] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.bulkMovePickTarget([], 'c1');

      expect(ctx.storageService.saveCollections).not.toHaveBeenCalled();
    });

    it('should skip builtin collections in target list', async () => {
      const r1 = makeRequest('r1');
      const source = makeCollection('c1', 'Source', [r1]);
      const builtinCol = makeCollection('drafts', 'Drafts', [], 'drafts');
      const target = makeCollection('c2', 'Target', []);
      const ctx = createMockContext({ collections: [source, builtinCol, target] });
      const handler = new CollectionCrudHandler(ctx);

      (vscode.window.showQuickPick as jest.Mock).mockImplementation((items: any[]) => {
        // Verify the drafts collection is not in the list
        const labels = items.map((i: any) => i.label);
        expect(labels).not.toContain('Drafts');
        return Promise.resolve({ value: 'collection:c2' });
      });

      await handler.bulkMovePickTarget(['r1'], 'c1');

      expect(target.items).toHaveLength(1);
    });

    it('should always use native vscode QuickPick even when UIService is available', async () => {
      const ui = createMockUIService();
      const r1 = makeRequest('r1');
      const source = makeCollection('c1', 'Source', [r1]);
      const target = makeCollection('c2', 'Target', []);
      const ctx = createMockContext({ collections: [source, target], uiService: ui as any });
      const handler = new CollectionCrudHandler(ctx);

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({ value: 'collection:c2' });

      await handler.bulkMovePickTarget(['r1'], 'c1');

      expect(vscode.window.showQuickPick).toHaveBeenCalled();
      expect(ui.showQuickPick).not.toHaveBeenCalled();
      expect(target.items).toHaveLength(1);
    });

    it('should do nothing if native quick pick returns null', async () => {
      const source = makeCollection('c1', 'Source', [makeRequest('r1')]);
      const ctx = createMockContext({ collections: [source] });
      const handler = new CollectionCrudHandler(ctx);

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(null);

      await handler.bulkMovePickTarget(['r1'], 'c1');

      expect(ctx.storageService.saveCollections).not.toHaveBeenCalled();
    });

    it('should move folders as well as requests', async () => {
      const folder = makeFolder('f1', 'Auth', [makeRequest('r2')]);
      const source = makeCollection('c1', 'Source', [makeRequest('r1'), folder]);
      const target = makeCollection('c2', 'Target', []);
      const ctx = createMockContext({ collections: [source, target] });
      const handler = new CollectionCrudHandler(ctx);

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
        value: 'collection:c2',
      });

      await handler.bulkMovePickTarget(['f1'], 'c1');

      expect(source.items).toHaveLength(1);
      expect(source.items[0].id).toBe('r1');
      expect(target.items).toHaveLength(1);
      const movedFolder = target.items[0] as Folder;
      expect(movedFolder.id).toBe('f1');
      expect(movedFolder.children).toHaveLength(1);
    });

    it('should update timestamps on both source and target collections', async () => {
      const r1 = makeRequest('r1');
      const source = makeCollection('c1', 'Source', [r1]);
      const target = makeCollection('c2', 'Target', []);
      const originalSourceUpdated = source.updatedAt;
      const originalTargetUpdated = target.updatedAt;
      const ctx = createMockContext({ collections: [source, target] });
      const handler = new CollectionCrudHandler(ctx);

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
        value: 'collection:c2',
      });

      await handler.bulkMovePickTarget(['r1'], 'c1');

      expect(source.updatedAt).not.toBe(originalSourceUpdated);
      expect(target.updatedAt).not.toBe(originalTargetUpdated);
    });
  });

  // ── addRequest ──────────────────────────────────────────────────

  describe('addRequest', () => {
    it('should add a request to a collection and return it', async () => {
      const col = makeCollection('c1', 'Test');
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      const result = await handler.addRequest('c1', {
        type: 'request',
        name: 'Login',
        method: 'POST',
        url: 'https://api.example.com/login',
        params: [],
        headers: [],
        auth: { type: 'none' },
        body: { type: 'json', content: '{}' },
      });

      expect(result.name).toBe('Login');
      expect(result.id).toBeDefined();
      expect(result.createdAt).toBeDefined();
      expect(col.items).toHaveLength(1);
      expect(ctx.storageService.saveCollections).toHaveBeenCalled();
    });

    it('should add request to a specific folder', async () => {
      const folder = makeFolder('f1', 'Auth', []);
      const col = makeCollection('c1', 'Test', [folder]);
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.addRequest('c1', {
        type: 'request',
        name: 'Token',
        method: 'POST',
        url: '/token',
        params: [],
        headers: [],
        auth: { type: 'none' },
        body: { type: 'none', content: '' },
      }, 'f1');

      const updatedFolder = col.items[0] as Folder;
      expect(updatedFolder.children).toHaveLength(1);
    });

    it('should throw if collection not found', async () => {
      const ctx = createMockContext({ collections: [] });
      const handler = new CollectionCrudHandler(ctx);

      await expect(handler.addRequest('nonexistent', {
        type: 'request',
        name: 'Test',
        method: 'GET',
        url: '',
        params: [],
        headers: [],
        auth: { type: 'none' },
        body: { type: 'none', content: '' },
      })).rejects.toThrow('Collection not found');
    });

    it('should notify after adding', async () => {
      const col = makeCollection('c1', 'Test');
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.addRequest('c1', {
        type: 'request',
        name: 'Test',
        method: 'GET',
        url: '',
        params: [],
        headers: [],
        auth: { type: 'none' },
        body: { type: 'none', content: '' },
      });

      expect(ctx.notifyCollectionsUpdated).toHaveBeenCalled();
    });
  });

  // ── createRequestInCollection ───────────────────────────────────

  describe('createRequestInCollection', () => {
    it('should create a default HTTP request and return it with metadata', async () => {
      const col = makeCollection('c1', 'Test');
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      const result = await handler.createRequestInCollection('c1');

      expect(result.request.name).toBe('New Request');
      expect(result.request.method).toBe('GET');
      expect(result.collectionId).toBe('c1');
      expect(result.connectionMode).toBe('http');
      expect(col.items).toHaveLength(1);
    });

    it('should create a WebSocket request when specified', async () => {
      const col = makeCollection('c1', 'Test');
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      const result = await handler.createRequestInCollection('c1', undefined, 'websocket' as any);

      expect(result.request.name).toBe('New WebSocket');
      expect(result.connectionMode).toBe('websocket');
    });

    it('should create request in a specific folder', async () => {
      const folder = makeFolder('f1', 'Auth', []);
      const col = makeCollection('c1', 'Test', [folder]);
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.createRequestInCollection('c1', 'f1');

      const updatedFolder = col.items[0] as Folder;
      expect(updatedFolder.children).toHaveLength(1);
    });

    it('should throw if collection not found', async () => {
      const ctx = createMockContext({ collections: [] });
      const handler = new CollectionCrudHandler(ctx);

      await expect(handler.createRequestInCollection('nonexistent')).rejects.toThrow('Collection not found');
    });

    it('should include User-Agent header in created request', async () => {
      const col = makeCollection('c1', 'Test');
      const ctx = createMockContext({ collections: [col] });
      const handler = new CollectionCrudHandler(ctx);

      const result = await handler.createRequestInCollection('c1');

      expect(result.request.headers).toHaveLength(1);
      expect(result.request.headers[0].key).toBe('User-Agent');
      expect(result.request.headers[0].value).toBe('HiveFetch');
    });
  });

  // ── createCollectionAndAddRequest ───────────────────────────────

  describe('createCollectionAndAddRequest', () => {
    it('should create a new collection with a default request', async () => {
      const ctx = createMockContext();
      const handler = new CollectionCrudHandler(ctx);

      const result = await handler.createCollectionAndAddRequest('New API');

      expect(ctx.collections).toHaveLength(1);
      expect(ctx.collections[0].name).toBe('New API');
      expect(ctx.collections[0].items).toHaveLength(1);
      expect(result.request.name).toBe('New Request');
      expect(result.connectionMode).toBe('http');
    });

    it('should apply color and icon when provided', async () => {
      const ctx = createMockContext();
      const handler = new CollectionCrudHandler(ctx);

      await handler.createCollectionAndAddRequest('Colored', 'http' as any, '#ff0000', 'rocket');

      expect(ctx.collections[0].color).toBe('#ff0000');
      expect(ctx.collections[0].icon).toBe('rocket');
    });

    it('should not set color or icon when not provided', async () => {
      const ctx = createMockContext();
      const handler = new CollectionCrudHandler(ctx);

      await handler.createCollectionAndAddRequest('Plain');

      expect(ctx.collections[0].color).toBeUndefined();
      expect(ctx.collections[0].icon).toBeUndefined();
    });

    it('should create GraphQL request when requestKind is graphql', async () => {
      const ctx = createMockContext();
      const handler = new CollectionCrudHandler(ctx);

      const result = await handler.createCollectionAndAddRequest('GraphQL API', 'graphql' as any);

      expect(result.request.name).toBe('New GraphQL Request');
      expect(result.request.method).toBe('POST');
      expect(result.connectionMode).toBe('http');
    });

    it('should create SSE request when requestKind is sse', async () => {
      const ctx = createMockContext();
      const handler = new CollectionCrudHandler(ctx);

      const result = await handler.createCollectionAndAddRequest('SSE API', 'sse' as any);

      expect(result.request.name).toBe('New SSE Connection');
      expect(result.connectionMode).toBe('sse');
    });

    it('should save and notify', async () => {
      const ctx = createMockContext();
      const handler = new CollectionCrudHandler(ctx);

      await handler.createCollectionAndAddRequest('Test');

      expect(ctx.storageService.saveCollections).toHaveBeenCalled();
      expect(ctx.notifyCollectionsUpdated).toHaveBeenCalled();
    });

    it('should return collectionId, request, and connectionMode', async () => {
      const ctx = createMockContext();
      const handler = new CollectionCrudHandler(ctx);

      const result = await handler.createCollectionAndAddRequest('Test');

      expect(result.collectionId).toBeDefined();
      expect(result.request).toBeDefined();
      expect(result.connectionMode).toBe('http');
    });

    it('should include connectionMode on the request itself', async () => {
      const ctx = createMockContext();
      const handler = new CollectionCrudHandler(ctx);

      const result = await handler.createCollectionAndAddRequest('WS Test', 'websocket' as any);

      expect(result.request.connectionMode).toBe('websocket');
    });
  });

  // ── createEmptyCollection ───────────────────────────────────────

  describe('createEmptyCollection', () => {
    it('should create an empty collection', async () => {
      const ctx = createMockContext();
      const handler = new CollectionCrudHandler(ctx);

      await handler.createEmptyCollection('Empty API');

      expect(ctx.collections).toHaveLength(1);
      expect(ctx.collections[0].name).toBe('Empty API');
      expect(ctx.collections[0].items).toEqual([]);
      expect(ctx.storageService.saveCollections).toHaveBeenCalled();
    });

    it('should prevent duplicate names (case-insensitive)', async () => {
      const ui = createMockUIService();
      const existing = makeCollection('c1', 'My API');
      const ctx = createMockContext({ collections: [existing], uiService: ui as any });
      const handler = new CollectionCrudHandler(ctx);

      await handler.createEmptyCollection('my api');

      expect(ctx.collections).toHaveLength(1);
      expect(ui.showWarning).toHaveBeenCalledWith(
        expect.stringContaining('already exists'),
      );
      expect(ctx.storageService.saveCollections).not.toHaveBeenCalled();
    });

    it('should allow creating when existing collection with same name is builtin', async () => {
      const builtin = makeCollection('drafts', 'Drafts', [], 'drafts');
      const ctx = createMockContext({ collections: [builtin] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.createEmptyCollection('Drafts');

      expect(ctx.collections).toHaveLength(2);
      expect(ctx.storageService.saveCollections).toHaveBeenCalled();
    });

    it('should allow different names', async () => {
      const existing = makeCollection('c1', 'API v1');
      const ctx = createMockContext({ collections: [existing] });
      const handler = new CollectionCrudHandler(ctx);

      await handler.createEmptyCollection('API v2');

      expect(ctx.collections).toHaveLength(2);
    });

    it('should set expanded to true and generate timestamps', async () => {
      const ctx = createMockContext();
      const handler = new CollectionCrudHandler(ctx);

      await handler.createEmptyCollection('Test');

      expect(ctx.collections[0].expanded).toBe(true);
      expect(ctx.collections[0].createdAt).toBeDefined();
      expect(ctx.collections[0].updatedAt).toBeDefined();
    });
  });
});
