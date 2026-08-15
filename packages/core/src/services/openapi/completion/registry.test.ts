import { analyzeOpenApi } from '../analyze';
import {
  ALL_NODE_KIND_TABLES,
  getCompletions,
  getEnumValues,
  getPropertyDocs,
  getDynamicKeyCandidates,
} from './registry';

function names(kind: Parameters<typeof getCompletions>[0], version: Parameters<typeof getCompletions>[1]): string[] {
  return getCompletions(kind, version).map((entry) => entry.name);
}

describe('getCompletions', () => {
  it('returns the Operation properties', () => {
    const ops = names('Operation', '3.1');
    expect(ops).toEqual(expect.arrayContaining(['operationId', 'summary', 'parameters', 'requestBody', 'responses']));
  });

  it('returns [] for unknown / tableless kinds', () => {
    expect(getCompletions('Unknown', '3.1')).toEqual([]);
    expect(getCompletions('Paths', '3.1')).toEqual([]);
    expect(getCompletions('SecurityRequirement', '3.1')).toEqual([]);
  });

  it('applies version gating on the Root object', () => {
    expect(names('Root', '3.0')).not.toContain('webhooks');
    expect(names('Root', '3.0')).not.toContain('jsonSchemaDialect');
    expect(names('Root', '3.1')).toEqual(expect.arrayContaining(['webhooks', 'jsonSchemaDialect']));
    expect(names('Root', '3.2')).toContain('$self');
    expect(names('Root', '3.1')).not.toContain('$self');
  });

  it('applies version gating on the Path Item object (3.2 query / additionalOperations)', () => {
    expect(names('PathItem', '3.1')).not.toContain('query');
    expect(names('PathItem', '3.1')).not.toContain('additionalOperations');
    expect(names('PathItem', '3.2')).toEqual(expect.arrayContaining(['query', 'additionalOperations']));
  });

  it('resolves the exclusiveMinimum boolean/numeric split without duplicating the key', () => {
    const v30 = getCompletions('Schema', '3.0').filter((e) => e.name === 'exclusiveMinimum');
    const v31 = getCompletions('Schema', '3.1').filter((e) => e.name === 'exclusiveMinimum');
    expect(v30).toHaveLength(1);
    expect(v31).toHaveLength(1);
    expect(v30[0].enumValues).toBeDefined(); // 3.0 boolean form
    expect(v31[0].enumValues).toBeUndefined(); // 3.1 numeric form
  });

  it('gates 3.0-only nullable and 3.1+ 2020-12 keywords on Schema', () => {
    expect(names('Schema', '3.0')).toContain('nullable');
    expect(names('Schema', '3.1')).not.toContain('nullable');
    expect(names('Schema', '3.0')).not.toContain('prefixItems');
    expect(names('Schema', '3.1')).toEqual(expect.arrayContaining(['const', 'prefixItems', 'patternProperties']));
  });

  it('excludes already-present keys', () => {
    const existing = new Set(['operationId', 'responses']);
    const ops = getCompletions('Operation', '3.1', { existingKeys: existing }).map((e) => e.name);
    expect(ops).not.toContain('operationId');
    expect(ops).not.toContain('responses');
    expect(ops).toContain('summary');
  });

  it('never emits a duplicate property name for any kind/version', () => {
    for (const version of ['3.0', '3.1', '3.2'] as const) {
      for (const table of ALL_NODE_KIND_TABLES) {
        const emitted = getCompletions(table.kind, version).map((e) => e.name);
        expect(new Set(emitted).size).toBe(emitted.length);
      }
    }
  });
});

describe('getEnumValues', () => {
  it('returns parameter location values', () => {
    expect(getEnumValues('Parameter', 'in', '3.1')?.map((v) => v.value)).toEqual([
      'query',
      'header',
      'path',
      'cookie',
    ]);
  });

  it('gates the 3.2 querystring parameter location by version', () => {
    expect(getEnumValues('Parameter', 'in', '3.1')?.map((v) => v.value)).not.toContain('querystring');
    expect(getEnumValues('Parameter', 'in', '3.2')?.map((v) => v.value)).toContain('querystring');
  });

  it('gates the 3.2 discriminator defaultMapping property by version', () => {
    expect(getCompletions('Discriminator', '3.1').map((entry) => entry.name)).not.toContain('defaultMapping');
    expect(getCompletions('Discriminator', '3.2').map((entry) => entry.name)).toContain('defaultMapping');
    expect(getPropertyDocs('Discriminator', 'defaultMapping', '3.2')).toBeDefined();
  });

  it('gates the null type value by version', () => {
    expect(getEnumValues('Schema', 'type', '3.0')?.map((v) => v.value)).not.toContain('null');
    expect(getEnumValues('Schema', 'type', '3.1')?.map((v) => v.value)).toContain('null');
  });

  it('gates mutualTLS security scheme type by version', () => {
    expect(getEnumValues('SecurityScheme', 'type', '3.0')?.map((v) => v.value)).not.toContain('mutualTLS');
    expect(getEnumValues('SecurityScheme', 'type', '3.1')?.map((v) => v.value)).toContain('mutualTLS');
  });

  it('returns undefined for non-enum properties', () => {
    expect(getEnumValues('Operation', 'operationId', '3.1')).toBeUndefined();
  });
});

describe('getPropertyDocs', () => {
  it('returns markdown docs for a known property', () => {
    expect(getPropertyDocs('Operation', 'operationId', '3.1')).toMatch(/identify the operation/i);
  });

  it('returns undefined for unknown kind/property', () => {
    expect(getPropertyDocs('Operation', 'nope', '3.1')).toBeUndefined();
    expect(getPropertyDocs('Unknown', 'anything', '3.1')).toBeUndefined();
  });

  it('returns the version-appropriate docs for a split property', () => {
    expect(getPropertyDocs('Schema', 'exclusiveMinimum', '3.0')).toMatch(/boolean form/i);
    expect(getPropertyDocs('Schema', 'exclusiveMinimum', '3.1')).toMatch(/numeric form/i);
  });
});

describe('getDynamicKeyCandidates', () => {
  it('returns defined security scheme names for a Security Requirement', () => {
    const spec = [
      'openapi: 3.1.0',
      'info:',
      '  title: T',
      '  version: 1.0.0',
      'paths: {}',
      'components:',
      '  securitySchemes:',
      '    apiKey:',
      '      type: apiKey',
      '      name: X-Key',
      '      in: header',
      '    oauth:',
      '      type: oauth2',
      '      flows: {}',
      '',
    ].join('\n');
    const analysis = analyzeOpenApi(spec, 'yaml');
    expect(getDynamicKeyCandidates('SecurityRequirement', analysis).sort()).toEqual(['apiKey', 'oauth']);
  });

  it('returns [] for other kinds or when no schemes exist', () => {
    const analysis = analyzeOpenApi('openapi: 3.1.0\ninfo:\n  title: T\n  version: 1.0.0\npaths: {}\n', 'yaml');
    expect(getDynamicKeyCandidates('SecurityRequirement', analysis)).toEqual([]);
    expect(getDynamicKeyCandidates('Operation', analysis)).toEqual([]);
  });
});
