import * as vscode from 'vscode';

const mockResolveScriptsForRequest = jest.fn();

jest.mock('@nouto/core/services', () => ({
  resolveScriptsForRequest: (...args: any[]) => mockResolveScriptsForRequest(...args),
}));

import { ScriptRunner } from './ScriptRunner';

// --- Helpers ---

function createMockWebview(): any {
  return {
    postMessage: jest.fn(),
  };
}

function createMockScriptEngine(): any {
  return {
    executePreRequestScript: jest.fn().mockResolvedValue({
      success: true,
      logs: [],
      tests: [],
      variablesToSet: [],
      modifiedRequest: null,
    }),
    executePostResponseScript: jest.fn().mockResolvedValue({
      success: true,
      logs: [],
      tests: [],
      variablesToSet: [],
    }),
  };
}

function createMockStorageService(): any {
  return {
    loadEnvironments: jest.fn().mockResolvedValue({
      activeId: 'env-1',
      environments: [
        {
          id: 'env-1',
          name: 'Dev',
          variables: [
            { key: 'baseUrl', value: 'http://localhost', enabled: true },
            { key: 'disabled', value: 'skip', enabled: false },
          ],
        },
      ],
      globalVariables: [
        { key: 'apiKey', value: 'global-key', enabled: true },
        { key: 'disabledGlobal', value: 'nope', enabled: false },
      ],
    }),
  };
}

function createMockSecretStorageService(): any {
  return {
    resolveSecrets: jest.fn().mockImplementation((_id: string, vars: any[]) =>
      Promise.resolve(vars)
    ),
  };
}

function createRunner(overrides: {
  scriptEngine?: any;
  storageService?: any;
  secretStorageService?: any;
  collections?: any[];
  isWebviewAlive?: (panelId: string) => boolean;
} = {}) {
  const scriptEngine = overrides.scriptEngine ?? createMockScriptEngine();
  const storageService = overrides.storageService ?? createMockStorageService();
  const secretStorageService = overrides.secretStorageService ?? createMockSecretStorageService();
  const collections = overrides.collections ?? [];
  const isWebviewAlive = overrides.isWebviewAlive ?? jest.fn().mockReturnValue(true);

  const runner = new ScriptRunner(
    scriptEngine,
    storageService,
    secretStorageService,
    () => collections,
    isWebviewAlive as any,
  );

  return { runner, scriptEngine, storageService, secretStorageService, isWebviewAlive };
}

function basePanelInfo(overrides: any = {}): any {
  return {
    collectionId: overrides.collectionId ?? null,
    requestId: overrides.requestId ?? null,
    ...overrides,
  };
}

function baseRequestData(overrides: any = {}) {
  return {
    id: 'req-1',
    name: 'Test Request',
    method: 'GET',
    url: 'http://example.com/api',
    headers: [],
    params: [],
    ...overrides,
  };
}

// --- Tests ---

