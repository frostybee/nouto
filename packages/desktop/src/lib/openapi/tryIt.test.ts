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

import { initTryIt, tryOperation } from './tryIt';
import { openApiSession, loadDocument, resetSession } from './session.svelte';

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
    resetSession();
    tab = freshTab();
    tabsMocks.createRequestTab.mockReturnValue(tab);
    setView = vi.fn();
    initTryIt({ setView });
  });

  it('opens a prefilled unsaved tab and switches to the main view', () => {
    loadDocument('/tmp/pets.yaml', SPEC_YAML, 'yaml');
    const outcome = tryOperation('/pets/{petId}', 'get');

    expect(outcome.ok).toBe(true);
    expect(tabsMocks.createRequestTab).toHaveBeenCalledWith(expect.any(String), null, null, null);
    expect(tab.method).toBe('GET');
    expect(tab.icon).toBe('GET');
    expect(tab.url).toContain('/pets/');
    expect(tabsMocks.openTab).toHaveBeenCalledWith(tab);
    expect(setView).toHaveBeenCalledWith('main');
    expect(openApiSession.selectedOperation).toEqual({ path: '/pets/{petId}', method: 'get' });
  });

  it('uses the current unsaved buffer, not the saved content', () => {
    loadDocument('/tmp/pets.yaml', SPEC_YAML, 'yaml');
    // Simulate an unsaved edit adding a second operation, without waiting
    // for the analysis debounce — tryOperation reads content directly.
    openApiSession.content = SPEC_YAML + `  /toys:
    get:
      operationId: listToys
      responses:
        '200': { description: OK }
`;
    const outcome = tryOperation('/toys', 'get');
    expect(outcome.ok).toBe(true);
    expect(tabsMocks.openTab).toHaveBeenCalled();
  });

  it('reports a conversion error without throwing and shows a toast', () => {
    loadDocument('/tmp/pets.yaml', SPEC_YAML, 'yaml');
    const outcome = tryOperation('/nope', 'get');

    expect(outcome.ok).toBe(false);
    expect(outcome.message).toMatch(/not found/);
    expect(notificationMocks.showNotification).toHaveBeenCalledWith('error', expect.stringMatching(/not found/));
    expect(tabsMocks.openTab).not.toHaveBeenCalled();
    expect(setView).not.toHaveBeenCalled();
  });

  it('fails gracefully when no document is open', () => {
    const outcome = tryOperation('/pets/{petId}', 'get');
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toMatch(/No OpenAPI document/);
    expect(tabsMocks.createRequestTab).not.toHaveBeenCalled();
  });
});
