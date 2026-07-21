import * as vscode from 'vscode';
import { OpenApiActionService } from './OpenApiActionService';
import { createFakeTextDocument } from '../test/helpers/fakeTextDocument';
import { clearOpenApiDocumentState } from './openapi';

const SPEC = `openapi: 3.1.0
info:
  title: Petstore
  version: 1.0.0
servers:
  - url: https://{host}/v1
    variables:
      host:
        default: api.example.com
paths:
  /pets:
    get:
      summary: List pets
      responses:
        '200':
          description: ok
    query:
      summary: Query pets
      responses:
        '200':
          description: ok
    additionalOperations:
      PURGE:
        summary: Purge pets
        responses:
          '200':
            description: ok
`;

describe('OpenApiActionService', () => {
  let storageService: {
    loadCollections: jest.Mock;
    saveCollections: jest.Mock;
    loadEnvironments: jest.Mock;
    saveEnvironments: jest.Mock;
  };
  let panelManager: { openDraftRequest: jest.Mock };
  let onCollectionsUpdated: jest.Mock;
  let onEnvironmentsUpdated: jest.Mock;
  let service: OpenApiActionService;
  const openedUris: vscode.Uri[] = [];

  function makeDocument(content = SPEC, path = '/petstore.yaml') {
    return createFakeTextDocument({ content, languageId: 'yaml', path });
  }

  /** Makes openTextDocument resolve these documents, keyed by URI string. */
  function setResolvableDocuments(...documents: vscode.TextDocument[]): void {
    (vscode.workspace.openTextDocument as jest.Mock).mockImplementation(
      async (uri: vscode.Uri) => {
        openedUris.push(uri);
        const match = documents.find((document) => document.uri.toString() === uri.toString());
        if (!match) throw new Error(`unknown document ${uri.toString()}`);
        return match;
      }
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    openedUris.length = 0;
    storageService = {
      loadCollections: jest.fn().mockResolvedValue([]),
      saveCollections: jest.fn().mockResolvedValue(true),
      loadEnvironments: jest.fn().mockResolvedValue({ environments: [], activeId: null }),
      saveEnvironments: jest.fn().mockResolvedValue(true),
    };
    panelManager = { openDraftRequest: jest.fn() };
    onCollectionsUpdated = jest.fn();
    onEnvironmentsUpdated = jest.fn();
    service = new OpenApiActionService({
      storageService: storageService as never,
      panelManager,
      onCollectionsUpdated,
      onEnvironmentsUpdated,
    });
    (vscode.window as { activeTextEditor?: unknown }).activeTextEditor = undefined;
  });

  afterEach(() => {
    clearOpenApiDocumentState(vscode.Uri.file('/petstore.yaml'));
  });

  describe('source resolution', () => {
    it('prefers an explicit URI over the active editor', async () => {
      const target = makeDocument(SPEC, '/explicit.yaml');
      const active = makeDocument(SPEC, '/active.yaml');
      setResolvableDocuments(target, active);
      (vscode.window as { activeTextEditor?: unknown }).activeTextEditor = { document: active };

      const source = await service.resolveSource(target.uri);

      expect(source.document.uri.toString()).toBe(target.uri.toString());
      clearOpenApiDocumentState(target.uri);
      clearOpenApiDocumentState(active.uri);
    });

    it('falls back to the active editor', async () => {
      const active = makeDocument(SPEC, '/active.yaml');
      setResolvableDocuments(active);
      (vscode.window as { activeTextEditor?: unknown }).activeTextEditor = { document: active };

      const source = await service.resolveSource();

      expect(source.document.uri.toString()).toBe(active.uri.toString());
      clearOpenApiDocumentState(active.uri);
    });

    it('reads the in-memory text so unsaved edits win over disk', async () => {
      const dirty = makeDocument(SPEC.replace('Petstore', 'Edited'), '/dirty.yaml');
      setResolvableDocuments(dirty);

      const source = await service.resolveSource(dirty.uri);

      // Routed through openTextDocument rather than reading the file itself.
      expect(openedUris).toHaveLength(1);
      expect(source.content).toContain('Edited');
      clearOpenApiDocumentState(dirty.uri);
    });

    it('rejects documents that are not OpenAPI specifications', async () => {
      const plain = makeDocument('name: plain\n', '/plain.yaml');
      setResolvableDocuments(plain);

      await expect(service.resolveSource(plain.uri)).rejects.toThrow(/not a recognized OpenAPI/);
    });

    it('detects JSON and YAML formats', async () => {
      const json = createFakeTextDocument({
        content: JSON.stringify({
          openapi: '3.1.0',
          info: { title: 'J', version: '1' },
          paths: {},
        }),
        languageId: 'json',
        path: '/spec.json',
      });
      const yamlDoc = makeDocument(SPEC, '/spec.yaml');
      setResolvableDocuments(json, yamlDoc);

      expect((await service.resolveSource(json.uri)).format).toBe('json');
      expect((await service.resolveSource(yamlDoc.uri)).format).toBe('yaml');
      clearOpenApiDocumentState(json.uri);
      clearOpenApiDocumentState(yamlDoc.uri);
    });
  });

  describe('tryOperation', () => {
    it('opens the converted operation beside the source without running it', async () => {
      const document = makeDocument();
      setResolvableDocuments(document);

      const outcome = await service.tryOperation({
        uri: document.uri,
        path: '/pets',
        method: 'get',
      });

      expect(outcome.ok).toBe(true);
      expect(panelManager.openDraftRequest).toHaveBeenCalledTimes(1);
      const [request, options] = panelManager.openDraftRequest.mock.calls[0];
      expect(request.name).toBe('List pets');
      expect(request.method).toBe('GET');
      expect(request.url).toBe('https://api.example.com/v1/pets');
      expect(options).toEqual({ viewColumn: vscode.ViewColumn.Beside });
      expect(options).not.toHaveProperty('autoRun');
    });

    it('converts 3.2 query and additionalOperations entries', async () => {
      const document = makeDocument();
      setResolvableDocuments(document);

      const queryOutcome = await service.tryOperation({
        uri: document.uri,
        path: '/pets',
        method: 'query',
      });
      const purgeOutcome = await service.tryOperation({
        uri: document.uri,
        path: '/pets',
        method: 'PURGE',
      });

      expect(queryOutcome.ok).toBe(true);
      expect(purgeOutcome.ok).toBe(true);
      expect(panelManager.openDraftRequest.mock.calls[1][0].method).toBe('PURGE');
    });

    it('returns conversion warnings alongside the opened request', async () => {
      const document = makeDocument(
        SPEC.replace(/servers:[\s\S]*?paths:/, 'paths:'),
        '/nosrv.yaml'
      );
      setResolvableDocuments(document);

      const outcome = await service.tryOperation({
        uri: document.uri,
        path: '/pets',
        method: 'get',
      });

      expect(outcome.ok && outcome.warnings.some((w) => w.includes('no servers'))).toBe(true);
      clearOpenApiDocumentState(document.uri);
    });

    it('opens no panel when the operation does not exist', async () => {
      const document = makeDocument();
      setResolvableDocuments(document);

      const outcome = await service.tryOperation({
        uri: document.uri,
        path: '/missing',
        method: 'get',
      });

      expect(outcome).toEqual({ ok: false, message: expect.stringContaining('/missing') });
      expect(panelManager.openDraftRequest).not.toHaveBeenCalled();
    });
  });

  describe('generateCollection', () => {
    it('appends one collection, saves it, and awaits the sidebar refresh', async () => {
      const document = makeDocument();
      setResolvableDocuments(document);
      const existing = { id: 'c-1', name: 'Existing', items: [] };
      storageService.loadCollections.mockResolvedValue([existing]);

      const outcome = await service.generateCollection(document.uri);

      expect(outcome.ok).toBe(true);
      const saved = storageService.saveCollections.mock.calls[0][0];
      expect(saved).toHaveLength(2);
      expect(saved[0]).toBe(existing);
      expect(saved[1].name).toBe('Petstore v1.0.0');
      expect(onCollectionsUpdated).toHaveBeenCalledTimes(1);
    });

    it('never merges into a same-name collection', async () => {
      const document = makeDocument();
      setResolvableDocuments(document);
      storageService.loadCollections.mockResolvedValue([
        { id: 'c-1', name: 'Petstore v1.0.0', items: [] },
      ]);

      await service.generateCollection(document.uri);

      const saved = storageService.saveCollections.mock.calls[0][0];
      expect(saved).toHaveLength(2);
      expect(saved[1].id).not.toBe('c-1');
    });

    it('offers server variables as an environment only after the collection is stored', async () => {
      const document = makeDocument();
      setResolvableDocuments(document);
      (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Yes');

      const outcome = await service.generateCollection(document.uri);

      if (!outcome.ok) throw new Error('expected success');
      // Storage already happened; the prompt is a separate, later step.
      expect(storageService.saveCollections).toHaveBeenCalled();
      expect(storageService.saveEnvironments).not.toHaveBeenCalled();

      await outcome.promptEnvironment?.();

      expect(storageService.saveEnvironments).toHaveBeenCalled();
      expect(onEnvironmentsUpdated).toHaveBeenCalled();
    });

    it('leaves only the collection when the environment prompt is declined', async () => {
      const document = makeDocument();
      setResolvableDocuments(document);
      (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('No');

      const outcome = await service.generateCollection(document.uri);
      if (!outcome.ok) throw new Error('expected success');
      await outcome.promptEnvironment?.();

      expect(storageService.saveEnvironments).not.toHaveBeenCalled();
    });

    it('leaves only the collection when the prompt is dismissed', async () => {
      const document = makeDocument();
      setResolvableDocuments(document);
      (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);

      const outcome = await service.generateCollection(document.uri);
      if (!outcome.ok) throw new Error('expected success');
      await outcome.promptEnvironment?.();

      expect(storageService.saveEnvironments).not.toHaveBeenCalled();
    });

    it('reports partial success when only the environment fails to save', async () => {
      const document = makeDocument();
      setResolvableDocuments(document);
      (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Yes');
      storageService.saveEnvironments.mockRejectedValue(new Error('disk full'));

      const outcome = await service.generateCollection(document.uri);
      if (!outcome.ok) throw new Error('expected success');
      await outcome.promptEnvironment?.();

      const message = (vscode.window.showErrorMessage as jest.Mock).mock.calls[0][0] as string;
      expect(message).toContain('was saved');
      expect(message).toContain('disk full');
      expect(storageService.saveCollections).toHaveBeenCalled();
    });

    it('fails without saving when the document cannot be converted', async () => {
      const document = makeDocument(
        'openapi: 3.1.0\ninfo:\n  title: Broken\n  version: 1.0.0\n',
        '/broken.yaml'
      );
      setResolvableDocuments(document);

      const outcome = await service.generateCollection(document.uri);

      expect(outcome.ok).toBe(false);
      expect(storageService.saveCollections).not.toHaveBeenCalled();
      clearOpenApiDocumentState(document.uri);
    });

    it('reports storage failures', async () => {
      const document = makeDocument();
      setResolvableDocuments(document);
      storageService.saveCollections.mockRejectedValue(new Error('read-only'));

      const outcome = await service.generateCollection(document.uri);

      expect(outcome).toEqual({ ok: false, message: 'read-only' });
    });

    it('warns that webhooks were skipped', async () => {
      const document = makeDocument(
        `${SPEC}webhooks:\n  petCreated:\n    post:\n      responses:\n        '200':\n          description: ok\n`,
        '/hooks.yaml'
      );
      setResolvableDocuments(document);

      const outcome = await service.generateCollection(document.uri);

      expect(outcome.ok && outcome.warnings.some((w) => w.includes('webhook'))).toBe(true);
      clearOpenApiDocumentState(document.uri);
    });
  });

  it('serializes actions on the same document', async () => {
    const document = makeDocument();
    setResolvableDocuments(document);
    const order: string[] = [];
    storageService.saveCollections.mockImplementation(async () => {
      order.push('save:start');
      await new Promise((resolve) => setTimeout(resolve, 0));
      order.push('save:end');
    });

    await Promise.all([
      service.generateCollection(document.uri),
      service.generateCollection(document.uri),
    ]);

    expect(order).toEqual(['save:start', 'save:end', 'save:start', 'save:end']);
  });
});
