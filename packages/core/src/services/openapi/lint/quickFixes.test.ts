import { analyzeOpenApi } from '../analyze';
import type { OpenApiFormat } from '../types';
import type { SpecTextEdit } from '../specEdit';
import { deriveOperationId } from '../specNaming';
import { runLintRules } from './registry';
import { LINT_FIXABLE_CODES, planLintQuickFix } from './quickFixes';

const YAML_SPEC = [
  'openapi: 3.1.0',
  'info: { title: T, version: 1.0.0, description: d }',
  'security: [{ key: [] }]',
  'paths:',
  '  /store/order/{orderId}:',
  '    get:',
  '      parameters:',
  '        - name: orderId',
  '          in: path',
  '          required: true',
  '          schema:',
  '            type: string',
  '        - name: tags',
  '          in: query',
  '          schema:',
  '            type: array',
  '            items: { type: string }',
  '        - $ref: "#/components/parameters/Shared"',
  '      responses:',
  "        '200':",
  '          description: ok',
  'components:',
  '  securitySchemes:',
  '    key: { type: apiKey, in: header, name: X-Key }',
  '  parameters:',
  '    Shared:',
  '      name: q',
  '      in: query',
  '      schema:',
  '        type: string',
  '  schemas:',
  '    Pet:',
  '      type: object',
  '      properties:',
  '        id: { type: integer }',
  '    Loose:',
  '      type: object',
  '      additionalProperties: true',
  '',
].join('\n');

const JSON_SPEC = JSON.stringify(
  {
    openapi: '3.1.0',
    info: { title: 'T', version: '1.0.0', description: 'd' },
    security: [{ key: [] }],
    paths: {
      '/pets': {
        get: {
          parameters: [{ name: 'q', in: 'query', schema: { type: 'string' } }],
          responses: { '200': { description: 'ok' } },
        },
      },
    },
    components: {
      securitySchemes: { key: { type: 'apiKey', in: 'header', name: 'X-Key' } },
    },
  },
  null,
  2
);

function applyEdits(text: string, edits: SpecTextEdit[]): string {
  let result = text;
  for (const edit of [...edits].sort((a, b) => b.offset - a.offset)) {
    result = result.slice(0, edit.offset) + edit.text + result.slice(edit.offset + edit.length);
  }
  return result;
}

function lintDiagnostics(text: string, format: OpenApiFormat) {
  const analysis = analyzeOpenApi(text, format);
  return { analysis, diagnostics: runLintRules(analysis, { disabledRules: [] }) };
}

/**
 * Applies the fix for every diagnostic with `code` (matching `pointer` when
 * given) and returns the codes still reported afterwards plus the fixed text.
 */
function fixAndRelint(text: string, format: OpenApiFormat, code: string, pointer?: string) {
  const { analysis, diagnostics } = lintDiagnostics(text, format);
  const target = diagnostics.find(
    (d) => d.code === code && (pointer === undefined || d.pointer === pointer)
  );
  expect(target).toBeDefined();
  const fix = planLintQuickFix({ text, format }, target!, analysis);
  expect(fix).toBeDefined();
  const fixed = applyEdits(text, fix!.edits);
  const codesAfter = lintDiagnostics(fixed, format).diagnostics.map((d) => d.code);
  return { fix: fix!, fixed, codesAfter };
}

