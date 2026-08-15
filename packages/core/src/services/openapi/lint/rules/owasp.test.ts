import { parse as parseYaml } from 'yaml';
import { analyzeOpenApi } from '../../analyze';
import type { OpenApiFormat } from '../../types';
import { runLintRules } from '../registry';
import { planLintQuickFixes } from '../quickFixes';
import type { SpecTextEdit } from '../../specEdit';

function analyze(text: string, format: OpenApiFormat = 'yaml') {
  const analysis = analyzeOpenApi(text, format);
  return { analysis, diagnostics: runLintRules(analysis, { disabledRules: [] }) };
}

function pointers(text: string, code: string) {
  return analyze(text).diagnostics.filter((d) => d.code === code).map((d) => d.pointer);
}

function applyEdits(text: string, edits: SpecTextEdit[]): string {
  let result = text;
  for (const edit of [...edits].sort((a, b) => b.offset - a.offset)) {
    result = result.slice(0, edit.offset) + edit.text + result.slice(edit.offset + edit.length);
  }
  return result;
}

function fixFirst(text: string, code: string, format: OpenApiFormat = 'yaml') {
  const { analysis, diagnostics } = analyze(text, format);
  const target = diagnostics.find((d) => d.code === code);
  expect(target).toBeDefined();
  const fixes = planLintQuickFixes({ text, format }, target!, analysis);
  expect(fixes.length).toBeGreaterThan(0);
  const fixed = applyEdits(text, fixes[0].edits);
  return { fix: fixes[0], fixes, fixed, codesAfter: analyze(fixed, format).diagnostics.map((d) => d.code) };
}

const SPEC = [
  'openapi: 3.1.0',
  'info: { title: T, version: 1.0.0, description: D }',
  'servers: [{ url: https://api.example.com }]',
  'security: [{ jwt: [] }]',
  'paths:',
  '  /pets/{petId}:',
  '    parameters:',
  '      - { name: petId, in: path, required: true, schema: { type: integer } }',
  '    get:',
  '      operationId: getPet',
  '      summary: Get',
  '      tags: [pets]',
  '      parameters:',
  '        - { name: api_key, in: query, schema: { type: string, maxLength: 10 } }',
  '        - { name: q, in: query, schema: { type: string } }',
  '      responses:',
  "        '200':",
  '          description: OK',
  '          content:',
  '            application/json:',
  '              schema: { $ref: "#/components/schemas/Pet" }',
  "        '429':",
  '          description: Slow down',
  '        default: { description: Error }',
  '    delete:',
  '      operationId: deletePet',
  '      summary: Delete',
  '      tags: [pets]',
  '      security: []',
  '      responses:',
  "        '204': { description: Gone }",
  "        '401': { description: Unauthorized }",
  "        '429': { description: Slow, headers: { retry-after: { schema: { type: integer } } } }",
  "        '500': { description: Boom }",
  'components:',
  '  schemas:',
  '    Pet:',
  '      type: object',
  '      additionalProperties: false',
  '      properties:',
  '        id: { type: integer, format: int64, minimum: 0, maximum: 100 }',
  '        count: { type: integer }',
  '        name: { type: string }',
  '        code: { type: string, pattern: "^[a-z]+$" }',
  '        tags: { type: array, items: { type: string, format: uuid } }',
  '        bounded: { type: array, maxItems: 5, items: { type: string, enum: [a] } }',
  '  securitySchemes:',
  '    jwt:',
  '      type: http',
  '      scheme: bearer',
  '      bearerFormat: JWT',
  '    good: { type: http, scheme: bearer, bearerFormat: JWT, description: "Follows RFC 8725." }',
  '    old: { type: http, scheme: negotiate }',
  '',
].join('\n');

