// Mock DataFileService (must be before import)
const mockParseDataFile = jest.fn();
jest.mock('../../services/DataFileService', () => ({
  parseDataFile: mockParseDataFile,
}));

// Mock fs/promises
jest.mock('fs/promises', () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
}));

// Mock @nouto/core/services
const mockResolveVariablesForRequest = jest.fn().mockReturnValue([]);
jest.mock('@nouto/core/services', () => ({
  resolveVariablesForRequest: mockResolveVariablesForRequest,
}));

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { RunnerPanelHandler, type IRunnerContext } from './RunnerPanelHandler';
import type { Collection, SavedRequest, Folder } from '../../services/types';

// --- Helpers ---

function makeRequest(overrides: Partial<SavedRequest> = {}): SavedRequest {
  return {
    type: 'request',
    id: `req-${Math.random().toString(36).slice(2, 7)}`,
    name: 'Test Request',
    method: 'GET',
    url: 'https://example.com',
    params: [],
    headers: [],
    body: { type: 'none' },
    ...overrides,
  } as SavedRequest;
}

function makeFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    type: 'folder',
    id: 'folder-1',
    name: 'Test Folder',
    children: [],
    expanded: true,
    ...overrides,
  } as Folder;
}

function makeCollection(overrides: Partial<Collection> = {}): Collection {
  return {
    id: 'col-1',
    name: 'Test Collection',
    items: [],
    ...overrides,
  } as Collection;
}

let mockPostMessage: jest.Mock;
let mockOnDidReceiveMessage: jest.Mock;
let mockOnDidDispose: jest.Mock;
let mockMsgDisposable: { dispose: jest.Mock };
let messageHandler: (message: any) => Promise<void>;

function setupWebviewPanel() {
  mockPostMessage = jest.fn().mockResolvedValue(true);
  mockMsgDisposable = { dispose: jest.fn() };
  mockOnDidReceiveMessage = jest.fn().mockImplementation((handler) => {
    messageHandler = handler;
    return mockMsgDisposable;
  });
  mockOnDidDispose = jest.fn();

  const mockPanel = {
    webview: {
      html: '',
      postMessage: mockPostMessage,
      onDidReceiveMessage: mockOnDidReceiveMessage,
      asWebviewUri: jest.fn((uri: any) => ({ toString: () => uri?.fsPath || String(uri) })),
      cspSource: 'mock-csp',
    },
    onDidDispose: mockOnDidDispose,
    dispose: jest.fn(),
  };

  (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockPanel);
  return mockPanel;
}

function createHandler(collections: Collection[] = []) {
  const ctx: IRunnerContext = {
    collections,
    storageService: {
      loadEnvironments: jest.fn().mockResolvedValue({
        environments: [],
        activeEnvironmentId: null,
      }),
    },
    extensionUri: vscode.Uri.file('/mock/extension'),
    getNonce: jest.fn().mockReturnValue('test-nonce'),
  };

  const runnerService = {
    runCollection: jest.fn().mockResolvedValue({ totalRequests: 0, passed: 0, failed: 0 }),
    cancel: jest.fn(),
  } as any;

  const handler = new RunnerPanelHandler(ctx, runnerService);
  return { handler, ctx, runnerService };
}

// --- Tests ---

