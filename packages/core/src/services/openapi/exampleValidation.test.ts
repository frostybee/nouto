import { analyzeOpenApi } from './analyze';
import { validateExampleSites } from './exampleValidation';
import { collectExampleSites } from './lint/exampleSites';
import { ALL_LINT_RULES, LINT_RULES_CATALOG, runLintRules } from './lint/registry';
import { LINT_FIXABLE_CODES } from './lint/quickFixes';

const SPEC = (version: string) => [
  `openapi: ${version}`,
  'info: { title: T, version: 1.0.0 }',
  'paths:',
  '  /pets:',
  '    get:',
  '      parameters:',
  '        - name: limit',
  '          in: query',
  '          schema: { type: integer, maximum: 10 }',
  '          example: 50',
  '        - name: tag',
  '          in: query',
  '          schema: { type: string }',
  '          examples:',
  '            good: { value: dog }',
  '            bad: { value: 3 }',
  '            ext: { externalValue: https://x/y }',
  '            ref: { $ref: "#/components/examples/E" }',
  '      responses:',
  "        '200':",
  '          description: OK',
  '          content:',
  '            application/json:',
  '              schema: { $ref: "#/components/schemas/Pet" }',
  '              example: { id: "not-a-number", extra: 1 }',
  '              examples:',
  '                ok: { value: { id: 1, name: n } }',
  '            text/plain:',
  '              example: anything',
  'components:',
  '  examples:',
  '    E: { value: 1 }',
  '  schemas:',
  '    Pet:',
  '      type: object',
  '      required: [id, name]',
  '      additionalProperties: false',
  '      properties:',
  '        id: { type: integer }',
  '        name: { type: string, example: 7 }',
  '        kind: { type: string, examples: [cat, 5] }',
  '      example: { id: 1, name: ok }',
  '    Ext:',
  '      $ref: "./other.yaml#/X"',
  '      example: 1',
  '',
].join('\n');

describe('collectExampleSites', () => {
  it('finds schema, media type, and parameter examples with the right rule ids', () => {
    const analysis = analyzeOpenApi(SPEC('3.1.0'), 'yaml');
    const sites = collectExampleSites(analysis);
    const byPointer = new Map(sites.map((site) => [site.valuePointer, site]));
    expect(byPointer.get('/components/schemas/Pet/example')?.rule).toBe('example-invalid-schema');
    expect(byPointer.get('/components/schemas/Pet/properties/name/example')?.schemaPointer).toBe('/components/schemas/Pet/properties/name');
    expect(byPointer.get('/components/schemas/Pet/properties/kind/examples/1')?.rule).toBe('example-invalid-schema');
    expect(byPointer.get('/paths/~1pets/get/parameters/0/example')?.rule).toBe('example-invalid-media');
    expect(byPointer.get('/paths/~1pets/get/parameters/1/examples/bad/value')?.value).toBe(3);
    expect(byPointer.get('/paths/~1pets/get/responses/200/content/application~1json/example')?.schemaPointer).toBe(
      '/paths/~1pets/get/responses/200/content/application~1json/schema'
    );
    // Skipped: externalValue, $ref examples, media types without a schema, external-ref schemas.
    expect(byPointer.has('/paths/~1pets/get/parameters/1/examples/ext/value')).toBe(false);
    expect(byPointer.has('/paths/~1pets/get/parameters/1/examples/ref/value')).toBe(false);
    expect(byPointer.has('/paths/~1pets/get/responses/200/content/text~1plain/example')).toBe(false);
    expect(byPointer.has('/components/schemas/Ext/example')).toBe(false);
  });

  it('only collects schema examples[] for 3.1+', () => {
    const sites30 = collectExampleSites(analyzeOpenApi(SPEC('3.0.3'), 'yaml'));
    expect(sites30.some((site) => site.valuePointer.endsWith('/kind/examples/1'))).toBe(false);
  });
});

describe('validateExampleSites (host-side Ajv)', () => {
  it.each(['3.0.3', '3.1.0', '3.2.0'])('reports mismatching examples for %s and stays quiet on valid ones', (version) => {
    const analysis = analyzeOpenApi(SPEC(version), 'yaml');
    const diagnostics = validateExampleSites(analysis, { disabledRules: [] });
    const pointers = diagnostics.map((d) => d.pointer).sort();
    const expected = [
      '/components/schemas/Pet/properties/name/example',
      '/paths/~1pets/get/parameters/0/example',
      '/paths/~1pets/get/parameters/1/examples/bad/value',
      '/paths/~1pets/get/responses/200/content/application~1json/example',
    ];
    if (version !== '3.0.3') expected.push('/components/schemas/Pet/properties/kind/examples/1');
    expect(pointers).toEqual(expected.sort());
    for (const diagnostic of diagnostics) {
      expect(diagnostic.source).toBe('lint');
      expect(['example-invalid-schema', 'example-invalid-media']).toContain(diagnostic.code);
      expect(diagnostic.severity).toBe('warning');
      expect(diagnostic.message).toMatch(/^Example does not match its schema: /);
    }
    const media = diagnostics.find((d) => d.pointer?.endsWith('application~1json/example'))!;
    expect(media.message).toContain('/id must be integer');
    expect(media.message).toContain('unexpected property "extra"');
  });

  it('honours severity overrides and off', () => {
    const analysis = analyzeOpenApi(SPEC('3.1.0'), 'yaml');
    const errors = validateExampleSites(analysis, { severityOverrides: { 'example-invalid-media': 'error', 'example-invalid-schema': 'off' } });
    expect(errors.every((d) => d.code === 'example-invalid-media' && d.severity === 'error')).toBe(true);
    expect(errors.length).toBeGreaterThan(0);
    expect(validateExampleSites(analysis, { severityOverrides: { 'example-invalid-media': 'off', 'example-invalid-schema': 'off' } })).toEqual([]);
  });

  it('returns nothing for unparsed documents', () => {
    expect(validateExampleSites(analyzeOpenApi(': nope', 'yaml'))).toEqual([]);
  });
});

describe('host-validated rule registration', () => {
  it('registers both rules in the catalog with empty run() and no quick fix', () => {
    for (const id of ['example-invalid-schema', 'example-invalid-media']) {
      const rule = ALL_LINT_RULES.find((candidate) => candidate.id === id)!;
      expect(rule.hostValidated).toBe(true);
      expect(rule.run(analyzeOpenApi(SPEC('3.1.0'), 'yaml'))).toEqual([]);
      expect(LINT_RULES_CATALOG.find((entry) => entry.id === id)?.group).toBe('Schemas');
      expect(LINT_FIXABLE_CODES.has(id)).toBe(false);
    }
    expect(runLintRules(analyzeOpenApi(SPEC('3.1.0'), 'yaml')).map((d) => d.code)).not.toContain('example-invalid-schema');
  });
});
