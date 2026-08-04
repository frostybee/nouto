import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const tauriMocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => tauriMocks);

import { openApiSession, setContent, loadDocument, markSaved, resetSession, reanalyzeCurrent } from './session.svelte';

const VALID_YAML = `openapi: 3.1.0\ninfo:\n  title: T\n  version: 1.0.0\npaths: {}\n`;

describe('openApiSession', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    tauriMocks.invoke.mockReset();
    tauriMocks.invoke.mockResolvedValue([]);
    resetSession();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts empty and clean', () => {
    expect(openApiSession.documentUri).toBeNull();
    expect(openApiSession.format).toBeNull();
    expect(openApiSession.dirty).toBe(false);
  });

  it('loadDocument sets state and analyzes synchronously', () => {
    loadDocument('/tmp/api.yaml', VALID_YAML, 'yaml');
    expect(openApiSession.documentUri).toBe('/tmp/api.yaml');
    expect(openApiSession.savedContent).toBe(VALID_YAML);
    expect(openApiSession.dirty).toBe(false);
    expect(openApiSession.version).toBe('3.1');
    expect(openApiSession.lastValidSpec).toBeDefined();
    expect(openApiSession.previewStale).toBe(false);
  });

  it('setContent marks dirty and reverts when content matches savedContent again', () => {
    loadDocument('/tmp/api.yaml', VALID_YAML, 'yaml');
    setContent(VALID_YAML + '# note\n');
    expect(openApiSession.dirty).toBe(true);
    setContent(VALID_YAML);
    expect(openApiSession.dirty).toBe(false);
  });

  it('debounces analysis on setContent', () => {
    loadDocument('/tmp/api.yaml', VALID_YAML, 'yaml');
    const edited = VALID_YAML.replace('3.1.0', '3.0.3');
    setContent(edited);
    expect(openApiSession.version).toBe('3.1');
    vi.advanceTimersByTime(350);
    expect(openApiSession.version).toBe('3.0');
  });

  it('keeps lastValidSpec and flags previewStale on a broken edit', () => {
    loadDocument('/tmp/api.yaml', VALID_YAML, 'yaml');
    const spec = openApiSession.lastValidSpec;
    setContent('openapi: 3.1.0\n  broken:\nindent');
    vi.advanceTimersByTime(350);
    expect(openApiSession.previewStale).toBe(true);
    expect(openApiSession.lastValidSpec).toBe(spec);
  });

  it('markSaved adopts the uri and clears dirty', () => {
    loadDocument(null, VALID_YAML, 'yaml');
    setContent(VALID_YAML + '# more\n');
    expect(openApiSession.dirty).toBe(true);
    markSaved('/tmp/saved.yaml');
    expect(openApiSession.documentUri).toBe('/tmp/saved.yaml');
    expect(openApiSession.dirty).toBe(false);
    expect(openApiSession.savedContent).toBe(VALID_YAML + '# more\n');
  });

  it('resetSession returns to the empty state and cancels pending analysis', () => {
    loadDocument('/tmp/api.yaml', VALID_YAML, 'yaml');
    setContent(VALID_YAML + 'x');
    resetSession();
    vi.advanceTimersByTime(350);
    expect(openApiSession.format).toBeNull();
    expect(openApiSession.analysis).toBeNull();
    expect(openApiSession.dirty).toBe(false);
  });

  it('starts with the preview visible at the default split ratio', () => {
    expect(openApiSession.previewVisible).toBe(true);
    expect(openApiSession.previewSplitRatio).toBe(0.35);
    expect(openApiSession.contentRevision).toBe(0);
  });

  it('bumps contentRevision on every edit and load', () => {
    loadDocument('/tmp/api.yaml', VALID_YAML, 'yaml');
    const afterLoad = openApiSession.contentRevision;
    expect(afterLoad).toBeGreaterThan(0);
    setContent(VALID_YAML + '# a\n');
    setContent(VALID_YAML + '# ab\n');
    expect(openApiSession.contentRevision).toBe(afterLoad + 2);
    loadDocument('/tmp/other.yaml', VALID_YAML, 'yaml');
    expect(openApiSession.contentRevision).toBe(afterLoad + 3);
  });

  it('a load cancels analysis scheduled by earlier edits', () => {
    loadDocument('/tmp/a.yaml', VALID_YAML, 'yaml');
    setContent('openapi: 3.0.3\n');
    loadDocument('/tmp/b.yaml', VALID_YAML, 'yaml');
    vi.advanceTimersByTime(350);
    expect(openApiSession.version).toBe('3.1');
  });

  describe('diagnostics pipeline', () => {
    it('populates sync diagnostics on loadDocument and merges the schema pass', async () => {
      tauriMocks.invoke.mockResolvedValue([
        { pointer: '/info', message: 'schema issue' },
      ]);
      loadDocument('/tmp/api.yaml', VALID_YAML, 'yaml');
      // Sync sources land immediately (lint findings exist for this minimal doc).
      expect(openApiSession.diagnostics.length).toBeGreaterThan(0);
      expect(openApiSession.diagnostics.some((d) => d.source === 'schema')).toBe(false);
      await vi.advanceTimersByTimeAsync(0);
      expect(openApiSession.diagnostics.some(
        (d) => d.source === 'schema' && d.message === 'schema issue'
      )).toBe(true);
    });

    it('discards a stale schema resolution superseded by a newer edit', async () => {
      let resolveFirst!: (value: unknown) => void;
      tauriMocks.invoke
        .mockImplementationOnce(
          () => new Promise((resolve) => { resolveFirst = resolve; })
        )
        .mockResolvedValueOnce([{ pointer: '/info', message: 'fresh' }]);

      loadDocument('/tmp/api.yaml', VALID_YAML, 'yaml'); // first invoke, held open
      setContent(VALID_YAML + '# edit\n');
      await vi.advanceTimersByTimeAsync(350); // debounce fires -> second invoke resolves

      expect(openApiSession.diagnostics.some((d) => d.message === 'fresh')).toBe(true);

      resolveFirst([{ pointer: '/info', message: 'stale' }]);
      await vi.advanceTimersByTimeAsync(0);
      expect(openApiSession.diagnostics.some((d) => d.message === 'stale')).toBe(false);
      expect(openApiSession.diagnostics.some((d) => d.message === 'fresh')).toBe(true);
    });

    it('resetSession clears diagnostics and invalidates in-flight schema fetches', async () => {
      let resolveInvoke!: (value: unknown) => void;
      tauriMocks.invoke.mockImplementationOnce(
        () => new Promise((resolve) => { resolveInvoke = resolve; })
      );
      loadDocument('/tmp/api.yaml', VALID_YAML, 'yaml');
      resetSession();
      resolveInvoke([{ pointer: '/info', message: 'late' }]);
      await vi.advanceTimersByTimeAsync(0);
      expect(openApiSession.diagnostics).toEqual([]);
    });

    it('reanalyzeCurrent re-derives diagnostics without a content change', async () => {
      loadDocument('/tmp/api.yaml', VALID_YAML, 'yaml');
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
  });
});
