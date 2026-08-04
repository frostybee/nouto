import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { flushSync } from 'svelte';

const tauriMocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => tauriMocks);

import {
  openApiSession,
  setContent,
  setContentFor,
  openSession,
  newSession,
  closeSession,
  markSaved,
  resetAllSessions,
  reanalyzeCurrent,
  reanalyzeAllSessions,
  sessionList,
  getSession,
  activeSessionId,
  setActiveSessionId,
  findSessionByPath,
} from './session.svelte';

const VALID_YAML = `openapi: 3.1.0\ninfo:\n  title: T\n  version: 1.0.0\npaths: {}\n`;

describe('openApiSession registry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    tauriMocks.invoke.mockReset();
    tauriMocks.invoke.mockResolvedValue([]);
    resetAllSessions();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts empty: no sessions, facade reads the empty defaults', () => {
    expect(sessionList()).toEqual([]);
    expect(activeSessionId()).toBeNull();
    expect(openApiSession.documentUri).toBeNull();
    expect(openApiSession.format).toBeNull();
    expect(openApiSession.dirty).toBe(false);
  });

  it('openSession creates an active session and analyzes synchronously', () => {
    const id = openSession('/tmp/api.yaml', VALID_YAML, 'yaml');
    expect(activeSessionId()).toBe(id);
    expect(openApiSession.id).toBe(id);
    expect(openApiSession.documentUri).toBe('/tmp/api.yaml');
    expect(openApiSession.savedContent).toBe(VALID_YAML);
    expect(openApiSession.dirty).toBe(false);
    expect(openApiSession.version).toBe('3.1');
    expect(openApiSession.lastValidSpec).toBeDefined();
    expect(openApiSession.previewStale).toBe(false);
    expect(openApiSession.contentRevision).toBe(1);
  });

  it('ids are opaque, unique, and never reused within a run', () => {
    const a = openSession('/tmp/a.yaml', VALID_YAML, 'yaml');
    const b = newSession(VALID_YAML, 'yaml');
    expect(a).not.toBe(b);
    closeSession(b);
    const c = newSession(VALID_YAML, 'yaml');
    expect(c).not.toBe(b);
  });

  it('setContent marks the active session dirty and reverts when content matches savedContent', () => {
    openSession('/tmp/api.yaml', VALID_YAML, 'yaml');
    setContent(VALID_YAML + '# note\n');
    expect(openApiSession.dirty).toBe(true);
    setContent(VALID_YAML);
    expect(openApiSession.dirty).toBe(false);
  });

  it('debounces analysis on setContent', () => {
    openSession('/tmp/api.yaml', VALID_YAML, 'yaml');
    const edited = VALID_YAML.replace('3.1.0', '3.0.3');
    setContent(edited);
    expect(openApiSession.version).toBe('3.1');
    vi.advanceTimersByTime(350);
    expect(openApiSession.version).toBe('3.0');
  });

  it('keeps lastValidSpec and flags previewStale on a broken edit', () => {
    openSession('/tmp/api.yaml', VALID_YAML, 'yaml');
    const spec = openApiSession.lastValidSpec;
    setContent('openapi: 3.1.0\n  broken:\nindent');
    vi.advanceTimersByTime(350);
    expect(openApiSession.previewStale).toBe(true);
    expect(openApiSession.lastValidSpec).toBe(spec);
  });

  it('markSaved adopts the uri, clears dirty, and never migrates the registry key', () => {
    const id = newSession(VALID_YAML, 'yaml');
    setContent(VALID_YAML + '# more\n');
    expect(openApiSession.dirty).toBe(true);
    markSaved(id, '/tmp/saved.yaml');
    expect(getSession(id)?.documentUri).toBe('/tmp/saved.yaml');
    expect(getSession(id)?.dirty).toBe(false);
    expect(getSession(id)?.savedContent).toBe(VALID_YAML + '# more\n');
    expect(openApiSession.id).toBe(id);
  });

  it('bumps contentRevision per session on every edit', () => {
    const id = openSession('/tmp/api.yaml', VALID_YAML, 'yaml');
    expect(getSession(id)?.contentRevision).toBe(1);
    setContent(VALID_YAML + '# a\n');
    setContent(VALID_YAML + '# ab\n');
    expect(getSession(id)?.contentRevision).toBe(3);
    const other = openSession('/tmp/other.yaml', VALID_YAML, 'yaml');
    expect(getSession(other)?.contentRevision).toBe(1);
    expect(getSession(id)?.contentRevision).toBe(3);
  });

  describe('multi-session behavior', () => {
    it('opening a second document keeps both sessions and activates the new one', () => {
      const a = openSession('/tmp/a.yaml', VALID_YAML, 'yaml');
      const b = openSession('/tmp/b.yaml', VALID_YAML, 'yaml');
      expect(sessionList().map((s) => s.id)).toEqual([a, b]);
      expect(activeSessionId()).toBe(b);
      setActiveSessionId(a);
      expect(openApiSession.documentUri).toBe('/tmp/a.yaml');
    });

    it('setActiveSessionId ignores unknown ids', () => {
      const a = openSession('/tmp/a.yaml', VALID_YAML, 'yaml');
      setActiveSessionId('doc-does-not-exist');
      expect(activeSessionId()).toBe(a);
    });

    it('per-session debounce: an edit in a background tab still lands in that tab', () => {
      const a = openSession('/tmp/a.yaml', VALID_YAML, 'yaml');
      const b = openSession('/tmp/b.yaml', VALID_YAML, 'yaml');
      setActiveSessionId(a);
      setContent(VALID_YAML.replace('3.1.0', '3.0.3'));
      // Switch away before the debounce fires — analysis must still target A.
      setActiveSessionId(b);
      vi.advanceTimersByTime(350);
      expect(getSession(a)?.version).toBe('3.0');
      expect(getSession(b)?.version).toBe('3.1');
    });

    it('an edit in one tab does not invalidate another tab\'s in-flight schema fetch', async () => {
      let resolveA!: (value: unknown) => void;
      tauriMocks.invoke
        .mockImplementationOnce(() => new Promise((resolve) => { resolveA = resolve; }))
        .mockResolvedValue([]);
      const a = openSession('/tmp/a.yaml', VALID_YAML, 'yaml'); // A's invoke held open
      const b = openSession('/tmp/b.yaml', VALID_YAML, 'yaml');
      setContentFor(b, VALID_YAML + '# edit\n');
      await vi.advanceTimersByTimeAsync(350);
      resolveA([{ pointer: '/info', message: 'a-schema' }]);
      await vi.advanceTimersByTimeAsync(0);
      expect(getSession(a)?.diagnostics.some((d) => d.message === 'a-schema')).toBe(true);
    });

    it('closeSession removes the session and activates the neighbor', () => {
      const a = openSession('/tmp/a.yaml', VALID_YAML, 'yaml');
      const b = openSession('/tmp/b.yaml', VALID_YAML, 'yaml');
      const c = openSession('/tmp/c.yaml', VALID_YAML, 'yaml');
      setActiveSessionId(b);
      closeSession(b);
      expect(sessionList().map((s) => s.id)).toEqual([a, c]);
      expect(activeSessionId()).toBe(c);
      closeSession(c);
      expect(activeSessionId()).toBe(a);
      closeSession(a);
      expect(activeSessionId()).toBeNull();
      expect(sessionList()).toEqual([]);
    });

    it('closing a background session leaves the active one untouched', () => {
      const a = openSession('/tmp/a.yaml', VALID_YAML, 'yaml');
      const b = openSession('/tmp/b.yaml', VALID_YAML, 'yaml');
      closeSession(a);
      expect(activeSessionId()).toBe(b);
    });

    it('closeSession cancels the session\'s pending analysis', () => {
      const a = openSession('/tmp/a.yaml', VALID_YAML, 'yaml');
      setContentFor(a, VALID_YAML.replace('3.1.0', '3.0.3'));
      closeSession(a);
      vi.advanceTimersByTime(350); // must not throw / resurrect state
      expect(getSession(a)).toBeUndefined();
    });

    it('new sessions inherit layout preferences from the previously-active session', () => {
      const a = openSession('/tmp/a.yaml', VALID_YAML, 'yaml');
      const sessionA = getSession(a)!;
      sessionA.splitRatio = 0.5;
      sessionA.previewVisible = false;
      sessionA.previewSplitRatio = 0.6;
      const b = newSession(VALID_YAML, 'yaml');
      expect(getSession(b)?.splitRatio).toBe(0.5);
      expect(getSession(b)?.previewVisible).toBe(false);
      expect(getSession(b)?.previewSplitRatio).toBe(0.6);
    });
  });

  describe('findSessionByPath', () => {
    it('matches across backslash/case drive-letter variants', () => {
      const id = openSession('C:\\specs\\api.yaml', VALID_YAML, 'yaml');
      expect(findSessionByPath('c:/specs/api.yaml')?.id).toBe(id);
      expect(findSessionByPath('C:\\specs\\api.yaml')?.id).toBe(id);
      expect(findSessionByPath('C:\\specs\\other.yaml')).toBeUndefined();
    });

    it('never matches untitled sessions', () => {
      newSession(VALID_YAML, 'yaml');
      expect(findSessionByPath('/tmp/api.yaml')).toBeUndefined();
    });
  });

  describe('facade reactivity', () => {
    it('$effect reads through the facade re-track field changes and tab switches', () => {
      const seen: Array<string | null> = [];
      const cleanup = $effect.root(() => {
        $effect(() => {
          seen.push(openApiSession.documentUri);
        });
      });
      flushSync();
      expect(seen).toEqual([null]);

      const a = openSession('/tmp/a.yaml', VALID_YAML, 'yaml');
      flushSync();
      expect(seen.at(-1)).toBe('/tmp/a.yaml');

      openSession('/tmp/b.yaml', VALID_YAML, 'yaml');
      flushSync();
      expect(seen.at(-1)).toBe('/tmp/b.yaml');

      setActiveSessionId(a);
      flushSync();
      expect(seen.at(-1)).toBe('/tmp/a.yaml');

      markSaved(a, '/tmp/renamed.yaml');
      flushSync();
      expect(seen.at(-1)).toBe('/tmp/renamed.yaml');

      cleanup();
    });

    it('facade writes land on the active session and are no-ops with none active', () => {
      openApiSession.splitRatio = 0.42; // no session — silent no-op
      expect(openApiSession.splitRatio).toBe(0.7);
      const id = openSession('/tmp/a.yaml', VALID_YAML, 'yaml');
      openApiSession.splitRatio = 0.42;
      expect(getSession(id)?.splitRatio).toBe(0.42);
    });
  });

  describe('diagnostics pipeline', () => {
    it('populates sync diagnostics on open and merges the schema pass', async () => {
      tauriMocks.invoke.mockResolvedValue([
        { pointer: '/info', message: 'schema issue' },
      ]);
      openSession('/tmp/api.yaml', VALID_YAML, 'yaml');
      expect(openApiSession.diagnostics.length).toBeGreaterThan(0);
      expect(openApiSession.diagnostics.some((d) => d.source === 'schema')).toBe(false);
      await vi.advanceTimersByTimeAsync(0);
      expect(openApiSession.diagnostics.some(
        (d) => d.source === 'schema' && d.message === 'schema issue'
      )).toBe(true);
    });

    it('discards a stale schema resolution superseded by a newer edit in the same session', async () => {
      let resolveFirst!: (value: unknown) => void;
      tauriMocks.invoke
        .mockImplementationOnce(
          () => new Promise((resolve) => { resolveFirst = resolve; })
        )
        .mockResolvedValueOnce([{ pointer: '/info', message: 'fresh' }]);

      openSession('/tmp/api.yaml', VALID_YAML, 'yaml'); // first invoke, held open
      setContent(VALID_YAML + '# edit\n');
      await vi.advanceTimersByTimeAsync(350); // debounce fires -> second invoke resolves

      expect(openApiSession.diagnostics.some((d) => d.message === 'fresh')).toBe(true);

      resolveFirst([{ pointer: '/info', message: 'stale' }]);
      await vi.advanceTimersByTimeAsync(0);
      expect(openApiSession.diagnostics.some((d) => d.message === 'stale')).toBe(false);
      expect(openApiSession.diagnostics.some((d) => d.message === 'fresh')).toBe(true);
    });

    it('resetAllSessions clears the registry and invalidates in-flight schema fetches', async () => {
      let resolveInvoke!: (value: unknown) => void;
      tauriMocks.invoke.mockImplementationOnce(
        () => new Promise((resolve) => { resolveInvoke = resolve; })
      );
      openSession('/tmp/api.yaml', VALID_YAML, 'yaml');
      resetAllSessions();
      resolveInvoke([{ pointer: '/info', message: 'late' }]);
      await vi.advanceTimersByTimeAsync(0);
      expect(sessionList()).toEqual([]);
      expect(openApiSession.diagnostics).toEqual([]);
    });

    it('closeSession invalidates that session\'s in-flight schema fetch', async () => {
      let resolveInvoke!: (value: unknown) => void;
      tauriMocks.invoke.mockImplementationOnce(
        () => new Promise((resolve) => { resolveInvoke = resolve; })
      );
      const id = openSession('/tmp/api.yaml', VALID_YAML, 'yaml');
      const session = getSession(id)!;
      closeSession(id);
      resolveInvoke([{ pointer: '/info', message: 'late' }]);
      await vi.advanceTimersByTimeAsync(0);
      expect(session.diagnostics.some((d) => d.message === 'late')).toBe(false);
    });

    it('reanalyzeCurrent re-derives diagnostics without a content change', async () => {
      openSession('/tmp/api.yaml', VALID_YAML, 'yaml');
      await vi.advanceTimersByTimeAsync(0);
      const callsBefore = tauriMocks.invoke.mock.calls.length;
      reanalyzeCurrent();
      expect(tauriMocks.invoke.mock.calls.length).toBe(callsBefore + 1);
      expect(openApiSession.diagnostics.length).toBeGreaterThan(0);
    });

    it('reanalyzeCurrent is a no-op with no document loaded', () => {
      reanalyzeCurrent();
      expect(openApiSession.diagnostics).toEqual([]);
      expect(tauriMocks.invoke).not.toHaveBeenCalled();
    });

    describe('external-ref merge (3rd async source)', () => {
      const EXT_YAML = [
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

      it('swaps the sync external-ref-unsupported placeholder for the definitive diagnostic', async () => {
        tauriMocks.invoke.mockImplementation(async (command: string) => {
          if (command === 'validate_openapi_schema') return [];
          throw new Error('missing'); // read_openapi_ref_file → file not found
        });
        const id = openSession('C:\\specs\\api.yaml', EXT_YAML, 'yaml');
        expect(getSession(id)!.diagnostics.some((d) => d.code === 'external-ref-unsupported')).toBe(true);
        await vi.advanceTimersByTimeAsync(0);
        const diags = getSession(id)!.diagnostics;
        expect(diags.some((d) => d.code === 'external-ref-unsupported')).toBe(false);
        expect(diags.some((d) => d.code === 'external-file-not-found')).toBe(true);
        expect(getSession(id)!.externalAnalysis?.externalRefs.size).toBe(1);
      });

      it('keeps both async slices when external resolves first', async () => {
        let resolveSchema!: (value: unknown) => void;
        tauriMocks.invoke.mockImplementation((command: string) => {
          if (command === 'validate_openapi_schema') {
            return new Promise((resolve) => { resolveSchema = resolve; });
          }
          return Promise.reject(new Error('missing'));
        });
        const id = openSession('C:\\specs\\api.yaml', EXT_YAML, 'yaml');
        await vi.advanceTimersByTimeAsync(0);
        expect(getSession(id)!.diagnostics.some((d) => d.code === 'external-file-not-found')).toBe(true);

        resolveSchema([{ pointer: '/info', message: 'schema-slow' }]);
        await vi.advanceTimersByTimeAsync(0);
        const diags = getSession(id)!.diagnostics;
        expect(diags.some((d) => d.message === 'schema-slow')).toBe(true);
        expect(diags.some((d) => d.code === 'external-file-not-found')).toBe(true);
      });

      it('keeps both async slices when schema resolves first', async () => {
        let rejectRead!: (error: unknown) => void;
        tauriMocks.invoke.mockImplementation((command: string) => {
          if (command === 'validate_openapi_schema') {
            return Promise.resolve([{ pointer: '/info', message: 'schema-fast' }]);
          }
          return new Promise((_resolve, reject) => { rejectRead = reject; });
        });
        const id = openSession('C:\\specs\\api.yaml', EXT_YAML, 'yaml');
        await vi.advanceTimersByTimeAsync(0);
        expect(getSession(id)!.diagnostics.some((d) => d.message === 'schema-fast')).toBe(true);
        expect(getSession(id)!.diagnostics.some((d) => d.code === 'external-file-not-found')).toBe(false);

        rejectRead(new Error('missing'));
        await vi.advanceTimersByTimeAsync(0);
        const diags = getSession(id)!.diagnostics;
        expect(diags.some((d) => d.message === 'schema-fast')).toBe(true);
        expect(diags.some((d) => d.code === 'external-file-not-found')).toBe(true);
      });

      it('untitled documents never run the external pass', async () => {
        tauriMocks.invoke.mockImplementation(async (command: string, args?: { path?: string }) => {
          if (command === 'validate_openapi_schema') return [];
          throw new Error(`read attempted: ${args?.path}`);
        });
        const id = newSession(EXT_YAML, 'yaml');
        await vi.advanceTimersByTimeAsync(0);
        expect(getSession(id)!.externalAnalysis).toBeNull();
        // Placeholder stays — nothing definitive to swap in.
        expect(getSession(id)!.diagnostics.some((d) => d.code === 'external-ref-unsupported')).toBe(true);
        expect(
          tauriMocks.invoke.mock.calls.some(([command]) => command === 'read_openapi_ref_file')
        ).toBe(false);
      });
    });

    it('reanalyzeAllSessions re-runs every open session', async () => {
      openSession('/tmp/a.yaml', VALID_YAML, 'yaml');
      openSession('/tmp/b.yaml', VALID_YAML, 'yaml');
      await vi.advanceTimersByTimeAsync(0);
      const callsBefore = tauriMocks.invoke.mock.calls.length;
      reanalyzeAllSessions();
      expect(tauriMocks.invoke.mock.calls.length).toBe(callsBefore + 2);
    });
  });
});
