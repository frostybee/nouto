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
import { openApiSession, loadDocument, resetSession } from './session.svelte';

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
    resetSession();
    posted = [];
    postSpy = vi.spyOn(window, 'postMessage').mockImplementation(((message: any) => {
      posted.push(message);
    }) as any);
  });

  afterEach(() => {
    postSpy.mockRestore();
  });

  const ofType = (type: string) => posted.filter((m) => m && m.type === type);

  it('answers openApiPreviewReady with a full preview payload', () => {
    loadDocument('/tmp/api.yaml', VALID_YAML, 'yaml');
    const adapter = createPreviewAdapter();
    adapter.postMessage({ type: 'openApiPreviewReady' });

    const payloads = ofType('openApiPreviewData');
    expect(payloads).toHaveLength(1);
    const data = payloads[0].data;
    expect(data.documentUri).toBe('/tmp/api.yaml');
    expect(data.documentVersion).toBe(openApiSession.contentRevision);
    expect(data.stale).toBe(false);
    expect(data.tryItEnabled).toBe(true);
    expect(data.version).toBe('3.1');
    expect(data.spec).toBeDefined();
    expect(data.spec.openapi).toBe('3.1.0');
  });

  it('omits the spec while the document is stale', () => {
    loadDocument('/tmp/broken.yaml', 'openapi: 3.1.0\n  broken:\nindent', 'yaml');
    const adapter = createPreviewAdapter();
    adapter.pushPreviewData();

    const data = ofType('openApiPreviewData')[0].data;
    expect(data.stale).toBe(true);
    expect(data.spec).toBeUndefined();
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

  it('wraps Try It in action started/succeeded messages', () => {
    tryItMocks.tryOperation.mockReturnValue({ ok: true, message: 'Opened "Get pets".' });
    const adapter = createPreviewAdapter();

    adapter.postMessage({ type: 'openApiTryOperation', data: { path: '/pets', method: 'get' } });

    expect(tryItMocks.tryOperation).toHaveBeenCalledWith('/pets', 'get');
    expect(ofType('openApiActionStarted')[0].data).toEqual({ action: 'tryOperation' });
    expect(ofType('openApiActionSucceeded')[0].data).toEqual({ action: 'tryOperation', message: 'Opened "Get pets".' });
    expect(ofType('openApiActionFailed')).toHaveLength(0);
  });

  it('reports a failed Try It via openApiActionFailed', () => {
    tryItMocks.tryOperation.mockReturnValue({ ok: false, message: 'path "/x" not found' });
    const adapter = createPreviewAdapter();

    adapter.postMessage({ type: 'openApiTryOperation', data: { path: '/x', method: 'get' } });

    expect(ofType('openApiActionFailed')[0].data).toEqual({ action: 'tryOperation', message: 'path "/x" not found' });
  });

  it('routes Generate Collection through the shared import pipeline', () => {
    loadDocument('/tmp/api.yaml', VALID_YAML, 'yaml');
    importExportMocks.generateCollectionFromOpenApi.mockReturnValue({ ok: true, message: 'Generated collection "T".' });
    const adapter = createPreviewAdapter();

    adapter.postMessage({ type: 'openApiGenerateCollection' });

    expect(importExportMocks.generateCollectionFromOpenApi).toHaveBeenCalledWith(VALID_YAML, 'yaml');
    expect(ofType('openApiActionSucceeded')[0].data.action).toBe('generateCollection');
  });

  it('fails Generate Collection when no document is open', () => {
    const adapter = createPreviewAdapter();
    adapter.postMessage({ type: 'openApiGenerateCollection' });

    expect(importExportMocks.generateCollectionFromOpenApi).not.toHaveBeenCalled();
    expect(ofType('openApiActionFailed')[0].data.message).toMatch(/No OpenAPI document/);
  });

  it('keeps adapter state in memory for getState/setState', () => {
    const adapter = createPreviewAdapter();
    expect(adapter.getState()).toEqual({});
    adapter.setState({ renderer: 'rapidoc' });
    expect(adapter.getState()).toEqual({ renderer: 'rapidoc' });
  });
});
