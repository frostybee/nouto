import { describe, it, expect, beforeEach, vi } from 'vitest';

const dialogMocks = vi.hoisted(() => ({ save: vi.fn(), open: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => dialogMocks);

const fsMocks = vi.hoisted(() => ({ writeTextFile: vi.fn(), readTextFile: vi.fn() }));
vi.mock('@tauri-apps/plugin-fs', () => fsMocks);

const notificationMocks = vi.hoisted(() => ({ showNotification: vi.fn() }));
vi.mock('@nouto/ui/stores/notifications.svelte', () => notificationMocks);

import { initImportExport, generateCollectionFromOpenApi } from './import-export.svelte';
import { collections, setCollections } from '@nouto/ui/stores/collections.svelte';
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
    sent = [];
    localCollections = [];
    setCollections([]);
    initImportExport({
      messageBus: { send: (m: any) => sent.push(m) } as any,
      getCollections: () => localCollections,
      setCollections: (c) => { localCollections = c; },
    });
  });

  it('appends the generated collection and persists it', () => {
    const outcome = generateCollectionFromOpenApi(SPEC_YAML, 'yaml');

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

  it('stores each operation exactly once', () => {
    generateCollectionFromOpenApi(SPEC_YAML, 'yaml');
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

  it('surfaces discovered server variables as a passive toast', () => {
    generateCollectionFromOpenApi(SPEC_YAML, 'yaml');
    expect(notificationMocks.showNotification).toHaveBeenCalledWith(
      'info',
      expect.stringMatching(/Found \d+ server\/path variables/)
    );
  });

  it('reports parse failures without appending anything', () => {
    const outcome = generateCollectionFromOpenApi('not: [valid openapi', 'yaml');

    expect(outcome.ok).toBe(false);
    expect(collections()).toHaveLength(0);
    expect(sent).toHaveLength(0);
    expect(notificationMocks.showNotification).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('Generate Collection failed')
    );
  });

  it('works with JSON documents', () => {
    const json = JSON.stringify({
      openapi: '3.0.3',
      info: { title: 'JSON API', version: '1.0.0' },
      paths: { '/things': { get: { responses: { '200': { description: 'OK' } } } } },
    });
    const outcome = generateCollectionFromOpenApi(json, 'json');
    expect(outcome.ok).toBe(true);
    expect(collections()[0].name).toContain('JSON API');
  });
});
