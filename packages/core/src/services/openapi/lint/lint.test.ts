import { analyzeOpenApi } from '../analyze';
import type { LintOptions } from './types';
import {
  runLintRules,
  ALL_LINT_RULES,
  DEFAULT_DISABLED_RULES,
  LINT_RULES_CATALOG,
  lintOptionsFromSettings,
  effectiveSeverity,
} from './registry';

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

  it('marks absence-type findings as anchored and leaves value-targeting ones alone', () => {
    const byCode = new Map(diagnosticsFor(VIOLATING).map((d) => [d.code, d]));
    for (const anchored of [
      'operation-without-security',
      'operation-missing-4xx',
      'operation-missing-5xx',
      'operation-missing-description',
      'operation-missing-tags',
      'operation-missing-operation-id',
      'missing-info-description',
      'schema-unconstrained-additional-properties',
      'unused-component-schema',
    ]) {
      expect(byCode.get(anchored)?.data).toEqual({ anchor: true });
    }
    for (const valueTargeting of ['server-uses-http', 'server-url-has-credentials']) {
      expect(byCode.get(valueTargeting)?.data).toBeUndefined();
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

  it('exposes a catalog covering every rule with unique ids and a group', () => {
    const catalogIds = LINT_RULES_CATALOG.map((entry) => entry.id).sort();
    const ruleIds = ALL_LINT_RULES.map((rule) => rule.id).sort();
    expect(catalogIds).toEqual(ruleIds);
    expect(new Set(catalogIds).size).toBe(catalogIds.length);
    expect(LINT_RULES_CATALOG.every((entry) => entry.group.length > 0)).toBe(true);
    // Each catalog entry mirrors its rule's default severity.
    for (const rule of ALL_LINT_RULES) {
      const entry = LINT_RULES_CATALOG.find((candidate) => candidate.id === rule.id)!;
      expect(entry.defaultSeverity).toBe(rule.defaultSeverity);
    }
  });

  it('groups the policy rules separately in the catalog', () => {
    const groupOf = (id: string) => LINT_RULES_CATALOG.find((entry) => entry.id === id)?.group;
    expect(groupOf('operation-without-security')).toBe('Policy');
    expect(groupOf('unused-component-schema')).toBe('Policy');
    expect(groupOf('rate-limit-headers')).toBe('Opt-in');
    expect(groupOf('http-basic-scheme')).toBe('Security');
  });

  describe('lintOptionsFromSettings', () => {
    it('keeps opt-in rules disabled until the user sets a severity', () => {
      const options = lintOptionsFromSettings({});
      expect(options.disabledRules).toEqual(DEFAULT_DISABLED_RULES);
      expect(codesFor(VIOLATING, options)).not.toContain('rate-limit-headers');
    });

    it('enables an opt-in rule once a severity is stored, and honours off/overrides', () => {
      const options = lintOptionsFromSettings({ 'rate-limit-headers': 'warning', 'operation-missing-tags': 'off' });
      expect(options.disabledRules).not.toContain('rate-limit-headers');
      const codes = codesFor(VIOLATING, options);
      expect(codes).toContain('rate-limit-headers');
      expect(codes).not.toContain('operation-missing-tags');
    });

    it('treats an undefined map like an empty one', () => {
      expect(lintOptionsFromSettings(undefined)).toEqual({
        disabledRules: DEFAULT_DISABLED_RULES,
        severityOverrides: {},
      });
    });
  });

  describe('effectiveSeverity', () => {
    const rule = ALL_LINT_RULES.find((candidate) => candidate.id === 'operation-missing-tags')!;
    const optIn = ALL_LINT_RULES.find((candidate) => candidate.id === 'rate-limit-headers')!;

    it('returns the default, the override, or off', () => {
      expect(effectiveSeverity(rule)).toBe('warning');
      expect(effectiveSeverity(rule, { severityOverrides: { 'operation-missing-tags': 'error' } })).toBe('error');
      expect(effectiveSeverity(rule, { severityOverrides: { 'operation-missing-tags': 'off' } })).toBe('off');
      expect(effectiveSeverity(rule, { disabledRules: ['operation-missing-tags'] })).toBe('off');
    });

    it('applies the default opt-in set when no disabled list is given', () => {
      expect(effectiveSeverity(optIn)).toBe('off');
      expect(effectiveSeverity(optIn, { disabledRules: [] })).toBe('warning');
    });
  });
});
