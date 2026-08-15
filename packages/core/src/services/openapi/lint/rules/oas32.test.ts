import { analyzeOpenApi } from '../../analyze';
import { runLintRules } from '../registry';

function pointers(text: string, code: string) {
  return runLintRules(analyzeOpenApi(text, 'yaml'), { disabledRules: [] })
    .filter((d) => d.code === code)
    .map((d) => d.pointer);
}

const SPEC = [
  'openapi: 3.2.0',
  'info: { title: T, version: 1.0.0, description: D }',
  'servers: [{ url: https://api.example.com }]',
  'tags:',
  '  - name: root',
  '  - name: child',
  '    parent: root',
  '  - name: orphan',
  '    parent: nowhere',
  '  - name: a',
  '    parent: b',
  '  - name: b',
  '    parent: a',
  'paths:',
  '  /search:',
  '    get:',
  '      operationId: search',
  '      summary: Search',
  '      tags: [root]',
  '      parameters:',
  '        - name: qs',
  '          in: querystring',
  '          content:',
  '            application/x-www-form-urlencoded:',
  '              schema: { type: object }',
  '        - name: extra',
  '          in: querystring',
  '          content:',
  '            application/json:',
  '              schema: { type: object }',
  '        - { name: page, in: query, schema: { type: integer } }',
  '      responses:',
  "        '200':",
  '          description: OK',
  '          content:',
  '            application/jsonl:',
  '              itemSchema: { $ref: "#/components/schemas/Pet" }',
  '              encoding: {}',
  '              itemEncoding: {}',
  '            text/event-stream:',
  '              prefixEncoding: []',
  '        default: { description: Error }',
  '  /clean:',
  '    get:',
  '      operationId: clean',
  '      summary: Clean',
  '      tags: [root]',
  '      parameters:',
  '        - name: qs',
  '          in: querystring',
  '          content:',
  '            application/x-www-form-urlencoded:',
  '              schema: { type: object }',
  '      responses:',
  '        default: { description: Error }',
  'components:',
  '  schemas:',
  '    Pet:',
  '      type: object',
  '      discriminator:',
  '        propertyName: kind',
  '        defaultMapping: Cat',
  '    Cat: { type: object }',
  '    Bad:',
  '      type: object',
  '      discriminator: { propertyName: kind, defaultMapping: Missing }',
  '    RefOk:',
  '      type: object',
  '      discriminator: { propertyName: kind, defaultMapping: "#/components/schemas/Cat" }',
  '    RefBad:',
  '      type: object',
  '      discriminator: { propertyName: kind, defaultMapping: "#/components/schemas/Nope" }',
  '    External:',
  '      type: object',
  '      discriminator: { propertyName: kind, defaultMapping: "./other.yaml#/Cat" }',
  '',
].join('\n');

describe('OpenAPI 3.2 rules', () => {
  it('querystring-parameter-conflict flags extra querystring params and query coexistence', () => {
    expect(pointers(SPEC, 'querystring-parameter-conflict')).toEqual([
      '/paths/~1search/get/parameters/1',
      '/paths/~1search/get/parameters/0',
    ]);
  });

  it('tag-parent-invalid flags unknown parents and cycles', () => {
    expect(pointers(SPEC, 'tag-parent-invalid')).toEqual(['/tags/2/parent', '/tags/3/parent', '/tags/4/parent']);
  });

  it('discriminator-default-mapping-invalid checks names and internal refs, skips external', () => {
    expect(pointers(SPEC, 'discriminator-default-mapping-invalid')).toEqual([
      '/components/schemas/Bad/discriminator/defaultMapping',
      '/components/schemas/RefBad/discriminator/defaultMapping',
    ]);
  });

  it('media-type-encoding-conflict flags mixed encodings and sequential encodings without itemSchema', () => {
    expect(pointers(SPEC, 'media-type-encoding-conflict')).toEqual([
      '/paths/~1search/get/responses/200/content/application~1jsonl/itemEncoding',
      '/paths/~1search/get/responses/200/content/text~1event-stream/prefixEncoding',
    ]);
  });

  it('is silent on documents that do not use the 3.2 constructs', () => {
    const plain = 'openapi: 3.1.0\ninfo: { title: T, version: 1 }\npaths:\n  /a:\n    get:\n      responses: { default: { description: d } }\n';
    for (const code of ['querystring-parameter-conflict', 'tag-parent-invalid', 'discriminator-default-mapping-invalid', 'media-type-encoding-conflict']) {
      expect(pointers(plain, code)).toEqual([]);
    }
  });
});
