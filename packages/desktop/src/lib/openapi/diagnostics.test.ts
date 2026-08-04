import { describe, it, expect, beforeEach, vi } from 'vitest';
import { analyzeOpenApi } from '@nouto/core/services/openapi/analyze';
import { computeSyncDiagnostics, fetchSchemaDiagnostics } from './diagnostics';

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
    const before = computeSyncDiagnostics(YAML_WITH_ISSUES, 'yaml', analysis)
      .filter((d) => d.source === 'lint');
    expect(before.length).toBeGreaterThan(0);
    const offAll = Object.fromEntries(before.map((d) => [d.code!, 'off' as const]));
    settingsMocks.settings.openApiLintRules = offAll;
    const after = computeSyncDiagnostics(YAML_WITH_ISSUES, 'yaml', analysis)
      .filter((d) => d.source === 'lint');
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
