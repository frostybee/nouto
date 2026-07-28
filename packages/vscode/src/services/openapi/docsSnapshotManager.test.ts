import * as vscode from 'vscode';
import { OpenApiDocsSnapshotManager } from './docsSnapshotManager';
import { clearOpenApiDocumentState } from './index';
import { createFakeTextDocument } from '../../test/helpers/fakeTextDocument';

const vscodeMock = vscode as typeof vscode & {
  __fireDidChangeTextDocument(document: vscode.TextDocument): void;
  __fireDidCloseTextDocument(document: vscode.TextDocument): void;
};

const VALID = `openapi: 3.1.0
info: { title: Snap, version: 1.0.0 }
paths: {}
`;

const INVALID = 'openapi: 3.1.0\ninfo: [broken\n';

describe('OpenApiDocsSnapshotManager', () => {
  let manager: OpenApiDocsSnapshotManager;
  const documents: vscode.TextDocument[] = [];
  const writeFile = vscode.workspace.fs.writeFile as jest.Mock;
  const folder = vscode.Uri.file('/storage/openapi-docs/snap-1');

  beforeEach(() => {
    jest.useFakeTimers();
    writeFile.mockClear();
    writeFile.mockResolvedValue(undefined);
    manager = new OpenApiDocsSnapshotManager(
      { resolve: (fromUri, refPath) => new URL(refPath, fromUri).toString(), load: async () => undefined },
      { globalState: { get: () => undefined } } as unknown as vscode.ExtensionContext
    );
    manager.start();
  });

  afterEach(() => {
    manager.dispose();
    for (const document of documents) clearOpenApiDocumentState(document.uri);
    documents.length = 0;
    jest.useRealTimers();
  });

  function doc(content: string, version = 1, path = '/snap.yaml') {
    const document = createFakeTextDocument({ content, version, path, languageId: 'yaml' });
    documents.push(document);
    return document;
  }

  async function settle(): Promise<void> {
    jest.advanceTimersByTime(500);
    // Let the async bundle + writeFile promise chain resolve.
    for (let i = 0; i < 15; i += 1) await Promise.resolve();
  }

  it('rewrites only spec.js on a debounced document change', async () => {
    const document = doc(VALID);
    manager.register(document, folder);

    vscodeMock.__fireDidChangeTextDocument(doc(VALID, 2));
    expect(writeFile).not.toHaveBeenCalled(); // debounced, not immediate
    await settle();

    expect(writeFile).toHaveBeenCalledTimes(1);
    const [uri, bytes] = writeFile.mock.calls[0];
    expect(String(uri.path)).toContain('spec.js');
    expect(new TextDecoder().decode(bytes)).toContain('window.__NOUTO_OPENAPI_SPEC = ');
  });

  it('coalesces rapid changes into one write', async () => {
    const document = doc(VALID);
    manager.register(document, folder);

    vscodeMock.__fireDidChangeTextDocument(doc(VALID, 2));
    jest.advanceTimersByTime(100);
    vscodeMock.__fireDidChangeTextDocument(doc(VALID, 3));
    await settle();

    expect(writeFile).toHaveBeenCalledTimes(1);
  });

  it('keeps the last valid payload when the document stops parsing', async () => {
    const document = doc(VALID);
    manager.register(document, folder);

    vscodeMock.__fireDidChangeTextDocument(doc(INVALID, 2));
    await settle();

    expect(writeFile).not.toHaveBeenCalled();
  });

  it('ignores changes to unregistered documents', async () => {
    vscodeMock.__fireDidChangeTextDocument(doc(VALID, 1, '/other.yaml'));
    await settle();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('stops updating after the document closes', async () => {
    const document = doc(VALID);
    manager.register(document, folder);
    vscodeMock.__fireDidCloseTextDocument(document);

    vscodeMock.__fireDidChangeTextDocument(doc(VALID, 2));
    await settle();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('writes a bundled spec for documents with external refs', async () => {
    const EXT = `openapi: 3.1.0
info: { title: Snap, version: 1.0.0 }
paths: {}
components:
  schemas:
    Item:
      $ref: './common.yaml#/Item'
`;
    manager.dispose();
    manager = new OpenApiDocsSnapshotManager(
      {
        resolve: (fromUri, refPath) => new URL(refPath, fromUri).toString(),
        load: async (uri) =>
          uri === 'file:///bundle/common.yaml'
            ? { content: 'Item:\n  type: string\n', format: 'yaml' }
            : undefined,
      },
      { globalState: { get: () => undefined } } as unknown as vscode.ExtensionContext
    );
    manager.start();

    const document = doc(EXT, 1, '/bundle/snap.yaml');
    manager.register(document, folder);
    vscodeMock.__fireDidChangeTextDocument(doc(EXT, 2, '/bundle/snap.yaml'));
    await settle();

    expect(writeFile).toHaveBeenCalledTimes(1);
    const written = new TextDecoder().decode(writeFile.mock.calls[0][1]);
    expect(written).toContain('#/components/schemas/Item_2');
    expect(written).not.toContain('./common.yaml');
  });

  it('unregisters when the snapshot folder was removed out from under it', async () => {
    const document = doc(VALID);
    manager.register(document, folder);
    writeFile.mockRejectedValueOnce(new Error('ENOENT'));

    vscodeMock.__fireDidChangeTextDocument(doc(VALID, 2));
    await settle();
    expect(writeFile).toHaveBeenCalledTimes(1);

    writeFile.mockClear();
    vscodeMock.__fireDidChangeTextDocument(doc(VALID, 3));
    await settle();
    expect(writeFile).not.toHaveBeenCalled();
  });
});
