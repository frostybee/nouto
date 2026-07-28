import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { OpenApiOutlineProvider } from './OpenApiOutlineProvider';
import { clearOpenApiDocumentState } from '../services/openapi';
import { fireNoutoSettingsChanged } from '../services/settingsEvents';
import { createFakeTextDocument } from '../test/helpers/fakeTextDocument';
import type { OutlineNode } from './openapi-outline/nodes';

const mocked = vscode as unknown as {
  __treeViews: Map<string, {
    visible: boolean;
    reveal: jest.Mock;
    dispose: jest.Mock;
    options: { showCollapseAll?: boolean };
  }>;
  __fireDidChangeActiveTextEditor(editor: unknown): void;
  __fireDidChangeTextDocument(document: unknown): void;
  __fireDidCloseTextDocument(document: unknown): void;
  __fireDidChangeTextEditorSelection(event: unknown): void;
  __setOpenTabs(uris: unknown[]): void;
  window: { activeTextEditor: unknown };
};

const fixtureContent = fs.readFileSync(
  path.join(__dirname, '../services/openapi/__fixtures__/outline-full.yaml'),
  'utf8'
);

function specDocument(docPath = '/outline-full.yaml', version = 1) {
  return createFakeTextDocument({ content: fixtureContent, path: docPath, version });
}

function selectionEventAt(document: vscode.TextDocument, offset: number) {
  const position = document.positionAt(offset);
  return {
    textEditor: {
      document,
      selection: { active: position, anchor: position },
    },
  };
}

