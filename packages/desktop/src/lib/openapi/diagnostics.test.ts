import { describe, it, expect, beforeEach, vi } from 'vitest';
import { analyzeOpenApi } from '@nouto/core/services/openapi/analyze';
import {
  computeSyncDiagnostics,
  fetchExampleDiagnostics,
  fetchSchemaDiagnostics,
} from './diagnostics';

const tauriMocks = vi.hoisted(() => ({ invoke: vi.fn() }));
const settingsMocks = vi.hoisted(() => ({
  settings: {
    openApiLintEnabled: true,
    openApiLintRules: {} as Record<string, 'error' | 'warning' | 'off'>,
  },
}));

vi.mock('@tauri-apps/api/core', () => tauriMocks);
vi.mock('@nouto/ui/stores/settings.svelte', () => settingsMocks);

// Duplicate operationId -> a 'semantic' diagnostic; no declared security -> lint.
const YAML_WITH_ISSUES = `openapi: 3.1.0
info:
  title: T
  version: 1.0.0
paths:
  /a:
    get:
      operationId: dup
      responses:
        '200':
          description: OK
  /b:
    get:
      operationId: dup
      responses:
        '200':
          description: OK
`;

describe('computeSyncDiagnostics', () => {
  beforeEach(() => {
    settingsMocks.settings.openApiLintEnabled = true;
    settingsMocks.settings.openApiLintRules = {};
  });

  it('returns only syntax diagnostics when there is no analysis', () => {
    const diagnostics = computeSyncDiagnostics('paths: {', 'yaml', null);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.every((d) => d.source === 'syntax')).toBe(true);
  });

  it('merges syntax, semantic/reference, and lint sources', () => {
    const analysis = analyzeOpenApi(YAML_WITH_ISSUES, 'yaml');
    const diagnostics = computeSyncDiagnostics(YAML_WITH_ISSUES, 'yaml', analysis);
    const sources = new Set(diagnostics.map((d) => d.source));
    expect(sources.has('semantic')).toBe(true);
    expect(sources.has('lint')).toBe(true);
    expect(sources.has('syntax')).toBe(false);
  });

  it('omits lint diagnostics when openApiLintEnabled is false', () => {
    settingsMocks.settings.openApiLintEnabled = false;
    const analysis = analyzeOpenApi(YAML_WITH_ISSUES, 'yaml');
    const diagnostics = computeSyncDiagnostics(YAML_WITH_ISSUES, 'yaml', analysis);
    expect(diagnostics.some((d) => d.source === 'lint')).toBe(false);
    expect(diagnostics.some((d) => d.source === 'semantic')).toBe(true);
  });

  it('honors per-rule severity overrides including off', () => {
    const analysis = analyzeOpenApi(YAML_WITH_ISSUES, 'yaml');
    const before = computeSyncDiagnostics(YAML_WITH_ISSUES, 'yaml', analysis).filter(
      (d) => d.source === 'lint',
    );
    expect(before.length).toBeGreaterThan(0);
    const offAll = Object.fromEntries(before.map((d) => [d.code!, 'off' as const]));
    settingsMocks.settings.openApiLintRules = offAll;
    const after = computeSyncDiagnostics(YAML_WITH_ISSUES, 'yaml', analysis).filter(
      (d) => d.source === 'lint',
    );
    expect(after).toEqual([]);
  });
});