describe('planLintQuickFix', () => {
  it('lists exactly the rules that have a fix', () => {
    expect([...LINT_FIXABLE_CODES].sort()).toEqual([
      'operation-missing-4xx',
      'operation-missing-5xx',
      'operation-missing-operation-id',
      'operation-missing-tags',
      'parameter-unbounded',
      'schema-unconstrained-additional-properties',
    ]);
  });

  it('returns undefined for non-lint diagnostics and rules without a fix', () => {
    const { analysis, diagnostics } = lintDiagnostics(YAML_SPEC, 'yaml');
    const noFix = diagnostics.find((d) => d.code === 'operation-missing-description')!;
    expect(planLintQuickFix({ text: YAML_SPEC, format: 'yaml' }, noFix, analysis)).toBeUndefined();
    expect(
      planLintQuickFix(
        { text: YAML_SPEC, format: 'yaml' },
        { ...noFix, source: 'semantic', code: 'operation-missing-4xx' },
        analysis
      )
    ).toBeUndefined();
  });

  it.each(['yaml', 'json'] as const)(
    'adds a default response that clears both 4xx and 5xx (%s)',
    (format) => {
      const text = format === 'yaml' ? YAML_SPEC : JSON_SPEC;
      const { fix, fixed, codesAfter } = fixAndRelint(text, format, 'operation-missing-5xx');
      expect(fix.title).toBe('Add "default" response');
      expect(fixed).toContain('default');
      expect(fixed).toContain('Unexpected error');
      expect(codesAfter).not.toContain('operation-missing-4xx');
      expect(codesAfter).not.toContain('operation-missing-5xx');
    }
  );

  it('gives 4xx and 5xx findings on the same operation the same fix key', () => {
    const { analysis, diagnostics } = lintDiagnostics(YAML_SPEC, 'yaml');
    const doc = { text: YAML_SPEC, format: 'yaml' as const };
    const four = planLintQuickFix(doc, diagnostics.find((d) => d.code === 'operation-missing-4xx')!, analysis);
    const five = planLintQuickFix(doc, diagnostics.find((d) => d.code === 'operation-missing-5xx')!, analysis);
    expect(four?.key).toBe(five?.key);
    expect(four?.edits).toEqual(five?.edits);
  });

  it('adds maxLength to a string parameter and maxItems to an array parameter', () => {
    const base = '/paths/~1store~1order~1{orderId}/get/parameters';
    const str = fixAndRelint(YAML_SPEC, 'yaml', 'parameter-unbounded', `${base}/0`);
    expect(str.fix.title).toBe('Add maxLength: 255');
    expect(str.fixed).toMatch(/type: string\n\s+maxLength: 255/);
    expect(str.codesAfter.filter((c) => c === 'parameter-unbounded')).toHaveLength(2);

    const arr = fixAndRelint(YAML_SPEC, 'yaml', 'parameter-unbounded', `${base}/1`);
    expect(arr.fix.title).toBe('Add maxItems: 100');
    expect(arr.fixed).toMatch(/maxItems: 100/);

    const json = fixAndRelint(JSON_SPEC, 'json', 'parameter-unbounded');
    expect(json.fixed).toContain('"maxLength": 255');
    expect(json.codesAfter).not.toContain('parameter-unbounded');
  });

  it('offers no fix for a $ref parameter (shared definition)', () => {
    const { analysis, diagnostics } = lintDiagnostics(YAML_SPEC, 'yaml');
    const shared = diagnostics.find(
      (d) => d.code === 'parameter-unbounded' && d.pointer?.endsWith('/parameters/2')
    );
    expect(shared).toBeDefined();
    expect(planLintQuickFix({ text: YAML_SPEC, format: 'yaml' }, shared!, analysis)).toBeUndefined();
  });

  it('constrains additionalProperties whether absent or explicitly true', () => {
    const absent = fixAndRelint(
      YAML_SPEC, 'yaml', 'schema-unconstrained-additional-properties', '/components/schemas/Pet'
    );
    expect(absent.fix.title).toBe('Set additionalProperties: false');
    expect(absent.fixed).toMatch(/Pet:[\s\S]*?additionalProperties: false/);

    const explicit = fixAndRelint(
      YAML_SPEC, 'yaml', 'schema-unconstrained-additional-properties', '/components/schemas/Loose'
    );
    expect(explicit.fixed).toContain('additionalProperties: false');
    expect(explicit.fixed).not.toContain('additionalProperties: true');
    expect(
      explicit.codesAfter.filter((c) => c === 'schema-unconstrained-additional-properties')
    ).toHaveLength(1); // Pet still flagged, Loose fixed
  });

  it('adds a tag from the first static path segment', () => {
    const { fix, fixed, codesAfter } = fixAndRelint(YAML_SPEC, 'yaml', 'operation-missing-tags');
    expect(fix.title).toBe('Add tag "store"');
    expect(fixed).toMatch(/tags:\n\s+- store/);
    expect(codesAfter).not.toContain('operation-missing-tags');
  });

  it('adds a derived, collision-free operationId', () => {
    const { fix, fixed, codesAfter } = fixAndRelint(YAML_SPEC, 'yaml', 'operation-missing-operation-id');
    expect(fix.title).toBe('Add operationId "getStoreOrderByOrderId"');
    expect(fixed).toContain('operationId: getStoreOrderByOrderId');
    expect(codesAfter).not.toContain('operation-missing-operation-id');
  });

  it('overwrites an empty operationId instead of inserting a duplicate key', () => {
    const text = YAML_SPEC.replace('    get:\n', "    get:\n      operationId: ''\n");
    const { fixed } = fixAndRelint(text, 'yaml', 'operation-missing-operation-id');
    expect(fixed.match(/operationId:/g)).toHaveLength(1);
    expect(fixed).toContain('operationId: getStoreOrderByOrderId');
  });
});

describe('deriveOperationId', () => {
  it.each([
    ['get', '/store/order/{orderId}', 'getStoreOrderByOrderId'],
    ['QUERY', '/pet/search', 'queryPetSearch'],
    ['get', '/', 'getRoot'],
    ['post', '/user-profiles/:id/avatar.png', 'postUserProfilesByIdAvatarPng'],
    ['delete', '/v1/{tenant_id}', 'deleteV1ByTenantId'],
  ])('%s %s -> %s', (method, path, expected) => {
    expect(deriveOperationId(method, path)).toBe(expected);
  });
});
