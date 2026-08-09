import { describe, it, expect, beforeEach, vi } from 'vitest';

const tauriMocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => tauriMocks);

// The session store runs its own external pass on open (production wiring).
// These unit tests drive the cache directly with a fake resolver, so that
// background pass is switched off except in the store-wiring test below —
// otherwise its pending-computation entry (keyed by session, not resolver)
// would be shared with the direct calls under test.
const settingsMocks = vi.hoisted(() => ({
  settings: {
    openApiLintEnabled: false,
    openApiLintRules: {} as Record<string, string>,
    openApiIntelliSenseEnabled: true,
    openApiExternalRefsEnabled: false,
  },
}));
vi.mock('@nouto/ui/stores/settings.svelte', () => settingsMocks);

import { resolveExternalRefUri } from '@nouto/core/services/openapi/externalRefs';
import type { FileResolver } from '@nouto/core/services/openapi/externalRefs';
import {
  clearExternalAnalysis,
  getExternalAnalysis,
  referrersOf,
} from './externalAnalysisCache';
import {
  openSession,
  newSession,
  getSession,
  setContentFor,
  closeSession,
  resetAllSessions,
  findSessionByPath,
} from './session.svelte';
import { fileUriToPath, pathToFileUri } from './pathUtils';

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

const COMMON_YAML = [
  'components:',
  '  schemas:',
  '    Pet:',
  '      type: object',
  '',
].join('\n');

const ROOT_PATH = 'C:\\specs\\api.yaml';
const COMMON_PATH = 'C:\\specs\\common.yaml';

function makeResolver(files: Record<string, string>, loads: string[]): FileResolver {
  return {
    resolve: (fromUri, refPath) => resolveExternalRefUri(fromUri, refPath),
    async load(uri) {
      loads.push(uri);
      const open = findSessionByPath(fileUriToPath(uri));
      if (open) return { content: open.content, format: open.format ?? 'yaml' };
      const content = files[uri];
      return content === undefined ? undefined : { content, format: 'yaml' };
    },
  };
}

