import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as vscode from 'vscode';
import { getByJsonPointer } from '@nouto/core/services';
import { registerOpenApiOutlineEditCommands } from './openapi-outline-edit';
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

/** Applies the WorkspaceEdit captured by the applyEdit spy to the document. */
function appliedText(document: vscode.TextDocument): string {
  const applyEdit = vscode.workspace.applyEdit as jest.Mock;
  expect(applyEdit).toHaveBeenCalledTimes(1);
  const edit = applyEdit.mock.calls[0][0] as {
    get(uri: unknown): Array<{ range: vscode.Range; newText: string }>;
  };
  const changes = edit.get(document.uri)
    .map((change) => ({
      start: document.offsetAt(change.range.start),
      end: document.offsetAt(change.range.end),
      newText: change.newText,
    }))
    .sort((a, b) => b.start - a.start);
  let result = document.getText();
  for (const change of changes) {
    result = result.slice(0, change.start) + change.newText + result.slice(change.end);
  }
  return result;
}

function parseAt(content: string, pointer: string): unknown {
  const resolved = getByJsonPointer(yaml.load(content), pointer);
  expect(resolved.found).toBe(true);
  return resolved.value;
}

describe('openapi-outline edit commands', () => {
  const uris: vscode.Uri[] = [];
  let provider: OpenApiOutlineProvider;
  let document: vscode.TextDocument;

  function nodeFor(overrides: Record<string, unknown> = {}) {
    return { documentUri: document.uri.toString(), ...overrides };
  }

  beforeEach(() => {
    document = createFakeTextDocument({ content: fixtureContent, path: '/outline-full.yaml' });
    uris.push(document.uri);
    provider = {
      revealPointerOnce: jest.fn().mockResolvedValue(undefined),
      suppressSelectionSyncOnce: jest.fn(),
    } as unknown as OpenApiOutlineProvider;
    (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue(document);
    (vscode.window.showTextDocument as jest.Mock).mockResolvedValue({
      selection: undefined,
      revealRange: jest.fn(),
    });
    registerOpenApiOutlineEditCommands(provider);
  });

  afterEach(() => {
    for (const uri of uris) clearOpenApiDocumentState(uri);
    uris.length = 0;
    jest.clearAllMocks();
  });

  it('copyJsonPointer writes the pointer to the clipboard', async () => {
    await handlerFor('nouto.openApiOutline.copyJsonPointer')(nodeFor({ pointer: '/paths/~1pets' }));
    expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith('/paths/~1pets');
    expect(vscode.window.setStatusBarMessage).toHaveBeenCalled();
  });

  it('copyJsonPointer ignores nodes without a pointer', async () => {
    await handlerFor('nouto.openApiOutline.copyJsonPointer')(nodeFor());
    expect(vscode.env.clipboard.writeText).not.toHaveBeenCalled();
  });

  it('commands ignore malformed payloads', async () => {
    await handlerFor('nouto.openApiOutline.addPath')(undefined);
    await handlerFor('nouto.openApiOutline.deletePath')({ pointer: 42 });
    expect(vscode.workspace.openTextDocument).not.toHaveBeenCalled();
    expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
  });

  it('addPath inserts a placeholder path with a GET stub, prompt-free', async () => {
    await handlerFor('nouto.openApiOutline.addPath')(nodeFor());

    expect(vscode.window.showInputBox).not.toHaveBeenCalled();
    expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
    const result = appliedText(document);
    expect(parseAt(result, '/paths/~1new-path/get/responses/200/description')).toBe('OK');
    expect(provider.revealPointerOnce).toHaveBeenCalledWith('/paths/~1new-path');
  });

  it('addPath uniquifies the placeholder against existing paths', async () => {
    const custom = createFakeTextDocument({
      content: 'openapi: 3.1.0\ninfo:\n  title: T\n  version: 1.0.0\npaths:\n  /new-path: {}\n',
      path: '/custom.yaml',
    });
    uris.push(custom.uri);
    (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue(custom);

    await handlerFor('nouto.openApiOutline.addPath')({ documentUri: custom.uri.toString() });

    const result = appliedText(custom);
    expect(parseAt(result, '/paths/~1new-path-2/get/responses/200/description')).toBe('OK');
    expect(provider.revealPointerOnce).toHaveBeenCalledWith('/paths/~1new-path-2');
  });

  it('addOperation offers only methods the path item lacks', async () => {
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce('PUT');

    await handlerFor('nouto.openApiOutline.addOperation')(
      nodeFor({ pointer: '/paths/~1pets', path: '/pets' })
    );

    const [methods] = (vscode.window.showQuickPick as jest.Mock).mock.calls[0];
    expect(methods).not.toContain('GET');
    expect(methods).not.toContain('POST');
    expect(methods).toContain('PUT');
    const result = appliedText(document);
    expect(parseAt(result, '/paths/~1pets/put/responses/200/description')).toBe('OK');
    expect(provider.revealPointerOnce).toHaveBeenCalledWith('/paths/~1pets/put');
  });

  it('addOperation aborts when the method pick is cancelled', async () => {
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce(undefined);
    await handlerFor('nouto.openApiOutline.addOperation')(nodeFor({ pointer: '/paths/~1pets' }));
    expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
  });

  it('addServer appends a server with optional description', async () => {
    (vscode.window.showInputBox as jest.Mock)
      .mockResolvedValueOnce('https://c.example')
      .mockResolvedValueOnce('Sandbox');

    await handlerFor('nouto.openApiOutline.addServer')(nodeFor());

    const result = appliedText(document);
    expect(parseAt(result, '/servers/2')).toEqual({ url: 'https://c.example', description: 'Sandbox' });
    expect(provider.revealPointerOnce).toHaveBeenCalledWith('/servers/2');
  });

  it('addTag appends a name-only tag when the description is skipped', async () => {
    (vscode.window.showInputBox as jest.Mock)
      .mockResolvedValueOnce('store')
      .mockResolvedValueOnce(undefined);

    await handlerFor('nouto.openApiOutline.addTag')(nodeFor());

    const result = appliedText(document);
    expect(parseAt(result, '/tags/2')).toEqual({ name: 'store' });
  });

  it('addSecurityRequirement builds the requirement from picked schemes', async () => {
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce(['apiKeyAuth']);

    await handlerFor('nouto.openApiOutline.addSecurityRequirement')(nodeFor());

    const [names, options] = (vscode.window.showQuickPick as jest.Mock).mock.calls[0];
    expect(names).toContain('apiKeyAuth');
    expect(options.canPickMany).toBe(true);
    const result = appliedText(document);
    expect(parseAt(result, '/security/2')).toEqual({ apiKeyAuth: [] });
  });

  it('addSecurityRequirement maps the no-auth pick to an empty requirement', async () => {
    (vscode.window.showQuickPick as jest.Mock)
      .mockResolvedValueOnce(['No authentication (optional security)']);

    await handlerFor('nouto.openApiOutline.addSecurityRequirement')(nodeFor());

    const result = appliedText(document);
    expect(parseAt(result, '/security/2')).toEqual({});
  });

  it('addSecurityScheme inserts the picked preset under a unique placeholder name', async () => {
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce('HTTP Bearer');

    await handlerFor('nouto.openApiOutline.addSecurityScheme')(nodeFor());

    expect(vscode.window.showInputBox).not.toHaveBeenCalled();
    const result = appliedText(document);
    expect(parseAt(result, '/components/securitySchemes/bearerAuth'))
      .toEqual({ type: 'http', scheme: 'bearer' });
    expect(provider.revealPointerOnce)
      .toHaveBeenCalledWith('/components/securitySchemes/bearerAuth');
  });

  it('addSecurityScheme uniquifies against existing scheme names', async () => {
    // The fixture already declares apiKeyAuth: the API Key placeholder collides.
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce('API Key');

    await handlerFor('nouto.openApiOutline.addSecurityScheme')(nodeFor());

    const result = appliedText(document);
    expect(parseAt(result, '/components/securitySchemes/apiKeyAuth-2'))
      .toEqual({ type: 'apiKey', in: 'header', name: 'X-API-Key' });
  });

  it('addComponent inserts a placeholder name on section nodes, prompt-free', async () => {
    await handlerFor('nouto.openApiOutline.addComponent')(
      nodeFor({ component: { section: 'schemas' } })
    );

    expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
    expect(vscode.window.showInputBox).not.toHaveBeenCalled();
    const result = appliedText(document);
    expect(parseAt(result, '/components/schemas/NewSchema'))
      .toEqual({ type: 'object', properties: {} });
  });

  it('addComponent asks only for the section on the group node', async () => {
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce('responses');

    await handlerFor('nouto.openApiOutline.addComponent')(nodeFor());

    expect(vscode.window.showInputBox).not.toHaveBeenCalled();
    const result = appliedText(document);
    expect(parseAt(result, '/components/responses/NewResponse')).toEqual({ description: 'OK' });
  });

  it('addComponent routes securitySchemes section nodes to the scheme command', async () => {
    const node = nodeFor({ component: { section: 'securitySchemes' } });

    await handlerFor('nouto.openApiOutline.addComponent')(node);

    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith('nouto.openApiOutline.addSecurityScheme', node);
    expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
  });

  it('addWebhook inserts a placeholder webhook with a POST stub, prompt-free', async () => {
    await handlerFor('nouto.openApiOutline.addWebhook')(nodeFor());

    expect(vscode.window.showInputBox).not.toHaveBeenCalled();
    expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
    const result = appliedText(document);
    expect(parseAt(result, '/webhooks/newWebhook/post/responses/200/description')).toBe('OK');
    expect(provider.revealPointerOnce).toHaveBeenCalledWith('/webhooks/newWebhook');
  });

  it('delete commands remove the node and skip the tree reveal', async () => {
    await handlerFor('nouto.openApiOutline.deletePath')(nodeFor({ pointer: '/paths/~1health' }));

    const result = appliedText(document);
    const paths = parseAt(result, '/paths') as Record<string, unknown>;
    expect(Object.keys(paths)).toEqual(['/pets']);
    expect(provider.revealPointerOnce).not.toHaveBeenCalled();
  });

  it('delete commands surface unresolvable targets as errors', async () => {
    await handlerFor('nouto.openApiOutline.deleteServer')(nodeFor({ pointer: '/servers/9' }));
    expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
    expect(vscode.window.showErrorMessage).toHaveBeenCalled();
  });

  it('delete commands ignore nodes without a pointer', async () => {
    await handlerFor('nouto.openApiOutline.deleteTag')(nodeFor());
    expect(vscode.workspace.openTextDocument).not.toHaveBeenCalled();
  });

  it('refuses to edit documents whose analysis has errors', async () => {
    const broken = createFakeTextDocument({
      content: 'openapi: 3.1.0\ninfo:\n  title: [broken\npaths: {}\n',
      path: '/broken.yaml',
    });
    uris.push(broken.uri);
    (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue(broken);

    await handlerFor('nouto.openApiOutline.deletePath')({
      documentUri: broken.uri.toString(),
      pointer: '/paths/~1pets',
    });

    expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
    expect(vscode.window.showErrorMessage)
      .toHaveBeenCalledWith(expect.stringContaining('has errors'));
  });

  it('surfaces unavailable documents as errors', async () => {
    (vscode.workspace.openTextDocument as jest.Mock).mockRejectedValue(new Error('gone'));
    await handlerFor('nouto.openApiOutline.addServer')(nodeFor());
    expect(vscode.window.showErrorMessage)
      .toHaveBeenCalledWith(expect.stringContaining('no longer available'));
    expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
  });

  it('surfaces unplannable inserts as errors', async () => {
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce('GET');
    // /info/title traverses a primitive: the engine returns no plan.
    await handlerFor('nouto.openApiOutline.addOperation')(nodeFor({ pointer: '/info/title' }));
    expect(vscode.window.showErrorMessage)
      .toHaveBeenCalledWith(expect.stringContaining('Could not edit'));
    expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
  });

  it('wraps unexpected handler failures in an error message', async () => {
    (provider.revealPointerOnce as jest.Mock).mockRejectedValueOnce(new Error('boom'));

    await handlerFor('nouto.openApiOutline.addPath')(nodeFor());

    expect(vscode.window.showErrorMessage)
      .toHaveBeenCalledWith(expect.stringContaining('boom'));
  });

  it('addServer requires a URL and aborts on cancel', async () => {
    (vscode.window.showInputBox as jest.Mock).mockResolvedValueOnce(undefined);
    await handlerFor('nouto.openApiOutline.addServer')(nodeFor());
    expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
    const [options] = (vscode.window.showInputBox as jest.Mock).mock.calls[0];
    expect(options.validateInput('  ')).toMatch(/required/);
    expect(options.validateInput('https://x')).toBeUndefined();
  });

  it('addTag requires a name and aborts on cancel', async () => {
    (vscode.window.showInputBox as jest.Mock).mockResolvedValueOnce(undefined);
    await handlerFor('nouto.openApiOutline.addTag')(nodeFor());
    expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
    const [options] = (vscode.window.showInputBox as jest.Mock).mock.calls[0];
    expect(options.validateInput('')).toMatch(/required/);
  });

  it('addSecurityRequirement aborts when nothing is picked', async () => {
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce([]);
    await handlerFor('nouto.openApiOutline.addSecurityRequirement')(nodeFor());
    expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
  });

  it('addComponent aborts when the section pick is cancelled', async () => {
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce(undefined);
    await handlerFor('nouto.openApiOutline.addComponent')(nodeFor());
    expect(vscode.window.showInputBox).not.toHaveBeenCalled();
    expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
  });

  it('addSecurityScheme aborts when the preset pick is cancelled', async () => {
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValueOnce(undefined);
    await handlerFor('nouto.openApiOutline.addSecurityScheme')(nodeFor());
    expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
  });
});
