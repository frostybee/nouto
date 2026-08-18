import { describe, it, expect, beforeEach, vi } from 'vitest';

const tauriMocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => tauriMocks);

import { createTauriFileResolver } from './tauriFileResolver';
import { openSession, setContentFor, resetAllSessions } from './session.svelte';
import { pathToFileUri } from './pathUtils';

const VALID_YAML = `openapi: 3.1.0\ninfo:\n  title: T\n  version: 1.0.0\npaths: {}\n`;

describe('tauriFileResolver', () => {
  const resolver = createTauriFileResolver();

  beforeEach(() => {
    tauriMocks.invoke.mockReset();
    resetAllSessions();
  });

  describe('resolve', () => {
    it('delegates to core resolveExternalRefUri (WHATWG URL arithmetic)', () => {
      const base = pathToFileUri('C:\\specs\\api.yaml');
      expect(resolver.resolve(base, './schemas/common.yaml')).toBe(
        pathToFileUri('C:\\specs\\schemas\\common.yaml'),
      );
      expect(resolver.resolve(base, '../shared/common.yaml')).toBe(
        pathToFileUri('C:\\shared\\common.yaml'),
      );
    });
  });

  describe('load', () => {
    it('prefers an open session buffer — unsaved edits win over disk', async () => {
      const id = openSession('C:\\specs\\common.yaml', VALID_YAML, 'yaml');
      setContentFor(id, VALID_YAML + '# unsaved\n');

      const result = await resolver.load(pathToFileUri('C:\\specs\\common.yaml'));
      expect(result).toEqual({ content: VALID_YAML + '# unsaved\n', format: 'yaml' });
      // openSession's own schema pass may invoke; the resolver must not read disk.
      expect(
        tauriMocks.invoke.mock.calls.some(([command]) => command === 'read_openapi_ref_file'),
      ).toBe(false);
    });

    it('falls back to the Rust read command for files with no session', async () => {
      tauriMocks.invoke.mockResolvedValue('type: object\n');
      const result = await resolver.load('file:///C:/specs/schemas/common.yaml');
      expect(tauriMocks.invoke).toHaveBeenCalledWith('read_openapi_ref_file', {
        path: 'C:\\specs\\schemas\\common.yaml',
      });
      expect(result).toEqual({ content: 'type: object\n', format: 'yaml' });
    });

    it('infers json format from the extension on disk reads', async () => {
      tauriMocks.invoke.mockResolvedValue('{}');
      const result = await resolver.load('file:///C:/specs/common.json');
      expect(result?.format).toBe('json');
    });

    it('returns undefined when the Rust read fails (missing/disallowed file)', async () => {
      tauriMocks.invoke.mockRejectedValue('File not found');
      expect(await resolver.load('file:///C:/specs/missing.yaml')).toBeUndefined();
    });

    it('returns undefined for non-file URIs instead of throwing', async () => {
      expect(await resolver.load('https://example.com/spec.yaml')).toBeUndefined();
      expect(tauriMocks.invoke).not.toHaveBeenCalled();
    });
  });
});
