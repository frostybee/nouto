import { describe, it, expect, beforeEach, vi } from 'vitest';

const tauriMocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => tauriMocks);

import { resolveExternalRefUri } from '@nouto/core/services/openapi/externalRefs';
import type { FileResolver } from '@nouto/core/services/openapi/externalRefs';
import {
  clearExternalRefCompletionCache,
  crossFileRefTargets,
  parsePartialRefValue,
  typedRefValue,
} from './externalRefCompletion';
import { openSession, setContentFor, resetAllSessions } from '../session.svelte';
import { pathToFileUri } from '../pathUtils';

const COMMON_YAML = [
  'components:',
  '  schemas:',
  '    Pet:',
  '      type: object',
  '    Toy:',
  '      type: object',
  '',
].join('\n');

describe('parsePartialRefValue', () => {
  it('splits file and pointer parts', () => {
    expect(parsePartialRefValue('./common.yaml#/components/schemas/')).toEqual({
      filePart: './common.yaml',
      pointerPart: '/components/schemas/',
      hasHash: true,
    });
  });

  it('handles a file part with no hash yet', () => {
    expect(parsePartialRefValue('./common.yaml')).toEqual({
      filePart: './common.yaml',
      pointerPart: '',
      hasHash: false,
    });
  });

  it('rejects internal, scheme’d, absolute, and empty refs', () => {
    expect(parsePartialRefValue('#/components/schemas/Pet')).toBeUndefined();
    expect(parsePartialRefValue('https://example.com/x.yaml#/a')).toBeUndefined();
    expect(parsePartialRefValue('C:\\x\\common.yaml#/a')).toBeUndefined();
    expect(parsePartialRefValue('')).toBeUndefined();
  });
});

describe('typedRefValue', () => {
  it('returns the unquoted text after the colon', () => {
    expect(typedRefValue('      $ref: ./common')).toEqual({ text: './common', startCharacter: 12 });
  });

  it('returns the text inside an open quote without swallowing it', () => {
    const before = "      $ref: './common";
    expect(typedRefValue(before)).toEqual({ text: './common', startCharacter: 13 });
  });

  it('returns undefined with no colon on the line', () => {
    expect(typedRefValue('      ./common')).toBeUndefined();
  });
});

describe('crossFileRefTargets', () => {
  function makeResolver(files: Record<string, string>, loads: string[]): FileResolver {
    return {
      resolve: (fromUri, refPath) => resolveExternalRefUri(fromUri, refPath),
      async load(uri) {
        loads.push(uri);
        const content = files[uri];
        return content === undefined ? undefined : { content, format: 'yaml' };
      },
    };
  }

  const FROM_URI = pathToFileUri('C:\\specs\\api.yaml');
  const COMMON_URI = pathToFileUri('C:\\specs\\common.yaml');
  const partial = { filePart: './common.yaml', pointerPart: '/', hasHash: true };

  beforeEach(() => {
    tauriMocks.invoke.mockReset();
    tauriMocks.invoke.mockResolvedValue([]);
    clearExternalRefCompletionCache();
    resetAllSessions();
  });

  it('enumerates section-appropriate targets in the referenced file', async () => {
    const loads: string[] = [];
    const targets = await crossFileRefTargets(
      FROM_URI,
      partial,
      'schema',
      makeResolver({ [COMMON_URI]: COMMON_YAML }, loads)
    );
    expect(targets).toEqual(['#/components/schemas/Pet', '#/components/schemas/Toy']);
  });

  it('returns [] for unresolvable or unparsable files', async () => {
    expect(await crossFileRefTargets(FROM_URI, partial, 'schema', makeResolver({}, []))).toEqual([]);
    expect(
      await crossFileRefTargets(
        FROM_URI,
        partial,
        'schema',
        makeResolver({ [COMMON_URI]: '{{{{not yaml' }, [])
      )
    ).toEqual([]);
  });

  it('caches closed-file parses for the process lifetime', async () => {
    const loads: string[] = [];
    const resolver = makeResolver({ [COMMON_URI]: COMMON_YAML }, loads);
    await crossFileRefTargets(FROM_URI, partial, 'schema', resolver);
    await crossFileRefTargets(FROM_URI, partial, 'schema', resolver);
    expect(loads).toHaveLength(1);
  });

  it('invalidates the cache when the target is an open session that edits', async () => {
    const id = openSession('C:\\specs\\common.yaml', COMMON_YAML, 'yaml');
    const loads: string[] = [];
    // Resolver reads the open buffer in production; the fixture map stands in.
    const resolver = makeResolver({ [COMMON_URI]: COMMON_YAML }, loads);

    await crossFileRefTargets(FROM_URI, partial, 'schema', resolver);
    await crossFileRefTargets(FROM_URI, partial, 'schema', resolver);
    expect(loads).toHaveLength(1); // same revision — cached

    setContentFor(id, COMMON_YAML + '# edit\n');
    await crossFileRefTargets(FROM_URI, partial, 'schema', resolver);
    expect(loads).toHaveLength(2); // revision bumped — reloaded
  });
});
