import { parse as parseYaml } from 'yaml';
import { analyzeOpenApi } from '../../analyze';
import type { OpenApiFormat } from '../../types';
import { runLintRules } from '../registry';
import { planLintQuickFixes } from '../quickFixes';
import type { SpecTextEdit } from '../../specEdit';

/** Phase 3 rules: schemas, components, security references, callbacks/webhooks. */

function analyze(text: string, format: OpenApiFormat = 'yaml') {
  const analysis = analyzeOpenApi(text, format);
  return { analysis, diagnostics: runLintRules(analysis, { disabledRules: [] }) };
}

function findings(text: string, code: string) {
  return analyze(text).diagnostics.filter((d) => d.code === code);
}

function pointers(text: string, code: string) {
  return findings(text, code).map((d) => d.pointer);
}

function applyEdits(text: string, edits: SpecTextEdit[]): string {
  let result = text;
  for (const edit of [...edits].sort((a, b) => b.offset - a.offset)) {
    result = result.slice(0, edit.offset) + edit.text + result.slice(edit.offset + edit.length);
  }
  return result;
}

function fixFirst(text: string, code: string, format: OpenApiFormat = 'yaml', pick = 0) {
  const { analysis, diagnostics } = analyze(text, format);
  const target = diagnostics.find((d) => d.code === code);
  expect(target).toBeDefined();
  const fixes = planLintQuickFixes({ text, format }, target!, analysis);
  expect(fixes.length).toBeGreaterThan(pick);
  const fixed = applyEdits(text, fixes[pick].edits);
  return { fix: fixes[pick], fixes, fixed, codesAfter: analyze(fixed, format).diagnostics.map((d) => d.code) };
}

const HEAD = (version = '3.1.0') => [
  `openapi: ${version}`,
  'info: { title: T, version: 1.0.0, description: D }',
  'servers: [{ url: https://api.example.com }]',
  'paths:',
  '  /pets:',
  '    get:',
  '      operationId: listPets',
  '      summary: List',
  '      tags: [pets]',
  '      responses:',
  "        '200':",
  '          description: OK',
  '          content:',
  '            application/json:',
  '              schema: { $ref: "#/components/schemas/Pet" }',
  '        default: { description: Error }',
];

const doc = (body: string[], version?: string) => [...HEAD(version), ...body, ''].join('\n');