describe('OWASP rules', () => {
  it('integer rules flag missing bounds and format, with fixes', () => {
    const expectedInteger = [
      '/components/schemas/Pet/properties/count',
      '/paths/~1pets~1{petId}/parameters/0/schema',
      '/paths/~1pets~1{petId}/delete/responses/429/headers/retry-after/schema',
    ];
    expect(pointers(SPEC, 'owasp-integer-unbounded')).toEqual(expectedInteger);
    expect(pointers(SPEC, 'owasp-integer-no-format')).toEqual(expectedInteger);
    // The YAML fixtures use flow-style schemas (refused by the planners), so
    // the fixes are exercised on the JSON rendering.
    const json = JSON.stringify(parseYaml(SPEC), null, 2);
    const jsonBounds = fixFirst(json, 'owasp-integer-unbounded', 'json');
    expect(jsonBounds.fix.title).toContain('minimum/maximum');
    expect(JSON.parse(jsonBounds.fixed).components.schemas.Pet.properties.count).toEqual({
      type: 'integer',
      minimum: 0,
      maximum: 1000000,
    });
    const format = fixFirst(json, 'owasp-integer-no-format', 'json');
    expect(JSON.parse(format.fixed).components.schemas.Pet.properties.count.format).toBe('int64');
    // A schema with only one bound gets only the missing one.
    const halfDoc = parseYaml(SPEC);
    halfDoc.components.schemas.Pet.properties.count.maximum = 9;
    const half = JSON.stringify(halfDoc, null, 2);
    expect(half).not.toBe(json);
    const halfFix = fixFirst(half, 'owasp-integer-unbounded', 'json');
    expect(JSON.parse(halfFix.fixed).components.schemas.Pet.properties.count).toEqual({ type: 'integer', maximum: 9, minimum: 0 });
  });

  it('string/array rules skip operation parameter schemas and restricted schemas', () => {
    expect(pointers(SPEC, 'owasp-string-unrestricted')).toEqual(['/components/schemas/Pet/properties/name']);
    expect(pointers(SPEC, 'owasp-array-unbounded')).toEqual(['/components/schemas/Pet/properties/tags']);
    const json = JSON.stringify(parseYaml(SPEC), null, 2);
    const str = fixFirst(json, 'owasp-string-unrestricted', 'json');
    expect(JSON.parse(str.fixed).components.schemas.Pet.properties.name.maxLength).toBe(255);
    expect(str.codesAfter).not.toContain('owasp-string-unrestricted');
    const arr = fixFirst(json, 'owasp-array-unbounded', 'json');
    expect(JSON.parse(arr.fixed).components.schemas.Pet.properties.tags.maxItems).toBe(100);
  });

  it('response rules: 401 only for secured operations; 429/500 always; Retry-After header', () => {
    expect(pointers(SPEC, 'owasp-response-401-missing')).toEqual(['/paths/~1pets~1{petId}/get/responses']);
    expect(pointers(SPEC, 'owasp-response-429-missing')).toEqual([]);
    expect(pointers(SPEC, 'owasp-response-500-missing')).toEqual(['/paths/~1pets~1{petId}/get/responses']);
    expect(pointers(SPEC, 'owasp-429-retry-after')).toEqual(['/paths/~1pets~1{petId}/get/responses/429']);

    const r401 = fixFirst(SPEC, 'owasp-response-401-missing');
    expect(parseYaml(r401.fixed).paths['/pets/{petId}'].get.responses['401']).toEqual({ description: 'Unauthorized' });
    expect(r401.codesAfter).not.toContain('owasp-response-401-missing');
    const r500 = fixFirst(SPEC, 'owasp-response-500-missing');
    expect(parseYaml(r500.fixed).paths['/pets/{petId}'].get.responses['500']).toEqual({ description: 'Internal Server Error' });
    const retry = fixFirst(SPEC, 'owasp-429-retry-after');
    expect(parseYaml(retry.fixed).paths['/pets/{petId}'].get.responses['429'].headers['Retry-After'].schema).toEqual({ type: 'integer' });
    expect(retry.codesAfter).not.toContain('owasp-429-retry-after');

    const no429 = SPEC.replace("        '429':\n          description: Slow down\n", '');
    expect(pointers(no429, 'owasp-response-429-missing')).toEqual(['/paths/~1pets~1{petId}/get/responses']);
    const r429 = fixFirst(no429, 'owasp-response-429-missing');
    const inserted = parseYaml(r429.fixed).paths['/pets/{petId}'].get.responses['429'];
    expect(inserted.description).toBe('Too Many Requests');
    expect(inserted.headers['Retry-After']).toBeDefined();
    expect(r429.codesAfter).not.toContain('owasp-response-429-missing');
    expect(r429.codesAfter).not.toContain('owasp-429-retry-after');
  });

  it('auth rules: JWT note, insecure http scheme, credentials in query, numeric id, unprotected unsafe op', () => {
    expect(pointers(SPEC, 'owasp-jwt-best-practices')).toEqual(['/components/securitySchemes/jwt']);
    const jwt = fixFirst(SPEC, 'owasp-jwt-best-practices');
    expect(parseYaml(jwt.fixed).components.securitySchemes.jwt.description).toContain('RFC 8725');
    expect(jwt.codesAfter).not.toContain('owasp-jwt-best-practices');

    expect(pointers(SPEC, 'owasp-auth-insecure-scheme')).toEqual(['/components/securitySchemes/old/scheme']);
    expect(pointers(SPEC, 'owasp-credentials-in-query')).toEqual(['/paths/~1pets~1{petId}/get/parameters/0']);
    expect(pointers(SPEC, 'owasp-numeric-id')).toEqual(['/paths/~1pets~1{petId}/parameters/0']);
    expect(pointers(SPEC, 'owasp-unsafe-operation-unprotected')).toEqual(['/paths/~1pets~1{petId}/delete']);

    const unsafe = fixFirst(SPEC, 'owasp-unsafe-operation-unprotected');
    expect(unsafe.fixes.map((f) => f.title)).toContain('Require "jwt" for this operation');
    expect(parseYaml(unsafe.fixed).paths['/pets/{petId}'].delete.security).toEqual([{ jwt: [] }]);
    expect(unsafe.codesAfter).not.toContain('owasp-unsafe-operation-unprotected');
  });

  it('OWASP rules are on by default and grouped under OWASP', () => {
    const defaults = runLintRules(analyzeOpenApi(SPEC, 'yaml')).map((d) => d.code);
    expect(defaults).toContain('owasp-numeric-id');
  });
});
