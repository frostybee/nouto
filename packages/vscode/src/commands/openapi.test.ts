import * as vscode from 'vscode';
import {
  registerGenerateCollectionFromOpenApiCommand,
  registerNewOpenApiSpecCommand,
  registerOpenApiDocsInBrowserCommand,
  registerOpenApiPreviewCommand,
  registerTryOpenApiOperationCommand,
} from './openapi';
import { createFakeTextDocument } from '../test/helpers/fakeTextDocument';
import { clearOpenApiDocumentState } from '../services/openapi';

describe('registerNewOpenApiSpecCommand', () => {
  async function registeredHandler(): Promise<() => Promise<void>> {
    registerNewOpenApiSpecCommand();
    return (vscode.commands.registerCommand as jest.Mock).mock.calls.at(-1)[1];
  }

  it('opens an untitled YAML document with the scaffold and selects the title', async () => {
    let document: vscode.TextDocument | undefined;
    (vscode.workspace.openTextDocument as jest.Mock).mockImplementation(
      async (options: { language: string; content: string }) => {
        expect(options.language).toBe('yaml');
        document = createFakeTextDocument({ content: options.content, path: '/untitled-1.yaml' });
        return document;
      }
    );
    const editor = { selection: undefined as vscode.Selection | undefined, revealRange: jest.fn() };
    (vscode.window.showTextDocument as jest.Mock).mockResolvedValue(editor);

    await (await registeredHandler())();

    expect(vscode.window.showSaveDialog).not.toHaveBeenCalled();
    expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();
    const content = document!.getText();
    expect(content).toContain('openapi: 3.1.0');
    expect(content).toContain('servers:');
    expect(content).toContain('  - url: https://api.server.test/v1');
    expect(content).toContain('  /test:');
    expect(content).toContain("        '200':");
    expect(vscode.window.showTextDocument).toHaveBeenCalledWith(document);

    // The selection covers the `API Title` value for inline replacement.
    expect(editor.selection).toBeDefined();
    expect(document!.getText(editor.selection)).toBe('API Title');
    expect(editor.revealRange).toHaveBeenCalled();
  });

  it('reports failures to open the document', async () => {
    (vscode.workspace.openTextDocument as jest.Mock).mockRejectedValueOnce(new Error('no editor'));
    await (await registeredHandler())();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'Failed to create OpenAPI specification: no editor'
    );
  });
});

describe('registerOpenApiPreviewCommand', () => {
  const previewManager = { openPreview: jest.fn() };

  function handler(): () => Promise<void> {
    registerOpenApiPreviewCommand(previewManager as never);
    return (vscode.commands.registerCommand as jest.Mock).mock.calls.at(-1)[1];
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (vscode.window as { activeTextEditor?: unknown }).activeTextEditor = undefined;
  });

  it('reports when no editor is active', async () => {
    await handler()();
    expect(previewManager.openPreview).not.toHaveBeenCalled();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'Open an OpenAPI document to preview it.'
    );
  });

  it('reports when the active document is not an OpenAPI specification', async () => {
    const document = createFakeTextDocument({
      content: 'name: plain\n',
      languageId: 'yaml',
      path: '/plain.yaml',
    });
    (vscode.window as { activeTextEditor?: unknown }).activeTextEditor = { document };

    await handler()();

    expect(previewManager.openPreview).not.toHaveBeenCalled();
    expect(vscode.window.showErrorMessage).toHaveBeenCalled();
  });

  it('opens the preview for a recognized specification', async () => {
    const document = createFakeTextDocument({
      content: 'openapi: 3.1.0\ninfo:\n  title: T\n  version: 1.0.0\npaths: {}\n',
      languageId: 'yaml',
      path: '/cmd-preview.yaml',
    });
    (vscode.window as { activeTextEditor?: unknown }).activeTextEditor = { document };

    await handler()();

    expect(previewManager.openPreview).toHaveBeenCalledWith(document);
  });
});

describe('registerTryOpenApiOperationCommand', () => {
  const actionService = { tryOperation: jest.fn() };

  function handler(): (args: unknown) => Promise<void> {
    registerTryOpenApiOperationCommand(actionService as never);
    return (vscode.commands.registerCommand as jest.Mock).mock.calls.at(-1)[1];
  }

  beforeEach(() => {
    jest.clearAllMocks();
    actionService.tryOperation.mockResolvedValue({ ok: true, message: 'opened', warnings: [] });
  });

  it('forwards the lens payload to the action workflow', async () => {
    await handler()({ uri: 'file:///spec.yaml', path: '/pets', method: 'get' });

    const call = actionService.tryOperation.mock.calls[0][0];
    expect(call.uri.toString()).toContain('spec.yaml');
    expect(call).toMatchObject({ path: '/pets', method: 'get' });
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('opened');
  });

  it('rejects malformed payloads without running anything', async () => {
    await handler()({ path: '/pets' });
    await handler()(undefined);

    expect(actionService.tryOperation).not.toHaveBeenCalled();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Nouto: invalid Try It request.');
  });

  it('consolidates conversion caveats into one warning', async () => {
    actionService.tryOperation.mockResolvedValue({
      ok: true,
      message: 'opened',
      warnings: ['Cookie parameter skipped.', 'No servers declared.'],
    });

    await handler()({ uri: 'file:///spec.yaml', path: '/pets', method: 'get' });

    expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      '2 conversion caveats: Cookie parameter skipped. No servers declared.'
    );
  });

  it('reports conversion failures', async () => {
    actionService.tryOperation.mockResolvedValue({ ok: false, message: 'path not found' });

    await handler()({ uri: 'file:///spec.yaml', path: '/nope', method: 'get' });

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'Failed to open the operation: path not found'
    );
    expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
  });
});