describe('schema rules (Phase 3)', () => {
  it('enum-duplicate-values flags later duplicates (deep-equal) and fixes all at once', () => {
    const text = doc([
      'components:',
      '  schemas:',
      '    Pet:',
      '      type: string',
      '      enum:',
      '        - a',
      '        - b',
      '        - a',
      '        - b',
      '    Obj:',
      '      type: object',
      '      properties:',
      '        k:',
      '          enum: [{ x: 1, y: 2 }, { y: 2, x: 1 }, 3]',
    ]);
    expect(pointers(text, 'enum-duplicate-values')).toEqual([
      '/components/schemas/Pet/enum/2',
      '/components/schemas/Pet/enum/3',
      '/components/schemas/Obj/properties/k/enum/1',
    ]);
    const { fix, fixed, codesAfter } = fixFirst(text, 'enum-duplicate-values');
    expect(fix.key).toBe('dedupe-enum@/components/schemas/Pet/enum');
    expect(parseYaml(fixed).components.schemas.Pet.enum).toEqual(['a', 'b']);
    expect(codesAfter.filter((c) => c === 'enum-duplicate-values')).toHaveLength(1);
  });

  it('enum-type-mismatch respects single/array types, nullable, and integer/number', () => {
    const text = doc([
      'components:',
      '  schemas:',
      '    A: { type: string, enum: [a, 1, null] }',
      '    B: { type: [string, "null"], enum: [a, null, 2] }',
      '    C: { type: integer, enum: [1, 1.5] }',
      '    D: { type: number, enum: [1, 1.5] }',
      '    E: { enum: [1, a] }',
    ], '3.1.0');
    expect(pointers(text, 'enum-type-mismatch')).toEqual([
      '/components/schemas/A/enum/1',
      '/components/schemas/A/enum/2',
      '/components/schemas/B/enum/2',
      '/components/schemas/C/enum/1',
    ]);
    const nullable = doc(['components:', '  schemas:', '    A: { type: string, nullable: true, enum: [a, null] }'], '3.0.3');
    expect(pointers(nullable, 'enum-type-mismatch')).toEqual([]);
  });

  it('schema-required-property-undefined flags and offers define/remove fixes', () => {
    const text = doc([
      'components:',
      '  schemas:',
      '    Pet:',
      '      type: object',
      '      required:',
      '        - id',
      '        - name',
      '      properties:',
      '        id: { type: string }',
      '    Open:',
      '      type: object',
      '      required: [x]',
      '      additionalProperties: { type: string }',
      '    Composed:',
      '      allOf: [{ $ref: "#/components/schemas/Pet" }]',
      '      required: [zzz]',
      '    Bare:',
      '      type: object',
      '      required: [q]',
    ]);
    expect(pointers(text, 'schema-required-property-undefined')).toEqual([
      '/components/schemas/Pet/required/1',
      '/components/schemas/Bare/required/0',
    ]);
    const define = fixFirst(text, 'schema-required-property-undefined', 'yaml', 0);
    expect(define.fixes.map((f) => f.title)).toEqual(['Define property "name"', 'Remove "name" from required']);
    expect(parseYaml(define.fixed).components.schemas.Pet.properties.name).toEqual({ type: 'string' });
    const remove = fixFirst(text, 'schema-required-property-undefined', 'yaml', 1);
    expect(parseYaml(remove.fixed).components.schemas.Pet.required).toEqual(['id']);
    // Bare schema without properties: the define fix creates the map.
    const bare = analyze(text);
    const bareFinding = bare.diagnostics.find((d) => d.pointer === '/components/schemas/Bare/required/0')!;
    const bareFixes = planLintQuickFixes({ text, format: 'yaml' }, bareFinding, bare.analysis);
    expect(parseYaml(applyEdits(text, bareFixes[0].edits)).components.schemas.Bare.properties).toEqual({ q: { type: 'string' } });
  });

  it('nullable rules are version gated and the 3.1 fix converts to a null type', () => {
    const body = [
      'components:',
      '  schemas:',
      '    A:',
      '      type: string',
      '      nullable: true',
      '    B:',
      '      nullable: true',
      '    C:',
      '      type: [string, integer]',
      '      nullable: true',
      '    D:',
      '      type: string',
      '      nullable: false',
    ];
    const v30 = doc(body, '3.0.3');
    expect(pointers(v30, 'schema-nullable-without-type')).toEqual(['/components/schemas/B/nullable']);
    expect(pointers(v30, 'schema-nullable-in-31')).toEqual([]);
    const v31 = doc(body, '3.1.0');
    expect(pointers(v31, 'schema-nullable-without-type')).toEqual([]);
    expect(pointers(v31, 'schema-nullable-in-31')).toHaveLength(4);

    const a = fixFirst(v31, 'schema-nullable-in-31');
    expect(a.fix.title).toBe('Replace nullable with a "null" type');
    const parsed = parseYaml(a.fixed);
    expect(parsed.components.schemas.A).toEqual({ type: ['string', 'null'] });
    // Remaining findings each get their own fix; run them all.
    let text = a.fixed;
    for (let guard = 0; guard < 4; guard++) {
      const { diagnostics, analysis } = analyze(text);
      const next = diagnostics.find((d) => d.code === 'schema-nullable-in-31');
      if (!next) break;
      const fixes = planLintQuickFixes({ text, format: 'yaml' }, next, analysis);
      text = applyEdits(text, fixes[0].edits);
    }
    const final = parseYaml(text).components.schemas;
    expect(final.B).toEqual({});
    expect(final.C).toEqual({ type: ['string', 'integer', 'null'] });
    expect(final.D).toEqual({ type: 'string' });
    expect(pointers(text, 'schema-nullable-in-31')).toEqual([]);

    // JSON round trip for the composed replace + delete edit.
    const json = JSON.stringify(parseYaml(v31), null, 2);
    const jsonFix = fixFirst(json, 'schema-nullable-in-31', 'json');
    expect(JSON.parse(jsonFix.fixed).components.schemas.A).toEqual({ type: ['string', 'null'] });
  });

  it('schema-mixed-range-constraints handles 3.1 numeric and 3.0 boolean forms', () => {
    const modern = doc(['components:', '  schemas:', '    A: { type: number, maximum: 5, exclusiveMaximum: 4, minimum: 1 }'], '3.1.0');
    expect(pointers(modern, 'schema-mixed-range-constraints')).toEqual(['/components/schemas/A/exclusiveMaximum']);
    const legacy = doc(['components:', '  schemas:', '    A: { type: number, exclusiveMaximum: true, minimum: 1, exclusiveMinimum: true }'], '3.0.3');
    expect(pointers(legacy, 'schema-mixed-range-constraints')).toEqual(['/components/schemas/A/exclusiveMaximum']);
  });
});

