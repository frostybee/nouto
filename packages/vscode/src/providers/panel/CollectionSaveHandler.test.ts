import * as vscode from 'vscode';

jest.mock('@hivefetch/core', () => ({
  extractPathname: (url: string) => {
    const protoEnd = url.indexOf('://');
    if (protoEnd !== -1) {
      const pathStart = url.indexOf('/', protoEnd + 3);
      if (pathStart === -1) return '/';
      const queryStart = url.indexOf('?', pathStart);
      return queryStart === -1 ? url.slice(pathStart) : url.slice(pathStart, queryStart);
    }
    if (url.startsWith('/')) {
      const queryStart = url.indexOf('?');
      return queryStart === -1 ? url : url.slice(0, queryStart);
    }
    return url || '/';
  },
  isRequest: (item: any) => item?.type === 'request',
  isFolder: (item: any) => item?.type === 'folder',
}));

import { CollectionSaveHandler } from './CollectionSaveHandler';
import type { IPanelContext, PanelInfo } from './PanelTypes';

// --- Helpers ---

function createMockWebview(): any {
  return { postMessage: jest.fn() };
}

function createMockUIService(): any {
  return {
    showInfo: jest.fn(),
    showError: jest.fn(),
    showWarning: jest.fn(),
  };
}

function createMockPanel(overrides: Partial<PanelInfo> = {}): PanelInfo {
  return {
    panel: { title: 'Test Panel' } as any,
    requestId: null,
    collectionId: null,
    abortController: null,
    isDirty: false,
    uiService: createMockUIService(),
    ...overrides,
  };
}