describe('OpenApiOutlineProvider', () => {
  let provider: OpenApiOutlineProvider;
  let settingsBlob: Record<string, unknown>;
  const uris: vscode.Uri[] = [];

  function fakeContext(): vscode.ExtensionContext {
    return {
      globalState: {
        get: (key: string) => (key === 'nouto.settings' ? settingsBlob : undefined),
      },
    } as unknown as vscode.ExtensionContext;
  }

  function startWithDocument(document: vscode.TextDocument): void {
    uris.push(document.uri);
    mocked.window.activeTextEditor = { document };
    provider.start();
  }

  function treeView() {
    return mocked.__treeViews.get(OpenApiOutlineProvider.viewId)!;
  }

  const fakeResolver = {
    resolve: (fromUri: string, refPath: string) => new URL(refPath, fromUri).toString(),
    load: async () => undefined as { content: string; format: 'yaml' | 'json' } | undefined,
  };

  beforeEach(() => {
    jest.useFakeTimers();
    settingsBlob = {};
    provider = new OpenApiOutlineProvider(fakeContext(), fakeResolver);
  });

  afterEach(() => {
    provider.dispose();
    for (const uri of uris) clearOpenApiDocumentState(uri);
    uris.length = 0;
    mocked.window.activeTextEditor = undefined;
    jest.useRealTimers();
  });

  describe('Referenced files (async external pass)', () => {
    const EXT_SPEC = [
      'openapi: 3.1.0',
      'info:',
      '  title: T',
      '  version: 1.0.0',
      'paths: {}',
      'components:',
      '  schemas:',
      '    Item:',
      "      $ref: './common.yaml#/Item'",
      '',
    ].join('\n');
    const COMMON = { content: 'Item:\n  type: string\n', format: 'yaml' as const };

    async function flush(): Promise<void> {
      for (let i = 0; i < 20; i += 1) await Promise.resolve();
    }

    function useResolver(files: Record<string, { content: string; format: 'yaml' | 'json' }>) {
      provider.dispose();
      provider = new OpenApiOutlineProvider(fakeContext(), {
        resolve: (fromUri: string, refPath: string) => new URL(refPath, fromUri).toString(),
        load: async (uri: string) => files[uri],
      });
    }

    function externalDocument(dir: string) {
      return createFakeTextDocument({ content: EXT_SPEC, path: `${dir}/api.yaml` });
    }

    it('appends the group once external refs resolve, with click-through children', async () => {
      useResolver({ 'file:///outline-ext/common.yaml': COMMON });
      const document = externalDocument('/outline-ext');
      startWithDocument(document);
      expect(provider.getChildren().map((node) => node.label)).not.toContain('Referenced files');

      await flush();

      const group = provider.getChildren().find((node) => node.label === 'Referenced files')!;
      expect(group).toBeDefined();
      const file = group.children[0];
      expect(file.label).toBe('common.yaml');
      const child = file.children[0];
      const item = provider.getTreeItem(child);
      expect(item.command).toMatchObject({ command: 'nouto.openApiOutline.reveal' });
      expect((item.command!.arguments![0] as OutlineNode).documentUri).toBe(
        'file:///outline-ext/common.yaml'
      );
    });

    it('skips the pass when externalRefsEnabled is off', async () => {
      settingsBlob = { openApiExternalRefsEnabled: false };
      useResolver({ 'file:///outline-off/common.yaml': COMMON });
      startWithDocument(externalDocument('/outline-off'));

      await flush();

      expect(provider.getChildren().map((node) => node.label)).not.toContain('Referenced files');
    });

    it('discards a superseded pass after the outline moves to another document', async () => {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      provider.dispose();
      provider = new OpenApiOutlineProvider(fakeContext(), {
        resolve: (fromUri: string, refPath: string) => new URL(refPath, fromUri).toString(),
        load: async (uri: string) => {
          await gate;
          return uri === 'file:///outline-race/common.yaml' ? COMMON : undefined;
        },
      });
      const external = externalDocument('/outline-race');
      startWithDocument(external);

      // The outline re-targets to a plain spec before the load completes.
      const plain = specDocument('/outline-race-other.yaml');
      uris.push(plain.uri);
      mocked.__fireDidChangeActiveTextEditor({ document: plain });

      release();
      await flush();

      expect(provider.getChildren().map((node) => node.label)).not.toContain('Referenced files');
      expect(provider.getChildren().map((node) => node.label)).toContain('Paths');
    });
  });

  it('builds the outline from the active editor on start', () => {
    startWithDocument(specDocument());
    const roots = provider.getChildren();
    expect(roots.map((node) => node.label)).toContain('Paths');
    expect(treeView().options.showCollapseAll).toBe(true);
  });

  it('produces collapsed tree items with theme icons and reveal commands', () => {
    startWithDocument(specDocument());
    const paths = provider.getChildren().find((node) => node.label === 'Paths')!;
    const groupItem = provider.getTreeItem(paths);
    expect(groupItem.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
    expect((groupItem.iconPath as vscode.ThemeIcon).id).toBe('list-tree');

    // Operations nest their own surface (responses, tags, …), so they are
    // collapsible and the leaves sit one level deeper.
    const operation = paths.children[0].children[0];
    expect(provider.getTreeItem(operation).collapsibleState)
      .toBe(vscode.TreeItemCollapsibleState.Collapsed);

    const leaf = operation.children[0].children[0];
    const leafItem = provider.getTreeItem(leaf);
    expect(leafItem.collapsibleState).toBe(vscode.TreeItemCollapsibleState.None);
    expect(leafItem.command).toMatchObject({
      command: 'nouto.openApiOutline.reveal',
      arguments: [leaf],
    });
    expect(leafItem.id).toBe(leaf.id);
  });

  it('round-trips getParent for deep nodes', () => {
    startWithDocument(specDocument());
    const components = provider.getChildren().find((node) => node.label === 'Components')!;
    const schema = components.children[0].children[0];
    expect(provider.getParent(schema)).toBe(components.children[0]);
    expect(provider.getParent(components)).toBeUndefined();
  });

  it('clears the outline when a non-OpenAPI editor becomes active', () => {
    startWithDocument(specDocument());
    const other = createFakeTextDocument({
      content: 'const nope = 1;\n',
      languageId: 'typescript',
      path: '/app.ts',
    });
    mocked.__fireDidChangeActiveTextEditor({ document: other });
    expect(provider.getChildren()).toEqual([]);
  });

  it('keeps the outline when focus moves to a non-editor surface', () => {
    startWithDocument(specDocument());
    mocked.__fireDidChangeActiveTextEditor(undefined);
    expect(provider.getChildren().length).toBeGreaterThan(0);
  });

  it('rebuilds after a debounced document change', () => {
    const document = specDocument();
    startWithDocument(document);
    const changed = jest.fn();
    provider.onDidChangeTreeData(changed);

    mocked.__fireDidChangeTextDocument(document);
    expect(changed).not.toHaveBeenCalled();
    jest.advanceTimersByTime(400);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('clears state when the current document closes', () => {
    const document = specDocument();
    startWithDocument(document);
    mocked.__fireDidCloseTextDocument(document);
    expect(provider.getChildren()).toEqual([]);
  });

  it('clears when the last tab showing the document closes', () => {
    const document = specDocument();
    startWithDocument(document);
    // Another file's tab remains: the spec's own tab is gone.
    mocked.__setOpenTabs([vscode.Uri.file('/other.yaml')]);
    expect(provider.getChildren()).toEqual([]);
  });

  it('keeps the outline while any tab still shows the document', () => {
    const document = specDocument();
    startWithDocument(document);
    mocked.__setOpenTabs([document.uri, vscode.Uri.file('/other.yaml')]);
    expect(provider.getChildren().length).toBeGreaterThan(0);
  });

  it('reveals the nearest outline node for the editor cursor', () => {
    const document = specDocument();
    startWithDocument(document);
    // Cursor inside `summary: List pets` resolves to the GET /pets operation.
    const offset = fixtureContent.indexOf('List pets');
    mocked.__fireDidChangeTextEditorSelection(selectionEventAt(document, offset));
    jest.advanceTimersByTime(150);

    expect(treeView().reveal).toHaveBeenCalledTimes(1);
    const [node, options] = treeView().reveal.mock.calls[0] as [OutlineNode, object];
    expect(node.label).toBe('GET /pets');
    expect(node.parent?.label).toBe('/pets');
    expect(options).toEqual({ select: true, focus: false, expand: true });
  });

  it('maps deep cursor positions to their nearest ancestor node', () => {
    const document = specDocument();
    startWithDocument(document);
    // Inside `type: object` of the Pet schema: no node for /properties depth.
    const offset = fixtureContent.indexOf('type: object');
    mocked.__fireDidChangeTextEditorSelection(selectionEventAt(document, offset));
    jest.advanceTimersByTime(150);

    const [node] = treeView().reveal.mock.calls[0] as [OutlineNode];
    expect(node.label).toBe('Pet');
  });

  it('suppresses exactly one selection sync after a reveal command', () => {
    const document = specDocument();
    startWithDocument(document);
    const offset = fixtureContent.indexOf('List pets');

    provider.suppressSelectionSyncOnce();
    mocked.__fireDidChangeTextEditorSelection(selectionEventAt(document, offset));
    jest.advanceTimersByTime(150);
    expect(treeView().reveal).not.toHaveBeenCalled();

    mocked.__fireDidChangeTextEditorSelection(selectionEventAt(document, offset));
    jest.advanceTimersByTime(150);
    expect(treeView().reveal).toHaveBeenCalledTimes(1);
  });

  it('ignores selection events from other documents', () => {
    const document = specDocument();
    startWithDocument(document);
    const other = createFakeTextDocument({ content: 'openapi: 3.1.0\n', path: '/other.yaml' });
    uris.push(other.uri);
    mocked.__fireDidChangeTextEditorSelection(selectionEventAt(other, 0));
    jest.advanceTimersByTime(150);
    expect(treeView().reveal).not.toHaveBeenCalled();
  });

  it('refresh() rebuilds against the current document version', () => {
    startWithDocument(specDocument());
    const changed = jest.fn();
    provider.onDidChangeTreeData(changed);
    provider.refresh();
    expect(changed).toHaveBeenCalledTimes(1);
    expect(provider.getChildren().length).toBeGreaterThan(0);
  });

  it('revealPointerOnce bypasses the debounce and selects the pointer node', async () => {
    const document = specDocument();
    startWithDocument(document);
    const changed = jest.fn();
    provider.onDidChangeTreeData(changed);
    // A pending debounced rebuild must be superseded, not doubled.
    mocked.__fireDidChangeTextDocument(document);

    await provider.revealPointerOnce('/paths/~1pets');

    expect(changed).toHaveBeenCalledTimes(1);
    const [node, options] = treeView().reveal.mock.calls[0] as [OutlineNode, object];
    expect(node.label).toBe('/pets');
    expect(options).toEqual({ select: true, focus: false, expand: true });
    jest.advanceTimersByTime(400);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('revealPointerOnce ignores unknown pointers and missing documents', async () => {
    await provider.revealPointerOnce('/paths/~1pets');
    startWithDocument(specDocument());
    await provider.revealPointerOnce('/paths/~1missing');
    expect(treeView().reveal).not.toHaveBeenCalled();
  });

  it('close() detaches the document and publishes the has-document key', () => {
    const executeCommand = (vscode.commands.executeCommand as jest.Mock);
    startWithDocument(specDocument());
    expect(executeCommand).toHaveBeenCalledWith(
      'setContext', 'nouto.openApiOutlineHasDocument', true
    );

    executeCommand.mockClear();
    provider.close();

    expect(provider.getChildren()).toEqual([]);
    expect(provider.document).toBeUndefined();
    expect(executeCommand).toHaveBeenCalledWith(
      'setContext', 'nouto.openApiOutlineHasDocument', false
    );
  });

  it('publishes the has-errors context key on rebuild and clear', () => {
    const executeCommand = (vscode.commands.executeCommand as jest.Mock);
    executeCommand.mockClear();
    const document = specDocument();
    startWithDocument(document);
    expect(executeCommand).toHaveBeenCalledWith(
      'setContext', 'nouto.openApiOutlineHasErrors', false
    );

    executeCommand.mockClear();
    mocked.__fireDidCloseTextDocument(document);
    expect(executeCommand).toHaveBeenCalledWith(
      'setContext', 'nouto.openApiOutlineHasErrors', false
    );
  });

  it('publishes the sort context key from the persisted setting on start', () => {
    const executeCommand = (vscode.commands.executeCommand as jest.Mock);
    settingsBlob = { openApiOutlineSortAlphabetically: true };
    executeCommand.mockClear();
    startWithDocument(specDocument());
    expect(executeCommand).toHaveBeenCalledWith(
      'setContext', 'nouto.openApiOutlineSortAlphabetically', true
    );
  });

  it('refreshes and re-syncs the sort key when settings change', () => {
    const executeCommand = (vscode.commands.executeCommand as jest.Mock);
    startWithDocument(specDocument());
    const changed = jest.fn();
    provider.onDidChangeTreeData(changed);

    settingsBlob = { openApiOutlineSortAlphabetically: true };
    executeCommand.mockClear();
    fireNoutoSettingsChanged();

    expect(changed).toHaveBeenCalledTimes(1);
    expect(executeCommand).toHaveBeenCalledWith(
      'setContext', 'nouto.openApiOutlineSortAlphabetically', true
    );
  });

  it('stops reacting to events after dispose', () => {
    const document = specDocument();
    startWithDocument(document);
    provider.dispose();
    expect(treeView().dispose).toHaveBeenCalled();

    const rebuilt = jest.fn();
    provider.onDidChangeTreeData?.(rebuilt);
    mocked.__fireDidChangeTextDocument(document);
    jest.advanceTimersByTime(400);
    expect(rebuilt).not.toHaveBeenCalled();
  });
});
