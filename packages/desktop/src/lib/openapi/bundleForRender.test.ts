import { describe, it, expect, beforeEach, vi } from 'vitest';

const tauriMocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => tauriMocks);

const settingsMocks = vi.hoisted(() => ({
  settings: {
    openApiLintEnabled: false,
    openApiLintRules: {} as Record<string, string>,
    openApiIntelliSenseEnabled: true,
    openApiExternalRefsEnabled: true,
  },
}));
vi.mock('@nouto/ui/stores/settings.svelte', () => settingsMocks);

import { bundleSpecForRender } from './bundleForRender';
import { openSession, newSession, getSession, resetAllSessions } from './session.svelte';

const ROOT_YAML = [
  'openapi: 3.1.0',
  'info:',
  '  title: T',
  '  version: 1.0.0',
  'paths: {}',
  'components:',
  '  schemas:',
  '    Pet:',
  '      $ref: ./common.yaml#/components/schemas/Pet',
  '',
].join('\n');

const PLAIN_YAML = `openapi: 3.1.0\ninfo:\n  title: T\n  version: 1.0.0\npaths: {}\n`;
const COMMON_YAML = 'components:\n  schemas:\n    Pet:\n      type: object\n';

beforeEach(() => {
  tauriMocks.invoke.mockReset();
  tauriMocks.invoke.mockImplementation(async (command: string, args?: { path?: string }) => {
    if (command === 'validate_openapi_schema') return [];
    if (command === 'read_openapi_ref_file' && args?.path === 'C:\\specs\\common.yaml') {
      return COMMON_YAML;
    }
    throw new Error(`unexpected invoke: ${command} ${args?.path ?? ''}`);
  });
  settingsMocks.settings.openApiExternalRefsEnabled = true;
  resetAllSessions();
});

describe('bundleSpecForRender', () => {
  it('returns the raw spec for untitled documents', async () => {
    const id = newSession(ROOT_YAML, 'yaml');
    const session = getSession(id)!;
    const result = await bundleSpecForRender(session);
    expect(result.spec).toBe(session.lastValidSpec);
    expect(result.externalRefsIncomplete).toBeUndefined();
  });

  it('returns the raw spec when the setting is off', async () => {
    settingsMocks.settings.openApiExternalRefsEnabled = false;
    const id = openSession('C:\\specs\\api.yaml', ROOT_YAML, 'yaml');
    const session = getSession(id)!;
    const result = await bundleSpecForRender(session);
    expect(result.spec).toBe(session.lastValidSpec);
  });

  it('returns the raw spec when the document has no external refs', async () => {
    const id = openSession('C:\\specs\\plain.yaml', PLAIN_YAML, 'yaml');
    const session = getSession(id)!;
    const result = await bundleSpecForRender(session);
    expect(result.spec).toBe(session.lastValidSpec);
    expect(result.externalRefsIncomplete).toBeUndefined();
  });

  it('bundles resolvable external refs into a self-contained document', async () => {
    const id = openSession('C:\\specs\\api.yaml', ROOT_YAML, 'yaml');
    const session = getSession(id)!;
    const result = await bundleSpecForRender(session);
    expect(result.externalRefsIncomplete).toBeUndefined();
    const text = JSON.stringify(result.spec);
    expect(text).not.toContain('./common.yaml'); // rewritten to internal refs
    expect(text).toContain('#/components/schemas/');
  });

  it('flags an incomplete bundle when a referenced file is missing', async () => {
    tauriMocks.invoke.mockImplementation(async (command: string) => {
      if (command === 'validate_openapi_schema') return [];
      throw new Error('missing');
    });
    const id = openSession('C:\\specs\\api.yaml', ROOT_YAML, 'yaml');
    const session = getSession(id)!;
    const result = await bundleSpecForRender(session);
    expect(result.externalRefsIncomplete).toBe(true);
    expect(result.spec).toBeDefined();
  });

  it('returns undefined spec when the session never parsed', async () => {
    const id = openSession('C:\\specs\\broken.yaml', 'openapi: 3.1.0\n  broken:\nindent', 'yaml');
    const session = getSession(id)!;
    expect((await bundleSpecForRender(session)).spec).toBeUndefined();
  });
});
