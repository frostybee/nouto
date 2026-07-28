import * as vscode from 'vscode';
import * as yaml from 'js-yaml';
import { registerCreateExternalFileCommand } from './openapi-code-actions';
import { createFakeTextDocument } from '../test/helpers/fakeTextDocument';

describe('nouto.openApiCodeAction.createExternalFile', () => {
  const getWorkspaceFolder = vscode.workspace.getWorkspaceFolder as jest.Mock;
  const stat = vscode.workspace.fs.stat as jest.Mock;
  const writeFile = vscode.workspace.fs.writeFile as jest.Mock;
  const openTextDocument = vscode.workspace.openTextDocument as jest.Mock;
  const showTextDocument = vscode.window.showTextDocument as jest.Mock;

  function handler(): (payload: unknown) => Promise<void> {
    registerCreateExternalFileCommand();
    return (vscode.commands.registerCommand as jest.Mock).mock.calls.at(-1)[1];
  }

  beforeEach(() => {
    jest.clearAllMocks();
    getWorkspaceFolder.mockReturnValue({ name: 'mock-workspace' });
    stat.mockRejectedValue(new Error('ENOENT'));
    writeFile.mockResolvedValue(undefined);
    openTextDocument.mockImplementation(async (uri: vscode.Uri) =>
      createFakeTextDocument({ content: '', path: uri.path })
    );
    showTextDocument.mockResolvedValue(undefined);
  });

  function writtenText(): string {
    return new TextDecoder().decode(writeFile.mock.calls[0][1]);
  }

  it('scaffolds a YAML file seeded with the expected component and opens it', async () => {
    await handler()({
      targetUri: 'file:///mock/workspace/common.yaml',
      targetPointer: '/components/schemas/Pet',
    });

    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(writeFile.mock.calls[0][0].path).toBe('/mock/workspace/common.yaml');
    const parsed = yaml.load(writtenText()) as Record<string, any>;
    expect(parsed.components.schemas.Pet).toEqual({ type: 'object', properties: {} });
    expect(showTextDocument).toHaveBeenCalledTimes(1);
  });

  it('scaffolds JSON for .json targets', async () => {
    await handler()({
      targetUri: 'file:///mock/workspace/common.json',
      targetPointer: '/components/responses/NotFound',
    });

    const parsed = JSON.parse(writtenText()) as Record<string, any>;
    expect(parsed.components.responses.NotFound).toEqual({ description: 'OK' });
  });

  it('writes an empty parseable document for non-component pointers', async () => {
    await handler()({
      targetUri: 'file:///mock/workspace/common.yaml',
      targetPointer: '/Missing',
    });

    expect(yaml.load(writtenText())).toEqual({});
  });

  it('refuses to write outside the workspace', async () => {
    getWorkspaceFolder.mockReturnValue(undefined);

    await handler()({
      targetUri: 'file:///elsewhere/common.yaml',
      targetPointer: '/components/schemas/Pet',
    });

    expect(writeFile).not.toHaveBeenCalled();
  });

  it('no-ops when the file already exists (stale diagnostic race)', async () => {
    stat.mockResolvedValue({ type: 1, size: 10 });

    await handler()({
      targetUri: 'file:///mock/workspace/common.yaml',
      targetPointer: '/components/schemas/Pet',
    });

    expect(writeFile).not.toHaveBeenCalled();
  });

  it('ignores malformed payloads', async () => {
    await handler()(undefined);
    await handler()({ targetUri: 42 });

    expect(writeFile).not.toHaveBeenCalled();
  });
});
