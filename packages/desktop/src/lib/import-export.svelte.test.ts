import { describe, it, expect, beforeEach, vi } from 'vitest';

const dialogMocks = vi.hoisted(() => ({ save: vi.fn(), open: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => dialogMocks);

const fsMocks = vi.hoisted(() => ({ writeTextFile: vi.fn(), readTextFile: vi.fn() }));
vi.mock('@tauri-apps/plugin-fs', () => fsMocks);

const notificationMocks = vi.hoisted(() => ({ showNotification: vi.fn() }));
vi.mock('@nouto/ui/stores/notifications.svelte', () => notificationMocks);

const tauriMocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => tauriMocks);

const bundleMocks = vi.hoisted(() => ({ bundleSpecForRender: vi.fn() }));
vi.mock('./openapi/bundleForRender', () => bundleMocks);

import { initImportExport, generateCollectionFromOpenApi } from './import-export.svelte';
import { collections, setCollections } from '@nouto/ui/stores/collections.svelte';
import { getSession, openSession, resetAllSessions } from './openapi/session.svelte';
import type { ExternalAnalysisResult } from '@nouto/core/services/openapi/externalRefs';
import type { Collection } from '@nouto/core';

const SPEC_YAML = `openapi: 3.1.0
info:
  title: Pet API
  version: 1.0.0
servers:
  - url: https://{host}/v1
    variables:
      host:
        default: api.example.com
paths:
  /pets:
    get:
      operationId: listPets
      responses:
        '200': { description: OK }
    post:
      operationId: createPet
      responses:
        '201': { description: Created }
`;

describe('generateCollectionFromOpenApi', () => {
  let sent: any[];
  let localCollections: Collection[];

  beforeEach(() => {
    notificationMocks.showNotification.mockReset();
    tauriMocks.invoke.mockReset();
    tauriMocks.invoke.mockResolvedValue([]);
    bundleMocks.bundleSpecForRender.mockReset();
    resetAllSessions();
    sent = [];
    localCollections = [];
    setCollections([]);
    initImportExport({
      messageBus: { send: (m: any) => sent.push(m) } as any,
      getCollections: () => localCollections,
      setCollections: (c) => { localCollections = c; },
    });
  });

  it('appends the generated collection and persists it', async () => {
    const id = openSession('/tmp/pets.yaml', SPEC_YAML, 'yaml');
    const outcome = await generateCollectionFromOpenApi(id);

    expect(outcome.ok).toBe(true);
    expect(collections()).toHaveLength(1);
    expect(collections()[0].name).toContain('Pet API');
    expect(localCollections).toHaveLength(1);

    const saves = sent.filter((m) => m.type === 'saveCollections');
    expect(saves).toHaveLength(1);
    expect(saves[0].data).toHaveLength(1);

    expect(notificationMocks.showNotification).toHaveBeenCalledWith(
      'info',
      expect.stringContaining('Generated collection "Pet API')
    );
  });

  it('stores each operation exactly once', async () => {
    await generateCollectionFromOpenApi(openSession('/tmp/pets.yaml', SPEC_YAML, 'yaml'));
    const items = collections()[0].items;
    const requestNames: string[] = [];
    const walk = (nodes: any[]) => {
      for (const node of nodes) {
        if (node.type === 'folder') walk(node.children);
        else requestNames.push(node.name);
      }
    };
    walk(items as any[]);
    expect(requestNames).toHaveLength(2);
    expect(new Set(requestNames).size).toBe(2);
  });

  it('surfaces discovered server variables as a passive toast', async () => {
    await generateCollectionFromOpenApi(openSession('/tmp/pets.yaml', SPEC_YAML, 'yaml'));
    expect(notificationMocks.showNotification).toHaveBeenCalledWith(
      'info',
      expect.stringMatching(/Found \d+ server\/path variables/)
    );
  });

  it('reports parse failures without appending anything', async () => {
    const outcome = await generateCollectionFromOpenApi(
      openSession('/tmp/bad.yaml', 'not: [valid openapi', 'yaml')
    );

    expect(outcome.ok).toBe(false);
    expect(collections()).toHaveLength(0);
    expect(sent).toHaveLength(0);
    expect(notificationMocks.showNotification).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('Generate Collection failed')
    );
  });

  it('works with JSON documents', async () => {
    const json = JSON.stringify({
      openapi: '3.0.3',
      info: { title: 'JSON API', version: '1.0.0' },
      paths: { '/things': { get: { responses: { '200': { description: 'OK' } } } } },
    });
    const outcome = await generateCollectionFromOpenApi(openSession('/tmp/api.json', json, 'json'));
    expect(outcome.ok).toBe(true);
    expect(collections()[0].name).toContain('JSON API');
  });

  it('fails gracefully for an unknown session id', async () => {
    const outcome = await generateCollectionFromOpenApi('doc-nope');
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toMatch(/No OpenAPI document/);
    expect(collections()).toHaveLength(0);
  });

  it('converts cross-file documents from the bundled spec and flags incomplete bundles', async () => {
    const id = openSession('/tmp/pets.yaml', SPEC_YAML, 'yaml');
    getSession(id)!.externalAnalysis = {
      diagnostics: [],
      externalRefs: new Map([['./common.yaml#/components/schemas/Pet', {}]]),
      resolvedFiles: new Map(),
      referencedFiles: new Set(['file:///tmp/common.yaml']),
    } as unknown as ExternalAnalysisResult;
    bundleMocks.bundleSpecForRender.mockResolvedValue({
      spec: {
        openapi: '3.1.0',
        info: { title: 'Bundled API', version: '2.0.0' },
        paths: { '/pets': { get: { operationId: 'listPets', responses: { '200': { description: 'OK' } } } } },
      },
      externalRefsIncomplete: true,
    });

    const outcome = await generateCollectionFromOpenApi(id);
    expect(outcome.ok).toBe(true);
    // The bundled title proves the bundle (not the raw buffer) was converted.
    expect(collections()[0].name).toContain('Bundled API');
    expect(notificationMocks.showNotification).toHaveBeenCalledWith(
      'warning',
      expect.stringContaining('may be incomplete')
    );
  });
});
