import * as vscode from 'vscode';
import { VscodeFileResolver } from './vscodeFileResolver';
import { createFakeTextDocument } from '../../test/helpers/fakeTextDocument';

describe('VscodeFileResolver', () => {
  const resolver = new VscodeFileResolver();
  const openDocuments = vscode.workspace.textDocuments as vscode.TextDocument[];
  const readFile = vscode.workspace.fs.readFile as jest.Mock;

  afterEach(() => {
    openDocuments.length = 0;
    readFile.mockReset();
  });

  it('resolves relative paths with core URI arithmetic', () => {
    expect(resolver.resolve('file:///specs/api.yaml', './schemas/user.yaml')).toBe(
      'file:///specs/schemas/user.yaml'
    );
    expect(resolver.resolve('file:///specs/api.yaml', '../common.yaml')).toBe('file:///common.yaml');
  });

  it('prefers an open document (including unsaved edits) over the file system', async () => {
    openDocuments.push(
      createFakeTextDocument({ path: '/specs/common.yaml', content: 'from: buffer' })
    );

    const loaded = await resolver.load('file:///specs/common.yaml');

    expect(loaded).toEqual({ content: 'from: buffer', format: 'yaml' });
    expect(readFile).not.toHaveBeenCalled();
  });

  it('derives the format of an open document from its language id', async () => {
    openDocuments.push(
      createFakeTextDocument({ path: '/specs/common.json', content: '{}', languageId: 'json' })
    );

    const loaded = await resolver.load('file:///specs/common.json');

    expect(loaded).toEqual({ content: '{}', format: 'json' });
  });

  it('falls back to workspace.fs.readFile with format from the file extension', async () => {
    readFile.mockResolvedValueOnce(Buffer.from('from: disk', 'utf8'));

    const loaded = await resolver.load('file:///specs/closed.YML');

    expect(loaded).toEqual({ content: 'from: disk', format: 'yaml' });
    expect(readFile).toHaveBeenCalledTimes(1);
    expect(readFile.mock.calls[0][0].path).toBe('/specs/closed.YML');
  });

  it('treats non-yaml extensions as json', async () => {
    readFile.mockResolvedValueOnce(Buffer.from('{"a":1}', 'utf8'));

    const loaded = await resolver.load('file:///specs/closed.json');

    expect(loaded).toEqual({ content: '{"a":1}', format: 'json' });
  });

  it('returns undefined when the file cannot be read', async () => {
    readFile.mockRejectedValueOnce(new Error('ENOENT'));

    await expect(resolver.load('file:///specs/missing.yaml')).resolves.toBeUndefined();
  });
});
