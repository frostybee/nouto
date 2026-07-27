import * as vscode from 'vscode';
import * as yaml from 'js-yaml';
import {
  registerGenerateOpenApiFromCollectionCommand,
  registerGenerateOpenApiFromHarCommand,
} from './openapi-export';
import type { StorageService } from '../services/StorageService';
import type { Collection } from '@nouto/core';

const NOW = '2026-01-01T00:00:00.000Z';

const makeCollection = (overrides: Partial<Collection> = {}): Collection => ({
  id: 'col-1',
  name: 'My API',
  items: [
    {
      type: 'request',
      id: 'req-1',
      name: 'List users',
      method: 'GET',
      url: 'https://api.example.com/users',
      params: [],
      headers: [],
      auth: { type: 'none' },
      body: { type: 'none', content: '' },
      createdAt: NOW,
      updatedAt: NOW,
    },
  ],
  expanded: true,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const makeHarContent = (): string =>
  JSON.stringify({
    log: {
      entries: [
        {
          request: {
            method: 'GET',
            url: 'https://api.example.com/users',
            headers: [],
            queryString: [],
          },
          response: {
            status: 200,
            content: { mimeType: 'application/json', text: '{"id":1}' },
          },
        },
      ],
    },
  });

function openedYaml(): Record<string, unknown> {
  const options = (vscode.workspace.openTextDocument as jest.Mock).mock.calls.at(-1)[0];
  expect(options.language).toBe('yaml');
  return yaml.load(options.content) as Record<string, unknown>;
}

describe('registerGenerateOpenApiFromCollectionCommand', () => {
  const loadCollections = jest.fn();
  const storageService = { loadCollections } as unknown as StorageService;

  function handler(): (collectionId?: string) => Promise<void> {
    registerGenerateOpenApiFromCollectionCommand(storageService);
    return (vscode.commands.registerCommand as jest.Mock).mock.calls.at(-1)[1];
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue({});
    (vscode.window.showTextDocument as jest.Mock).mockResolvedValue({});
  });

  it('registers the nouto.generateOpenApiFromCollection command', () => {
    registerGenerateOpenApiFromCollectionCommand(storageService);
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'nouto.generateOpenApiFromCollection',
      expect.any(Function)
    );
  });

  it('warns when there is nothing to export', async () => {
    loadCollections.mockResolvedValue([makeCollection({ items: [] })]);
    await handler()();
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      'No collections to generate an OpenAPI specification from.'
    );
    expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
  });

  it('excludes builtin collections from the QuickPick', async () => {
    loadCollections.mockResolvedValue([
      makeCollection(),
      makeCollection({ id: 'drafts', name: 'Drafts', builtin: 'drafts' }),
    ]);
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(undefined);
    await handler()();
    expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
      [{ label: 'My API', description: '1 items', id: 'col-1' }],
      expect.objectContaining({ title: 'Generate OpenAPI from Collection' })
    );
  });

  it('does nothing when the QuickPick is cancelled', async () => {
    loadCollections.mockResolvedValue([makeCollection()]);
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(undefined);
    await handler()();
    expect(vscode.workspace.openTextDocument).not.toHaveBeenCalled();
  });

  it('opens the generated document as untitled YAML', async () => {
    loadCollections.mockResolvedValue([makeCollection()]);
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({ id: 'col-1', label: 'My API' });

    await handler()();

    expect(vscode.window.showSaveDialog).not.toHaveBeenCalled();
    const document = openedYaml();
    expect(document).toMatchObject({
      openapi: '3.1.0',
      info: { title: 'My API', version: '1.0.0' },
      servers: [{ url: 'https://api.example.com' }],
    });
    expect((document.paths as Record<string, unknown>)['/users']).toBeDefined();
    expect(vscode.window.showTextDocument).toHaveBeenCalled();
    expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
  });

  it('skips the QuickPick when invoked with a collectionId (sidebar context menu)', async () => {
    loadCollections.mockResolvedValue([makeCollection()]);

    await handler()('col-1');

    expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
    expect(openedYaml()).toMatchObject({ info: { title: 'My API' } });
    expect(vscode.window.showTextDocument).toHaveBeenCalled();
  });

  it('does nothing for an unknown collectionId', async () => {
    loadCollections.mockResolvedValue([makeCollection()]);

    await handler()('missing-id');

    expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
    expect(vscode.workspace.openTextDocument).not.toHaveBeenCalled();
  });

  it('surfaces generation warnings', async () => {
    loadCollections.mockResolvedValue([
      makeCollection({
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'AWS request',
            method: 'GET',
            url: 'https://api.example.com/users',
            params: [],
            headers: [],
            auth: { type: 'aws' },
            body: { type: 'none', content: '' },
            createdAt: NOW,
            updatedAt: NOW,
          },
        ],
      }),
    ]);
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({ id: 'col-1', label: 'My API' });

    await handler()();

    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('OpenAPI generated with caveats:')
    );
  });

  it('reports failures', async () => {
    loadCollections.mockResolvedValue([makeCollection()]);
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({ id: 'col-1', label: 'My API' });
    (vscode.workspace.openTextDocument as jest.Mock).mockRejectedValueOnce(new Error('no editor'));

    await handler()();

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'Failed to generate OpenAPI specification: no editor'
    );
  });
});

describe('registerGenerateOpenApiFromHarCommand', () => {
  function handler(): (uri?: vscode.Uri) => Promise<void> {
    registerGenerateOpenApiFromHarCommand();
    return (vscode.commands.registerCommand as jest.Mock).mock.calls.at(-1)[1];
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue({});
    (vscode.window.showTextDocument as jest.Mock).mockResolvedValue({});
  });

  it('registers the nouto.generateOpenApiFromHar command', () => {
    registerGenerateOpenApiFromHarCommand();
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'nouto.generateOpenApiFromHar',
      expect.any(Function)
    );
  });

  it('does nothing when the open dialog is cancelled', async () => {
    (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue(undefined);
    await handler()();
    expect(vscode.workspace.fs.readFile).not.toHaveBeenCalled();
  });

  it('generates from a dialog-picked HAR file', async () => {
    (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([{ fsPath: '/tmp/a.har' }]);
    (vscode.workspace.fs.readFile as jest.Mock).mockResolvedValue(
      Buffer.from(makeHarContent(), 'utf-8')
    );

    await handler()();

    expect(vscode.window.showOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({ filters: { 'HAR Files': ['har', 'json'] } })
    );
    const document = openedYaml();
    expect(document).toMatchObject({ openapi: '3.1.0' });
    expect((document.paths as Record<string, unknown>)['/users']).toBeDefined();
  });

  it('skips the dialog when invoked with a uri (explorer context menu)', async () => {
    (vscode.workspace.fs.readFile as jest.Mock).mockResolvedValue(
      Buffer.from(makeHarContent(), 'utf-8')
    );

    await handler()({ fsPath: '/tmp/a.har' } as vscode.Uri);

    expect(vscode.window.showOpenDialog).not.toHaveBeenCalled();
    expect(openedYaml()).toMatchObject({ openapi: '3.1.0' });
  });

  it('reports invalid HAR content through the error message', async () => {
    (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([{ fsPath: '/tmp/a.har' }]);
    (vscode.workspace.fs.readFile as jest.Mock).mockResolvedValue(Buffer.from('nope', 'utf-8'));

    await handler()();

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'Failed to generate OpenAPI specification: Invalid HAR file: content is not valid JSON'
    );
  });
});
