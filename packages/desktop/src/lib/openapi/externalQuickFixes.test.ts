import { describe, it, expect, beforeEach, vi } from 'vitest';

const tauriMocks = vi.hoisted(() => ({ invoke: vi.fn() }));
const dialogMocks = vi.hoisted(() => ({ open: vi.fn(), save: vi.fn() }));
const fsMocks = vi.hoisted(() => ({ readTextFile: vi.fn(), writeTextFile: vi.fn() }));
const modalMocks = vi.hoisted(() => ({ showLocalSaveDiscardCancel: vi.fn() }));
const notificationMocks = vi.hoisted(() => ({ showNotification: vi.fn() }));

vi.mock('@tauri-apps/api/core', () => tauriMocks);
vi.mock('@tauri-apps/plugin-dialog', () => dialogMocks);
vi.mock('@tauri-apps/plugin-fs', () => fsMocks);
vi.mock('../modal-store.svelte', () => modalMocks);
vi.mock('@nouto/ui/stores/notifications.svelte', () => notificationMocks);

import * as yaml from 'js-yaml';
import { analyzeOpenApiWithExternalRefs, resolveExternalRefUri } from '@nouto/core/services/openapi/externalRefs';
import type { FileResolver } from '@nouto/core/services/openapi/externalRefs';
import { buildPointerMap } from '@nouto/core/services/openapi/pointerMap';
import { buildExternalQuickFixes, scaffoldContent } from './externalQuickFixes';
import {
  openSession,
  getSession,
  activeSessionId,
  resetAllSessions,
  sessionList,
} from './session.svelte';
import { pathToFileUri } from './pathUtils';

const COMMON = 'components:\n  schemas:\n    Item:\n      type: string\n';

function rootSpec(ref: string): string {
  return [
    'openapi: 3.1.0',
    'info:',
    '  title: T',
    '  version: 1.0.0',
    'paths: {}',
    'components:',
    '  schemas:',
    '    Local:',
    `      $ref: '${ref}'`,
    '',
  ].join('\n');
}

function makeResolver(files: Record<string, string>): FileResolver {
  return {
    resolve: (fromUri, refPath) => resolveExternalRefUri(fromUri, refPath),
    async load(uri) {
      const content = files[uri];
      return content === undefined ? undefined : { content, format: 'yaml' };
    },
  };
}

const ROOT_PATH = 'C:\\specs\\api.yaml';
const COMMON_URI = pathToFileUri('C:\\specs\\common.yaml');

/** Opens the root spec as a session and derives real tier-2 diagnostics for it. */
async function setup(ref: string, files: Record<string, string>) {
  const content = rootSpec(ref);
  const id = openSession(ROOT_PATH, content, 'yaml');
  const session = getSession(id)!;
  const external = await analyzeOpenApiWithExternalRefs(
    session.analysis!.parsedSpec as object,
    pathToFileUri(ROOT_PATH),
    makeResolver(files)
  );
  const map = buildPointerMap(content, 'yaml');
  const fullRange = { from: 0, to: content.length };
  return { session, external, map, fullRange };
}

beforeEach(() => {
  vi.clearAllMocks();
  tauriMocks.invoke.mockResolvedValue([]);
  localStorage.clear();
  resetAllSessions();
});

describe('buildExternalQuickFixes', () => {
  it('offers a create-component fix whose apply() patches the referenced session', async () => {
    const { session, external, map, fullRange } = await setup(
      './common.yaml#/components/schemas/Missing',
      { [COMMON_URI]: COMMON }
    );
    // Open the referenced file as a (background) session too.
    openSession('C:\\specs\\common.yaml', COMMON, 'yaml');
    const commonId = activeSessionId()!;

    const fixes = buildExternalQuickFixes(session, external.diagnostics, map, fullRange);
    expect(fixes).toHaveLength(1);
    expect(fixes[0].title).toBe('Create missing component "Missing" in common.yaml');
    expect(fixes[0].code).toBe('external-pointer-not-found');

    await fixes[0].apply();
    const common = getSession(commonId)!;
    expect(common.content).toContain('Missing:');
    expect(common.pendingReveal).toBe('/components/schemas/Missing');
    expect(activeSessionId()).toBe(commonId);
    // The current document was not modified.
    expect(session.content).toBe(rootSpec('./common.yaml#/components/schemas/Missing'));
  });

  it('offers no component fix for a pointer outside /components/<section>/<name>', async () => {
    const { session, external, map, fullRange } = await setup('./common.yaml#/Missing', {
      [COMMON_URI]: COMMON,
    });
    expect(buildExternalQuickFixes(session, external.diagnostics, map, fullRange)).toEqual([]);
  });

  it('offers a create-file fix that writes the scaffold and opens the new tab', async () => {
    const { session, external, map, fullRange } = await setup(
      './missing.yaml#/components/schemas/Pet',
      {}
    );
    const fixes = buildExternalQuickFixes(session, external.diagnostics, map, fullRange);
    expect(fixes).toHaveLength(1);
    expect(fixes[0].title).toBe('Create missing file "missing.yaml"');
    expect(fixes[0].code).toBe('external-file-not-found');

    tauriMocks.invoke.mockResolvedValue(undefined); // write_openapi_ref_file ok
    fsMocks.readTextFile.mockResolvedValue(scaffoldContent('/components/schemas/Pet', 'yaml'));
    await fixes[0].apply();

    const writeCall = tauriMocks.invoke.mock.calls.find(([cmd]) => cmd === 'write_openapi_ref_file');
    expect(writeCall).toBeDefined();
    expect(writeCall![1]).toMatchObject({ path: 'C:\\specs\\missing.yaml' });
    const written = (writeCall![1] as { content: string }).content;
    expect((yaml.load(written) as Record<string, unknown>).components).toBeDefined();
    // Opened as a new tab.
    expect(sessionList().some((s) => s.documentUri === 'C:\\specs\\missing.yaml')).toBe(true);
  });

  it('matches fixes by cursor overlap with the diagnostic marker', async () => {
    const { session, external, map } = await setup('./missing.yaml#/components/schemas/Pet', {});
    // A range far from the $ref (offset 0..1 sits on the openapi key).
    expect(buildExternalQuickFixes(session, external.diagnostics, map, { from: 0, to: 1 })).toEqual([]);
  });

  it('offers nothing for untitled documents', async () => {
    const { external, map, fullRange, session } = await setup(
      './missing.yaml#/components/schemas/Pet',
      {}
    );
    const untitled = { ...session, documentUri: null };
    expect(buildExternalQuickFixes(untitled, external.diagnostics, map, fullRange)).toEqual([]);
  });
});

describe('scaffoldContent', () => {
  it('seeds a components pointer in YAML', () => {
    const parsed = yaml.load(scaffoldContent('/components/schemas/Pet', 'yaml')) as {
      components: { schemas: Record<string, unknown> };
    };
    expect(parsed.components.schemas.Pet).toBeDefined();
  });

  it('produces JSON for json format and an empty doc for other pointers', () => {
    expect(JSON.parse(scaffoldContent('', 'json'))).toEqual({});
    expect(JSON.parse(scaffoldContent('/x/y', 'json'))).toEqual({});
    const parsed = JSON.parse(scaffoldContent('/components/responses/NotFound', 'json'));
    expect(parsed.components.responses.NotFound).toBeDefined();
  });
});