function createSavedRequest(overrides: any = {}): any {
  return {
    type: 'request',
    id: 'req-1',
    name: 'GET /api/test',
    method: 'GET',
    url: 'https://example.com/api/test',
    params: [],
    headers: [],
    auth: { type: 'none' },
    body: { type: 'none', content: '' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function createMockDraftService(): any {
  return {
    upsert: jest.fn(),
    remove: jest.fn(),
    get: jest.fn(),
  };
}

function createMockStorageService(): any {
  return {
    saveCollections: jest.fn().mockResolvedValue(undefined),
  };
}

function createMockSidebarProvider(overrides: any = {}): any {
  return {
    addRequest: jest.fn().mockResolvedValue(createSavedRequest()),
    removeFromDraftsCollection: jest.fn().mockResolvedValue(undefined),
    getCollections: jest.fn().mockReturnValue(overrides.collections ?? []),
    createCollectionAndAddRequest: jest.fn().mockResolvedValue({
      collectionId: 'col-new',
      request: createSavedRequest({ id: 'req-new', name: 'New Request', method: 'GET', url: '' }),
    }),
    notifyCollectionsUpdated: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createCtx(overrides: any = {}): IPanelContext {
  const panels = overrides.panels ?? new Map<string, PanelInfo>();
  return {
    panels,
    extensionContext: {} as any,
    sidebarProvider: createMockSidebarProvider(overrides.sidebarOverrides),
    generateId: jest.fn().mockReturnValue('gen-id'),
    getCollectionName: jest.fn().mockReturnValue('Mock Collection'),
    isWebviewAlive: jest.fn().mockReturnValue(true),
  } as any;
}

function createHandler(ctxOverrides: any = {}) {
  const panelInfo = createMockPanel(ctxOverrides.panelOverrides);
  const panels = new Map<string, PanelInfo>([['panel-1', panelInfo]]);
  const ctx = createCtx({ panels, sidebarOverrides: ctxOverrides.sidebarOverrides });
  const draftService = createMockDraftService();
  const storageService = createMockStorageService();
  const getCollectionName = jest.fn().mockReturnValue(ctxOverrides.collectionName ?? 'My Collection');

  const handler = new CollectionSaveHandler(ctx, draftService, storageService, getCollectionName);

  return { handler, ctx, draftService, storageService, getCollectionName, panelInfo, panels };
}

// --- Tests ---

describe('CollectionSaveHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handleSaveToCollection', () => {
    it('should save a request to a collection and show info', async () => {
      const { handler, ctx, panelInfo } = createHandler();

      await handler.handleSaveToCollection('panel-1', {
        collectionId: 'col-1',
        request: {
          type: 'request',
          name: 'Test',
          method: 'GET',
          url: 'https://example.com',
          params: [],
          headers: [],
          auth: { type: 'none' },
          body: { type: 'none', content: '' },
        },
      });

      expect(ctx.sidebarProvider.addRequest).toHaveBeenCalledWith('col-1', expect.objectContaining({ method: 'GET' }));
      expect(panelInfo.uiService!.showInfo).toHaveBeenCalledWith('Request saved to collection');
    });

    it('should show error on failure', async () => {
      const { handler, ctx, panelInfo } = createHandler();
      (ctx.sidebarProvider.addRequest as jest.Mock).mockRejectedValue(new Error('Save failed'));

      await handler.handleSaveToCollection('panel-1', {
        collectionId: 'col-1',
        request: {
          type: 'request',
          name: 'Test',
          method: 'GET',
          url: 'https://example.com',
          params: [],
          headers: [],
          auth: { type: 'none' },
          body: { type: 'none', content: '' },
        },
      });

      expect(panelInfo.uiService!.showError).toHaveBeenCalledWith('Failed to save request: Save failed');
    });

    it('should handle unknown panelId gracefully (no uiService)', async () => {
      const { handler } = createHandler();

      // Should not throw even when panelId is unknown (uiService is undefined)
      await expect(
        handler.handleSaveToCollection('unknown-panel', {
          collectionId: 'col-1',
          request: {
            type: 'request',
            name: 'Test',
            method: 'GET',
            url: 'https://example.com',
            params: [],
            headers: [],
            auth: { type: 'none' },
            body: { type: 'none', content: '' },
          },
        })
      ).resolves.toBeUndefined();
    });
  });

  describe('handleSaveToCollectionWithLink', () => {
    it('should save, link panel, remove draft, and post message', async () => {
      const newReq = createSavedRequest({ id: 'req-linked', name: 'GET /api/test' });
      const { handler, ctx, draftService, panelInfo } = createHandler({
        panelOverrides: { method: 'POST', url: 'https://example.com/api/old' },
      });
      (ctx.sidebarProvider.addRequest as jest.Mock).mockResolvedValue(newReq);

      const webview = createMockWebview();

      await handler.handleSaveToCollectionWithLink(webview, 'panel-1', {
        collectionId: 'col-1',
        request: {
          method: 'POST',
          url: 'https://example.com/api/users',
          params: [{ id: 'p1', key: 'a', value: '1', enabled: true }],
          headers: [],
          auth: { type: 'bearer', token: 'tok' },
          body: { type: 'json', content: '{}' },
        },
      });

      // addRequest called with derived request data
      expect(ctx.sidebarProvider.addRequest).toHaveBeenCalledWith(
        'col-1',
        expect.objectContaining({
          type: 'request',
          method: 'POST',
          url: 'https://example.com/api/users',
          name: 'POST /api/users',
        }),
        undefined,
      );
      expect(ctx.sidebarProvider.removeFromDraftsCollection).toHaveBeenCalledWith('https://example.com/api/users', 'POST');

      // Panel linked
      expect(panelInfo.requestId).toBe('req-linked');
      expect(panelInfo.collectionId).toBe('col-1');
      expect(panelInfo.isDirty).toBe(false);

      // Draft removed
      expect(draftService.remove).toHaveBeenCalledWith('panel-1');

      // Webview notified
      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'requestLinkedToCollection',
        data: expect.objectContaining({ requestId: 'req-linked', collectionId: 'col-1' }),
      });
    });

    it('should use panel method/url when request data is missing', async () => {
      const newReq = createSavedRequest({ id: 'req-2', name: 'POST /api/old' });
      const { handler, ctx } = createHandler({
        panelOverrides: { method: 'POST', url: 'https://example.com/api/old' },
      });
      (ctx.sidebarProvider.addRequest as jest.Mock).mockResolvedValue(newReq);
      const webview = createMockWebview();

      await handler.handleSaveToCollectionWithLink(webview, 'panel-1', {
        collectionId: 'col-1',
        // no request data
      });

      expect(ctx.sidebarProvider.addRequest).toHaveBeenCalledWith(
        'col-1',
        expect.objectContaining({
          method: 'POST',
          url: 'https://example.com/api/old',
        }),
        undefined,
      );
    });

    it('should pass folderId to addRequest when provided', async () => {
      const newReq = createSavedRequest();
      const { handler, ctx } = createHandler();
      (ctx.sidebarProvider.addRequest as jest.Mock).mockResolvedValue(newReq);
      const webview = createMockWebview();

      await handler.handleSaveToCollectionWithLink(webview, 'panel-1', {
        collectionId: 'col-1',
        folderId: 'folder-1',
        request: { method: 'GET', url: 'https://example.com/test' },
      });

      expect(ctx.sidebarProvider.addRequest).toHaveBeenCalledWith('col-1', expect.anything(), 'folder-1');
    });

    it('should return early when panelId is not found', async () => {
      const { handler, ctx } = createHandler();
      const webview = createMockWebview();

      await handler.handleSaveToCollectionWithLink(webview, 'unknown-panel', {
        collectionId: 'col-1',
      });

      expect(ctx.sidebarProvider.addRequest).not.toHaveBeenCalled();
      expect(webview.postMessage).not.toHaveBeenCalled();
    });

    it('should show error on failure', async () => {
      const { handler, ctx, panelInfo } = createHandler();
      (ctx.sidebarProvider.addRequest as jest.Mock).mockRejectedValue(new Error('Boom'));
      const webview = createMockWebview();

      await handler.handleSaveToCollectionWithLink(webview, 'panel-1', {
        collectionId: 'col-1',
      });

      expect(panelInfo.uiService!.showError).toHaveBeenCalledWith('Failed to save: Boom');
    });

    it('should default to GET and empty url when neither request nor panel have values', async () => {
      const newReq = createSavedRequest({ id: 'req-3' });
      const { handler, ctx } = createHandler({
        panelOverrides: { method: undefined, url: undefined },
      });
      (ctx.sidebarProvider.addRequest as jest.Mock).mockResolvedValue(newReq);
      const webview = createMockWebview();

      await handler.handleSaveToCollectionWithLink(webview, 'panel-1', {
        collectionId: 'col-1',
      });

      expect(ctx.sidebarProvider.addRequest).toHaveBeenCalledWith(
        'col-1',
        expect.objectContaining({ method: 'GET', url: '' }),
        undefined,
      );
    });
  });

  describe('handleSaveToNewCollectionWithLink', () => {
    it('should create collection, merge request data, link panel, and post message', async () => {
      const baseReq = createSavedRequest({ id: 'req-new', name: 'New Request', method: 'GET', url: '' });
      const collection = { id: 'col-new', items: [baseReq], updatedAt: '' };
      const { handler, ctx, draftService, storageService, panelInfo } = createHandler({
        sidebarOverrides: {
          createCollectionAndAddRequest: jest.fn().mockResolvedValue({ collectionId: 'col-new', request: baseReq }),
          getCollections: jest.fn().mockReturnValue([collection]),
        },
      });
      const webview = createMockWebview();

      await handler.handleSaveToNewCollectionWithLink(webview, 'panel-1', {
        name: 'New Collection',
        request: {
          method: 'POST',
          url: 'https://example.com/api/items',
          params: [{ id: 'p2', key: 'x', value: '1', enabled: true }],
        },
      });

      // Storage saved with merged request
      expect(storageService.saveCollections).toHaveBeenCalled();
      expect(ctx.sidebarProvider.notifyCollectionsUpdated).toHaveBeenCalled();

      // Drafts cleaned up
      expect(ctx.sidebarProvider.removeFromDraftsCollection).toHaveBeenCalledWith('https://example.com/api/items', 'POST');

      // Panel linked
      expect(panelInfo.requestId).toBe('req-new');
      expect(panelInfo.collectionId).toBe('col-new');
      expect(panelInfo.collectionName).toBe('New Collection');
      expect(panelInfo.isDirty).toBe(false);
      expect(panelInfo.panel.title).toBe('New Collection / POST /api/items');

      // Draft removed
      expect(draftService.remove).toHaveBeenCalledWith('panel-1');

      // Webview notified
      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'requestLinkedToCollection',
        data: { requestId: 'req-new', collectionId: 'col-new', collectionName: 'New Collection' },
      });
    });

    it('should handle no request data (uses default from created request)', async () => {
      const baseReq = createSavedRequest({ id: 'req-new', name: 'New Request', method: 'GET', url: '' });
      const { handler, storageService, panelInfo } = createHandler({
        sidebarOverrides: {
          createCollectionAndAddRequest: jest.fn().mockResolvedValue({ collectionId: 'col-new', request: baseReq }),
          getCollections: jest.fn().mockReturnValue([]),
        },
      });
      const webview = createMockWebview();

      await handler.handleSaveToNewCollectionWithLink(webview, 'panel-1', {
        name: 'Empty Collection',
      });

      // No storage save needed since no request data to merge
      expect(storageService.saveCollections).not.toHaveBeenCalled();

      // Panel uses the default request name
      expect(panelInfo.requestName).toBe('New Request');
      expect(panelInfo.panel.title).toBe('Empty Collection / New Request');
    });

    it('should skip merge when collection is not found after creation', async () => {
      const baseReq = createSavedRequest({ id: 'req-new', name: 'New Request' });
      const { handler, storageService } = createHandler({
        sidebarOverrides: {
          createCollectionAndAddRequest: jest.fn().mockResolvedValue({ collectionId: 'col-new', request: baseReq }),
          getCollections: jest.fn().mockReturnValue([]), // Collection not found
        },
      });
      const webview = createMockWebview();

      await handler.handleSaveToNewCollectionWithLink(webview, 'panel-1', {
        name: 'Test',
        request: { method: 'DELETE', url: 'https://example.com/api/items/1' },
      });

      expect(storageService.saveCollections).not.toHaveBeenCalled();
      // Should still succeed (webview notified)
      expect(webview.postMessage).toHaveBeenCalled();
    });

    it('should return early when panelId is not found', async () => {
      const { handler, ctx } = createHandler();
      const webview = createMockWebview();

      await handler.handleSaveToNewCollectionWithLink(webview, 'unknown-panel', {
        name: 'Test',
      });

      expect(ctx.sidebarProvider.createCollectionAndAddRequest).not.toHaveBeenCalled();
    });

    it('should show error on failure', async () => {
      const { handler, panelInfo } = createHandler({
        sidebarOverrides: {
          createCollectionAndAddRequest: jest.fn().mockRejectedValue(new Error('Creation failed')),
        },
      });
      const webview = createMockWebview();

      await handler.handleSaveToNewCollectionWithLink(webview, 'panel-1', {
        name: 'Failing',
      });

      expect(panelInfo.uiService!.showError).toHaveBeenCalledWith('Failed to save: Creation failed');
    });

    it('should derive request name from request url when provided', async () => {
      const baseReq = createSavedRequest({ id: 'req-new', name: 'New Request', method: 'GET', url: '' });
      const collection = { id: 'col-new', items: [baseReq] };
      const { handler, panelInfo } = createHandler({
        sidebarOverrides: {
          createCollectionAndAddRequest: jest.fn().mockResolvedValue({ collectionId: 'col-new', request: baseReq }),
          getCollections: jest.fn().mockReturnValue([collection]),
        },
      });
      const webview = createMockWebview();

      await handler.handleSaveToNewCollectionWithLink(webview, 'panel-1', {
        name: 'Col',
        request: { url: 'https://api.example.com/v2/users' },
      });

      // method falls back to newRequest.method (GET)
      expect(panelInfo.requestName).toBe('GET /v2/users');
    });
  });

  describe('handleDraftUpdated', () => {
    it('should update panel name and upsert draft for collection requests', async () => {
      const { handler, draftService, panelInfo } = createHandler();
      const request = createSavedRequest({ method: 'PUT', url: 'https://example.com/api/items/5' });

      await handler.handleDraftUpdated('panel-1', {
        panelId: 'panel-1',
        requestId: 'req-1',
        collectionId: 'col-1',
        request,
      });

      expect(panelInfo.requestName).toBe('PUT /api/items/5');
      expect(draftService.upsert).toHaveBeenCalledWith('panel-1', 'req-1', 'col-1', request);
    });

    it('should update panel title for unsaved requests', async () => {
      const { handler, draftService, panelInfo } = createHandler();
      const request = createSavedRequest({ method: 'DELETE', url: 'https://example.com/api/items/3' });

      await handler.handleDraftUpdated('panel-1', {
        panelId: 'panel-1',
        requestId: null,
        collectionId: null,
        request,
      });

      expect(panelInfo.panel.title).toBe('* DELETE /api/items/3');
      expect(draftService.upsert).toHaveBeenCalledWith('panel-1', null, null, request);
    });

    it('should not update panel name when request has no url (collection request)', async () => {
      const { handler, panelInfo } = createHandler({
        panelOverrides: { requestName: 'Original Name' },
      });
      const request = createSavedRequest({ method: 'GET', url: '' });

      await handler.handleDraftUpdated('panel-1', {
        panelId: 'panel-1',
        requestId: 'req-1',
        collectionId: 'col-1',
        request,
      });

      // requestName should not be updated because request.url is falsy
      expect(panelInfo.requestName).toBe('Original Name');
    });

    it('should not crash when panelInfo is not found', async () => {
      const { handler, draftService } = createHandler();
      const request = createSavedRequest();

      await handler.handleDraftUpdated('unknown-panel', {
        panelId: 'unknown-panel',
        requestId: 'req-1',
        collectionId: 'col-1',
        request,
      });

      // Still upserts draft even without panel info
      expect(draftService.upsert).toHaveBeenCalled();
    });

    it('should not update title when unsaved request url is empty', async () => {
      const { handler, panelInfo } = createHandler({
        panelOverrides: { panel: { title: 'Original Title' } as any },
      });
      const request = createSavedRequest({ url: '' });

      await handler.handleDraftUpdated('panel-1', {
        panelId: 'panel-1',
        requestId: null,
        collectionId: null,
        request,
      });

      // title should not be changed because url is empty
      expect(panelInfo.panel.title).toBe('Original Title');
    });
  });

  describe('handleSaveCollectionRequest', () => {
    it('should update request in collection, save, clear dirty, and notify webview', async () => {
      const existingReq = createSavedRequest({ id: 'req-1' });
      const collection = { id: 'col-1', items: [existingReq], updatedAt: '' };
      const { handler, ctx, draftService, storageService, panelInfo } = createHandler({
        panelOverrides: { collectionName: 'Test Col', requestName: 'GET /api/test' },
        sidebarOverrides: { getCollections: jest.fn().mockReturnValue([collection]) },
      });
      const webview = createMockWebview();
      const updatedRequest = createSavedRequest({ id: 'req-1', method: 'PUT', url: 'https://example.com/api/updated' });

      await handler.handleSaveCollectionRequest(webview, 'panel-1', {
        panelId: 'panel-1',
        requestId: 'req-1',
        collectionId: 'col-1',
        request: updatedRequest,
      });

      expect(storageService.saveCollections).toHaveBeenCalled();
      expect(ctx.sidebarProvider.notifyCollectionsUpdated).toHaveBeenCalled();
      expect(panelInfo.isDirty).toBe(false);
      expect(draftService.remove).toHaveBeenCalledWith('panel-1');
      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'collectionRequestSaved',
        data: { requestId: 'req-1', collectionId: 'col-1' },
      });
    });

    it('should unlink panel and notify webview when collection is not found', async () => {
      const { handler, panelInfo } = createHandler({
        sidebarOverrides: { getCollections: jest.fn().mockReturnValue([]) },
      });
      const webview = createMockWebview();
      const request = createSavedRequest({ id: 'req-1', method: 'POST', url: 'https://example.com/api/test' });

      await handler.handleSaveCollectionRequest(webview, 'panel-1', {
        panelId: 'panel-1',
        requestId: 'req-1',
        collectionId: 'col-missing',
        request,
      });

      expect(panelInfo.uiService!.showError).toHaveBeenCalledWith('Collection not found. The request has been unlinked.');
      expect(panelInfo.requestId).toBeNull();
      expect(panelInfo.collectionId).toBeNull();
      expect(panelInfo.collectionName).toBeUndefined();
      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'requestUnlinked',
        data: { message: 'Collection was deleted. Request has been unlinked.' },
      });
    });

    it('should unlink panel when request is not found in collection', async () => {
      const otherReq = createSavedRequest({ id: 'other-req' });
      const collection = { id: 'col-1', items: [otherReq], updatedAt: '' };
      const { handler, panelInfo } = createHandler({
        sidebarOverrides: { getCollections: jest.fn().mockReturnValue([collection]) },
      });
      const webview = createMockWebview();
      const request = createSavedRequest({ id: 'req-missing' });

      await handler.handleSaveCollectionRequest(webview, 'panel-1', {
        panelId: 'panel-1',
        requestId: 'req-missing',
        collectionId: 'col-1',
        request,
      });

      expect(panelInfo.uiService!.showError).toHaveBeenCalledWith('Request not found in collection. It may have been deleted.');
      expect(panelInfo.requestId).toBeNull();
      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'requestUnlinked',
        data: { message: 'Request was deleted from its collection. Request has been unlinked.' },
      });
    });

    it('should return early when panelId is not found', async () => {
      const { handler, storageService } = createHandler();
      const webview = createMockWebview();

      await handler.handleSaveCollectionRequest(webview, 'unknown-panel', {
        panelId: 'unknown-panel',
        requestId: 'req-1',
        collectionId: 'col-1',
        request: createSavedRequest(),
      });

      expect(storageService.saveCollections).not.toHaveBeenCalled();
      expect(webview.postMessage).not.toHaveBeenCalled();
    });

    it('should show error on storage failure', async () => {
      const existingReq = createSavedRequest({ id: 'req-1' });
      const collection = { id: 'col-1', items: [existingReq], updatedAt: '' };
      const { handler, storageService, panelInfo } = createHandler({
        sidebarOverrides: { getCollections: jest.fn().mockReturnValue([collection]) },
      });
      (storageService.saveCollections as jest.Mock).mockRejectedValue(new Error('Disk full'));
      const webview = createMockWebview();

      await handler.handleSaveCollectionRequest(webview, 'panel-1', {
        panelId: 'panel-1',
        requestId: 'req-1',
        collectionId: 'col-1',
        request: createSavedRequest({ id: 'req-1' }),
      });

      expect(panelInfo.uiService!.showError).toHaveBeenCalledWith('Failed to save: Disk full');
    });

    it('should use getCollectionName fallback when panelInfo.collectionName is not set', async () => {
      const existingReq = createSavedRequest({ id: 'req-1' });
      const collection = { id: 'col-1', items: [existingReq], updatedAt: '' };
      const { handler, getCollectionName, panelInfo } = createHandler({
        panelOverrides: { collectionName: undefined, requestName: 'GET /api/test' },
        sidebarOverrides: { getCollections: jest.fn().mockReturnValue([collection]) },
        collectionName: 'Fallback Name',
      });
      const webview = createMockWebview();

      await handler.handleSaveCollectionRequest(webview, 'panel-1', {
        panelId: 'panel-1',
        requestId: 'req-1',
        collectionId: 'col-1',
        request: createSavedRequest({ id: 'req-1' }),
      });

      expect(getCollectionName).toHaveBeenCalledWith('col-1');
      expect(panelInfo.panel.title).toBe('Fallback Name / GET /api/test');
    });

    it('should set title to just reqName when collName is empty', async () => {
      const existingReq = createSavedRequest({ id: 'req-1' });
      const collection = { id: 'col-1', items: [existingReq], updatedAt: '' };
      const { handler, panelInfo } = createHandler({
        panelOverrides: { collectionName: '', requestName: 'GET /api/test' },
        sidebarOverrides: { getCollections: jest.fn().mockReturnValue([collection]) },
        collectionName: '',
      });
      const webview = createMockWebview();

      await handler.handleSaveCollectionRequest(webview, 'panel-1', {
        panelId: 'panel-1',
        requestId: 'req-1',
        collectionId: 'col-1',
        request: createSavedRequest({ id: 'req-1' }),
      });

      expect(panelInfo.panel.title).toBe('GET /api/test');
    });
  });

  describe('handleRevertRequest', () => {
    it('should send original request to webview and clear dirty state', async () => {
      const originalReq = createSavedRequest({ id: 'req-1', name: 'Original', method: 'GET', url: 'https://example.com/original' });
      const collection = { id: 'col-1', items: [originalReq] };
      const { handler, draftService, panelInfo } = createHandler({
        panelOverrides: { collectionName: 'Test Col', isDirty: true },
        sidebarOverrides: { getCollections: jest.fn().mockReturnValue([collection]) },
      });
      const webview = createMockWebview();

      await handler.handleRevertRequest(webview, 'panel-1', {
        panelId: 'panel-1',
        requestId: 'req-1',
        collectionId: 'col-1',
      });

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'originalRequestLoaded',
        data: originalReq,
      });
      expect(panelInfo.isDirty).toBe(false);
      expect(panelInfo.panel.title).toBe('Test Col / Original');
      expect(draftService.remove).toHaveBeenCalledWith('panel-1');
    });

    it('should show error when collection is not found', async () => {
      const { handler, panelInfo } = createHandler({
        sidebarOverrides: { getCollections: jest.fn().mockReturnValue([]) },
      });
      const webview = createMockWebview();

      await handler.handleRevertRequest(webview, 'panel-1', {
        panelId: 'panel-1',
        requestId: 'req-1',
        collectionId: 'col-missing',
      });

      expect(panelInfo.uiService!.showError).toHaveBeenCalledWith('Collection not found.');
      expect(webview.postMessage).not.toHaveBeenCalled();
    });

    it('should show error when request is not found in collection', async () => {
      const otherReq = createSavedRequest({ id: 'other-req' });
      const collection = { id: 'col-1', items: [otherReq] };
      const { handler, panelInfo } = createHandler({
        sidebarOverrides: { getCollections: jest.fn().mockReturnValue([collection]) },
      });
      const webview = createMockWebview();

      await handler.handleRevertRequest(webview, 'panel-1', {
        panelId: 'panel-1',
        requestId: 'req-missing',
        collectionId: 'col-1',
      });

      expect(panelInfo.uiService!.showError).toHaveBeenCalledWith('Request not found in collection.');
      expect(webview.postMessage).not.toHaveBeenCalled();
    });

    it('should find request in nested folders', async () => {
      const nestedReq = createSavedRequest({ id: 'req-nested', name: 'Nested' });
      const folder = { type: 'folder', id: 'folder-1', name: 'Auth', children: [nestedReq] };
      const collection = { id: 'col-1', items: [folder] };
      const { handler } = createHandler({
        sidebarOverrides: { getCollections: jest.fn().mockReturnValue([collection]) },
      });
      const webview = createMockWebview();

      await handler.handleRevertRequest(webview, 'panel-1', {
        panelId: 'panel-1',
        requestId: 'req-nested',
        collectionId: 'col-1',
      });

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'originalRequestLoaded',
        data: nestedReq,
      });
    });

    it('should handle missing panelInfo gracefully (still sends message but skips title update)', async () => {
      const originalReq = createSavedRequest({ id: 'req-1', name: 'Original' });
      const collection = { id: 'col-1', items: [originalReq] };
      const { handler, draftService } = createHandler({
        sidebarOverrides: { getCollections: jest.fn().mockReturnValue([collection]) },
      });
      const webview = createMockWebview();

      await handler.handleRevertRequest(webview, 'unknown-panel', {
        panelId: 'unknown-panel',
        requestId: 'req-1',
        collectionId: 'col-1',
      });

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'originalRequestLoaded',
        data: originalReq,
      });
      // Draft still removed for the unknown panel
      expect(draftService.remove).toHaveBeenCalledWith('unknown-panel');
    });

    it('should show error on exception', async () => {
      const { handler, panelInfo } = createHandler({
        sidebarOverrides: {
          getCollections: jest.fn().mockImplementation(() => { throw new Error('DB error'); }),
        },
      });
      const webview = createMockWebview();

      await handler.handleRevertRequest(webview, 'panel-1', {
        panelId: 'panel-1',
        requestId: 'req-1',
        collectionId: 'col-1',
      });

      expect(panelInfo.uiService!.showError).toHaveBeenCalledWith('Failed to revert: DB error');
    });

    it('should use getCollectionName fallback and default reqName when panel has no collectionName', async () => {
      const originalReq = createSavedRequest({ id: 'req-1', name: '' });
      const collection = { id: 'col-1', items: [originalReq] };
      const { handler, getCollectionName, panelInfo } = createHandler({
        panelOverrides: { collectionName: undefined },
        sidebarOverrides: { getCollections: jest.fn().mockReturnValue([collection]) },
        collectionName: 'Resolved Col',
      });
      const webview = createMockWebview();

      await handler.handleRevertRequest(webview, 'panel-1', {
        panelId: 'panel-1',
        requestId: 'req-1',
        collectionId: 'col-1',
      });

      expect(getCollectionName).toHaveBeenCalledWith('col-1');
      expect(panelInfo.panel.title).toBe('Resolved Col / Request');
    });
  });

  describe('saveDirectToCollection', () => {
    it('should update request in collection and save', async () => {
      const existingReq = createSavedRequest({ id: 'req-1' });
      const collection = { id: 'col-1', items: [existingReq], updatedAt: '' };
      const { handler, storageService, ctx } = createHandler({
        sidebarOverrides: { getCollections: jest.fn().mockReturnValue([collection]) },
      });

      const result = await handler.saveDirectToCollection('req-1', 'col-1', createSavedRequest({ id: 'req-1', method: 'PATCH' }));

      expect(result).toBe(true);
      expect(storageService.saveCollections).toHaveBeenCalled();
      expect(ctx.sidebarProvider.notifyCollectionsUpdated).toHaveBeenCalled();
      expect(collection.updatedAt).toBeTruthy();
    });

    it('should return false when collection is not found', async () => {
      const { handler } = createHandler({
        sidebarOverrides: { getCollections: jest.fn().mockReturnValue([]) },
      });

      const result = await handler.saveDirectToCollection('req-1', 'col-missing', createSavedRequest());
      expect(result).toBe(false);
    });

    it('should return false when request is not found in collection', async () => {
      const collection = { id: 'col-1', items: [], updatedAt: '' };
      const { handler } = createHandler({
        sidebarOverrides: { getCollections: jest.fn().mockReturnValue([collection]) },
      });

      const result = await handler.saveDirectToCollection('req-missing', 'col-1', createSavedRequest());
      expect(result).toBe(false);
    });

    it('should return false on storage error', async () => {
      const existingReq = createSavedRequest({ id: 'req-1' });
      const collection = { id: 'col-1', items: [existingReq], updatedAt: '' };
      const { handler, storageService } = createHandler({
        sidebarOverrides: { getCollections: jest.fn().mockReturnValue([collection]) },
      });
      (storageService.saveCollections as jest.Mock).mockRejectedValue(new Error('Write error'));

      const result = await handler.saveDirectToCollection('req-1', 'col-1', createSavedRequest({ id: 'req-1' }));
      expect(result).toBe(false);
    });
  });

  describe('updateRequestInItems', () => {
    it('should update a top-level request', () => {
      const existingReq = createSavedRequest({ id: 'req-1', method: 'GET', url: 'https://old.com' });
      const items = [existingReq];
      const { handler } = createHandler();

      const result = handler.updateRequestInItems(items, 'req-1', createSavedRequest({
        id: 'req-1',
        method: 'PUT',
        url: 'https://new.com/api/v2',
        params: [{ key: 'a', value: '1' }],
      }));

      expect(result).toBe(true);
      expect(existingReq.method).toBe('PUT');
      expect(existingReq.url).toBe('https://new.com/api/v2');
      expect(existingReq.name).toBe('PUT /api/v2');
      expect(existingReq.params).toEqual([{ key: 'a', value: '1' }]);
      expect(existingReq.updatedAt).toBeTruthy();
    });

    it('should update a request nested in folders', () => {
      const nestedReq = createSavedRequest({ id: 'req-nested' });
      const folder = { type: 'folder', id: 'f1', name: 'F1', children: [nestedReq] };
      const items = [folder];
      const { handler } = createHandler();

      const result = handler.updateRequestInItems(items, 'req-nested', createSavedRequest({
        id: 'req-nested',
        method: 'DELETE',
        url: 'https://example.com/api/items/1',
      }));

      expect(result).toBe(true);
      expect(nestedReq.method).toBe('DELETE');
    });

    it('should return false when request is not found', () => {
      const items = [createSavedRequest({ id: 'req-other' })];
      const { handler } = createHandler();

      const result = handler.updateRequestInItems(items, 'req-missing', createSavedRequest());
      expect(result).toBe(false);
    });

    it('should not update name when url is empty', () => {
      const existingReq = createSavedRequest({ id: 'req-1', name: 'Original Name' });
      const items = [existingReq];
      const { handler } = createHandler();

      handler.updateRequestInItems(items, 'req-1', createSavedRequest({ id: 'req-1', url: '' }));

      expect(existingReq.name).toBe('Original Name');
    });

    it('should handle deeply nested folders', () => {
      const deepReq = createSavedRequest({ id: 'deep-req' });
      const innerFolder = { type: 'folder', id: 'inner', name: 'Inner', children: [deepReq] };
      const outerFolder = { type: 'folder', id: 'outer', name: 'Outer', children: [innerFolder] };
      const items = [outerFolder];
      const { handler } = createHandler();

      const result = handler.updateRequestInItems(items, 'deep-req', createSavedRequest({
        id: 'deep-req',
        method: 'PATCH',
        url: 'https://example.com/deep',
      }));

      expect(result).toBe(true);
      expect(deepReq.method).toBe('PATCH');
    });
  });

  describe('deriveRequestName', () => {
    it('should return method + pathname for a valid URL', () => {
      const { handler } = createHandler();
      expect(handler.deriveRequestName('GET', 'https://example.com/api/users')).toBe('GET /api/users');
    });

    it('should return "New Request" when url is empty', () => {
      const { handler } = createHandler();
      expect(handler.deriveRequestName('POST', '')).toBe('New Request');
    });

    it('should handle URLs without path', () => {
      const { handler } = createHandler();
      expect(handler.deriveRequestName('GET', 'https://example.com')).toBe('GET /');
    });
  });

  describe('extractPathname', () => {
    it('should extract pathname from full URL', () => {
      const { handler } = createHandler();
      expect(handler.extractPathname('https://example.com/api/test')).toBe('/api/test');
    });

    it('should return / for URL without path', () => {
      const { handler } = createHandler();
      expect(handler.extractPathname('https://example.com')).toBe('/');
    });

    it('should handle path-only URLs', () => {
      const { handler } = createHandler();
      expect(handler.extractPathname('/api/test')).toBe('/api/test');
    });
  });
});
