import { analyzeOpenApi } from '../analyze';
import { walkMediaTypes, walkParameters, walkSchemas } from './schemaWalk';
import {
  componentEntries,
  mergedParameters,
  operationViews,
  pathItems,
  rootTags,
  versionAtLeast,
} from './context';

const SPEC = [
  'openapi: 3.1.0',
  'info: { title: T, version: 1 }',
  'tags:',
  '  - name: pets',
  '  - notAnObject',
  'paths:',
  '  /pets/{id}:',
  '    parameters:',
  '      - name: id',
  '        in: path',
  '        required: true',
  '        schema: { type: string }',
  '      - name: verbose',
  '        in: query',
  '        schema: { type: boolean }',
  '    get:',
  '      parameters:',
  '        - name: verbose',
  '          in: query',
  '          schema: { type: integer }',
  '        - $ref: "#/components/parameters/Limit"',
  '      requestBody:',
  '        content:',
  '          application/json:',
  '            schema:',
  '              type: object',
  '              properties:',
  '                nested: { type: array, items: { type: string } }',
  '      responses:',
  "        '200':",
  '          description: ok',
  '          headers:',
  '            X-Rate: { schema: { type: integer } }',
  '          content:',
  '            application/json:',
  '              schema: { $ref: "#/components/schemas/Pet" }',
  '  /ref: { $ref: "#/components/pathItems/Other" }',
  'webhooks:',
  '  newPet:',
  '    post:',
  '      parameters: [{ name: h, in: header, schema: { type: string } }]',
  '      responses: {}',
  'components:',
  '  parameters:',
  '    Limit: { name: limit, in: query, schema: { type: integer } }',
  '  schemas:',
  '    Pet:',
  '      allOf:',
  '        - type: object',
  '          properties:',
  '            name: { type: string }',
  '        - $ref: "#/components/schemas/Base"',
  '    Base:',
  '      type: object',
  '      additionalProperties: { type: string }',
  '  pathItems:',
  '    Other:',
  '      get:',
  '        parameters: [{ name: q, in: query, schema: { type: number } }]',
  '        responses: {}',
  '',
].join('\n');

const analysis = analyzeOpenApi(SPEC, 'yaml');

describe('walkSchemas', () => {
  const sites = [...walkSchemas(analysis)];
  const pointers = sites.map((site) => site.pointer);

  it('visits component schemas as roots and their nested sub-schemas', () => {
    expect(pointers).toContain('/components/schemas/Pet');
    expect(pointers).toContain('/components/schemas/Pet/allOf/0');
    expect(pointers).toContain('/components/schemas/Pet/allOf/0/properties/name');
    expect(pointers).toContain('/components/schemas/Base/additionalProperties');
    const pet = sites.find((site) => site.pointer === '/components/schemas/Pet');
    expect(pet?.owner).toBe('component');
    expect(pet?.name).toBe('Pet');
  });

  it('does not descend into $ref nodes', () => {
    expect(pointers).not.toContain('/components/schemas/Pet/allOf/1');
    expect(pointers).not.toContain('/paths/~1pets~1{id}/get/responses/200/content/application~1json/schema');
  });

  it('visits inline schemas under parameters, headers, request bodies, webhooks, and component path items', () => {
    expect(pointers).toContain('/paths/~1pets~1{id}/parameters/0/schema');
    expect(pointers).toContain('/paths/~1pets~1{id}/get/parameters/0/schema');
    expect(pointers).toContain('/components/parameters/Limit/schema');
    expect(pointers).toContain('/paths/~1pets~1{id}/get/responses/200/headers/X-Rate/schema');
    expect(pointers).toContain('/paths/~1pets~1{id}/get/requestBody/content/application~1json/schema');
    expect(pointers).toContain(
      '/paths/~1pets~1{id}/get/requestBody/content/application~1json/schema/properties/nested/items'
    );
    expect(pointers).toContain('/webhooks/newPet/post/parameters/0/schema');
    expect(pointers).toContain('/components/pathItems/Other/get/parameters/0/schema');
  });

  it('reports each schema object once', () => {
    expect(new Set(pointers).size).toBe(pointers.length);
  });
});

describe('walkParameters / walkMediaTypes', () => {
  it('lists inline parameters everywhere and flags component ones', () => {
    const params = [...walkParameters(analysis)];
    const component = params.filter((site) => site.component).map((site) => site.pointer);
    expect(component).toEqual(['/components/parameters/Limit']);
    expect(params.map((site) => site.pointer)).toContain('/paths/~1pets~1{id}/get/parameters/0');
    expect(params.map((site) => site.pointer)).not.toContain('/paths/~1pets~1{id}/get/parameters/1');
  });

  it('lists media types with their content type', () => {
    const media = [...walkMediaTypes(analysis)];
    expect(media.map((site) => site.pointer)).toEqual(
      expect.arrayContaining([
        '/paths/~1pets~1{id}/get/requestBody/content/application~1json',
        '/paths/~1pets~1{id}/get/responses/200/content/application~1json',
      ])
    );
    expect(media[0].contentType).toBe('application/json');
  });
});

describe('context helpers', () => {
  it('pathItems skips $ref path items', () => {
    expect(pathItems(analysis).map((item) => item.path)).toEqual(['/pets/{id}']);
  });

  it('mergedParameters lets operation parameters override path-level ones', () => {
    const view = operationViews(analysis)[0];
    const merged = mergedParameters(view, analysis);
    expect(merged.map((param) => `${param.in}:${param.name}:${param.inherited}`)).toEqual([
      'path:id:true',
      'query:verbose:false',
      'query:limit:false',
    ]);
    const limit = merged.find((param) => param.name === 'limit');
    expect(limit?.isRef).toBe(true);
    expect(limit?.object.schema).toEqual({ type: 'integer' });
    // Overriding operation-level parameter is typed integer, not the path-level boolean.
    expect(merged.find((param) => param.name === 'verbose')?.object.schema).toEqual({ type: 'integer' });
  });

  it('componentEntries and rootTags skip non-object entries', () => {
    expect(componentEntries(analysis.parsedSpec as Record<string, unknown>, 'schemas').map((e) => e.name)).toEqual([
      'Pet',
      'Base',
    ]);
    expect(componentEntries(analysis.parsedSpec as Record<string, unknown>, 'responses')).toEqual([]);
    expect(rootTags(analysis.parsedSpec as Record<string, unknown>)).toEqual([
      { name: 'pets', object: { name: 'pets' }, pointer: '/tags/0' },
    ]);
  });

  it('versionAtLeast compares recognized versions and rejects unknown', () => {
    expect(versionAtLeast(analysis, '3.0')).toBe(true);
    expect(versionAtLeast(analysis, '3.1')).toBe(true);
    expect(versionAtLeast(analysis, '3.2')).toBe(false);
    expect(versionAtLeast({ ...analysis, version: undefined }, '3.0')).toBe(false);
  });
});
