import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const tauriMocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => tauriMocks);

const tryItMocks = vi.hoisted(() => ({
  tryOperation: vi.fn(),
  initTryIt: vi.fn(),
}));
vi.mock('./tryIt', () => tryItMocks);

const importExportMocks = vi.hoisted(() => ({
  generateCollectionFromOpenApi: vi.fn(),
}));
vi.mock('../import-export.svelte', () => importExportMocks);

import { createPreviewAdapter } from './previewAdapter.svelte';
import { openApiSession, openSession, resetAllSessions } from './session.svelte';

const VALID_YAML = `openapi: 3.1.0\ninfo:\n  title: T\n  version: 1.0.0\npaths: {}\n`;

type Posted = { type: string; data?: any };

describe('previewAdapter', () => {
  let posted: Posted[];
  let postSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tauriMocks.invoke.mockReset();
    tauriMocks.invoke.mockResolvedValue([]);
    tryItMocks.tryOperation.mockReset();
    importExportMocks.generateCollectionFromOpenApi.mockReset();
    resetAllSessions();
    posted = [];
    postSpy = vi.spyOn(window, 'postMessage').mockImplementation(((message: any) => {
      posted.push(message);
    }) as any);
  });

  afterEach(() => {
    postSpy.mockRestore();
  });

  const ofType = (type: string) => posted.filter((m) => m && m.type === type);

  it('answers openApiPreviewReady with a full preview payload', async () => {
    openSession('/tmp/api.yaml', VALID_YAML, 'yaml');
    const adapter = createPreviewAdapter();
    adapter.postMessage({ type: 'openApiPreviewReady' });

    await vi.waitFor(() => expect(ofType('openApiPreviewData')).toHaveLength(1));
    const data = ofType('openApiPreviewData')[0].data;
    expect(data.documentUri).toBe('/tmp/api.yaml');
    expect(data.documentVersion).toBe(openApiSession.contentRevision);
    expect(data.stale).toBe(false);
    expect(data.tryItEnabled).toBe(true);
    expect(data.version).toBe('3.1');
    expect(data.spec).toBeDefined();
    expect(data.spec.openapi).toBe('3.1.0');
    expect(data.externalRefsIncomplete).toBeUndefined();
  });

  it('omits the spec while the document is stale', async () => {
    openSession('/tmp/broken.yaml', 'openapi: 3.1.0\n  broken:\nindent', 'yaml');
    const adapter = createPreviewAdapter();
    adapter.pushPreviewData();

    await vi.waitFor(() => expect(ofType('openApiPreviewData')).toHaveLength(1));
    const data = ofType('openApiPreviewData')[0].data;
    expect(data.stale).toBe(true);
    expect(data.spec).toBeUndefined();
  });

  it('bundles external refs and flags an incomplete bundle in the payload', async () => {
    const EXT_YAML = [
      'openapi: 3.1.0',
      'info:',
      '  title: T',
      '  version: 1.0.0',
      'paths: {}',
      'components:',
      '  schemas:',
      '    Pet:',
      '      $ref: ./common.yaml#/components/schemas/Pet',
      '',
    ].join('\n');
    // The referenced file is missing → the external pass reports it and the
    // bundle is partial.
    tauriMocks.invoke.mockImplementation(async (command: string) => {
      if (command === 'validate_openapi_schema') return [];
      throw new Error('missing');
    });
    openSession('C:\\specs\\api.yaml', EXT_YAML, 'yaml');
    const adapter = createPreviewAdapter();
    adapter.pushPreviewData();

    await vi.waitFor(() => expect(ofType('openApiPreviewData')).toHaveLength(1));
    const data = ofType('openApiPreviewData')[0].data;
    expect(data.externalRefsIncomplete).toBe(true);
    expect(data.spec).toBeDefined();
  });

  it('bridges openApiProxyRequest to the openapi_proxy_fetch invoke', async () => {
    const response = { status: 200, statusText: 'OK', headers: {}, body: '{}', bodyEncoding: 'utf8', url: 'http://x/' };
    tauriMocks.invoke.mockResolvedValue(response);
    const adapter = createPreviewAdapter();
    const request = { method: 'GET', url: 'http://x/', headers: {} };

    adapter.postMessage({ type: 'openApiProxyRequest', data: { requestId: 'p1', request } });
    expect(tauriMocks.invoke).toHaveBeenCalledWith('openapi_proxy_fetch', { request });

    await vi.waitFor(() => expect(ofType('openApiProxyResponse')).toHaveLength(1));
    expect(ofType('openApiProxyResponse')[0].data).toEqual({ requestId: 'p1', response });
  });

  it('relays proxy failures as error responses', async () => {
    tauriMocks.invoke.mockRejectedValue(new Error('connection refused'));
    const adapter = createPreviewAdapter();

    adapter.postMessage({ type: 'openApiProxyRequest', data: { requestId: 'p1', request: { method: 'GET', url: 'http://x/', headers: {} } } });

    await vi.waitFor(() => expect(ofType('openApiProxyResponse')).toHaveLength(1));
    expect(ofType('openApiProxyResponse')[0].data).toEqual({ requestId: 'p1', error: 'connection refused' });
  });

  it('drops a late proxy result after openApiProxyCancel', async () => {
    let resolveInvoke!: (value: unknown) => void;
    tauriMocks.invoke.mockImplementation(() => new Promise((resolve) => { resolveInvoke = resolve; }));
    const adapter = createPreviewAdapter();

    adapter.postMessage({ type: 'openApiProxyRequest', data: { requestId: 'p1', request: { method: 'GET', url: 'http://x/', headers: {} } } });
    adapter.postMessage({ type: 'openApiProxyCancel', data: { requestId: 'p1' } });
    resolveInvoke({ status: 200 });
    await Promise.resolve();
    await Promise.resolve();

    expect(ofType('openApiProxyResponse')).toHaveLength(0);
  });

  it('wraps Try It in action started/succeeded messages', async () => {
    tryItMocks.tryOperation.mockReturnValue({ ok: true, message: 'Opened "Get pets".' });
    const adapter = createPreviewAdapter();

    adapter.postMessage({ type: 'openApiTryOperation', data: { path: '/pets', method: 'get' } });

    expect(tryItMocks.tryOperation).toHaveBeenCalledWith('/pets', 'get');
    expect(ofType('openApiActionStarted')[0].data).toEqual({ action: 'tryOperation' });
    await vi.waitFor(() => expect(ofType('openApiActionSucceeded')).toHaveLength(1));
    expect(ofType('openApiActionSucceeded')[0].data).toEqual({ action: 'tryOperation', message: 'Opened "Get pets".' });
    expect(ofType('openApiActionFailed')).toHaveLength(0);
  });

  it('reports a failed Try It via openApiActionFailed', async () => {
    tryItMocks.tryOperation.mockReturnValue({ ok: false, message: 'path "/x" not found' });
    const adapter = createPreviewAdapter();

    adapter.postMessage({ type: 'openApiTryOperation', data: { path: '/x', method: 'get' } });

    await vi.waitFor(() => expect(ofType('openApiActionFailed')).toHaveLength(1));
    expect(ofType('openApiActionFailed')[0].data).toEqual({ action: 'tryOperation', message: 'path "/x" not found' });
  });

  it('routes Generate Collection through the shared import pipeline', async () => {
    const id = openSession('/tmp/api.yaml', VALID_YAML, 'yaml');
    importExportMocks.generateCollectionFromOpenApi.mockReturnValue({ ok: true, message: 'Generated collection "T".' });
    const adapter = createPreviewAdapter();

    adapter.postMessage({ type: 'openApiGenerateCollection' });

    expect(importExportMocks.generateCollectionFromOpenApi).toHaveBeenCalledWith(id);
    await vi.waitFor(() => expect(ofType('openApiActionSucceeded')).toHaveLength(1));
    expect(ofType('openApiActionSucceeded')[0].data.action).toBe('generateCollection');
  });

  it('fails Generate Collection when no document is open', async () => {
    const adapter = createPreviewAdapter();
    adapter.postMessage({ type: 'openApiGenerateCollection' });

    expect(importExportMocks.generateCollectionFromOpenApi).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(ofType('openApiActionFailed')).toHaveLength(1));
    expect(ofType('openApiActionFailed')[0].data.message).toMatch(/No OpenAPI document/);
  });

  it('keeps adapter state in memory for getState/setState', () => {
    const adapter = createPreviewAdapter();
    expect(adapter.getState()).toEqual({});
    adapter.setState({ renderer: 'rapidoc' });
    expect(adapter.getState()).toEqual({ renderer: 'rapidoc' });
  });
});
