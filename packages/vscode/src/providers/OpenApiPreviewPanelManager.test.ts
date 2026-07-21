import * as vscode from 'vscode';
import { OpenApiPreviewPanelManager } from './OpenApiPreviewPanelManager';
import { createFakeTextDocument } from '../test/helpers/fakeTextDocument';
import { clearOpenApiDocumentState } from '../services/openapi';

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

  beforeEach(() => {
    jest.useFakeTimers();
    panels = [];
    (vscode.window.createWebviewPanel as jest.Mock).mockImplementation(() => {
      const panel = mocked.__createFakeWebviewPanel();
      panels.push(panel);
      return panel;
    });
    manager = new OpenApiPreviewPanelManager(extensionUri);
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
      renderer: 'redoc',
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

  it('disposes all panels on manager dispose', () => {
    const document = makeDocument(SPEC, '/dispose.yaml');
    setOpenDocuments(document);
    manager.openPreview(document);

    manager.dispose();

    expect(panels[0].dispose).toHaveBeenCalled();
    clearOpenApiDocumentState(document.uri);
  });
});
