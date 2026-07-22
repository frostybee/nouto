import * as vscode from 'vscode';
import { OpenApiPreviewPanelManager } from './OpenApiPreviewPanelManager';
import { createFakeTextDocument } from '../test/helpers/fakeTextDocument';
import { clearOpenApiDocumentState } from '../services/openapi';

// Keep the real core services (detectOpenApiVersion drives buildPayload) but
// stub executeRequest so the Try-It proxy never touches the network.
const mockExecuteRequest = jest.fn();
jest.mock('@nouto/core/services', () => {
  const actual = jest.requireActual('@nouto/core/services');
  return { ...actual, executeRequest: (...args: unknown[]) => mockExecuteRequest(...args) };
});

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const mocked = vscode as unknown as {
  __createFakeWebviewPanel: (viewType?: string) => any;
  __fireDidChangeActiveTextEditor: (editor: any) => void;
};

const SPEC = `openapi: 3.1.0
info:
  title: Preview
  version: 1.0.0
paths: {}
`;

const extensionUri = vscode.Uri.file('/ext');

function makeDocument(content = SPEC, path = '/preview.yaml', version = 1) {
  return createFakeTextDocument({ content, languageId: 'yaml', path, version });
}

/** Registers the document as open so the manager can resolve it by URI. */
function setOpenDocuments(...documents: vscode.TextDocument[]): void {
  (vscode.workspace as unknown as { textDocuments: vscode.TextDocument[] }).textDocuments =
    documents;
}

function lastPayload(panel: any) {
  return panel.posted[panel.posted.length - 1]?.data;
}

