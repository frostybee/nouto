import * as vscode from 'vscode';

// Mock executeRequest to capture the config it receives
const mockExecuteRequest = jest.fn().mockResolvedValue({
  status: 200,
  statusText: 'OK',
  headers: { 'content-type': 'application/json' },
  data: '{}',
  timing: { dns: 0, tcp: 0, tls: 0, ttfb: 0, transfer: 0, total: 0 },
  timeline: [],
  httpVersion: '1.1',
});

const mockResolveRequestWithInheritance = jest.fn();

jest.mock('@hivefetch/core/services', () => ({
  executeRequest: (...args: any[]) => mockExecuteRequest(...args),
  evaluateAssertions: jest.fn().mockReturnValue({ results: [], summary: { passed: 0, failed: 0, skipped: 0, total: 0 } }),
  resolveRequestWithInheritance: (...args: any[]) => mockResolveRequestWithInheritance(...args),
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn().mockReturnValue(Buffer.from('cert-data')),
}));

jest.mock('../../services/HistoryStorageService', () => ({
  HistoryStorageService: jest.fn().mockImplementation(() => ({
    addEntry: jest.fn().mockResolvedValue(undefined),
    initialize: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { RequestExecutor } from './RequestExecutor';

// --- Helpers ---

function createMockWebview(): any {
  return {
    postMessage: jest.fn(),
  };
}

function createMockCtx(overrides: any = {}): any {
  return {
    panels: new Map([
      ['panel-1', {
        abortController: null,
        collectionId: overrides.collectionId ?? null,
        requestId: overrides.requestId ?? null,
      }],
    ]),
    extensionContext: {
      globalState: {
        get: jest.fn().mockReturnValue(overrides.globalState ?? {}),
      },
    },
    isWebviewAlive: jest.fn().mockReturnValue(true),
    generateId: jest.fn().mockReturnValue('mock-id'),
    getCollectionName: jest.fn().mockReturnValue('Mock Collection'),
    sidebarProvider: {
      logHistory: jest.fn().mockResolvedValue(undefined),
      getCollections: jest.fn().mockReturnValue(overrides.collections ?? []),
      addToDraftsCollection: jest.fn().mockResolvedValue(undefined),
      removeFromDraftsCollection: jest.fn().mockResolvedValue(undefined),
      updateRequestResponse: jest.fn().mockResolvedValue(undefined),
    },
  };
}

function createMockBodyBuilder(): any {
  return {
    build: jest.fn().mockResolvedValue({ headerUpdates: {} }),
  };
}

function createMockAuthHandler(): any {
  return {
    applyAuth: jest.fn().mockResolvedValue({ headerUpdates: {}, paramUpdates: {} }),
    executeNtlmRequest: jest.fn(),
  };
}

function createMockScriptRunner(): any {
  return {
    runPreRequestScripts: jest.fn().mockResolvedValue(undefined),
    runPostResponseScripts: jest.fn().mockResolvedValue(undefined),
  };
}

function createMockCookieJarService(): any {
  return {
    buildCookieHeader: jest.fn().mockResolvedValue(null),
    storeFromResponse: jest.fn().mockResolvedValue(undefined),
    extractCookies: jest.fn().mockResolvedValue(undefined),
  };
}

function createExecutor(ctxOverrides: any = {}) {
  const ctx = createMockCtx(ctxOverrides);
  const authHandler = createMockAuthHandler();
  const executor = new RequestExecutor(
    ctx,
    createMockBodyBuilder(),
    authHandler,
    createMockScriptRunner(),
    createMockCookieJarService(),
  );
  return { executor, ctx, authHandler };
}

function baseRequestData(overrides: any = {}) {
  return {
    method: 'GET',
    url: 'http://api.example.com/test',
    headers: [],
    params: [],
    ...overrides,
  };
}

// --- Tests ---

describe('RequestExecutor - auth inheritance', () => {
  beforeEach(() => {
    mockExecuteRequest.mockClear();
    mockResolveRequestWithInheritance.mockReset();
    const mockGet = jest.fn().mockReturnValue(true);
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({ get: mockGet });
  });

  it('uses request own auth when authInheritance is undefined', async () => {
    const { executor, authHandler } = createExecutor();
    const webview = createMockWebview();
    const ownAuth = { type: 'bearer', token: 'my-token' };

    await executor.handleSendRequest(webview, 'panel-1', baseRequestData({
      auth: ownAuth,
    }));

    expect(authHandler.applyAuth).toHaveBeenCalledTimes(1);
    expect(authHandler.applyAuth.mock.calls[0][0]).toEqual(ownAuth);
    expect(mockResolveRequestWithInheritance).not.toHaveBeenCalled();
  });

  it('uses request own auth when authInheritance is "own"', async () => {
    const { executor, authHandler } = createExecutor({
      collectionId: 'col-1',
      requestId: 'req-1',
    });
    const webview = createMockWebview();
    const ownAuth = { type: 'bearer', token: 'my-token' };

    await executor.handleSendRequest(webview, 'panel-1', baseRequestData({
      auth: ownAuth,
      authInheritance: 'own',
    }));

    expect(authHandler.applyAuth).toHaveBeenCalledTimes(1);
    expect(authHandler.applyAuth.mock.calls[0][0]).toEqual(ownAuth);
    expect(mockResolveRequestWithInheritance).not.toHaveBeenCalled();
  });

  it('applies no auth when authInheritance is "none"', async () => {
    const { executor, authHandler } = createExecutor({
      collectionId: 'col-1',
      requestId: 'req-1',
    });
    const webview = createMockWebview();

    await executor.handleSendRequest(webview, 'panel-1', baseRequestData({
      auth: { type: 'bearer', token: 'should-be-ignored' },
      authInheritance: 'none',
    }));

    expect(authHandler.applyAuth).toHaveBeenCalledTimes(1);
    expect(authHandler.applyAuth.mock.calls[0][0]).toEqual({ type: 'none' });
    expect(mockResolveRequestWithInheritance).not.toHaveBeenCalled();
  });

  it('resolves inherited auth from collection when authInheritance is "inherit"', async () => {
    const collectionAuth = { type: 'bearer', token: 'col-token' };
    const collection = { id: 'col-1', name: 'My API', items: [] };

    mockResolveRequestWithInheritance.mockReturnValue({
      auth: collectionAuth,
      headers: [],
      variables: [],
      inheritedFrom: 'My API',
    });

    const { executor, authHandler } = createExecutor({
      collectionId: 'col-1',
      requestId: 'req-1',
      collections: [collection],
    });
    const webview = createMockWebview();

    await executor.handleSendRequest(webview, 'panel-1', baseRequestData({
      auth: { type: 'none' },
      authInheritance: 'inherit',
    }));

    expect(mockResolveRequestWithInheritance).toHaveBeenCalledWith(collection, 'req-1', 'inherit');
    expect(authHandler.applyAuth).toHaveBeenCalledTimes(1);
    expect(authHandler.applyAuth.mock.calls[0][0]).toEqual(collectionAuth);
  });

  it('uses panelInfo.requestId (not requestData.id) for inheritance lookup', async () => {
    const collection = { id: 'col-1', name: 'My API', items: [] };

    mockResolveRequestWithInheritance.mockReturnValue({
      auth: { type: 'bearer', token: 'resolved' },
      headers: [],
      variables: [],
    });

    const { executor } = createExecutor({
      collectionId: 'col-1',
      requestId: 'panel-req-id',
      collections: [collection],
    });
    const webview = createMockWebview();

    await executor.handleSendRequest(webview, 'panel-1', baseRequestData({
      id: 'wrong-id-from-webview',
      auth: { type: 'none' },
      authInheritance: 'inherit',
    }));

    // Must use panelInfo.requestId, not requestData.id
    expect(mockResolveRequestWithInheritance).toHaveBeenCalledWith(collection, 'panel-req-id', 'inherit');
  });

  it('falls back to request own auth when collection is not found', async () => {
    const { executor, authHandler } = createExecutor({
      collectionId: 'col-missing',
      requestId: 'req-1',
      collections: [], // no collections
    });
    const webview = createMockWebview();
    const ownAuth = { type: 'bearer', token: 'fallback' };

    await executor.handleSendRequest(webview, 'panel-1', baseRequestData({
      auth: ownAuth,
      authInheritance: 'inherit',
    }));

    expect(mockResolveRequestWithInheritance).not.toHaveBeenCalled();
    expect(authHandler.applyAuth).toHaveBeenCalledTimes(1);
    expect(authHandler.applyAuth.mock.calls[0][0]).toEqual(ownAuth);
  });

  it('falls back to request own auth when panelInfo has no requestId', async () => {
    const collection = { id: 'col-1', name: 'My API', items: [] };

    const { executor, authHandler } = createExecutor({
      collectionId: 'col-1',
      requestId: null, // no requestId (e.g. unsaved request)
      collections: [collection],
    });
    const webview = createMockWebview();
    const ownAuth = { type: 'bearer', token: 'fallback' };

    await executor.handleSendRequest(webview, 'panel-1', baseRequestData({
      auth: ownAuth,
      authInheritance: 'inherit',
    }));

    expect(mockResolveRequestWithInheritance).not.toHaveBeenCalled();
    expect(authHandler.applyAuth).toHaveBeenCalledTimes(1);
    expect(authHandler.applyAuth.mock.calls[0][0]).toEqual(ownAuth);
  });

  it('falls back to request own auth when resolve returns null', async () => {
    const collection = { id: 'col-1', name: 'My API', items: [] };
    mockResolveRequestWithInheritance.mockReturnValue(null);

    const { executor, authHandler } = createExecutor({
      collectionId: 'col-1',
      requestId: 'req-1',
      collections: [collection],
    });
    const webview = createMockWebview();
    const ownAuth = { type: 'bearer', token: 'fallback' };

    await executor.handleSendRequest(webview, 'panel-1', baseRequestData({
      auth: ownAuth,
      authInheritance: 'inherit',
    }));

    expect(mockResolveRequestWithInheritance).toHaveBeenCalled();
    expect(authHandler.applyAuth).toHaveBeenCalledTimes(1);
    // When resolve returns null, effectiveAuth stays as requestData.auth
    expect(authHandler.applyAuth.mock.calls[0][0]).toEqual(ownAuth);
  });

  it('does not resolve inheritance when no collectionId on panel', async () => {
    const { executor, authHandler } = createExecutor({
      collectionId: null, // standalone request, not in a collection
      requestId: 'req-1',
    });
    const webview = createMockWebview();
    const ownAuth = { type: 'bearer', token: 'standalone' };

    await executor.handleSendRequest(webview, 'panel-1', baseRequestData({
      auth: ownAuth,
      authInheritance: 'inherit',
    }));

    expect(mockResolveRequestWithInheritance).not.toHaveBeenCalled();
    expect(authHandler.applyAuth).toHaveBeenCalledTimes(1);
    expect(authHandler.applyAuth.mock.calls[0][0]).toEqual(ownAuth);
  });
});
