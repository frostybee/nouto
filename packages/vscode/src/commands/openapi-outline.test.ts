import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  registerOpenApiOutlineOpenSpecCommand,
  registerOpenApiOutlineRefreshCommand,
  registerOpenApiOutlineRevealCommand,
  registerOpenApiOutlineSaveAsCommand,
  registerOpenApiOutlineTryOperationCommand,
} from './openapi-outline';
import type { OpenApiOutlineProvider } from '../providers/OpenApiOutlineProvider';
import { clearOpenApiDocumentState } from '../services/openapi';
import { createFakeTextDocument } from '../test/helpers/fakeTextDocument';

const fixtureContent = fs.readFileSync(
  path.join(__dirname, '../services/openapi/__fixtures__/outline-full.yaml'),
  'utf8'
);

type CommandHandler = (...args: unknown[]) => Promise<void> | void;

function handlerFor(command: string): CommandHandler {
  const call = (vscode.commands.registerCommand as jest.Mock).mock.calls
    .filter(([id]) => id === command)
    .pop();
  expect(call).toBeDefined();
  return call![1] as CommandHandler;
}

describe('openapi-outline commands', () => {
  const uris: vscode.Uri[] = [];

  afterEach(() => {
    for (const uri of uris) clearOpenApiDocumentState(uri);
    uris.length = 0;
    jest.clearAllMocks();
  });

  it('refresh command delegates to the provider', () => {
    const provider = { refresh: jest.fn() } as unknown as OpenApiOutlineProvider;
    registerOpenApiOutlineRefreshCommand(provider);
    handlerFor('nouto.openApiOutline.refresh')();
    expect(provider.refresh).toHaveBeenCalledTimes(1);
  });

  it('reveal command selects the node key range and suppresses one sync pass', async () => {
    const document = createFakeTextDocument({ content: fixtureContent, path: '/outline-full.yaml' });
    uris.push(document.uri);
    const editor = { selection: undefined as unknown, revealRange: jest.fn() };
    (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue(document);
    (vscode.window.showTextDocument as jest.Mock).mockResolvedValue(editor);
    const provider = { suppressSelectionSyncOnce: jest.fn() } as unknown as OpenApiOutlineProvider;
    registerOpenApiOutlineRevealCommand(provider);

    await handlerFor('nouto.openApiOutline.reveal')({
      pointer: '/paths/~1pets/get',
      documentUri: document.uri.toString(),
    });

    expect(provider.suppressSelectionSyncOnce).toHaveBeenCalledTimes(1);
    const selection = editor.selection as vscode.Selection;
    // The key range of `get:` sits on the line declaring the operation.
    const keyLine = document.positionAt(fixtureContent.indexOf('    get:') + 4).line;
    expect(selection.start.line).toBe(keyLine);
    expect(editor.revealRange).toHaveBeenCalledWith(
      expect.anything(),
      vscode.TextEditorRevealType.InCenterIfOutsideViewport
    );
  });

  it('reveal command walks to the nearest resolvable ancestor pointer', async () => {
    const document = createFakeTextDocument({ content: fixtureContent, path: '/outline-walk.yaml' });
    uris.push(document.uri);
    const editor = { selection: undefined as unknown, revealRange: jest.fn() };
    (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue(document);
    (vscode.window.showTextDocument as jest.Mock).mockResolvedValue(editor);
    const provider = { suppressSelectionSyncOnce: jest.fn() } as unknown as OpenApiOutlineProvider;
    registerOpenApiOutlineRevealCommand(provider);

    // /paths/~1gone does not exist; the command should land on /paths.
    await handlerFor('nouto.openApiOutline.reveal')({
      pointer: '/paths/~1gone',
      documentUri: document.uri.toString(),
    });

    const selection = editor.selection as vscode.Selection;
    const pathsLine = document.positionAt(fixtureContent.indexOf('paths:')).line;
    expect(selection.start.line).toBe(pathsLine);
  });

  it('reveal command ignores malformed payloads', async () => {
    const provider = { suppressSelectionSyncOnce: jest.fn() } as unknown as OpenApiOutlineProvider;
    registerOpenApiOutlineRevealCommand(provider);
    await handlerFor('nouto.openApiOutline.reveal')({ pointer: 42 });
    await handlerFor('nouto.openApiOutline.reveal')(undefined);
    expect(vscode.workspace.openTextDocument).not.toHaveBeenCalled();
    expect(provider.suppressSelectionSyncOnce).not.toHaveBeenCalled();
  });

  it('reveal command swallows open failures', async () => {
    (vscode.workspace.openTextDocument as jest.Mock).mockRejectedValue(new Error('gone'));
    const provider = { suppressSelectionSyncOnce: jest.fn() } as unknown as OpenApiOutlineProvider;
    registerOpenApiOutlineRevealCommand(provider);
    await expect(
      handlerFor('nouto.openApiOutline.reveal')({ pointer: '/info', documentUri: 'file:///gone.yaml' })
    ).resolves.toBeUndefined();
    expect(provider.suppressSelectionSyncOnce).not.toHaveBeenCalled();
  });

  it('openSpec command opens the picked file in the editor', async () => {
    const picked = vscode.Uri.file('/picked.yaml');
    const document = createFakeTextDocument({ content: 'openapi: 3.1.0\n', path: '/picked.yaml' });
    uris.push(document.uri);
    (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([picked]);
    (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue(document);
    registerOpenApiOutlineOpenSpecCommand();

    await handlerFor('nouto.openApiOutline.openSpec')();

    expect(vscode.workspace.openTextDocument).toHaveBeenCalledWith(picked);
    expect(vscode.window.showTextDocument).toHaveBeenCalledWith(document);
  });

  it('openSpec command does nothing when the picker is cancelled', async () => {
    (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue(undefined);
    registerOpenApiOutlineOpenSpecCommand();
    await handlerFor('nouto.openApiOutline.openSpec')();
    expect(vscode.workspace.openTextDocument).not.toHaveBeenCalled();
  });

  it('saveAs command writes the outlined document to the chosen file', async () => {
    const document = createFakeTextDocument({ content: fixtureContent, path: '/outline-full.yaml' });
    uris.push(document.uri);
    const target = vscode.Uri.file('/copy.yaml');
    (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(target);
    (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue(document);
    const provider = { document } as unknown as OpenApiOutlineProvider;
    registerOpenApiOutlineSaveAsCommand(provider);

    await handlerFor('nouto.openApiOutline.saveAs')();

    expect(vscode.workspace.fs.writeFile).toHaveBeenCalledWith(
      target,
      new TextEncoder().encode(fixtureContent)
    );
    expect(vscode.window.showTextDocument).toHaveBeenCalled();
    // YAML documents offer YAML filters first.
    const [options] = (vscode.window.showSaveDialog as jest.Mock).mock.calls[0];
    expect(Object.keys(options.filters)[0]).toBe('YAML');
  });

  it('saveAs command errors when no document is available', async () => {
    (vscode.window as unknown as { activeTextEditor: unknown }).activeTextEditor = undefined;
    const provider = { document: undefined } as unknown as OpenApiOutlineProvider;
    registerOpenApiOutlineSaveAsCommand(provider);
    await handlerFor('nouto.openApiOutline.saveAs')();
    expect(vscode.window.showErrorMessage).toHaveBeenCalled();
    expect(vscode.window.showSaveDialog).not.toHaveBeenCalled();
  });

  it('tryOperation command adapts the node into the Try It payload', async () => {
    registerOpenApiOutlineTryOperationCommand();
    await handlerFor('nouto.openApiOutline.tryOperation')({
      pointer: '/paths/~1pets/get',
      documentUri: 'file:///outline-full.yaml',
      operation: { path: '/pets', method: 'get' },
    });
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('nouto.tryOpenApiOperation', {
      uri: 'file:///outline-full.yaml',
      path: '/pets',
      method: 'get',
    });
  });

  it('tryOperation command ignores nodes without operation metadata', async () => {
    registerOpenApiOutlineTryOperationCommand();
    await handlerFor('nouto.openApiOutline.tryOperation')({
      pointer: '/components/schemas/Pet',
      documentUri: 'file:///outline-full.yaml',
    });
    expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
      'nouto.tryOpenApiOperation',
      expect.anything()
    );
  });
});
