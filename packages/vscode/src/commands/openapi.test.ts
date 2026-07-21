import * as vscode from 'vscode';
import { registerNewOpenApiSpecCommand } from './openapi';
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