describe('component rules (Phase 3)', () => {
  it('ref-has-siblings: 3.0 flags any sibling, 3.1 allows summary/description outside schemas; fix removes them', () => {
    const body = [
      '  /other:',
      '    get:',
      '      responses:',
      "        '200':",
      '          $ref: "#/components/responses/Ok"',
      '          description: overridden',
      '          headers: {}',
      'components:',
      '  responses:',
      '    Ok: { description: ok }',
      '  schemas:',
      '    Pet:',
      '      $ref: "#/components/schemas/Base"',
      '      description: pet',
      '    Base: { type: object }',
    ];
    const v30 = doc(body, '3.0.3');
    expect(pointers(v30, 'ref-has-siblings')).toEqual(['/paths/~1other/get/responses/200', '/components/schemas/Pet']);
    const v31 = doc(body, '3.1.0');
    expect(pointers(v31, 'ref-has-siblings')).toEqual(['/paths/~1other/get/responses/200']);
    const fixed31 = fixFirst(v31, 'ref-has-siblings');
    expect(fixed31.fix.title).toBe('Remove keys next to $ref (headers)');
    expect(parseYaml(fixed31.fixed).paths['/other'].get.responses['200']).toEqual({
      $ref: '#/components/responses/Ok',
      description: 'overridden',
    });
    const fixed30 = fixFirst(v30, 'ref-has-siblings');
    expect(parseYaml(fixed30.fixed).paths['/other'].get.responses['200']).toEqual({ $ref: '#/components/responses/Ok' });
  });

  it('example-value-and-external-value flags and fixes by dropping externalValue', () => {
    const text = doc([
      'components:',
      '  schemas:',
      '    Pet: { type: string }',
      '  examples:',
      '    Both:',
      '      value: 1',
      '      externalValue: https://x/y.json',
      '    Fine: { value: 2 }',
    ]);
    expect(pointers(text, 'example-value-and-external-value')).toEqual(['/components/examples/Both']);
    const { fixed, codesAfter } = fixFirst(text, 'example-value-and-external-value');
    expect(parseYaml(fixed).components.examples.Both).toEqual({ value: 1 });
    expect(codesAfter).not.toContain('example-value-and-external-value');
  });

  it('component-key-invalid flags disallowed characters', () => {
    const text = doc(['components:', '  schemas:', '    Pet: { type: string }', '    "Bad Key": { type: string }', '    ok.name-x_1: { type: string }']);
    expect(pointers(text, 'component-key-invalid')).toEqual(['/components/schemas/Bad Key']);
  });

  it('unused-component covers non-schema kinds and security schemes, skips components-only docs, and fixes', () => {
    const text = doc([
      'security: [{ used: [] }]',
      'components:',
      '  schemas:',
      '    Pet: { type: string }',
      '  parameters:',
      '    Used: { name: u, in: query, schema: { type: string } }',
      '    Unused: { name: x, in: query, schema: { type: string } }',
      '  responses:',
      '    Never: { description: n }',
      '  securitySchemes:',
      '    used: { type: apiKey, in: header, name: X }',
      '    dangling: { type: apiKey, in: header, name: Y }',
    ]).replace('      operationId: listPets\n', '      operationId: listPets\n      parameters: [{ $ref: "#/components/parameters/Used" }]\n');
    expect(pointers(text, 'unused-component')).toEqual([
      '/components/parameters/Unused',
      '/components/responses/Never',
      '/components/securitySchemes/dangling',
    ]);
    const { fix, fixed, codesAfter } = fixFirst(text, 'unused-component');
    expect(fix.title).toBe('Remove unused parameters "Unused"');
    expect(parseYaml(fixed).components.parameters).toEqual({ Used: { name: 'u', in: 'query', schema: { type: 'string' } } });
    expect(codesAfter.filter((c) => c === 'unused-component')).toHaveLength(2);

    const componentsOnly = 'openapi: 3.1.0\ninfo: { title: T, version: 1 }\ncomponents:\n  schemas:\n    A: { type: string }\n  responses:\n    R: { description: r }\n';
    expect(pointers(componentsOnly, 'unused-component')).toEqual([]);
    expect(pointers(componentsOnly, 'unused-component-schema')).toEqual([]);
  });

  it('security-scheme-undefined and security-scope-undefined check root and operation requirements', () => {
    const text = doc([
      'security:',
      '  - oauth: [read, admin]',
      '  - ghost: []',
      'components:',
      '  schemas:',
      '    Pet: { type: string }',
      '  securitySchemes:',
      '    oauth:',
      '      type: oauth2',
      '      flows:',
      '        clientCredentials:',
      '          tokenUrl: https://x/token',
      '          scopes: { read: r }',
      '        authorizationCode:',
      '          authorizationUrl: https://x/auth',
      '          tokenUrl: https://x/token',
      '          scopes: { write: w }',
      '    oidc: { type: openIdConnect, openIdConnectUrl: https://x/.well-known }',
    ]).replace('      operationId: listPets\n', '      operationId: listPets\n      security: [{ nope: [] }, { oidc: [anything] }, { oauth: [write] }]\n');
    expect(pointers(text, 'security-scheme-undefined')).toEqual(['/security/1/ghost', '/paths/~1pets/get/security/0/nope']);
    expect(pointers(text, 'security-scope-undefined')).toEqual(['/security/0/oauth/1']);
  });

  it('callback-nested and webhook rules', () => {
    const text = doc([
      'webhooks:',
      '  newPet:',
      '    servers: [{ url: https://hook }]',
      '    post:',
      '      servers: [{ url: https://hook2 }]',
      '      callbacks: {}',
      '      responses: { default: { description: d } }',
      'components:',
      '  schemas:',
      '    Pet: { type: string }',
    ]).replace(
      '      operationId: listPets\n',
      [
        '      operationId: listPets',
        '      callbacks:',
        '        onEvent:',
        "          '{$request.body#/url}':",
        '            post:',
        '              callbacks:',
        '                nested: {}',
        '              responses: { default: { description: d } }',
        '',
      ].join('\n')
    );
    expect(pointers(text, 'callback-nested')).toEqual(['/paths/~1pets/get/callbacks/onEvent/{$request.body#~1url}/post/callbacks']);
    expect(pointers(text, 'webhook-has-servers')).toEqual(['/webhooks/newPet/servers', '/webhooks/newPet/post/servers']);
    expect(pointers(text, 'webhook-has-callbacks')).toEqual(['/webhooks/newPet/post/callbacks']);
  });
});
