import { analyzeOpenApi } from '../analyze';
import type { OpenApiFormat } from '../types';
import type { SpecTextEdit } from '../specEdit';
import { deriveOperationId, humanizeIdentifier } from '../specNaming';
import { runLintRules } from './registry';
import { LINT_FIXABLE_CODES, planLintQuickFixes } from './quickFixes';

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
  const fixes = planLintQuickFixes({ text, format }, target!, analysis);
  expect(fixes.length).toBeGreaterThan(0);
  const fix = fixes[0];
  const fixed = applyEdits(text, fix.edits);
  const codesAfter = lintDiagnostics(fixed, format).diagnostics.map((d) => d.code);
  return { fix, fixed, codesAfter };
}

describe('planLintQuickFix', () => {
  it('lists exactly the rules that have a fix', () => {
    expect([...LINT_FIXABLE_CODES].sort()).toEqual([
      'api-key-in-query',
      'missing-info-description',
      'operation-missing-4xx',
      'operation-missing-5xx',
      'operation-missing-description',
      'operation-missing-operation-id',
      'operation-missing-tags',
      'operation-without-security',
      'parameter-unbounded',
      'rate-limit-headers',
      'schema-unconstrained-additional-properties',
      'server-url-has-credentials',
      'server-uses-http',
      'unused-component-schema',
    ]);
  });

  it('returns undefined for non-lint diagnostics and rules without a fix', () => {
    const { analysis, diagnostics } = lintDiagnostics(YAML_SPEC, 'yaml');
    const noFix = diagnostics.find((d) => d.code === 'operation-missing-description')!;
    const basic = lintDiagnostics(YAML_SPEC.replace('key: { type: apiKey, in: header, name: X-Key }', 'key: { type: http, scheme: basic }'), 'yaml');
    const basicFinding = basic.diagnostics.find((d) => d.code === 'http-basic-scheme')!;
    expect(planLintQuickFixes({ text: YAML_SPEC, format: 'yaml' }, basicFinding, basic.analysis)).toEqual([]);
    expect(
      planLintQuickFixes(
        { text: YAML_SPEC, format: 'yaml' },
        { ...noFix, source: 'semantic', code: 'operation-missing-4xx' },
        analysis
      )
    ).toEqual([]);
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
    const [four] = planLintQuickFixes(doc, diagnostics.find((d) => d.code === 'operation-missing-4xx')!, analysis);
    const [five] = planLintQuickFixes(doc, diagnostics.find((d) => d.code === 'operation-missing-5xx')!, analysis);
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
    expect(planLintQuickFixes({ text: YAML_SPEC, format: 'yaml' }, shared!, analysis)).toEqual([]);
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

describe('planLintQuickFixes: security, servers, unused schema', () => {
  const SECURITY_SPEC = [
    'openapi: 3.0.4',
    'info: { title: T, version: 1.0.0, description: d }',
    'servers:',
    '  - url: http://petstore.example/api/v3',
    '  - url: https://user:s3cret@creds.example/v1?x=1',
    '  - url: http://admin:pw@both.example',
    'paths:',
    '  /store/order:',
    '    post:',
    '      operationId: placeOrder',
    '      summary: Place',
    '      tags: [store]',
    '      responses:',
    "        '200': { description: OK }",
    "        '400': { description: Bad }",
    "        default: { description: Err }",
    '  /store/inventory:',
    '    get:',
    '      operationId: getInventory',
    '      summary: Inventory',
    '      tags: [store]',
    '      security: []',
    '      responses:',
    "        '200': { description: OK }",
    "        '400': { description: Bad }",
    "        default: { description: Err }",
    'components:',
    '  securitySchemes:',
    '    petstore_auth:',
    '      type: oauth2',
    '      flows: { implicit: { authorizationUrl: https://a.example, scopes: { read: r } } }',
    '    api_key:',
    '      type: apiKey',
    '      name: api_key',
    '      in: query',
    '  schemas:',
    '    Order:',
    '      type: object',
    '      additionalProperties: false',
    '    Unused:',
    '      type: object',
    '      additionalProperties: false',
    '',
  ].join('\n');

  const doc = { text: SECURITY_SPEC, format: 'yaml' as const };

  function fixesFor(code: string, pointer?: string) {
    const { analysis, diagnostics } = lintDiagnostics(SECURITY_SPEC, 'yaml');
    const target = diagnostics.find((d) => d.code === code && (pointer === undefined || d.pointer === pointer));
    expect(target).toBeDefined();
    return planLintQuickFixes(doc, target!, analysis);
  }

  it('offers per-operation and global requirements for every scheme, in that order', () => {
    const fixes = fixesFor('operation-without-security', '/paths/~1store~1order/post');
    expect(fixes.map((f) => f.title)).toEqual([
      'Require "petstore_auth" for this operation',
      'Require "api_key" for this operation',
      'Require "petstore_auth" for all operations',
      'Require "api_key" for all operations',
    ]);
    expect(fixes[2].key).toBe('require-global-security@petstore_auth');
  });

  it('a per-operation requirement clears only that operation', () => {
    const [local] = fixesFor('operation-without-security', '/paths/~1store~1order/post');
    const fixed = applyEdits(SECURITY_SPEC, local.edits);
    expect(fixed).toMatch(/post:[\s\S]*?security:\n\s+- petstore_auth: \[\]/);
    const remaining = lintDiagnostics(fixed, 'yaml').diagnostics.filter((d) => d.code === 'operation-without-security');
    expect(remaining.map((d) => d.pointer)).toEqual(['/paths/~1store~1inventory/get']);
  });

  it('a global requirement clears every operation and lands in root order', () => {
    const global = fixesFor('operation-without-security', '/paths/~1store~1order/post')[2];
    const fixed = applyEdits(SECURITY_SPEC, global.edits);
    expect(fixed).toMatch(/servers:[\s\S]*security:\n\s+- petstore_auth: \[\]\npaths:/);
    const codes = lintDiagnostics(fixed, 'yaml').diagnostics.map((d) => d.code);
    expect(codes).not.toContain('operation-without-security');
  });

  it('appends to an existing empty security array instead of duplicating the key', () => {
    const [local] = fixesFor('operation-without-security', '/paths/~1store~1inventory/get');
    const fixed = applyEdits(SECURITY_SPEC, local.edits);
    expect(fixed.match(/security:/g)).toHaveLength(1);
    expect(fixed).toContain('- petstore_auth: []');
  });

  it('offers nothing to require when the document defines no security schemes', () => {
    const noSchemes = SECURITY_SPEC.replace(/  securitySchemes:[\s\S]*?  schemas:/, '  schemas:');
    const { analysis, diagnostics } = lintDiagnostics(noSchemes, 'yaml');
    const target = diagnostics.find((d) => d.code === 'operation-without-security')!;
    expect(planLintQuickFixes({ text: noSchemes, format: 'yaml' }, target, analysis)).toEqual([]);
  });

  it('moves an API key from query to header', () => {
    const [fix] = fixesFor('api-key-in-query');
    expect(fix.title).toBe('Move API key "api_key" to header');
    const fixed = applyEdits(SECURITY_SPEC, fix.edits);
    expect(fixed).toContain('in: header');
    expect(lintDiagnostics(fixed, 'yaml').diagnostics.map((d) => d.code)).not.toContain('api-key-in-query');
  });

  it('switches a server url to https and strips credentials, independently', () => {
    const [https] = fixesFor('server-uses-http', '/servers/0/url');
    expect(https.title).toBe('Use https://');
    expect(applyEdits(SECURITY_SPEC, https.edits)).toContain('url: https://petstore.example/api/v3');

    const [strip] = fixesFor('server-url-has-credentials', '/servers/1/url');
    expect(strip.title).toBe('Remove credentials from server URL');
    expect(applyEdits(SECURITY_SPEC, strip.edits)).toContain('url: https://creds.example/v1?x=1');
  });

  it('offers both fixes on a url that is http and has credentials, and they compose', () => {
    const [https] = fixesFor('server-uses-http', '/servers/2/url');
    const [strip] = fixesFor('server-url-has-credentials', '/servers/2/url');
    expect(https.key).not.toBe(strip.key);
    const once = applyEdits(SECURITY_SPEC, https.edits);
    const { analysis, diagnostics } = lintDiagnostics(once, 'yaml');
    const again = diagnostics.find((d) => d.code === 'server-url-has-credentials' && d.pointer === '/servers/2/url')!;
    const [strip2] = planLintQuickFixes({ text: once, format: 'yaml' }, again, analysis);
    const twice = applyEdits(once, strip2.edits);
    expect(twice).toContain('url: https://both.example');
    const codes = lintDiagnostics(twice, 'yaml').diagnostics.filter((d) => d.pointer === '/servers/2/url');
    expect(codes).toEqual([]);
  });

  it('removes an unused component schema and leaves the others', () => {
    const [fix] = fixesFor('unused-component-schema', '/components/schemas/Unused');
    expect(fix.title).toBe('Remove unused schema "Unused"');
    const fixed = applyEdits(SECURITY_SPEC, fix.edits);
    expect(fixed).not.toContain('Unused:');
    expect(fixed).toContain('Order:');
    const after = lintDiagnostics(fixed, 'yaml');
    expect(after.analysis.parsedSpec).toBeTruthy();
    // `Order` is unreferenced in this fixture too; only `Unused` must be gone.
    expect(after.diagnostics.map((d) => d.pointer)).not.toContain('/components/schemas/Unused');
    expect(after.diagnostics.map((d) => d.pointer)).toContain('/components/schemas/Order');
  });
});

describe('planLintQuickFixes: rate-limit-headers', () => {
  const RL_YAML = [
    'openapi: 3.1.0',
    'info: { title: T, version: 1.0.0, description: d }',
    'security: [{ key: [] }]',
    'paths:',
    '  /bare:',
    '    get:',
    '      operationId: bare',
    '      summary: s',
    '      tags: [t]',
    '      responses:',
    "        '200':",
    '          description: ok',
    "        '201':",
    '          description: created',
    "        '400': { description: bad }",
    '        default: { description: err }',
    '  /with-headers:',
    '    get:',
    '      operationId: withHeaders',
    '      summary: s',
    '      tags: [t]',
    '      responses:',
    "        '200':",
    '          description: ok',
    '          headers:',
    '            X-Request-Id:',
    '              schema: { type: string }',
    "        '400': { description: bad }",
    '        default: { description: err }',
    '  /partial:',
    '    get:',
    '      operationId: partial',
    '      summary: s',
    '      tags: [t]',
    '      responses:',
    "        '200':",
    '          description: ok',
    '          headers:',
    '            RateLimit-Limit: { schema: { type: integer } }',
    "        '400': { description: bad }",
    '        default: { description: err }',
    '  /ref-only:',
    '    get:',
    '      operationId: refOnly',
    '      summary: s',
    '      tags: [t]',
    '      responses:',
    "        '200': { $ref: '#/components/responses/Ok' }",
    "        '400': { description: bad }",
    '        default: { description: err }',
    'components:',
    '  securitySchemes:',
    '    key: { type: apiKey, in: header, name: X-Key }',
    '  responses:',
    '    Ok: { description: ok }',
    '',
  ].join('\n');

  const RL_JSON = JSON.stringify({
    openapi: '3.1.0',
    info: { title: 'T', version: '1.0.0', description: 'd' },
    security: [{ key: [] }],
    paths: {
      '/bare': {
        get: {
          operationId: 'bare', summary: 's', tags: ['t'],
          responses: { '200': { description: 'ok' }, '400': { description: 'bad' }, default: { description: 'err' } },
        },
      },
    },
    components: { securitySchemes: { key: { type: 'apiKey', in: 'header', name: 'X-Key' } } },
  }, null, 2);

  function rateLimitFix(text: string, format: OpenApiFormat, pointer: string) {
    const { analysis, diagnostics } = lintDiagnostics(text, format);
    const target = diagnostics.find((d) => d.code === 'rate-limit-headers' && d.pointer === pointer);
    expect(target).toBeDefined();
    return planLintQuickFixes({ text, format }, target!, analysis);
  }

  function rateLimitPointersAfter(text: string, format: OpenApiFormat) {
    return lintDiagnostics(text, format).diagnostics
      .filter((d) => d.code === 'rate-limit-headers')
      .map((d) => d.pointer);
  }

  it('adds the header trio to every inline 2xx response without headers (yaml)', () => {
    const [fix] = rateLimitFix(RL_YAML, 'yaml', '/paths/~1bare/get/responses');
    expect(fix.title).toBe('Add rate-limit headers to 2xx responses');
    const fixed = applyEdits(RL_YAML, fix.edits);
    // both 200 and 201 gained a headers block, in one fix
    expect(fixed.match(/X-RateLimit-Limit:/g)).toHaveLength(2);
    expect(fixed).toMatch(/'200':\n\s+description: ok\n\s+headers:\n\s+X-RateLimit-Limit:/);
    expect(rateLimitPointersAfter(fixed, 'yaml')).not.toContain('/paths/~1bare/get/responses');
    expect(analyzeOpenApi(fixed, 'yaml').parsedSpec).toBeTruthy();
  });

  it('adds the header trio in JSON and the document still parses', () => {
    const [fix] = rateLimitFix(RL_JSON, 'json', '/paths/~1bare/get/responses');
    const fixed = applyEdits(RL_JSON, fix.edits);
    expect(fixed).toContain('"X-RateLimit-Reset"');
    expect(() => JSON.parse(fixed)).not.toThrow();
    expect(rateLimitPointersAfter(fixed, 'json')).toEqual([]);
  });

  it('appends to an existing headers map in Limit/Remaining/Reset order and keeps other headers', () => {
    const [fix] = rateLimitFix(RL_YAML, 'yaml', '/paths/~1with-headers/get/responses');
    const fixed = applyEdits(RL_YAML, fix.edits);
    const block = fixed.slice(fixed.indexOf('/with-headers:'), fixed.indexOf('/partial:'));
    expect(block).toContain('X-Request-Id:');
    const order = ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'].map((n) => block.indexOf(n));
    expect(order.every((i) => i > block.indexOf('X-Request-Id'))).toBe(true);
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);
    expect(analyzeOpenApi(fixed, 'yaml').parsedSpec).toBeTruthy();
    expect(rateLimitPointersAfter(fixed, 'yaml')).not.toContain('/paths/~1with-headers/get/responses');
  });

  it('is not offered when the only 2xx response is a $ref, and does not fire on satisfied operations', () => {
    expect(rateLimitFix(RL_YAML, 'yaml', '/paths/~1ref-only/get/responses')).toEqual([]);
    expect(rateLimitPointersAfter(RL_YAML, 'yaml')).not.toContain('/paths/~1partial/get/responses');
  });
});

describe('planLintQuickFixes: derived summaries and descriptions', () => {
  const DESC_SPEC = [
    'openapi: 3.1.0',
    'info:',
    '  title: Swagger Petstore',
    '  version: 1.0.0',
    'security: [{ key: [] }]',
    'paths:',
    '  /store/order/{orderId}:',
    '    get:',
    '      operationId: getOrderById',
    '      tags: [store]',
    '      responses:',
    "        '200': { description: OK }",
    "        '400': { description: Bad }",
    '        default: { description: Err }',
    '  /pet/findByStatus:',
    '    get:',
    '      tags: [pet]',
    "      summary: ''",
    '      responses:',
    "        '200': { description: OK }",
    "        '400': { description: Bad }",
    '        default: { description: Err }',
    'components:',
    '  securitySchemes:',
    '    key: { type: apiKey, in: header, name: X-Key }',
    '',
  ].join('\n');

  it('adds a summary derived from the operationId', () => {
    const { fix, fixed, codesAfter } = fixAndRelint(
      DESC_SPEC, 'yaml', 'operation-missing-description', '/paths/~1store~1order~1{orderId}/get'
    );
    expect(fix.title).toBe('Add summary "Get order by id"');
    expect(fixed).toContain('summary: Get order by id');
    expect(codesAfter.filter((c) => c === 'operation-missing-description')).toHaveLength(1); // the other op
  });

  it('derives the summary from method and path when there is no operationId, overwriting a blank summary', () => {
    const { fix, fixed } = fixAndRelint(
      DESC_SPEC, 'yaml', 'operation-missing-description', '/paths/~1pet~1findByStatus/get'
    );
    expect(fix.title).toBe('Add summary "Get pet find by status"');
    const block = fixed.slice(fixed.indexOf('/pet/findByStatus:'), fixed.indexOf('components:'));
    expect(block.match(/summary:/g)).toHaveLength(1);
    expect(block).toContain('summary: Get pet find by status');
    const stillMissing = lintDiagnostics(fixed, 'yaml').diagnostics
      .filter((d) => d.code === 'operation-missing-description')
      .map((d) => d.pointer);
    expect(stillMissing).toEqual(['/paths/~1store~1order~1{orderId}/get']);
  });

  it('adds a summary in JSON too', () => {
    const json = JSON.stringify({
      openapi: '3.1.0',
      info: { title: 'T', version: '1', description: 'd' },
      security: [{ key: [] }],
      paths: { '/pets': { get: { operationId: 'listPets', tags: ['p'], responses: { '200': { description: 'ok' }, '400': { description: 'b' }, default: { description: 'e' } } } } },
      components: { securitySchemes: { key: { type: 'apiKey', in: 'header', name: 'X-Key' } } },
    }, null, 2);
    const { fixed, codesAfter } = fixAndRelint(json, 'json', 'operation-missing-description');
    expect(fixed).toContain('"summary": "List pets"');
    expect(() => JSON.parse(fixed)).not.toThrow();
    expect(codesAfter).not.toContain('operation-missing-description');
  });

  it('adds an info description derived from the title', () => {
    const { fix, fixed, codesAfter } = fixAndRelint(DESC_SPEC, 'yaml', 'missing-info-description');
    expect(fix.title).toBe('Add info description "Swagger Petstore API."');
    expect(fixed).toContain('description: Swagger Petstore API.');
    expect(codesAfter).not.toContain('missing-info-description');
  });

  it('does not double the word API and overwrites a blank description', () => {
    const spec = DESC_SPEC.replace('  title: Swagger Petstore\n', "  title: Petstore API\n  description: ''\n");
    const { fix, fixed } = fixAndRelint(spec, 'yaml', 'missing-info-description');
    expect(fix.title).toBe('Add info description "Petstore API."');
    const info = fixed.slice(fixed.indexOf('info:'), fixed.indexOf('security:'));
    expect(info.match(/description:/g)).toHaveLength(1);
    expect(info).toContain('description: Petstore API.');
  });
});

describe('humanizeIdentifier', () => {
  it.each([
    ['getOrderById', 'Get order by id'],
    ['findPetsByStatus', 'Find pets by status'],
    ['createUsersWithListInput', 'Create users with list input'],
    ['upload_file', 'Upload file'],
    ['place-order', 'Place order'],
    ['HTMLExport', 'Html export'],
    ['', ''],
  ])('%s -> %s', (input, expected) => {
    expect(humanizeIdentifier(input)).toBe(expected);
  });
});