describe('registerGenerateCollectionFromOpenApiCommand', () => {
  const actionService = { generateCollection: jest.fn() };

  function handler(): (resource?: vscode.Uri) => Promise<void> {
    registerGenerateCollectionFromOpenApiCommand(actionService as never);
    return (vscode.commands.registerCommand as jest.Mock).mock.calls.at(-1)[1];
  }

  beforeEach(() => {
    jest.clearAllMocks();
    actionService.generateCollection.mockResolvedValue({
      ok: true,
      message: 'created',
      warnings: [],
    });
  });

  it('passes an Explorer resource URI through', async () => {
    const uri = vscode.Uri.file('/from-explorer.yaml');
    await handler()(uri);
    expect(actionService.generateCollection).toHaveBeenCalledWith(uri);
  });

  it('falls back to the active editor when invoked from the palette', async () => {
    await handler()();
    expect(actionService.generateCollection).toHaveBeenCalledWith(undefined);
  });

  it('ignores a non-URI argument', async () => {
    await handler()('not-a-uri' as never);
    expect(actionService.generateCollection).toHaveBeenCalledWith(undefined);
  });

  it('prompts for the environment only after reporting success', async () => {
    const order: string[] = [];
    (vscode.window.showInformationMessage as jest.Mock).mockImplementation(async () => {
      order.push('success');
    });
    actionService.generateCollection.mockResolvedValue({
      ok: true,
      message: 'created',
      warnings: [],
      promptEnvironment: jest.fn(async () => { order.push('prompt'); }),
    });

    await handler()();

    expect(order).toEqual(['success', 'prompt']);
  });

  it('does not prompt when generation failed', async () => {
    const promptEnvironment = jest.fn();
    actionService.generateCollection.mockResolvedValue({ ok: false, message: 'invalid' });

    await handler()();

    expect(promptEnvironment).not.toHaveBeenCalled();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'Failed to generate the collection: invalid'
    );
  });
});

describe('registerOpenApiDocsInBrowserCommand', () => {
  const snapshots = { register: jest.fn() };
  const context = {
    extensionUri: vscode.Uri.file('/ext'),
    globalStorageUri: vscode.Uri.file('/storage'),
  };

  const VALID = `openapi: 3.1.0
info: { title: Pets, version: 1.0.0 }
paths: {}
`;

  const documents: vscode.TextDocument[] = [];

  function docsHandler(): (resource?: vscode.Uri) => Promise<void> {
    registerOpenApiDocsInBrowserCommand(context as never, snapshots as never);
    return (vscode.commands.registerCommand as jest.Mock).mock.calls.at(-1)[1];
  }

  function openApiDoc(content = VALID, path = '/pets.yaml') {
    const document = createFakeTextDocument({ content, path, languageId: 'yaml' });
    documents.push(document);
    (vscode.window as { activeTextEditor?: unknown }).activeTextEditor = { document };
    (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue(document);
    return document;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (vscode.window as { activeTextEditor?: unknown }).activeTextEditor = undefined;
    (vscode.workspace.fs.writeFile as jest.Mock).mockResolvedValue(undefined);
    (vscode.workspace.fs.readFile as jest.Mock).mockResolvedValue(
      new TextEncoder().encode('ASSET')
    );
  });

  afterEach(() => {
    for (const document of documents) clearOpenApiDocumentState(document.uri);
    documents.length = 0;
  });

  it('reports when no editor is active', async () => {
    await docsHandler()();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'Open an OpenAPI document to view its documentation.'
    );
    expect(vscode.env.openExternal).not.toHaveBeenCalled();
  });

  it('reports when the document is not OpenAPI', async () => {
    openApiDoc('just: yaml\n', '/not-openapi.yaml');
    await docsHandler()();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'This document is not a recognized OpenAPI 3.x specification.'
    );
    expect(vscode.env.openExternal).not.toHaveBeenCalled();
  });

  it('does nothing when the renderer pick is cancelled', async () => {
    openApiDoc();
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(undefined);
    await docsHandler()();
    expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();
    expect(vscode.env.openExternal).not.toHaveBeenCalled();
  });

  it('writes the snapshot, registers it, and opens the browser', async () => {
    const document = openApiDoc();
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
      id: 'swagger-ui',
      label: 'Swagger UI',
    });

    await docsHandler()();

    const writes = (vscode.workspace.fs.writeFile as jest.Mock).mock.calls.map(
      ([uri, bytes]: [vscode.Uri, Uint8Array]) => ({
        path: String(uri.path),
        text: new TextDecoder().decode(bytes),
      })
    );
    const spec = writes.find((w) => w.path.endsWith('spec.js'));
    const shell = writes.find((w) => w.path.endsWith('index.html'));
    expect(spec?.text).toContain('window.__NOUTO_OPENAPI_SPEC = ');
    expect(shell?.text).toContain('<title>Pets</title>');
    expect(shell?.text).toContain('ASSET');
    expect(spec?.path).toContain('openapi-docs/pets-');

    expect(snapshots.register).toHaveBeenCalledTimes(1);
    expect(snapshots.register.mock.calls[0][0]).toBe(document);
    const opened = (vscode.env.openExternal as jest.Mock).mock.calls[0][0] as vscode.Uri;
    expect(String(opened.path)).toContain('index.html');
  });

  it('reports asset read failures', async () => {
    openApiDoc();
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({ id: 'rapidoc', label: 'RapiDoc' });
    (vscode.workspace.fs.readFile as jest.Mock).mockRejectedValueOnce(new Error('missing asset'));

    await docsHandler()();

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'Failed to open documentation in browser: missing asset'
    );
    expect(vscode.env.openExternal).not.toHaveBeenCalled();
  });
});
