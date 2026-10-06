import * as vscode from 'vscode';

// executeRequest rejects the way Node does when every address of localhost
// refuses the connection: an AggregateError with an empty message
const mockExecuteRequest = jest.fn();

jest.mock('@nouto/core/services', () => ({
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
    getEnvData: jest.fn().mockResolvedValue({ variables: {}, globals: {} }),
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

const NodeAggregateError = (globalThis as any).AggregateError as new (errors: unknown[], message?: string) => Error;

function refusedLocalhost(): Error {
  return Object.assign(
    new NodeAggregateError([
      Object.assign(new Error('connect ECONNREFUSED ::1:3000'), { code: 'ECONNREFUSED' }),
      Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:3000'), { code: 'ECONNREFUSED' }),
    ], ''),
    { code: 'ECONNREFUSED' }
  );
}

describe('RequestExecutor - request errors', () => {
  beforeEach(() => {
    mockExecuteRequest.mockReset();
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({ get: jest.fn().mockReturnValue(true) });
  });

  it('reports an empty-message AggregateError as a refused connection', async () => {
    mockExecuteRequest.mockRejectedValueOnce(refusedLocalhost());
    const { executor } = createExecutor();
    const webview = createMockWebview();

    await executor.handleSendRequest(webview, 'panel-1', baseRequestData({ url: 'http://localhost:3000/people' }));

    const response = webview.postMessage.mock.calls
      .map(([message]: any[]) => message)
      .find((message: any) => message.type === 'requestResponse');
    expect(response.data.error).toBe(true);
    expect(response.data.data).toContain('ECONNREFUSED 127.0.0.1:3000');
    expect(response.data.errorInfo.category).toBe('connection');
    expect(response.data.errorInfo.message).toBe('Connection refused');
  });

  it('keeps an ordinary error message', async () => {
    mockExecuteRequest.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND nope.invalid'));
    const { executor } = createExecutor();
    const webview = createMockWebview();

    await executor.handleSendRequest(webview, 'panel-1', baseRequestData({ url: 'http://nope.invalid/' }));

    const response = webview.postMessage.mock.calls
      .map(([message]: any[]) => message)
      .find((message: any) => message.type === 'requestResponse');
    expect(response.data.data).toBe('getaddrinfo ENOTFOUND nope.invalid');
    expect(response.data.errorInfo.category).toBe('dns');
  });
});