describe('ScriptRunner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveScriptsForRequest.mockReset();
  });

  // =====================================================
  // getEnvData
  // =====================================================
  describe('getEnvData', () => {
    it('returns enabled variables from the active environment', async () => {
      const { runner } = createRunner();

      const envData = await runner.getEnvData();

      expect(envData.variables).toEqual({ baseUrl: 'http://localhost' });
      expect(envData.variables).not.toHaveProperty('disabled');
    });

    it('returns enabled global variables', async () => {
      const { runner } = createRunner();

      const envData = await runner.getEnvData();

      expect(envData.globals).toEqual({ apiKey: 'global-key' });
      expect(envData.globals).not.toHaveProperty('disabledGlobal');
    });

    it('returns empty variables when no active environment matches', async () => {
      const storageService = createMockStorageService();
      storageService.loadEnvironments.mockResolvedValue({
        activeId: 'non-existent',
        environments: [{ id: 'env-1', name: 'Dev', variables: [] }],
        globalVariables: [],
      });
      const { runner } = createRunner({ storageService });

      const envData = await runner.getEnvData();

      expect(envData.variables).toEqual({});
      expect(envData.globals).toEqual({});
    });

    it('returns empty globals when globalVariables is undefined', async () => {
      const storageService = createMockStorageService();
      storageService.loadEnvironments.mockResolvedValue({
        activeId: 'env-1',
        environments: [{ id: 'env-1', name: 'Dev', variables: [{ key: 'a', value: '1', enabled: true }] }],
        globalVariables: undefined,
      });
      const { runner } = createRunner({ storageService });

      const envData = await runner.getEnvData();

      expect(envData.variables).toEqual({ a: '1' });
      expect(envData.globals).toEqual({});
    });

    it('calls resolveSecrets for both active environment and globals', async () => {
      const { runner, secretStorageService } = createRunner();

      await runner.getEnvData();

      expect(secretStorageService.resolveSecrets).toHaveBeenCalledTimes(2);
      expect(secretStorageService.resolveSecrets).toHaveBeenCalledWith('env-1', expect.any(Array));
      expect(secretStorageService.resolveSecrets).toHaveBeenCalledWith('__global__', expect.any(Array));
    });

    it('returns empty variables when environments array is empty', async () => {
      const storageService = createMockStorageService();
      storageService.loadEnvironments.mockResolvedValue({
        activeId: null,
        environments: [],
        globalVariables: [],
      });
      const { runner } = createRunner({ storageService });

      const envData = await runner.getEnvData();

      expect(envData.variables).toEqual({});
      expect(envData.globals).toEqual({});
    });
  });

  // =====================================================
  // collectScriptSources
  // =====================================================
  describe('collectScriptSources', () => {
    it('returns empty array when no panelInfo and no request scripts', () => {
      const { runner } = createRunner();
      const result = runner.collectScriptSources(undefined, baseRequestData(), 'pre');
      expect(result).toEqual([]);
    });

    it('returns request-level pre-request script', () => {
      const { runner } = createRunner();
      const requestData = baseRequestData({
        scripts: { preRequest: 'console.log("pre")', postResponse: '' },
      });

      const result = runner.collectScriptSources(undefined, requestData, 'pre');

      expect(result).toEqual([{ source: 'console.log("pre")', level: 'request' }]);
    });

    it('returns request-level post-response script', () => {
      const { runner } = createRunner();
      const requestData = baseRequestData({
        scripts: { preRequest: '', postResponse: 'console.log("post")' },
      });

      const result = runner.collectScriptSources(undefined, requestData, 'post');

      expect(result).toEqual([{ source: 'console.log("post")', level: 'request' }]);
    });

    it('ignores whitespace-only request scripts', () => {
      const { runner } = createRunner();
      const requestData = baseRequestData({
        scripts: { preRequest: '   \n  ', postResponse: '' },
      });

      const result = runner.collectScriptSources(undefined, requestData, 'pre');

      expect(result).toEqual([]);
    });

    it('returns inherited scripts from collection when panelInfo has collectionId', () => {
      const collection = { id: 'col-1', name: 'API', items: [] };
      mockResolveScriptsForRequest.mockReturnValue({
        preRequestScripts: [{ source: 'inherited pre', level: 'collection' }],
        postResponseScripts: [{ source: 'inherited post', level: 'collection' }],
      });

      const { runner } = createRunner({ collections: [collection] });
      const panelInfo = basePanelInfo({ collectionId: 'col-1', requestId: 'req-1' });
      const requestData = baseRequestData();

      const result = runner.collectScriptSources(panelInfo, requestData, 'pre');

      expect(mockResolveScriptsForRequest).toHaveBeenCalledWith(collection, 'req-1');
      expect(result).toEqual([{ source: 'inherited pre', level: 'collection' }]);
    });

    it('returns inherited post scripts from collection', () => {
      const collection = { id: 'col-1', name: 'API', items: [] };
      mockResolveScriptsForRequest.mockReturnValue({
        preRequestScripts: [],
        postResponseScripts: [{ source: 'inherited post', level: 'collection' }],
      });

      const { runner } = createRunner({ collections: [collection] });
      const panelInfo = basePanelInfo({ collectionId: 'col-1', requestId: 'req-1' });

      const result = runner.collectScriptSources(panelInfo, baseRequestData(), 'post');

      expect(result).toEqual([{ source: 'inherited post', level: 'collection' }]);
    });

    it('combines inherited and request-level scripts (inherited first)', () => {
      const collection = { id: 'col-1', name: 'API', items: [] };
      mockResolveScriptsForRequest.mockReturnValue({
        preRequestScripts: [{ source: 'col-pre', level: 'collection' }],
        postResponseScripts: [],
      });

      const { runner } = createRunner({ collections: [collection] });
      const panelInfo = basePanelInfo({ collectionId: 'col-1', requestId: 'req-1' });
      const requestData = baseRequestData({
        scripts: { preRequest: 'req-pre', postResponse: '' },
      });

      const result = runner.collectScriptSources(panelInfo, requestData, 'pre');

      expect(result).toEqual([
        { source: 'col-pre', level: 'collection' },
        { source: 'req-pre', level: 'request' },
      ]);
    });

    it('skips collection scripts when collection is not found', () => {
      const { runner } = createRunner({ collections: [] });
      const panelInfo = basePanelInfo({ collectionId: 'col-missing', requestId: 'req-1' });
      const requestData = baseRequestData({
        scripts: { preRequest: 'req-pre', postResponse: '' },
      });

      const result = runner.collectScriptSources(panelInfo, requestData, 'pre');

      expect(mockResolveScriptsForRequest).not.toHaveBeenCalled();
      expect(result).toEqual([{ source: 'req-pre', level: 'request' }]);
    });

    it('skips collection scripts when no requestId is available', () => {
      const collection = { id: 'col-1', name: 'API', items: [] };
      const { runner } = createRunner({ collections: [collection] });
      const panelInfo = basePanelInfo({ collectionId: 'col-1', requestId: null });
      const requestData = baseRequestData({ id: undefined });

      const result = runner.collectScriptSources(panelInfo, requestData, 'pre');

      expect(mockResolveScriptsForRequest).not.toHaveBeenCalled();
    });

    it('uses requestData.id as fallback when panelInfo.requestId is null', () => {
      const collection = { id: 'col-1', name: 'API', items: [] };
      mockResolveScriptsForRequest.mockReturnValue({
        preRequestScripts: [{ source: 'col-pre', level: 'collection' }],
        postResponseScripts: [],
      });

      const { runner } = createRunner({ collections: [collection] });
      const panelInfo = basePanelInfo({ collectionId: 'col-1', requestId: null });
      const requestData = baseRequestData({ id: 'fallback-req-id' });

      const result = runner.collectScriptSources(panelInfo, requestData, 'pre');

      expect(mockResolveScriptsForRequest).toHaveBeenCalledWith(collection, 'fallback-req-id');
      expect(result).toHaveLength(1);
    });

    it('does not include request scripts when scripts property is missing', () => {
      const { runner } = createRunner();
      const requestData = { id: 'req-1', name: 'No Scripts', method: 'GET', url: 'http://a.com' };

      const result = runner.collectScriptSources(undefined, requestData, 'pre');

      expect(result).toEqual([]);
    });

    it('does not resolve collection scripts when panelInfo has no collectionId', () => {
      const { runner } = createRunner();
      const panelInfo = basePanelInfo({ collectionId: null, requestId: 'req-1' });

      const result = runner.collectScriptSources(panelInfo, baseRequestData(), 'pre');

      expect(mockResolveScriptsForRequest).not.toHaveBeenCalled();
    });
  });

  // =====================================================
  // runPreRequestScripts
  // =====================================================
  describe('runPreRequestScripts', () => {
    it('does nothing when there are no scripts', async () => {
      const { runner, scriptEngine } = createRunner();
      const webview = createMockWebview();

      await runner.runPreRequestScripts(
        webview, 'panel-1', undefined,
        baseRequestData(), { url: 'http://a.com', method: 'GET' }, {}
      );

      expect(scriptEngine.executePreRequestScript).not.toHaveBeenCalled();
      expect(webview.postMessage).not.toHaveBeenCalled();
    });

    it('does nothing when webview is not alive', async () => {
      const isWebviewAlive = jest.fn().mockReturnValue(false);
      const { runner, scriptEngine } = createRunner({ isWebviewAlive });
      const webview = createMockWebview();
      const requestData = baseRequestData({
        scripts: { preRequest: 'console.log("pre")', postResponse: '' },
      });

      await runner.runPreRequestScripts(
        webview, 'panel-1', undefined,
        requestData, { url: 'http://a.com', method: 'GET' }, {}
      );

      expect(scriptEngine.executePreRequestScript).not.toHaveBeenCalled();
    });

    it('executes script and posts scriptOutput message', async () => {
      const scriptEngine = createMockScriptEngine();
      const scriptResult = {
        success: true,
        logs: [{ level: 'log', message: 'hello' }],
        tests: [],
        variablesToSet: [],
        modifiedRequest: null,
      };
      scriptEngine.executePreRequestScript.mockResolvedValue(scriptResult);

      const { runner } = createRunner({ scriptEngine });
      const webview = createMockWebview();
      const requestData = baseRequestData({
        scripts: { preRequest: 'console.log("hello")', postResponse: '' },
      });

      await runner.runPreRequestScripts(
        webview, 'panel-1', undefined,
        requestData, { url: 'http://a.com', method: 'GET' }, {}
      );

      expect(scriptEngine.executePreRequestScript).toHaveBeenCalledTimes(1);
      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'scriptOutput',
        data: { phase: 'preRequest', result: scriptResult },
      });
    });

    it('applies modifiedRequest.url to config', async () => {
      const scriptEngine = createMockScriptEngine();
      scriptEngine.executePreRequestScript.mockResolvedValue({
        success: true,
        logs: [],
        tests: [],
        variablesToSet: [],
        modifiedRequest: { url: 'http://modified.com' },
      });

      const { runner } = createRunner({ scriptEngine });
      const webview = createMockWebview();
      const requestData = baseRequestData({
        scripts: { preRequest: 'hf.request.setUrl("http://modified.com")', postResponse: '' },
      });
      const config: any = { url: 'http://original.com', method: 'GET' };

      await runner.runPreRequestScripts(
        webview, 'panel-1', undefined,
        requestData, config, {}
      );

      expect(config.url).toBe('http://modified.com');
    });

    it('applies modifiedRequest.method to config', async () => {
      const scriptEngine = createMockScriptEngine();
      scriptEngine.executePreRequestScript.mockResolvedValue({
        success: true,
        logs: [],
        tests: [],
        variablesToSet: [],
        modifiedRequest: { method: 'POST' },
      });

      const { runner } = createRunner({ scriptEngine });
      const webview = createMockWebview();
      const requestData = baseRequestData({
        scripts: { preRequest: 'mod', postResponse: '' },
      });
      const config: any = { url: 'http://a.com', method: 'GET' };

      await runner.runPreRequestScripts(
        webview, 'panel-1', undefined,
        requestData, config, {}
      );

      expect(config.method).toBe('POST');
    });

    it('applies modifiedRequest.headers to both headers and config.headers', async () => {
      const scriptEngine = createMockScriptEngine();
      scriptEngine.executePreRequestScript.mockResolvedValue({
        success: true,
        logs: [],
        tests: [],
        variablesToSet: [],
        modifiedRequest: { headers: { 'X-Custom': 'value' } },
      });

      const { runner } = createRunner({ scriptEngine });
      const webview = createMockWebview();
      const requestData = baseRequestData({
        scripts: { preRequest: 'mod', postResponse: '' },
      });
      const config: any = { url: 'http://a.com', method: 'GET' };
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      await runner.runPreRequestScripts(
        webview, 'panel-1', undefined,
        requestData, config, headers
      );

      expect(headers['X-Custom']).toBe('value');
      expect(config.headers).toBe(headers);
    });

    it('applies modifiedRequest.body to config.data', async () => {
      const scriptEngine = createMockScriptEngine();
      scriptEngine.executePreRequestScript.mockResolvedValue({
        success: true,
        logs: [],
        tests: [],
        variablesToSet: [],
        modifiedRequest: { body: '{"modified":true}' },
      });

      const { runner } = createRunner({ scriptEngine });
      const webview = createMockWebview();
      const requestData = baseRequestData({
        scripts: { preRequest: 'mod', postResponse: '' },
      });
      const config: any = { url: 'http://a.com', method: 'POST', data: '{"original":true}' };

      await runner.runPreRequestScripts(
        webview, 'panel-1', undefined,
        requestData, config, {}
      );

      expect(config.data).toBe('{"modified":true}');
    });

    it('does not modify body when modifiedRequest.body is undefined', async () => {
      const scriptEngine = createMockScriptEngine();
      scriptEngine.executePreRequestScript.mockResolvedValue({
        success: true,
        logs: [],
        tests: [],
        variablesToSet: [],
        modifiedRequest: { body: undefined },
      });

      const { runner } = createRunner({ scriptEngine });
      const webview = createMockWebview();
      const requestData = baseRequestData({
        scripts: { preRequest: 'mod', postResponse: '' },
      });
      const config: any = { url: 'http://a.com', method: 'POST', data: 'original' };

      await runner.runPreRequestScripts(
        webview, 'panel-1', undefined,
        requestData, config, {}
      );

      expect(config.data).toBe('original');
    });

    it('posts setVariables message when variablesToSet is non-empty', async () => {
      const scriptEngine = createMockScriptEngine();
      const variablesToSet = [
        { key: 'token', value: 'abc', scope: 'environment' as const },
        { key: 'gVar', value: 'xyz', scope: 'global' as const },
      ];
      scriptEngine.executePreRequestScript.mockResolvedValue({
        success: true,
        logs: [],
        tests: [],
        variablesToSet,
        modifiedRequest: null,
      });

      const { runner } = createRunner({ scriptEngine });
      const webview = createMockWebview();
      const requestData = baseRequestData({
        scripts: { preRequest: 'setVars', postResponse: '' },
      });

      await runner.runPreRequestScripts(
        webview, 'panel-1', undefined,
        requestData, { url: 'http://a.com', method: 'GET' }, {}
      );

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'setVariables',
        data: variablesToSet,
      });
    });

    it('does not post setVariables when variablesToSet is empty', async () => {
      const scriptEngine = createMockScriptEngine();
      scriptEngine.executePreRequestScript.mockResolvedValue({
        success: true,
        logs: [],
        tests: [],
        variablesToSet: [],
        modifiedRequest: null,
      });

      const { runner } = createRunner({ scriptEngine });
      const webview = createMockWebview();
      const requestData = baseRequestData({
        scripts: { preRequest: 'noVars', postResponse: '' },
      });

      await runner.runPreRequestScripts(
        webview, 'panel-1', undefined,
        requestData, { url: 'http://a.com', method: 'GET' }, {}
      );

      expect(webview.postMessage).toHaveBeenCalledTimes(1);
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'scriptOutput' })
      );
    });

    it('stops executing scripts when a script fails (success: false)', async () => {
      const scriptEngine = createMockScriptEngine();
      scriptEngine.executePreRequestScript
        .mockResolvedValueOnce({
          success: false,
          logs: [],
          tests: [],
          variablesToSet: [],
          modifiedRequest: null,
        })
        .mockResolvedValueOnce({
          success: true,
          logs: [],
          tests: [],
          variablesToSet: [],
          modifiedRequest: null,
        });

      const collection = { id: 'col-1', name: 'API', items: [] };
      mockResolveScriptsForRequest.mockReturnValue({
        preRequestScripts: [
          { source: 'script1', level: 'collection' },
        ],
        postResponseScripts: [],
      });

      const { runner } = createRunner({ scriptEngine, collections: [collection] });
      const webview = createMockWebview();
      const panelInfo = basePanelInfo({ collectionId: 'col-1', requestId: 'req-1' });
      const requestData = baseRequestData({
        scripts: { preRequest: 'script2', postResponse: '' },
      });

      await runner.runPreRequestScripts(
        webview, 'panel-1', panelInfo,
        requestData, { url: 'http://a.com', method: 'GET' }, {}
      );

      expect(scriptEngine.executePreRequestScript).toHaveBeenCalledTimes(1);
    });

    it('executes multiple scripts in order and passes updated envData', async () => {
      const scriptEngine = createMockScriptEngine();
      scriptEngine.executePreRequestScript
        .mockResolvedValueOnce({
          success: true,
          logs: [],
          tests: [],
          variablesToSet: [{ key: 'token', value: 'set-by-script1', scope: 'environment' }],
          modifiedRequest: null,
        })
        .mockResolvedValueOnce({
          success: true,
          logs: [],
          tests: [],
          variablesToSet: [],
          modifiedRequest: null,
        });

      const collection = { id: 'col-1', name: 'API', items: [] };
      mockResolveScriptsForRequest.mockReturnValue({
        preRequestScripts: [{ source: 'col-script', level: 'collection' }],
        postResponseScripts: [],
      });

      const { runner } = createRunner({ scriptEngine, collections: [collection] });
      const webview = createMockWebview();
      const panelInfo = basePanelInfo({ collectionId: 'col-1', requestId: 'req-1' });
      const requestData = baseRequestData({
        scripts: { preRequest: 'req-script', postResponse: '' },
      });

      await runner.runPreRequestScripts(
        webview, 'panel-1', panelInfo,
        requestData, { url: 'http://a.com', method: 'GET' }, {}
      );

      expect(scriptEngine.executePreRequestScript).toHaveBeenCalledTimes(2);

      const secondCallEnvData = scriptEngine.executePreRequestScript.mock.calls[1][2];
      expect(secondCallEnvData.variables.token).toBe('set-by-script1');
    });

    it('applies global variables to envData.globals', async () => {
      const scriptEngine = createMockScriptEngine();
      scriptEngine.executePreRequestScript
        .mockResolvedValueOnce({
          success: true,
          logs: [],
          tests: [],
          variablesToSet: [{ key: 'gKey', value: 'gVal', scope: 'global' }],
          modifiedRequest: null,
        })
        .mockResolvedValueOnce({
          success: true,
          logs: [],
          tests: [],
          variablesToSet: [],
          modifiedRequest: null,
        });

      const collection = { id: 'col-1', name: 'API', items: [] };
      mockResolveScriptsForRequest.mockReturnValue({
        preRequestScripts: [{ source: 'col-script', level: 'collection' }],
        postResponseScripts: [],
      });

      const { runner } = createRunner({ scriptEngine, collections: [collection] });
      const webview = createMockWebview();
      const panelInfo = basePanelInfo({ collectionId: 'col-1', requestId: 'req-1' });
      const requestData = baseRequestData({
        scripts: { preRequest: 'req-script', postResponse: '' },
      });

      await runner.runPreRequestScripts(
        webview, 'panel-1', panelInfo,
        requestData, { url: 'http://a.com', method: 'GET' }, {}
      );

      const secondCallEnvData = scriptEngine.executePreRequestScript.mock.calls[1][2];
      expect(secondCallEnvData.globals.gKey).toBe('gVal');
    });

    it('does not post messages when webview dies mid-execution', async () => {
      const isWebviewAlive = jest.fn()
        .mockReturnValueOnce(true)   // initial check
        .mockReturnValueOnce(false)  // before postMessage (scriptOutput)
        .mockReturnValue(false);

      const scriptEngine = createMockScriptEngine();
      scriptEngine.executePreRequestScript.mockResolvedValue({
        success: true,
        logs: [],
        tests: [],
        variablesToSet: [{ key: 'a', value: 'b', scope: 'environment' as const }],
        modifiedRequest: null,
      });

      const { runner } = createRunner({ scriptEngine, isWebviewAlive });
      const webview = createMockWebview();
      const requestData = baseRequestData({
        scripts: { preRequest: 'script', postResponse: '' },
      });

      await runner.runPreRequestScripts(
        webview, 'panel-1', undefined,
        requestData, { url: 'http://a.com', method: 'GET' }, {}
      );

      expect(webview.postMessage).not.toHaveBeenCalled();
    });

    it('passes correct requestContext and info to script engine', async () => {
      const scriptEngine = createMockScriptEngine();
      const { runner } = createRunner({ scriptEngine });
      const webview = createMockWebview();
      const requestData = baseRequestData({
        name: 'My Request',
        scripts: { preRequest: 'script', postResponse: '' },
      });
      const config: any = { url: 'http://example.com', method: 'POST', data: '{"a":1}' };
      const headers = { 'Content-Type': 'application/json' };

      await runner.runPreRequestScripts(
        webview, 'panel-1', undefined,
        requestData, config, headers
      );

      expect(scriptEngine.executePreRequestScript).toHaveBeenCalledWith(
        'script',
        {
          url: 'http://example.com',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{"a":1}',
        },
        expect.any(Object),
        {
          requestName: 'My Request',
          currentIteration: 0,
          totalIterations: 1,
        }
      );
    });

    it('uses "Untitled" when requestData.name is undefined', async () => {
      const scriptEngine = createMockScriptEngine();
      const { runner } = createRunner({ scriptEngine });
      const webview = createMockWebview();
      const requestData = baseRequestData({
        name: undefined,
        scripts: { preRequest: 'script', postResponse: '' },
      });

      await runner.runPreRequestScripts(
        webview, 'panel-1', undefined,
        requestData, { url: 'http://a.com', method: 'GET' }, {}
      );

      const info = scriptEngine.executePreRequestScript.mock.calls[0][3];
      expect(info.requestName).toBe('Untitled');
    });
  });

  // =====================================================
  // runPostResponseScripts
  // =====================================================
  describe('runPostResponseScripts', () => {
    const baseResult = {
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      data: '{"ok":true}',
    };

    it('does nothing when there are no scripts', async () => {
      const { runner, scriptEngine } = createRunner();
      const webview = createMockWebview();

      await runner.runPostResponseScripts(
        webview, 'panel-1', undefined,
        baseRequestData(),
        { url: 'http://a.com', method: 'GET' },
        baseResult, 150
      );

      expect(scriptEngine.executePostResponseScript).not.toHaveBeenCalled();
    });

    it('does nothing when webview is not alive', async () => {
      const isWebviewAlive = jest.fn().mockReturnValue(false);
      const { runner, scriptEngine } = createRunner({ isWebviewAlive });
      const webview = createMockWebview();
      const requestData = baseRequestData({
        scripts: { preRequest: '', postResponse: 'console.log("post")' },
      });

      await runner.runPostResponseScripts(
        webview, 'panel-1', undefined,
        requestData,
        { url: 'http://a.com', method: 'GET' },
        baseResult, 150
      );

      expect(scriptEngine.executePostResponseScript).not.toHaveBeenCalled();
    });

    it('executes script and posts scriptOutput message', async () => {
      const scriptEngine = createMockScriptEngine();
      const postResult = {
        success: true,
        logs: [{ level: 'log', message: 'done' }],
        tests: [],
        variablesToSet: [],
      };
      scriptEngine.executePostResponseScript.mockResolvedValue(postResult);

      const { runner } = createRunner({ scriptEngine });
      const webview = createMockWebview();
      const requestData = baseRequestData({
        scripts: { preRequest: '', postResponse: 'console.log("done")' },
      });

      await runner.runPostResponseScripts(
        webview, 'panel-1', undefined,
        requestData,
        { url: 'http://a.com', method: 'GET' },
        baseResult, 200
      );

      expect(scriptEngine.executePostResponseScript).toHaveBeenCalledTimes(1);
      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'scriptOutput',
        data: { phase: 'postResponse', result: postResult },
      });
    });

    it('passes correct request, response, and info to script engine', async () => {
      const scriptEngine = createMockScriptEngine();
      const { runner } = createRunner({ scriptEngine });
      const webview = createMockWebview();
      const requestData = baseRequestData({
        name: 'Post Test',
        scripts: { preRequest: '', postResponse: 'test' },
      });
      const config: any = { url: 'http://api.com', method: 'POST', headers: { 'X-Key': 'val' }, data: 'body' };

      await runner.runPostResponseScripts(
        webview, 'panel-1', undefined,
        requestData, config, baseResult, 300
      );

      expect(scriptEngine.executePostResponseScript).toHaveBeenCalledWith(
        'test',
        {
          url: 'http://api.com',
          method: 'POST',
          headers: { 'X-Key': 'val' },
          body: 'body',
        },
        {
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
          body: '{"ok":true}',
          duration: 300,
        },
        expect.any(Object),
        {
          requestName: 'Post Test',
          currentIteration: 0,
          totalIterations: 1,
        }
      );
    });

    it('uses empty object for headers when config.headers is undefined', async () => {
      const scriptEngine = createMockScriptEngine();
      const { runner } = createRunner({ scriptEngine });
      const webview = createMockWebview();
      const requestData = baseRequestData({
        scripts: { preRequest: '', postResponse: 'test' },
      });
      const config: any = { url: 'http://a.com', method: 'GET', data: undefined };

      await runner.runPostResponseScripts(
        webview, 'panel-1', undefined,
        requestData, config, baseResult, 100
      );

      const requestCtx = scriptEngine.executePostResponseScript.mock.calls[0][1];
      expect(requestCtx.headers).toEqual({});
    });

    it('posts setVariables message when variablesToSet is non-empty', async () => {
      const scriptEngine = createMockScriptEngine();
      const variablesToSet = [{ key: 'token', value: 'resp-token', scope: 'environment' as const }];
      scriptEngine.executePostResponseScript.mockResolvedValue({
        success: true,
        logs: [],
        tests: [],
        variablesToSet,
      });

      const { runner } = createRunner({ scriptEngine });
      const webview = createMockWebview();
      const requestData = baseRequestData({
        scripts: { preRequest: '', postResponse: 'setVars' },
      });

      await runner.runPostResponseScripts(
        webview, 'panel-1', undefined,
        requestData,
        { url: 'http://a.com', method: 'GET' },
        baseResult, 100
      );

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'setVariables',
        data: variablesToSet,
      });
    });

    it('does not post setVariables when variablesToSet is empty', async () => {
      const scriptEngine = createMockScriptEngine();
      scriptEngine.executePostResponseScript.mockResolvedValue({
        success: true,
        logs: [],
        tests: [],
        variablesToSet: [],
      });

      const { runner } = createRunner({ scriptEngine });
      const webview = createMockWebview();
      const requestData = baseRequestData({
        scripts: { preRequest: '', postResponse: 'noVars' },
      });

      await runner.runPostResponseScripts(
        webview, 'panel-1', undefined,
        requestData,
        { url: 'http://a.com', method: 'GET' },
        baseResult, 100
      );

      expect(webview.postMessage).toHaveBeenCalledTimes(1);
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'scriptOutput' })
      );
    });

    it('stops executing scripts when a script fails', async () => {
      const scriptEngine = createMockScriptEngine();
      scriptEngine.executePostResponseScript
        .mockResolvedValueOnce({
          success: false,
          logs: [],
          tests: [],
          variablesToSet: [],
        })
        .mockResolvedValueOnce({
          success: true,
          logs: [],
          tests: [],
          variablesToSet: [],
        });

      const collection = { id: 'col-1', name: 'API', items: [] };
      mockResolveScriptsForRequest.mockReturnValue({
        preRequestScripts: [],
        postResponseScripts: [{ source: 'col-post', level: 'collection' }],
      });

      const { runner } = createRunner({ scriptEngine, collections: [collection] });
      const webview = createMockWebview();
      const panelInfo = basePanelInfo({ collectionId: 'col-1', requestId: 'req-1' });
      const requestData = baseRequestData({
        scripts: { preRequest: '', postResponse: 'req-post' },
      });

      await runner.runPostResponseScripts(
        webview, 'panel-1', panelInfo,
        requestData,
        { url: 'http://a.com', method: 'GET' },
        baseResult, 100
      );

      expect(scriptEngine.executePostResponseScript).toHaveBeenCalledTimes(1);
    });

    it('passes updated envData to subsequent scripts after variablesToSet', async () => {
      const scriptEngine = createMockScriptEngine();
      scriptEngine.executePostResponseScript
        .mockResolvedValueOnce({
          success: true,
          logs: [],
          tests: [],
          variablesToSet: [
            { key: 'envVar', value: 'fromScript1', scope: 'environment' },
            { key: 'globVar', value: 'globalFromScript1', scope: 'global' },
          ],
        })
        .mockResolvedValueOnce({
          success: true,
          logs: [],
          tests: [],
          variablesToSet: [],
        });

      const collection = { id: 'col-1', name: 'API', items: [] };
      mockResolveScriptsForRequest.mockReturnValue({
        preRequestScripts: [],
        postResponseScripts: [{ source: 'col-post', level: 'collection' }],
      });

      const { runner } = createRunner({ scriptEngine, collections: [collection] });
      const webview = createMockWebview();
      const panelInfo = basePanelInfo({ collectionId: 'col-1', requestId: 'req-1' });
      const requestData = baseRequestData({
        scripts: { preRequest: '', postResponse: 'req-post' },
      });

      await runner.runPostResponseScripts(
        webview, 'panel-1', panelInfo,
        requestData,
        { url: 'http://a.com', method: 'GET' },
        baseResult, 100
      );

      expect(scriptEngine.executePostResponseScript).toHaveBeenCalledTimes(2);

      const secondCallEnvData = scriptEngine.executePostResponseScript.mock.calls[1][3];
      expect(secondCallEnvData.variables.envVar).toBe('fromScript1');
      expect(secondCallEnvData.globals.globVar).toBe('globalFromScript1');
    });

    it('does not post messages when webview dies mid-execution', async () => {
      const isWebviewAlive = jest.fn()
        .mockReturnValueOnce(true)   // initial check
        .mockReturnValueOnce(false)  // before scriptOutput postMessage
        .mockReturnValue(false);

      const scriptEngine = createMockScriptEngine();
      scriptEngine.executePostResponseScript.mockResolvedValue({
        success: true,
        logs: [],
        tests: [],
        variablesToSet: [{ key: 'a', value: 'b', scope: 'environment' as const }],
      });

      const { runner } = createRunner({ scriptEngine, isWebviewAlive });
      const webview = createMockWebview();
      const requestData = baseRequestData({
        scripts: { preRequest: '', postResponse: 'script' },
      });

      await runner.runPostResponseScripts(
        webview, 'panel-1', undefined,
        requestData,
        { url: 'http://a.com', method: 'GET' },
        baseResult, 100
      );

      expect(webview.postMessage).not.toHaveBeenCalled();
    });

    it('uses "Untitled" when requestData.name is undefined', async () => {
      const scriptEngine = createMockScriptEngine();
      const { runner } = createRunner({ scriptEngine });
      const webview = createMockWebview();
      const requestData = baseRequestData({
        name: undefined,
        scripts: { preRequest: '', postResponse: 'test' },
      });

      await runner.runPostResponseScripts(
        webview, 'panel-1', undefined,
        requestData,
        { url: 'http://a.com', method: 'GET' },
        baseResult, 100
      );

      const info = scriptEngine.executePostResponseScript.mock.calls[0][4];
      expect(info.requestName).toBe('Untitled');
    });

    it('includes inherited scripts from collection', async () => {
      const scriptEngine = createMockScriptEngine();
      const collection = { id: 'col-1', name: 'API', items: [] };
      mockResolveScriptsForRequest.mockReturnValue({
        preRequestScripts: [],
        postResponseScripts: [
          { source: 'col-post-1', level: 'collection' },
          { source: 'col-post-2', level: 'folder' },
        ],
      });

      const { runner } = createRunner({ scriptEngine, collections: [collection] });
      const webview = createMockWebview();
      const panelInfo = basePanelInfo({ collectionId: 'col-1', requestId: 'req-1' });
      const requestData = baseRequestData({
        scripts: { preRequest: '', postResponse: 'req-post' },
      });

      await runner.runPostResponseScripts(
        webview, 'panel-1', panelInfo,
        requestData,
        { url: 'http://a.com', method: 'GET' },
        baseResult, 100
      );

      // 2 inherited + 1 request-level = 3
      expect(scriptEngine.executePostResponseScript).toHaveBeenCalledTimes(3);
      expect(scriptEngine.executePostResponseScript.mock.calls[0][0]).toBe('col-post-1');
      expect(scriptEngine.executePostResponseScript.mock.calls[1][0]).toBe('col-post-2');
      expect(scriptEngine.executePostResponseScript.mock.calls[2][0]).toBe('req-post');
    });
  });
});