describe('RunnerPanelHandler', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockResolveVariablesForRequest.mockReturnValue([]);
    mockParseDataFile.mockResolvedValue([]);
  });

  // ==================== openCollectionRunner - panel creation ====================

  describe('openCollectionRunner - panel creation', () => {
    it('returns early when collection is not found', async () => {
      const { handler } = createHandler([]);
      await handler.openCollectionRunner('nonexistent');
      expect(vscode.window.createWebviewPanel).not.toHaveBeenCalled();
    });

    it('returns early when folder is not found in collection', async () => {
      const collection = makeCollection({ id: 'col-1', items: [] });
      const { handler } = createHandler([collection]);
      await handler.openCollectionRunner('col-1', 'nonexistent-folder');
      expect(vscode.window.createWebviewPanel).not.toHaveBeenCalled();
    });

    it('shows info message when collection has no requests', async () => {
      const collection = makeCollection({ id: 'col-1', items: [] });
      const { handler } = createHandler([collection]);
      setupWebviewPanel();

      await handler.openCollectionRunner('col-1');
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('No requests to run');
      expect(vscode.window.createWebviewPanel).not.toHaveBeenCalled();
    });

    it('shows info message when folder has no requests', async () => {
      const folder = makeFolder({ id: 'folder-1', children: [] });
      const collection = makeCollection({ id: 'col-1', items: [folder] });
      const { handler } = createHandler([collection]);
      setupWebviewPanel();

      await handler.openCollectionRunner('col-1', 'folder-1');
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('No requests to run');
    });

    it('creates webview panel with collection name title', async () => {
      const req = makeRequest({ id: 'r1' });
      const collection = makeCollection({ id: 'col-1', name: 'My API', items: [req] });
      const { handler } = createHandler([collection]);
      setupWebviewPanel();

      await handler.openCollectionRunner('col-1');
      expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
        'nouto.collectionRunner',
        'Runner: My API',
        vscode.ViewColumn.Active,
        expect.objectContaining({
          enableScripts: true,
          retainContextWhenHidden: true,
        }),
      );
    });

    it('creates webview panel with folder name title when folderId is given', async () => {
      const req = makeRequest({ id: 'r1' });
      const folder = makeFolder({ id: 'folder-1', name: 'Auth Folder', children: [req] });
      const collection = makeCollection({ id: 'col-1', items: [folder] });
      const { handler } = createHandler([collection]);
      setupWebviewPanel();

      await handler.openCollectionRunner('col-1', 'folder-1');
      expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
        'nouto.collectionRunner',
        'Runner: Auth Folder',
        expect.anything(),
        expect.anything(),
      );
    });

    it('sets webview HTML content', async () => {
      const req = makeRequest({ id: 'r1' });
      const collection = makeCollection({ id: 'col-1', items: [req] });
      const { handler } = createHandler([collection]);
      const panel = setupWebviewPanel();

      await handler.openCollectionRunner('col-1');
      expect(panel.webview.html).toContain('<!DOCTYPE html>');
      expect(panel.webview.html).toContain('test-nonce');
      expect(panel.webview.html).toContain('runner.js');
      expect(panel.webview.html).toContain('style.css');
    });

    it('registers message handler and dispose handler', async () => {
      const req = makeRequest({ id: 'r1' });
      const collection = makeCollection({ id: 'col-1', items: [req] });
      const { handler } = createHandler([collection]);
      setupWebviewPanel();

      await handler.openCollectionRunner('col-1');
      expect(mockOnDidReceiveMessage).toHaveBeenCalledTimes(1);
      expect(mockOnDidDispose).toHaveBeenCalledTimes(1);
    });
  });

  // ==================== Message: ready ====================

  describe('message: ready', () => {
    it('sends initRunner with collection-level requests', async () => {
      const req1 = makeRequest({ id: 'r1', name: 'Get Users', method: 'GET', url: '/users' });
      const req2 = makeRequest({ id: 'r2', name: 'Create User', method: 'POST', url: '/users' });
      const collection = makeCollection({ id: 'col-1', name: 'My API', items: [req1, req2] });
      const { handler } = createHandler([collection]);
      setupWebviewPanel();

      await handler.openCollectionRunner('col-1');
      await messageHandler({ type: 'ready' });

      expect(mockPostMessage).toHaveBeenCalledWith({
        type: 'initRunner',
        data: {
          collectionId: 'col-1',
          collectionName: 'My API',
          folderId: undefined,
          requests: [
            { id: 'r1', name: 'Get Users', method: 'GET', url: '/users' },
            { id: 'r2', name: 'Create User', method: 'POST', url: '/users' },
          ],
        },
      });
    });

    it('sends initRunner with folder-scoped requests and folderId', async () => {
      const req = makeRequest({ id: 'r1', name: 'Req', method: 'GET', url: '/test' });
      const folder = makeFolder({ id: 'f1', name: 'Folder', children: [req] });
      const collection = makeCollection({ id: 'col-1', name: 'Col', items: [folder] });
      const { handler } = createHandler([collection]);
      setupWebviewPanel();

      await handler.openCollectionRunner('col-1', 'f1');
      await messageHandler({ type: 'ready' });

      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'initRunner',
          data: expect.objectContaining({
            folderId: 'f1',
            requests: [{ id: 'r1', name: 'Req', method: 'GET', url: '/test' }],
          }),
        }),
      );
    });
  });

  // ==================== Message: startCollectionRun ====================

  describe('message: startCollectionRun', () => {
    it('runs all requests when no requestIds are provided', async () => {
      const req1 = makeRequest({ id: 'r1' });
      const req2 = makeRequest({ id: 'r2' });
      const collection = makeCollection({ id: 'col-1', name: 'Col', items: [req1, req2] });
      const { handler, runnerService, ctx } = createHandler([collection]);
      setupWebviewPanel();

      await handler.openCollectionRunner('col-1');
      await messageHandler({
        type: 'startCollectionRun',
        data: { config: { iterations: 1, delayMs: 0 } },
      });

      expect(ctx.storageService.loadEnvironments).toHaveBeenCalled();
      expect(runnerService.runCollection).toHaveBeenCalledWith(
        [req1, req2],
        { iterations: 1, delayMs: 0 },
        'Col',
        expect.anything(),
        expect.any(Function),
        expect.any(Function),
        collection,
        [],
        undefined,
      );
    });

    it('runs only selected requests in the given order', async () => {
      const req1 = makeRequest({ id: 'r1' });
      const req2 = makeRequest({ id: 'r2' });
      const req3 = makeRequest({ id: 'r3' });
      const collection = makeCollection({ id: 'col-1', name: 'Col', items: [req1, req2, req3] });
      const { handler, runnerService } = createHandler([collection]);
      setupWebviewPanel();

      await handler.openCollectionRunner('col-1');
      await messageHandler({
        type: 'startCollectionRun',
        data: {
          config: { iterations: 1, delayMs: 0 },
          requestIds: ['r3', 'r1'],
        },
      });

      expect(runnerService.runCollection).toHaveBeenCalledWith(
        [req3, req1],
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.any(Function),
        expect.any(Function),
        expect.anything(),
        expect.anything(),
        undefined,
      );
    });

    it('filters out unknown requestIds gracefully', async () => {
      const req1 = makeRequest({ id: 'r1' });
      const collection = makeCollection({ id: 'col-1', name: 'Col', items: [req1] });
      const { handler, runnerService } = createHandler([collection]);
      setupWebviewPanel();

      await handler.openCollectionRunner('col-1');
      await messageHandler({
        type: 'startCollectionRun',
        data: {
          config: {},
          requestIds: ['r1', 'nonexistent'],
        },
      });

      expect(runnerService.runCollection).toHaveBeenCalledWith(
        [req1],
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.any(Function),
        expect.any(Function),
        expect.anything(),
        expect.anything(),
        undefined,
      );
    });

    it('parses data file when config includes dataFile and dataFileType', async () => {
      const req = makeRequest({ id: 'r1' });
      const collection = makeCollection({ id: 'col-1', name: 'Col', items: [req] });
      const { handler, runnerService } = createHandler([collection]);
      setupWebviewPanel();
      const mockRows = [{ name: 'Alice' }, { name: 'Bob' }];
      mockParseDataFile.mockResolvedValue(mockRows);

      await handler.openCollectionRunner('col-1');
      await messageHandler({
        type: 'startCollectionRun',
        data: {
          config: { dataFile: '/data.csv', dataFileType: 'csv' },
        },
      });

      expect(mockParseDataFile).toHaveBeenCalledWith('/data.csv', 'csv');
      expect(runnerService.runCollection).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.any(Function),
        expect.any(Function),
        expect.anything(),
        expect.anything(),
        mockRows,
      );
    });

    it('shows error message when data file parsing fails', async () => {
      const req = makeRequest({ id: 'r1' });
      const collection = makeCollection({ id: 'col-1', name: 'Col', items: [req] });
      const { handler } = createHandler([collection]);
      setupWebviewPanel();
      mockParseDataFile.mockRejectedValue(new Error('Invalid CSV'));

      await handler.openCollectionRunner('col-1');
      await messageHandler({
        type: 'startCollectionRun',
        data: {
          config: { dataFile: '/bad.csv', dataFileType: 'csv' },
        },
      });

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        'Failed to parse data file: Invalid CSV',
      );
    });

    it('shows generic error message for non-Error thrown objects', async () => {
      const req = makeRequest({ id: 'r1' });
      const collection = makeCollection({ id: 'col-1', name: 'Col', items: [req] });
      const { handler } = createHandler([collection]);
      setupWebviewPanel();
      mockParseDataFile.mockRejectedValue('string error');

      await handler.openCollectionRunner('col-1');
      await messageHandler({
        type: 'startCollectionRun',
        data: {
          config: { dataFile: '/bad.csv', dataFileType: 'csv' },
        },
      });

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        'Failed to parse data file: Unknown error',
      );
    });

    it('posts progress and result messages from callbacks', async () => {
      const req = makeRequest({ id: 'r1' });
      const collection = makeCollection({ id: 'col-1', name: 'Col', items: [req] });
      const { handler, runnerService } = createHandler([collection]);
      setupWebviewPanel();

      runnerService.runCollection.mockImplementation(
        async (_reqs: any, _cfg: any, _name: any, _env: any, onProgress: any, onResult: any) => {
          onProgress({ current: 1, total: 1, requestName: 'Test' });
          onResult({ requestId: 'r1', passed: true });
          return { totalRequests: 1, passed: 1, failed: 0 };
        },
      );

      await handler.openCollectionRunner('col-1');
      await messageHandler({
        type: 'startCollectionRun',
        data: { config: {} },
      });

      // Wait for the async runCollection promise chain
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockPostMessage).toHaveBeenCalledWith({
        type: 'collectionRunProgress',
        data: { current: 1, total: 1, requestName: 'Test' },
      });
      expect(mockPostMessage).toHaveBeenCalledWith({
        type: 'collectionRunRequestResult',
        data: { requestId: 'r1', passed: true },
      });
      expect(mockPostMessage).toHaveBeenCalledWith({
        type: 'collectionRunComplete',
        data: { totalRequests: 1, passed: 1, failed: 0 },
      });
    });

    it('resolves collection-scoped variables with folder ancestry', async () => {
      const req = makeRequest({ id: 'r1' });
      const folder = makeFolder({
        id: 'f1',
        children: [req],
        variables: [{ key: 'token', value: 'abc', enabled: true }],
      });
      const collection = makeCollection({ id: 'col-1', name: 'Col', items: [folder] });
      const { handler } = createHandler([collection]);
      setupWebviewPanel();
      mockResolveVariablesForRequest.mockReturnValue([{ key: 'token', value: 'abc', enabled: true }]);

      await handler.openCollectionRunner('col-1', 'f1');
      await messageHandler({
        type: 'startCollectionRun',
        data: { config: {} },
      });

      expect(mockResolveVariablesForRequest).toHaveBeenCalledWith(
        collection,
        [collection, folder],
      );
    });
  });

  // ==================== Message: cancelCollectionRun ====================

  describe('message: cancelCollectionRun', () => {
    it('calls cancel on runner service and posts cancelled message', async () => {
      const req = makeRequest({ id: 'r1' });
      const collection = makeCollection({ id: 'col-1', items: [req] });
      const { handler, runnerService } = createHandler([collection]);
      setupWebviewPanel();

      await handler.openCollectionRunner('col-1');
      await messageHandler({ type: 'cancelCollectionRun' });

      expect(runnerService.cancel).toHaveBeenCalled();
      expect(mockPostMessage).toHaveBeenCalledWith({ type: 'collectionRunCancelled' });
    });
  });

  // ==================== Message: retryFailedRequests ====================

  describe('message: retryFailedRequests', () => {
    it('retries only the specified failed request IDs', async () => {
      const req1 = makeRequest({ id: 'r1' });
      const req2 = makeRequest({ id: 'r2' });
      const req3 = makeRequest({ id: 'r3' });
      const collection = makeCollection({ id: 'col-1', name: 'Col', items: [req1, req2, req3] });
      const { handler, runnerService, ctx } = createHandler([collection]);
      setupWebviewPanel();

      await handler.openCollectionRunner('col-1');
      await messageHandler({
        type: 'retryFailedRequests',
        data: {
          requestIds: ['r2', 'r3'],
          config: { iterations: 1 },
        },
      });

      expect(ctx.storageService.loadEnvironments).toHaveBeenCalled();
      expect(runnerService.runCollection).toHaveBeenCalledWith(
        [req2, req3],
        { iterations: 1 },
        'Col',
        expect.anything(),
        expect.any(Function),
        expect.any(Function),
        collection,
        [],
      );
    });

    it('does not call runCollection when no matching requests found', async () => {
      const req = makeRequest({ id: 'r1' });
      const collection = makeCollection({ id: 'col-1', name: 'Col', items: [req] });
      const { handler, runnerService } = createHandler([collection]);
      setupWebviewPanel();

      await handler.openCollectionRunner('col-1');
      await messageHandler({
        type: 'retryFailedRequests',
        data: {
          requestIds: ['nonexistent'],
          config: {},
        },
      });

      expect(runnerService.runCollection).not.toHaveBeenCalled();
    });

    it('uses empty array for missing requestIds', async () => {
      const req = makeRequest({ id: 'r1' });
      const collection = makeCollection({ id: 'col-1', name: 'Col', items: [req] });
      const { handler, runnerService } = createHandler([collection]);
      setupWebviewPanel();

      await handler.openCollectionRunner('col-1');
      await messageHandler({
        type: 'retryFailedRequests',
        data: { config: {} },
      });

      expect(runnerService.runCollection).not.toHaveBeenCalled();
    });
  });

  // ==================== Message: selectDataFile ====================

  describe('message: selectDataFile', () => {
    it('opens file dialog and posts parsed file info on success', async () => {
      const req = makeRequest({ id: 'r1' });
      const collection = makeCollection({ id: 'col-1', items: [req] });
      const { handler } = createHandler([collection]);
      setupWebviewPanel();

      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([
        { fsPath: '/data/users.csv' },
      ]);
      mockParseDataFile.mockResolvedValue([
        { name: 'Alice', age: '30' },
        { name: 'Bob', age: '25' },
      ]);

      await handler.openCollectionRunner('col-1');
      await messageHandler({ type: 'selectDataFile' });

      expect(vscode.window.showOpenDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
        }),
      );
      expect(mockParseDataFile).toHaveBeenCalledWith('/data/users.csv', 'csv');
      expect(mockPostMessage).toHaveBeenCalledWith({
        type: 'dataFileSelected',
        data: {
          path: '/data/users.csv',
          type: 'csv',
          rowCount: 2,
          columns: ['name', 'age'],
        },
      });
    });

    it('detects JSON file type from extension', async () => {
      const req = makeRequest({ id: 'r1' });
      const collection = makeCollection({ id: 'col-1', items: [req] });
      const { handler } = createHandler([collection]);
      setupWebviewPanel();

      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([
        { fsPath: '/data/items.json' },
      ]);
      mockParseDataFile.mockResolvedValue([{ id: 1 }]);

      await handler.openCollectionRunner('col-1');
      await messageHandler({ type: 'selectDataFile' });

      expect(mockParseDataFile).toHaveBeenCalledWith('/data/items.json', 'json');
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'json' }),
        }),
      );
    });

    it('does nothing when file dialog is cancelled', async () => {
      const req = makeRequest({ id: 'r1' });
      const collection = makeCollection({ id: 'col-1', items: [req] });
      const { handler } = createHandler([collection]);
      setupWebviewPanel();

      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue(undefined);

      await handler.openCollectionRunner('col-1');
      await messageHandler({ type: 'selectDataFile' });

      expect(mockParseDataFile).not.toHaveBeenCalled();
    });

    it('does nothing when file dialog returns empty array', async () => {
      const req = makeRequest({ id: 'r1' });
      const collection = makeCollection({ id: 'col-1', items: [req] });
      const { handler } = createHandler([collection]);
      setupWebviewPanel();

      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([]);

      await handler.openCollectionRunner('col-1');
      await messageHandler({ type: 'selectDataFile' });

      expect(mockParseDataFile).not.toHaveBeenCalled();
    });

    it('shows error message when parsing selected data file fails', async () => {
      const req = makeRequest({ id: 'r1' });
      const collection = makeCollection({ id: 'col-1', items: [req] });
      const { handler } = createHandler([collection]);
      setupWebviewPanel();

      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([
        { fsPath: '/data/bad.csv' },
      ]);
      mockParseDataFile.mockRejectedValue(new Error('Malformed CSV'));

      await handler.openCollectionRunner('col-1');
      await messageHandler({ type: 'selectDataFile' });

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        'Failed to parse data file: Malformed CSV',
      );
    });

    it('reports empty columns for empty data file', async () => {
      const req = makeRequest({ id: 'r1' });
      const collection = makeCollection({ id: 'col-1', items: [req] });
      const { handler } = createHandler([collection]);
      setupWebviewPanel();

      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([
        { fsPath: '/data/empty.csv' },
      ]);
      mockParseDataFile.mockResolvedValue([]);

      await handler.openCollectionRunner('col-1');
      await messageHandler({ type: 'selectDataFile' });

      expect(mockPostMessage).toHaveBeenCalledWith({
        type: 'dataFileSelected',
        data: {
          path: '/data/empty.csv',
          type: 'csv',
          rowCount: 0,
          columns: [],
        },
      });
    });
  });

  // ==================== Message: exportRunResults ====================

  describe('message: exportRunResults', () => {
    const mockResults = [
      {
        requestName: 'Get Users',
        method: 'GET',
        url: 'https://api.example.com/users',
        status: 200,
        statusText: 'OK',
        duration: 150,
        passed: true,
        error: '',
      },
      {
        requestName: 'Create User',
        method: 'POST',
        url: 'https://api.example.com/users',
        status: 500,
        statusText: 'Internal Server Error',
        duration: 300,
        passed: false,
        error: 'Server error',
      },
    ];

    const mockSummary = { totalRequests: 2, passed: 1, failed: 1 };

    it('exports results as CSV when format is csv', async () => {
      const req = makeRequest({ id: 'r1' });
      const collection = makeCollection({ id: 'col-1', items: [req] });
      const { handler } = createHandler([collection]);
      setupWebviewPanel();

      const savedUri = { fsPath: '/output/results.csv' };
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(savedUri);

      await handler.openCollectionRunner('col-1');
      await messageHandler({
        type: 'exportRunResults',
        data: {
          format: 'csv',
          results: mockResults,
          summary: mockSummary,
          collectionName: 'My API',
        },
      });

      expect(vscode.window.showSaveDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: { 'CSV Files': ['csv'] },
          title: 'Export Results (CSV)',
        }),
      );

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/output/results.csv',
        expect.stringContaining('#,Name,Method,URL,Status,StatusText,Duration(ms),Pass/Fail,Error'),
        'utf8',
      );

      const writtenContent = (fs.writeFile as jest.Mock).mock.calls[0][1] as string;
      expect(writtenContent).toContain('1,"Get Users",GET,"https://api.example.com/users",200,OK,150,Pass,""');
      expect(writtenContent).toContain('2,"Create User",POST,"https://api.example.com/users",500,Internal Server Error,300,Fail,"Server error"');

      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'Results exported to /output/results.csv',
      );
    });

    it('exports results as JSON when format is json', async () => {
      const req = makeRequest({ id: 'r1' });
      const collection = makeCollection({ id: 'col-1', items: [req] });
      const { handler } = createHandler([collection]);
      setupWebviewPanel();

      const savedUri = { fsPath: '/output/results.json' };
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(savedUri);

      await handler.openCollectionRunner('col-1');
      await messageHandler({
        type: 'exportRunResults',
        data: {
          format: 'json',
          results: mockResults,
          summary: mockSummary,
          collectionName: 'Test API',
        },
      });

      expect(vscode.window.showSaveDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: { 'JSON Files': ['json'] },
          title: 'Export Results (JSON)',
        }),
      );

      const writtenContent = (fs.writeFile as jest.Mock).mock.calls[0][1] as string;
      const parsed = JSON.parse(writtenContent);
      expect(parsed.collectionName).toBe('Test API');
      expect(parsed.summary).toEqual(mockSummary);
      expect(parsed.results).toEqual(mockResults);
    });

    it('does nothing when save dialog is cancelled', async () => {
      const req = makeRequest({ id: 'r1' });
      const collection = makeCollection({ id: 'col-1', items: [req] });
      const { handler } = createHandler([collection]);
      setupWebviewPanel();

      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(undefined);

      await handler.openCollectionRunner('col-1');
      await messageHandler({
        type: 'exportRunResults',
        data: {
          format: 'json',
          results: [],
          summary: {},
          collectionName: 'Test',
        },
      });

      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('sanitizes collection name in default filename', async () => {
      const req = makeRequest({ id: 'r1' });
      const collection = makeCollection({ id: 'col-1', items: [req] });
      const { handler } = createHandler([collection]);
      setupWebviewPanel();

      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(undefined);

      await handler.openCollectionRunner('col-1');
      await messageHandler({
        type: 'exportRunResults',
        data: {
          format: 'csv',
          results: [],
          summary: {},
          collectionName: 'My API / v2.0',
        },
      });

      const callArgs = (vscode.window.showSaveDialog as jest.Mock).mock.calls[0][0];
      expect(callArgs.defaultUri.fsPath).toBe('My_API___v2_0_results.csv');
    });

    it('escapes double quotes in CSV values', async () => {
      const req = makeRequest({ id: 'r1' });
      const collection = makeCollection({ id: 'col-1', items: [req] });
      const { handler } = createHandler([collection]);
      setupWebviewPanel();

      const savedUri = { fsPath: '/output/results.csv' };
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(savedUri);

      await handler.openCollectionRunner('col-1');
      await messageHandler({
        type: 'exportRunResults',
        data: {
          format: 'csv',
          results: [{
            requestName: 'Request "with quotes"',
            method: 'GET',
            url: 'https://example.com',
            status: 200,
            statusText: 'OK',
            duration: 100,
            passed: true,
            error: '',
          }],
          summary: {},
          collectionName: 'Test',
        },
      });

      const writtenContent = (fs.writeFile as jest.Mock).mock.calls[0][1] as string;
      expect(writtenContent).toContain('"Request ""with quotes"""');
    });
  });

  // ==================== Panel dispose ====================

  describe('panel dispose', () => {
    it('disposes message handler and cancels runner on panel close', async () => {
      const req = makeRequest({ id: 'r1' });
      const collection = makeCollection({ id: 'col-1', items: [req] });
      const { handler, runnerService } = createHandler([collection]);
      setupWebviewPanel();

      await handler.openCollectionRunner('col-1');

      // Get the dispose callback and invoke it
      const disposeCallback = mockOnDidDispose.mock.calls[0][0];
      disposeCallback();

      expect(mockMsgDisposable.dispose).toHaveBeenCalled();
      expect(runnerService.cancel).toHaveBeenCalled();
    });
  });

  // ==================== resolveCollectionScopedVariables ====================

  describe('resolveCollectionScopedVariables (via startCollectionRun)', () => {
    it('passes only collection as ancestor when no folderId', async () => {
      const req = makeRequest({ id: 'r1' });
      const collection = makeCollection({ id: 'col-1', name: 'Col', items: [req] });
      const { handler } = createHandler([collection]);
      setupWebviewPanel();

      await handler.openCollectionRunner('col-1');
      await messageHandler({
        type: 'startCollectionRun',
        data: { config: {} },
      });

      expect(mockResolveVariablesForRequest).toHaveBeenCalledWith(
        collection,
        [collection],
      );
    });

    it('includes folder in ancestors when folderId is given', async () => {
      const req = makeRequest({ id: 'r1' });
      const folder = makeFolder({ id: 'f1', children: [req] });
      const collection = makeCollection({ id: 'col-1', name: 'Col', items: [folder] });
      const { handler } = createHandler([collection]);
      setupWebviewPanel();

      await handler.openCollectionRunner('col-1', 'f1');
      await messageHandler({
        type: 'startCollectionRun',
        data: { config: {} },
      });

      expect(mockResolveVariablesForRequest).toHaveBeenCalledWith(
        collection,
        [collection, folder],
      );
    });
  });

  // ==================== getRunnerHtml ====================

  describe('getRunnerHtml (via panel creation)', () => {
    it('generates HTML with correct CSP and resource URIs', async () => {
      const req = makeRequest({ id: 'r1' });
      const collection = makeCollection({ id: 'col-1', items: [req] });
      const { handler } = createHandler([collection]);
      const panel = setupWebviewPanel();

      await handler.openCollectionRunner('col-1');

      const html = panel.webview.html;
      expect(html).toContain('Content-Security-Policy');
      expect(html).toContain('mock-csp');
      expect(html).toContain('acquireVsCodeApi');
      expect(html).toContain('Collection Runner');
    });
  });
});