describe('OpenApiPreviewPanelManager', () => {
  let panels: any[] = [];
  let manager: OpenApiPreviewPanelManager;
  let actions: { tryOperation: jest.Mock; generateCollection: jest.Mock };

  beforeEach(() => {
    jest.useFakeTimers();
    panels = [];
    (vscode.window.createWebviewPanel as jest.Mock).mockImplementation(() => {
      const panel = mocked.__createFakeWebviewPanel();
      panels.push(panel);
      return panel;
    });
    actions = {
      tryOperation: jest.fn().mockResolvedValue({ ok: true, message: 'opened', warnings: [] }),
      generateCollection: jest.fn().mockResolvedValue({ ok: true, message: 'created', warnings: [] }),
    };
    manager = new OpenApiPreviewPanelManager(extensionUri, actions as never);
    manager.start();
  });

  afterEach(() => {
    manager.dispose();
    setOpenDocuments();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('creates one panel per URI and reveals an existing one on reopen', () => {
    const document = makeDocument();
    setOpenDocuments(document);

    manager.openPreview(document);
    manager.openPreview(document);

    expect(panels).toHaveLength(1);
    expect(panels[0].reveal).toHaveBeenCalledWith(vscode.ViewColumn.Beside);
    clearOpenApiDocumentState(document.uri);
  });

  it('opens independent panels for different documents', () => {
    const first = makeDocument(SPEC, '/a.yaml');
    const second = makeDocument(SPEC, '/b.yaml');
    setOpenDocuments(first, second);

    manager.openPreview(first);
    manager.openPreview(second);

    expect(panels).toHaveLength(2);
    clearOpenApiDocumentState(first.uri);
    clearOpenApiDocumentState(second.uri);
  });

  it('sends the parsed spec only after the ready handshake', () => {
    const document = makeDocument();
    setOpenDocuments(document);
    manager.openPreview(document);

    expect(panels[0].posted).toHaveLength(0);

    panels[0].__receive({ type: 'openApiPreviewReady' });

    expect(panels[0].posted).toHaveLength(1);
    const payload = lastPayload(panels[0]);
    expect(payload.stale).toBe(false);
    expect(payload.version).toBe('3.1');
    expect((payload.spec as { info: { title: string } }).info.title).toBe('Preview');
    clearOpenApiDocumentState(document.uri);
  });

  it('debounces document changes and skips versions already delivered', () => {
    const document = makeDocument();
    setOpenDocuments(document);
    manager.openPreview(document);
    panels[0].__receive({ type: 'openApiPreviewReady' });
    expect(panels[0].posted).toHaveLength(1);

    // Three rapid changes on the same version coalesce into one push attempt,
    // which is then skipped because the version was already sent.
    for (let i = 0; i < 3; i++) {
      (vscode as any).__fireDidChangeTextDocument(document);
    }
    jest.advanceTimersByTime(400);
    expect(panels[0].posted).toHaveLength(1);

    const updated = makeDocument(SPEC.replace('Preview', 'Renamed'), '/preview.yaml', 2);
    setOpenDocuments(updated);
    (vscode as any).__fireDidChangeTextDocument(updated);
    jest.advanceTimersByTime(400);

    expect(panels[0].posted).toHaveLength(2);
    expect((lastPayload(panels[0]).spec as { info: { title: string } }).info.title)
      .toBe('Renamed');
    clearOpenApiDocumentState(document.uri);
  });

  it('marks payloads stale without a spec when the version field breaks', () => {
    const document = makeDocument(SPEC, '/stale.yaml');
    setOpenDocuments(document);
    manager.openPreview(document);
    panels[0].__receive({ type: 'openApiPreviewReady' });

    const broken = makeDocument(SPEC.replace('openapi: 3.1.0', 'openapi: nope'), '/stale.yaml', 2);
    setOpenDocuments(broken);
    (vscode as any).__fireDidChangeTextDocument(broken);
    jest.advanceTimersByTime(400);

    const payload = lastPayload(panels[0]);
    expect(payload.stale).toBe(true);
    expect(payload.spec).toBeUndefined();
    // The last known version rides along so the webview can keep its banner.
    expect(payload.version).toBe('3.1');
    clearOpenApiDocumentState(document.uri);
  });

  it('marks payloads stale when the document no longer parses', () => {
    const document = makeDocument(SPEC, '/broken.yaml');
    setOpenDocuments(document);
    manager.openPreview(document);
    panels[0].__receive({ type: 'openApiPreviewReady' });

    const broken = makeDocument('openapi: 3.1.0\n  : : :\n', '/broken.yaml', 2);
    setOpenDocuments(broken);
    (vscode as any).__fireDidChangeTextDocument(broken);
    jest.advanceTimersByTime(400);

    expect(lastPayload(panels[0]).stale).toBe(true);
    clearOpenApiDocumentState(document.uri);
  });

  it('resends on a repeated ready handshake after a webview reload', () => {
    const document = makeDocument(SPEC, '/reload.yaml');
    setOpenDocuments(document);
    manager.openPreview(document);

    panels[0].__receive({ type: 'openApiPreviewReady' });
    panels[0].__receive({ type: 'openApiPreviewReady' });

    expect(panels[0].posted).toHaveLength(2);
    clearOpenApiDocumentState(document.uri);
  });

  it('disposes the preview when the source document closes', () => {
    const document = makeDocument(SPEC, '/closing.yaml');
    setOpenDocuments(document);
    manager.openPreview(document);

    (vscode as any).__fireDidCloseTextDocument(document);

    expect(panels[0].dispose).toHaveBeenCalled();
    clearOpenApiDocumentState(document.uri);
  });

  it('restores a panel from serialized state', async () => {
    const document = makeDocument(SPEC, '/revived.yaml');
    setOpenDocuments(document);
    (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue(document);
    const panel = mocked.__createFakeWebviewPanel();

    await manager.revivePreview(panel, {
      sourceUri: document.uri.toString(),
      renderer: 'rapidoc',
      theme: 'dark',
    });

    panel.__receive({ type: 'openApiPreviewReady' });
    expect(lastPayload(panel).stale).toBe(false);
    expect(panel.disposed).toBe(false);
    clearOpenApiDocumentState(document.uri);
  });

  it('disposes a restored panel whose document cannot be reopened', async () => {
    (vscode.workspace.openTextDocument as jest.Mock).mockRejectedValue(new Error('gone'));
    const panel = mocked.__createFakeWebviewPanel();

    await manager.revivePreview(panel, { sourceUri: 'file:///missing.yaml' });

    expect(panel.disposed).toBe(true);
    expect(vscode.window.showErrorMessage).toHaveBeenCalled();
  });

  it('disposes a restored panel with no persisted source URI', async () => {
    const panel = mocked.__createFakeWebviewPanel();
    await manager.revivePreview(panel, {});
    expect(panel.disposed).toBe(true);
  });

  it('sets the context key from the active editor', () => {
    const document = makeDocument(SPEC, '/context.yaml');
    mocked.__fireDidChangeActiveTextEditor({ document });

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      'setContext',
      'nouto.openApiActive',
      true
    );

    const other = createFakeTextDocument({
      content: 'name: not a spec\n',
      languageId: 'yaml',
      path: '/other.yaml',
    });
    mocked.__fireDidChangeActiveTextEditor({ document: other });

    expect(vscode.commands.executeCommand).toHaveBeenLastCalledWith(
      'setContext',
      'nouto.openApiActive',
      false
    );
    clearOpenApiDocumentState(document.uri);
  });

  it('keeps the context key when focus moves to a webview (no active editor)', () => {
    const document = makeDocument(SPEC, '/webview-focus.yaml');
    mocked.__fireDidChangeActiveTextEditor({ document });

    expect(vscode.commands.executeCommand).toHaveBeenLastCalledWith(
      'setContext',
      'nouto.openApiActive',
      true
    );
    (vscode.commands.executeCommand as jest.Mock).mockClear();

    // Focusing a webview panel (e.g. the request panel opened by Try It)
    // fires the event with no editor; the key must not flip to false.
    mocked.__fireDidChangeActiveTextEditor(undefined);

    expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
      'setContext',
      'nouto.openApiActive',
      expect.anything()
    );
    clearOpenApiDocumentState(document.uri);
  });

  it('builds HTML with a blob frame-src and no network access', () => {
    const document = makeDocument(SPEC, '/csp.yaml');
    setOpenDocuments(document);
    manager.openPreview(document);

    const html = panels[0].webview.html;
    expect(html).toContain('frame-src blob:');
    expect(html).toContain("default-src 'none'");
    expect(html).not.toContain('connect-src');
    clearOpenApiDocumentState(document.uri);
  });

  describe('toolbar actions', () => {
    /** Opens a ready panel and clears the initial data push. */
    function readyPanel(path: string) {
      const document = makeDocument(SPEC, path);
      setOpenDocuments(document);
      manager.openPreview(document);
      panels[0].__receive({ type: 'openApiPreviewReady' });
      panels[0].posted.length = 0;
      return document;
    }

    function postedTypes(panel: any): string[] {
      return panel.posted.map((message: { type: string }) => message.type);
    }

    it('runs Try It against the panel’s own source URI, never one from the webview', async () => {
      const document = readyPanel('/try.yaml');

      panels[0].__receive({
        type: 'openApiTryOperation',
        data: { path: '/pets', method: 'get', uri: 'file:///attacker.yaml' },
      });
      await Promise.resolve();
      await Promise.resolve();

      expect(actions.tryOperation).toHaveBeenCalledWith({
        uri: document.uri,
        path: '/pets',
        method: 'get',
      });
      expect(postedTypes(panels[0])).toEqual(['openApiActionStarted', 'openApiActionSucceeded']);
      clearOpenApiDocumentState(document.uri);
    });

    it('ignores malformed action payloads', () => {
      const document = readyPanel('/malformed.yaml');

      panels[0].__receive({ type: 'openApiTryOperation', data: { path: '/pets' } });
      panels[0].__receive({ type: 'openApiTryOperation' });

      expect(actions.tryOperation).not.toHaveBeenCalled();
      expect(panels[0].posted).toHaveLength(0);
      clearOpenApiDocumentState(document.uri);
    });

    it('reports a failed action instead of succeeding', async () => {
      const document = readyPanel('/failed.yaml');
      actions.generateCollection.mockResolvedValue({ ok: false, message: 'no paths' });

      panels[0].__receive({ type: 'openApiGenerateCollection' });
      await Promise.resolve();
      await Promise.resolve();

      expect(postedTypes(panels[0])).toEqual(['openApiActionStarted', 'openApiActionFailed']);
      expect(panels[0].posted[1].data.message).toBe('no paths');
      clearOpenApiDocumentState(document.uri);
    });

    it('reports success before prompting for the environment', async () => {
      const document = readyPanel('/env.yaml');
      const order: string[] = [];
      const promptEnvironment = jest.fn(async () => { order.push('prompt'); });
      actions.generateCollection.mockResolvedValue({
        ok: true,
        message: 'created',
        warnings: [],
        promptEnvironment,
      });
      panels[0].webview.postMessage.mockImplementation((message: { type: string }) => {
        order.push(message.type);
        panels[0].posted.push(message);
        return Promise.resolve(true);
      });

      panels[0].__receive({ type: 'openApiGenerateCollection' });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(promptEnvironment).toHaveBeenCalled();
      expect(order).toEqual(['openApiActionStarted', 'openApiActionSucceeded', 'prompt']);
      clearOpenApiDocumentState(document.uri);
    });

    it('appends conversion warnings to the success message', async () => {
      const document = readyPanel('/warn.yaml');
      actions.generateCollection.mockResolvedValue({
        ok: true,
        message: 'created',
        warnings: ['1 webhook operation skipped.'],
      });

      panels[0].__receive({ type: 'openApiGenerateCollection' });
      await Promise.resolve();
      await Promise.resolve();

      expect(panels[0].posted[1].data.message).toBe('created 1 webhook operation skipped.');
      clearOpenApiDocumentState(document.uri);
    });

    it('does not post to a panel disposed mid-action', async () => {
      const document = readyPanel('/disposed.yaml');
      let resolveAction: (value: unknown) => void = () => {};
      actions.generateCollection.mockReturnValue(
        new Promise((resolve) => { resolveAction = resolve; })
      );

      panels[0].__receive({ type: 'openApiGenerateCollection' });
      expect(postedTypes(panels[0])).toEqual(['openApiActionStarted']);

      panels[0].dispose();
      resolveAction({ ok: true, message: 'created', warnings: [] });
      await Promise.resolve();
      await Promise.resolve();

      expect(postedTypes(panels[0])).toEqual(['openApiActionStarted']);
      clearOpenApiDocumentState(document.uri);
    });
  });

  describe('try-it proxy', () => {
    function readyPanel(path: string) {
      const document = makeDocument(SPEC, path);
      setOpenDocuments(document);
      manager.openPreview(document);
      panels[0].__receive({ type: 'openApiPreviewReady' });
      panels[0].posted.length = 0;
      return document;
    }

    function findResponse(panel: any) {
      return panel.posted.find((m: { type: string }) => m.type === 'openApiProxyResponse');
    }

    /** The mocked config `get` returns the caller's default when enabled. */
    function enableTryIt(enabled: boolean) {
      (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: (_key: string, def: unknown) => (enabled ? def : false),
        update: jest.fn(),
      });
    }

    beforeEach(() => {
      enableTryIt(true);
      mockExecuteRequest.mockReset();
    });

    it('proxies a Try-It request through executeRequest and returns the response', async () => {
      mockExecuteRequest.mockResolvedValue({
        status: 201,
        statusText: 'Created',
        headers: { 'content-type': 'application/json' },
        data: '{"ok":true}',
        httpVersion: '1.1',
        timing: {},
        timeline: [],
      });
      const document = readyPanel('/proxy.yaml');

      panels[0].__receive({
        type: 'openApiProxyRequest',
        data: {
          requestId: 'p1',
          request: {
            method: 'post',
            url: 'https://api.test/pets?q=1',
            headers: { 'Content-Type': 'application/json', Host: 'evil', 'Content-Length': '5' },
            body: '{"a":1}',
          },
        },
      });
      await flush();

      const config = mockExecuteRequest.mock.calls[0][0];
      expect(config.method).toBe('POST');
      expect(config.url).toBe('https://api.test/pets?q=1');
      expect(config.data).toBe('{"a":1}');
      // Host and Content-Length are stripped; the HTTP client manages them.
      expect(config.headers).toEqual({ 'Content-Type': 'application/json' });
      expect(config.signal).toBeDefined();

      const response = findResponse(panels[0]);
      expect(response.data.requestId).toBe('p1');
      expect(response.data.response).toMatchObject({
        status: 201,
        statusText: 'Created',
        body: '{"ok":true}',
        bodyEncoding: 'utf8',
        url: 'https://api.test/pets?q=1',
      });
      clearOpenApiDocumentState(document.uri);
    });

    it('base64-encodes binary response bodies', async () => {
      const bytes = Buffer.from([1, 2, 3, 4]);
      mockExecuteRequest.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'image/png' },
        data: bytes,
        httpVersion: '1.1',
        timing: {},
        timeline: [],
      });
      const document = readyPanel('/binary.yaml');

      panels[0].__receive({
        type: 'openApiProxyRequest',
        data: { requestId: 'b1', request: { method: 'get', url: 'https://api.test/img', headers: {} } },
      });
      await flush();

      const response = findResponse(panels[0]);
      expect(response.data.response.bodyEncoding).toBe('base64');
      expect(response.data.response.body).toBe(bytes.toString('base64'));
      clearOpenApiDocumentState(document.uri);
    });

    it('posts an error and skips the network when Try It is disabled', async () => {
      enableTryIt(false);
      const document = readyPanel('/disabled.yaml');

      panels[0].__receive({
        type: 'openApiProxyRequest',
        data: { requestId: 'd1', request: { method: 'get', url: 'https://api.test/x', headers: {} } },
      });
      await flush();

      expect(mockExecuteRequest).not.toHaveBeenCalled();
      expect(findResponse(panels[0]).data.error).toBeDefined();
      clearOpenApiDocumentState(document.uri);
    });

    it('surfaces a request failure as a proxy error', async () => {
      mockExecuteRequest.mockRejectedValue(new Error('ECONNREFUSED'));
      const document = readyPanel('/fail.yaml');

      panels[0].__receive({
        type: 'openApiProxyRequest',
        data: { requestId: 'f1', request: { method: 'get', url: 'https://api.test/down', headers: {} } },
      });
      await flush();

      expect(findResponse(panels[0]).data.error).toBe('ECONNREFUSED');
      clearOpenApiDocumentState(document.uri);
    });

    it('ignores malformed proxy payloads', async () => {
      const document = readyPanel('/malformed-proxy.yaml');

      panels[0].__receive({ type: 'openApiProxyRequest', data: { request: { url: 'x' } } });
      panels[0].__receive({ type: 'openApiProxyRequest', data: { requestId: 'x' } });
      await flush();

      expect(mockExecuteRequest).not.toHaveBeenCalled();
      expect(panels[0].posted).toHaveLength(0);
      clearOpenApiDocumentState(document.uri);
    });

    it('aborts the in-flight request on cancel', async () => {
      let captured: { signal: AbortSignal } | undefined;
      mockExecuteRequest.mockImplementation((config: { signal: AbortSignal }) => {
        captured = config;
        return new Promise(() => {}); // never resolves
      });
      const document = readyPanel('/cancel.yaml');

      panels[0].__receive({
        type: 'openApiProxyRequest',
        data: { requestId: 'c1', request: { method: 'get', url: 'https://api.test/slow', headers: {} } },
      });
      await flush();
      expect(captured?.signal.aborted).toBe(false);

      panels[0].__receive({ type: 'openApiProxyCancel', data: { requestId: 'c1' } });
      expect(captured?.signal.aborted).toBe(true);
      clearOpenApiDocumentState(document.uri);
    });

    it('carries the tryItEnabled flag in the preview payload', () => {
      const document = readyPanel('/flag.yaml');
      const updated = makeDocument(SPEC, '/flag.yaml', 2);
      setOpenDocuments(updated);
      (vscode as any).__fireDidChangeTextDocument(updated);
      jest.advanceTimersByTime(400);
      expect(lastPayload(panels[0]).tryItEnabled).toBe(true);
      clearOpenApiDocumentState(document.uri);
    });
  });

  it('disposes all panels on manager dispose', () => {
    const document = makeDocument(SPEC, '/dispose.yaml');
    setOpenDocuments(document);
    manager.openPreview(document);

    manager.dispose();

    expect(panels[0].dispose).toHaveBeenCalled();
    clearOpenApiDocumentState(document.uri);
  });
});