describe('externalAnalysisCache', () => {
  beforeEach(() => {
    tauriMocks.invoke.mockReset();
    tauriMocks.invoke.mockImplementation(async (command: string) => {
      if (command === 'validate_openapi_schema') return [];
      throw new Error(`unexpected invoke: ${command}`);
    });
    settingsMocks.settings.openApiExternalRefsEnabled = false;
    resetAllSessions();
  });

  it('returns an empty result for untitled sessions', async () => {
    const id = newSession(ROOT_YAML, 'yaml');
    const loads: string[] = [];
    const result = await getExternalAnalysis(getSession(id)!, makeResolver({}, loads));
    expect(result.externalRefs.size).toBe(0);
    expect(loads).toEqual([]);
  });

  it('resolves external refs and caches until something changes', async () => {
    const id = openSession(ROOT_PATH, ROOT_YAML, 'yaml');
    const loads: string[] = [];
    const resolver = makeResolver({ [pathToFileUri(COMMON_PATH)]: COMMON_YAML }, loads);

    const first = await getExternalAnalysis(getSession(id)!, resolver);
    expect(first.diagnostics).toEqual([]);
    expect(first.externalRefs.size).toBe(1);
    expect([...first.referencedFiles]).toEqual([pathToFileUri(COMMON_PATH)]);
    const loadsAfterFirst = loads.length;

    const second = await getExternalAnalysis(getSession(id)!, resolver);
    expect(second).toBe(first);
    expect(loads.length).toBe(loadsAfterFirst); // cache hit — no re-read
  });

  it('reports a missing referenced file as external-file-not-found', async () => {
    const id = openSession(ROOT_PATH, ROOT_YAML, 'yaml');
    const result = await getExternalAnalysis(getSession(id)!, makeResolver({}, []));
    expect(result.diagnostics.some((d) => d.code === 'external-file-not-found')).toBe(true);
  });

  it('invalidates when the root document is edited', async () => {
    const id = openSession(ROOT_PATH, ROOT_YAML, 'yaml');
    const loads: string[] = [];
    const resolver = makeResolver({ [pathToFileUri(COMMON_PATH)]: COMMON_YAML }, loads);

    await getExternalAnalysis(getSession(id)!, resolver);
    const before = loads.length;
    setContentFor(id, ROOT_YAML + '# edit\n');
    await getExternalAnalysis(getSession(id)!, resolver);
    expect(loads.length).toBeGreaterThan(before);
  });

  it('invalidates when a referenced OPEN session is edited', async () => {
    const rootId = openSession(ROOT_PATH, ROOT_YAML, 'yaml');
    const commonId = openSession(COMMON_PATH, COMMON_YAML, 'yaml');
    const loads: string[] = [];
    const resolver = makeResolver({}, loads);

    const first = await getExternalAnalysis(getSession(rootId)!, resolver);
    expect(first.diagnostics).toEqual([]); // resolved from the open buffer
    const before = loads.length;

    setContentFor(commonId, COMMON_YAML + '# edit\n');
    await getExternalAnalysis(getSession(rootId)!, resolver);
    expect(loads.length).toBeGreaterThan(before);
  });

  it('invalidates when a previously-closed referenced file is opened as a session', async () => {
    const rootId = openSession(ROOT_PATH, ROOT_YAML, 'yaml');
    const loads: string[] = [];
    const resolver = makeResolver({ [pathToFileUri(COMMON_PATH)]: COMMON_YAML }, loads);

    await getExternalAnalysis(getSession(rootId)!, resolver); // common read from "disk"
    const before = loads.length;

    openSession(COMMON_PATH, COMMON_YAML + '# opened\n', 'yaml');
    await getExternalAnalysis(getSession(rootId)!, resolver);
    expect(loads.length).toBeGreaterThan(before); // buffer now wins — recompute
  });

  it('shares an in-flight computation for the same revision', async () => {
    const id = openSession(ROOT_PATH, ROOT_YAML, 'yaml');
    const loads: string[] = [];
    const resolver = makeResolver({ [pathToFileUri(COMMON_PATH)]: COMMON_YAML }, loads);

    const session = getSession(id)!;
    const [a, b] = await Promise.all([
      getExternalAnalysis(session, resolver),
      getExternalAnalysis(session, resolver),
    ]);
    expect(a).toBe(b);
  });

  it('tracks referrers and clears them on close', async () => {
    const rootId = openSession(ROOT_PATH, ROOT_YAML, 'yaml');
    const resolver = makeResolver({ [pathToFileUri(COMMON_PATH)]: COMMON_YAML }, []);
    await getExternalAnalysis(getSession(rootId)!, resolver);

    expect(referrersOf('someone-else', COMMON_PATH)).toEqual(new Set([rootId]));
    // The changed session itself is excluded.
    expect(referrersOf(rootId, COMMON_PATH)).toEqual(new Set());
    // The reverse index was written from resolver-produced URIs; an OS-path
    // query for the same file must key identically (write/read unification).
    expect(referrersOf('someone-else', fileUriToPath(pathToFileUri(COMMON_PATH)))).toEqual(
      new Set([rootId])
    );

    clearExternalAnalysis(rootId);
    expect(referrersOf('someone-else', COMMON_PATH)).toEqual(new Set());
  });

  it('editing a referenced session re-triggers the referrer diagnostics (store wiring)', async () => {
    vi.useFakeTimers();
    settingsMocks.settings.openApiExternalRefsEnabled = true;
    tauriMocks.invoke.mockImplementation(async (command: string, args?: { path?: string }) => {
      if (command === 'validate_openapi_schema') return [];
      if (command === 'read_openapi_ref_file' && args?.path === COMMON_PATH) return COMMON_YAML;
      throw new Error(`unexpected invoke: ${command} ${args?.path ?? ''}`);
    });
    try {
      const rootId = openSession(ROOT_PATH, ROOT_YAML, 'yaml');
      // First pass reads common.yaml from "disk" (the mocked Rust command).
      await vi.advanceTimersByTimeAsync(0);
      expect(getSession(rootId)?.externalAnalysis?.externalRefs.size).toBe(1);
      expect(getSession(rootId)?.diagnostics.some((d) => d.code === 'external-file-not-found')).toBe(false);

      // Opening the referenced file re-triggers the referrer (buffer wins),
      // then breaking the referenced pointer in that buffer re-triggers it
      // again via the debounced cross-tab invalidation.
      const commonId = openSession(COMMON_PATH, COMMON_YAML, 'yaml');
      await vi.advanceTimersByTimeAsync(350);
      expect(getSession(rootId)?.diagnostics.some((d) => d.code === 'external-pointer-not-found')).toBe(false);

      setContentFor(commonId, 'components:\n  schemas: {}\n');
      await vi.advanceTimersByTimeAsync(350);
      await vi.advanceTimersByTimeAsync(0);
      expect(
        getSession(rootId)?.diagnostics.some((d) => d.code === 'external-pointer-not-found')
      ).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
