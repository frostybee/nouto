import { analyzeOpenApi } from '../analyze';
import type { LintOptions } from './types';
import { runLintRules, ALL_LINT_RULES, DEFAULT_DISABLED_RULES } from './registry';

function codesFor(content: string, options?: LintOptions): string[] {
  const analysis = analyzeOpenApi(content, 'yaml');
  return runLintRules(analysis, options).map((diagnostic) => diagnostic.code!);
}

function diagnosticsFor(content: string, options?: LintOptions) {
  return runLintRules(analyzeOpenApi(content, 'yaml'), options);
}

const VIOLATING = [
  'openapi: 3.1.0',
  'info:',
  '  title: T',
  '  version: 1.0.0',
  'servers:',
  '  - url: http://insecure.example',
  '  - url: https://user:pass@creds.example',
  'paths:',
  '  /items:',
  '    get:',
  '      responses:',
  "        '200':",
  '          description: OK',
  'components:',
  '  schemas:',
  '    Unused:',
  '      type: object',
  '',
].join('\n');

describe('runLintRules', () => {
  it('flags the expected security/server/response/metadata violations by default', () => {
    const codes = new Set(codesFor(VIOLATING));
    for (const expected of [
      'operation-without-security',
      'server-uses-http',
      'server-url-has-credentials',
      'operation-missing-4xx',
      'operation-missing-5xx',
      'operation-missing-description',
      'operation-missing-tags',
      'operation-missing-operation-id',
      'missing-info-description',
      'schema-unconstrained-additional-properties',
      'unused-component-schema',
    ]) {
      expect(codes.has(expected)).toBe(true);
    }
  });

  it('stamps every diagnostic with source "lint" and a rule-id code', () => {
    for (const diagnostic of diagnosticsFor(VIOLATING)) {
      expect(diagnostic.source).toBe('lint');
      expect(typeof diagnostic.code).toBe('string');
    }
  });

  it('flags HTTP Basic schemes and API keys in the query string', () => {
    const spec = [
      'openapi: 3.1.0',
      'info: { title: T, version: 1.0.0, description: d }',
      'components:',
      '  securitySchemes:',
      '    basic: { type: http, scheme: basic }',
      '    key: { type: apiKey, in: query, name: k }',
      '',
    ].join('\n');
    const codes = new Set(codesFor(spec));
    expect(codes.has('http-basic-scheme')).toBe(true);
    expect(codes.has('api-key-in-query')).toBe(true);
  });

  it('flags an unbounded string parameter', () => {
    const spec = [
      'openapi: 3.1.0',
      'info: { title: T, version: 1.0.0, description: d }',
      'security: [{ apiKeyAuth: [] }]',
      'paths:',
      '  /search:',
      '    get:',
      '      operationId: search',
      '      summary: Search',
      '      tags: [a]',
      '      parameters:',
      '        - name: q',
      '          in: query',
      '          schema: { type: string }',
      '      responses:',
      "        '200': { description: OK }",
      "        '400': { description: Bad }",
      "        '500': { description: Err }",
      '',
    ].join('\n');
    expect(codesFor(spec)).toContain('parameter-unbounded');
  });

  it('does not flag a referenced component schema as unused', () => {
    const spec = [
      'openapi: 3.1.0',
      'info: { title: T, version: 1.0.0 }',
      'paths:',
      '  /pets:',
      '    get:',
      '      responses:',
      "        '200':",
      '          description: OK',
      '          content:',
      '            application/json:',
      '              schema: { $ref: "#/components/schemas/Pet" }',
      'components:',
      '  schemas:',
      '    Pet: { type: object, additionalProperties: false }',
      '',
    ].join('\n');
    expect(codesFor(spec)).not.toContain('unused-component-schema');
  });

  it('keeps opt-in rules (rate-limit-headers) off by default but enablable', () => {
    expect(DEFAULT_DISABLED_RULES).toContain('rate-limit-headers');
    expect(codesFor(VIOLATING)).not.toContain('rate-limit-headers');
    // An explicit (empty) disabledRules list opts every rule in.
    expect(codesFor(VIOLATING, { disabledRules: [] })).toContain('rate-limit-headers');
  });

  it('honors disabledRules and severityOverrides', () => {
    expect(codesFor(VIOLATING, { disabledRules: ['operation-without-security'] }))
      .not.toContain('operation-without-security');

    const off = codesFor(VIOLATING, { severityOverrides: { 'operation-missing-tags': 'off' } });
    expect(off).not.toContain('operation-missing-tags');

    const escalated = diagnosticsFor(VIOLATING, {
      severityOverrides: { 'operation-missing-tags': 'error' },
    }).filter((diagnostic) => diagnostic.code === 'operation-missing-tags');
    expect(escalated).not.toHaveLength(0);
    expect(escalated.every((diagnostic) => diagnostic.severity === 'error')).toBe(true);
  });

  it('returns nothing when the document did not parse', () => {
    expect(runLintRules(analyzeOpenApi(': not valid', 'yaml'))).toEqual([]);
  });

  it('registers rules with unique ids', () => {
    const ids = ALL_LINT_RULES.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
