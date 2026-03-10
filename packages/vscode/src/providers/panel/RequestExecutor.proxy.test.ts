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

jest.mock('@hivefetch/core/services', () => ({
  executeRequest: (...args: any[]) => mockExecuteRequest(...args),
  evaluateAssertions: jest.fn().mockReturnValue({ results: [], summary: { passed: 0, failed: 0, skipped: 0, total: 0 } }),
  resolveRequestWithInheritance: jest.fn(),
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

function createMockCtx(globalStateData: Record<string, any> = {}): any {
  return {
    panels: new Map([['panel-1', { abortController: null, collectionId: null, requestId: null }]]),
    extensionContext: {
      globalState: {
        get: jest.fn((key: string) => globalStateData[key]),
      },
    },
    isWebviewAlive: jest.fn().mockReturnValue(true),
    generateId: jest.fn().mockReturnValue('mock-id'),
    getCollectionName: jest.fn().mockReturnValue('Mock Collection'),
    sidebarProvider: {
      logHistory: jest.fn().mockResolvedValue(undefined),
      getCollections: jest.fn().mockReturnValue([]),
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
    runPostRequestScripts: jest.fn().mockResolvedValue(undefined),
  };
}

function createMockCookieJarService(): any {
  return {
    buildCookieHeader: jest.fn().mockResolvedValue(null),
    storeFromResponse: jest.fn().mockResolvedValue(undefined),
    extractCookies: jest.fn().mockResolvedValue(undefined),
  };
}

function createExecutor(globalStateData: Record<string, any> = {}) {
  const ctx = createMockCtx(globalStateData);
  const executor = new RequestExecutor(
    ctx,
    createMockBodyBuilder(),
    createMockAuthHandler(),
    createMockScriptRunner(),
    createMockCookieJarService(),
  );
  return { executor, ctx };
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

describe('RequestExecutor - proxy resolution', () => {
  beforeEach(() => {
    mockExecuteRequest.mockClear();
    // Reset vscode workspace config mock
    const mockGet = jest.fn().mockReturnValue(true);
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({ get: mockGet });
  });

  it('passes per-request proxy config to executeRequest', async () => {
    const { executor } = createExecutor();
    const webview = createMockWebview();

    await executor.handleSendRequest(webview, 'panel-1', baseRequestData({
      proxy: {
        enabled: true,
        protocol: 'http',
        host: '10.0.0.1',
        port: 8080,
        username: 'user',
        password: 'pass',
        noProxy: 'localhost',
      },
    }));

    expect(mockExecuteRequest).toHaveBeenCalledTimes(1);
    const config = mockExecuteRequest.mock.calls[0][0];
    expect(config.proxy).toEqual({
      protocol: 'http',
      host: '10.0.0.1',
      port: 8080,
      username: 'user',
      password: 'pass',
      noProxy: 'localhost',
    });
  });

  it('ignores per-request proxy when not enabled', async () => {
    const { executor } = createExecutor();
    const webview = createMockWebview();

    await executor.handleSendRequest(webview, 'panel-1', baseRequestData({
      proxy: {
        enabled: false,
        protocol: 'http',
        host: '10.0.0.1',
        port: 8080,
      },
    }));

    expect(mockExecuteRequest).toHaveBeenCalledTimes(1);
    const config = mockExecuteRequest.mock.calls[0][0];
    expect(config.proxy).toBeUndefined();
  });

  it('falls back to global proxy when no per-request proxy', async () => {
    const { executor } = createExecutor({
      'hivefetch.settings': {
        globalProxy: {
          enabled: true,
          protocol: 'socks5',
          host: 'proxy.corp.com',
          port: 1080,
          username: 'corp-user',
          password: 'corp-pass',
          noProxy: '*.internal.com',
        },
      },
    });
    const webview = createMockWebview();

    await executor.handleSendRequest(webview, 'panel-1', baseRequestData());

    expect(mockExecuteRequest).toHaveBeenCalledTimes(1);
    const config = mockExecuteRequest.mock.calls[0][0];
    expect(config.proxy).toEqual({
      protocol: 'socks5',
      host: 'proxy.corp.com',
      port: 1080,
      username: 'corp-user',
      password: 'corp-pass',
      noProxy: '*.internal.com',
    });
  });

  it('ignores global proxy when not enabled', async () => {
    const { executor } = createExecutor({
      'hivefetch.settings': {
        globalProxy: {
          enabled: false,
          protocol: 'http',
          host: 'proxy.corp.com',
          port: 3128,
        },
      },
    });
    const webview = createMockWebview();

    await executor.handleSendRequest(webview, 'panel-1', baseRequestData());

    expect(mockExecuteRequest).toHaveBeenCalledTimes(1);
    const config = mockExecuteRequest.mock.calls[0][0];
    expect(config.proxy).toBeUndefined();
  });

  it('ignores global proxy when host is empty', async () => {
    const { executor } = createExecutor({
      'hivefetch.settings': {
        globalProxy: {
          enabled: true,
          protocol: 'http',
          host: '',
          port: 8080,
        },
      },
    });
    const webview = createMockWebview();

    await executor.handleSendRequest(webview, 'panel-1', baseRequestData());

    expect(mockExecuteRequest).toHaveBeenCalledTimes(1);
    const config = mockExecuteRequest.mock.calls[0][0];
    expect(config.proxy).toBeUndefined();
  });

  it('per-request proxy takes priority over global proxy', async () => {
    const { executor } = createExecutor({
      'hivefetch.settings': {
        globalProxy: {
          enabled: true,
          protocol: 'http',
          host: 'global-proxy.com',
          port: 3128,
        },
      },
    });
    const webview = createMockWebview();

    await executor.handleSendRequest(webview, 'panel-1', baseRequestData({
      proxy: {
        enabled: true,
        protocol: 'socks5',
        host: 'local-proxy.com',
        port: 1080,
      },
    }));

    expect(mockExecuteRequest).toHaveBeenCalledTimes(1);
    const config = mockExecuteRequest.mock.calls[0][0];
    expect(config.proxy).toEqual({
      protocol: 'socks5',
      host: 'local-proxy.com',
      port: 1080,
      username: undefined,
      password: undefined,
      noProxy: undefined,
    });
  });

  it('defaults protocol to http when missing', async () => {
    const { executor } = createExecutor();
    const webview = createMockWebview();

    await executor.handleSendRequest(webview, 'panel-1', baseRequestData({
      proxy: {
        enabled: true,
        host: '10.0.0.1',
        port: 8080,
      },
    }));

    expect(mockExecuteRequest).toHaveBeenCalledTimes(1);
    const config = mockExecuteRequest.mock.calls[0][0];
    expect(config.proxy.protocol).toBe('http');
  });

  it('defaults global proxy port to 8080 when missing', async () => {
    const { executor } = createExecutor({
      'hivefetch.settings': {
        globalProxy: {
          enabled: true,
          host: 'proxy.corp.com',
        },
      },
    });
    const webview = createMockWebview();

    await executor.handleSendRequest(webview, 'panel-1', baseRequestData());

    expect(mockExecuteRequest).toHaveBeenCalledTimes(1);
    const config = mockExecuteRequest.mock.calls[0][0];
    expect(config.proxy.port).toBe(8080);
    expect(config.proxy.protocol).toBe('http');
  });

  it('sends no proxy config when neither per-request nor global is configured', async () => {
    const { executor } = createExecutor();
    const webview = createMockWebview();

    await executor.handleSendRequest(webview, 'panel-1', baseRequestData());

    expect(mockExecuteRequest).toHaveBeenCalledTimes(1);
    const config = mockExecuteRequest.mock.calls[0][0];
    expect(config.proxy).toBeUndefined();
  });
});
