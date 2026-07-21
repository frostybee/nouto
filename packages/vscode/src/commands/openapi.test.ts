import * as vscode from 'vscode';
import {
  registerGenerateCollectionFromOpenApiCommand,
  registerNewOpenApiSpecCommand,
  registerOpenApiPreviewCommand,
  registerTryOpenApiOperationCommand,
} from './openapi';
import { createFakeTextDocument } from '../test/helpers/fakeTextDocument';

describe('registerNewOpenApiSpecCommand', () => {
  async function registeredHandler(): Promise<() => Promise<void>> {
    registerNewOpenApiSpecCommand();
    return (vscode.commands.registerCommand as jest.Mock).mock.calls.at(-1)[1];
  }

  it('does nothing when the save dialog is cancelled', async () => {
    (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(undefined);
    await (await registeredHandler())();
    expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();
  });

  it('writes and opens a new OpenAPI 3.1 YAML document', async () => {
    const uri = vscode.Uri.file('/new-api.yaml');
    const document = createFakeTextDocument({ content: '', path: '/new-api.yaml' });
    (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(uri);
    (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue(document);
    (vscode.window.showTextDocument as jest.Mock).mockResolvedValue(undefined);

    await (await registeredHandler())();

    const bytes = (vscode.workspace.fs.writeFile as jest.Mock).mock.calls[0][1] as Uint8Array;
    expect(new TextDecoder().decode(bytes)).toBe(
      'openapi: 3.1.0\ninfo:\n  title: New API\n  version: 1.0.0\npaths: {}\n'
    );
    expect(vscode.workspace.openTextDocument).toHaveBeenCalledWith(uri);
    expect(vscode.window.showTextDocument).toHaveBeenCalledWith(document);
  });

  it('reports write failures', async () => {
    (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(vscode.Uri.file('/failed.yaml'));
    (vscode.workspace.fs.writeFile as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
    await (await registeredHandler())();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'Failed to create OpenAPI specification: disk full'
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
