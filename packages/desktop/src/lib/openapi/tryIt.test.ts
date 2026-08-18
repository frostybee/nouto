import { describe, it, expect, beforeEach, vi } from 'vitest';

const tauriMocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => tauriMocks);

const tabsMocks = vi.hoisted(() => ({
  createRequestTab: vi.fn(),
  openTab: vi.fn(),
}));
vi.mock('@nouto/ui/stores/tabs.svelte', () => tabsMocks);

const notificationMocks = vi.hoisted(() => ({ showNotification: vi.fn() }));
vi.mock('@nouto/ui/stores/notifications.svelte', () => notificationMocks);

const bundleMocks = vi.hoisted(() => ({ bundleSpecForRender: vi.fn() }));
vi.mock('./bundleForRender', () => bundleMocks);

import { initTryIt, tryOperation } from './tryIt';
import { getSession, openApiSession, openSession, resetAllSessions } from './session.svelte';
import type { ExternalAnalysisResult } from '@nouto/core/services/openapi/externalRefs';

const SPEC_YAML = `openapi: 3.1.0
info:
  title: Pet API
  version: 1.0.0
servers:
  - url: https://api.example.com/v1
paths:
  /pets/{petId}:
    get:
      operationId: getPet
      summary: Get a pet
      parameters:
        - name: petId
          in: path
          required: true
          schema: { type: string }
        - name: verbose
          in: query
          schema: { type: boolean }
      responses:
        '200': { description: OK }
`;

function freshTab(): Record<string, any> {
  return {
    id: 'tab-test',
    type: 'request',
    label: 'New Request',
    icon: 'GET',
    closable: true,
    dirty: false,
    method: 'GET',
    url: '',
    params: [],
    pathParams: [],
    headers: [],
    auth: { type: 'none' },
    body: { type: 'none', content: '' },
  };
}

describe('tryOperation', () => {
  let tab: Record<string, any>;
  let setView: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tauriMocks.invoke.mockReset();
    tauriMocks.invoke.mockResolvedValue([]);
    tabsMocks.createRequestTab.mockReset();
    tabsMocks.openTab.mockReset();
    notificationMocks.showNotification.mockReset();
    resetAllSessions();
    bundleMocks.bundleSpecForRender.mockReset();
    tab = freshTab();
    tabsMocks.createRequestTab.mockReturnValue(tab);
    setView = vi.fn();
    initTryIt({ setView });
  });

  it('opens a prefilled unsaved tab and switches to the main view', async () => {
    openSession('/tmp/pets.yaml', SPEC_YAML, 'yaml');
    const outcome = await tryOperation('/pets/{petId}', 'get');

    expect(outcome.ok).toBe(true);
    expect(tabsMocks.createRequestTab).toHaveBeenCalledWith(expect.any(String), null, null, null);
    expect(tab.method).toBe('GET');
    expect(tab.icon).toBe('GET');
    expect(tab.url).toContain('/pets/');
    expect(tabsMocks.openTab).toHaveBeenCalledWith(tab);
    expect(setView).toHaveBeenCalledWith('main');
    expect(openApiSession.selectedOperation).toEqual({ path: '/pets/{petId}', method: 'get' });
  });

  it('uses the current unsaved buffer, not the saved content', async () => {
    openSession('/tmp/pets.yaml', SPEC_YAML, 'yaml');
    // Simulate an unsaved edit adding a second operation, without waiting
    // for the analysis debounce — tryOperation reads content directly.
    openApiSession.content =
      SPEC_YAML +
      `  /toys:
    get:
      operationId: listToys
      responses:
        '200': { description: OK }
`;
    const outcome = await tryOperation('/toys', 'get');
    expect(outcome.ok).toBe(true);
    expect(tabsMocks.openTab).toHaveBeenCalled();
    // Single-file document: converted from the raw buffer, never the bundle.
    expect(bundleMocks.bundleSpecForRender).not.toHaveBeenCalled();
  });

  it('reports a conversion error without throwing and shows a toast', async () => {
    openSession('/tmp/pets.yaml', SPEC_YAML, 'yaml');
    const outcome = await tryOperation('/nope', 'get');

    expect(outcome.ok).toBe(false);
    expect(outcome.message).toMatch(/not found/);
    expect(notificationMocks.showNotification).toHaveBeenCalledWith(
      'error',
      expect.stringMatching(/not found/),
    );
    expect(tabsMocks.openTab).not.toHaveBeenCalled();
    expect(setView).not.toHaveBeenCalled();
  });

  it('fails gracefully when no document is open', async () => {
    const outcome = await tryOperation('/pets/{petId}', 'get');
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toMatch(/No OpenAPI document/);
    expect(tabsMocks.createRequestTab).not.toHaveBeenCalled();
  });

  it('converts cross-file documents from the bundled spec', async () => {
    const id = openSession('/tmp/pets.yaml', SPEC_YAML, 'yaml');
    const session = getSession(id)!;
    session.externalAnalysis = {
      diagnostics: [],
      externalRefs: new Map([['./common.yaml#/components/parameters/Page', {}]]),
      resolvedFiles: new Map(),
      referencedFiles: new Set(['file:///tmp/common.yaml']),
    } as unknown as ExternalAnalysisResult;
    // Bundled spec carries a query parameter the raw buffer only had as an
    // external $ref — its presence on the tab proves the bundle was used.
    bundleMocks.bundleSpecForRender.mockResolvedValue({
      spec: {
        openapi: '3.1.0',
        info: { title: 'Pet API', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com/v1' }],
        paths: {
          '/pets': {
            get: {
              operationId: 'listPets',
              parameters: [{ name: 'page', in: 'query', example: 2 }],
              responses: { '200': { description: 'OK' } },
            },
          },
        },
      },
    });

    const outcome = await tryOperation('/pets', 'get');
    expect(outcome.ok).toBe(true);
    expect(bundleMocks.bundleSpecForRender).toHaveBeenCalled();
    expect(tab.params).toEqual([expect.objectContaining({ key: 'page', value: '2' })]);
  });
});