describe('fetchSchemaDiagnostics', () => {
  beforeEach(() => {
    tauriMocks.invoke.mockReset();
  });

  it('maps Rust diagnostics to schema-source OpenApiDiagnostics', async () => {
    tauriMocks.invoke.mockResolvedValue([
      { pointer: '', message: "Missing property 'info'", missingProperty: 'info' },
      { pointer: '/paths/~1a/get', message: 'not valid' },
    ]);
    const result = await fetchSchemaDiagnostics({ openapi: '3.1.0' }, '3.1');
    expect(tauriMocks.invoke).toHaveBeenCalledWith('validate_openapi_schema', {
      spec: { openapi: '3.1.0' },
      version: '3.1',
    });
    expect(result).toEqual([
      {
        source: 'schema',
        severity: 'error',
        message: "Missing property 'info'",
        pointer: '',
        data: { missingProperty: 'info' },
      },
      {
        source: 'schema',
        severity: 'error',
        message: 'not valid',
        pointer: '/paths/~1a/get',
        data: undefined,
      },
    ]);
  });

  it('resolves to an empty list instead of throwing on invoke failure', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    tauriMocks.invoke.mockRejectedValue(new Error('boom'));
    await expect(fetchSchemaDiagnostics({}, '3.1')).resolves.toEqual([]);
    consoleError.mockRestore();
  });
});

describe('fetchExampleDiagnostics', () => {
  const WITH_EXAMPLE = `openapi: 3.1.0
info: { title: T, version: 1.0.0 }
paths:
  /a:
    get:
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema: { type: integer }
              example: nope
`;

  beforeEach(() => {
    tauriMocks.invoke.mockReset();
    settingsMocks.settings.openApiLintEnabled = true;
    settingsMocks.settings.openApiLintRules = {};
  });

  it('sends the collected sites to Rust and maps results to lint diagnostics with the rule severity', async () => {
    tauriMocks.invoke.mockResolvedValue([
      {
        rule: 'example-invalid-media',
        pointer: '/paths/~1a/get/responses/200/content/application~1json/example',
        message: 'Example does not match its schema: must be integer.',
      },
    ]);
    settingsMocks.settings.openApiLintRules = { 'example-invalid-media': 'error' };
    const analysis = analyzeOpenApi(WITH_EXAMPLE, 'yaml');
    const result = await fetchExampleDiagnostics(analysis);
    expect(tauriMocks.invoke).toHaveBeenCalledTimes(1);
    const [command, payload] = tauriMocks.invoke.mock.calls[0] as [
      string,
      { version: string; sites: unknown[] },
    ];
    expect(command).toBe('validate_openapi_examples');
    expect(payload.version).toBe('3.1');
    expect(payload.sites).toEqual([
      {
        rule: 'example-invalid-media',
        valuePointer: '/paths/~1a/get/responses/200/content/application~1json/example',
        schemaPointer: '/paths/~1a/get/responses/200/content/application~1json/schema',
        value: 'nope',
      },
    ]);
    expect(result).toEqual([
      {
        source: 'lint',
        severity: 'error',
        code: 'example-invalid-media',
        pointer: '/paths/~1a/get/responses/200/content/application~1json/example',
        message: 'Example does not match its schema: must be integer.',
      },
    ]);
  });

  it('skips the round trip when the rules are off, lint is disabled, or there are no sites', async () => {
    const analysis = analyzeOpenApi(WITH_EXAMPLE, 'yaml');
    settingsMocks.settings.openApiLintRules = {
      'example-invalid-media': 'off',
      'example-invalid-schema': 'off',
    };
    await expect(fetchExampleDiagnostics(analysis)).resolves.toEqual([]);
    settingsMocks.settings.openApiLintRules = {};
    settingsMocks.settings.openApiLintEnabled = false;
    await expect(fetchExampleDiagnostics(analysis)).resolves.toEqual([]);
    settingsMocks.settings.openApiLintEnabled = true;
    const noExamples = ['openapi: 3.1.0', 'info: { title: T, version: 1 }', 'paths: {}', ''].join(
      '\n',
    );
    await expect(fetchExampleDiagnostics(analyzeOpenApi(noExamples, 'yaml'))).resolves.toEqual([]);
    expect(tauriMocks.invoke).not.toHaveBeenCalled();
  });

  it('resolves to an empty list instead of throwing on invoke failure', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    tauriMocks.invoke.mockRejectedValue(new Error('boom'));
    await expect(fetchExampleDiagnostics(analyzeOpenApi(WITH_EXAMPLE, 'yaml'))).resolves.toEqual(
      [],
    );
    consoleError.mockRestore();
  });
});
