import * as yaml from 'js-yaml';
import * as vscode from 'vscode';
import { getByJsonPointer } from '@nouto/core/services';
import {
  planDeleteAtPointer,
  planInsertArrayItem,
  planInsertObjectMember,
} from './specEdit';
import { createFakeTextDocument } from '../../test/helpers/fakeTextDocument';

/** Applies a planned WorkspaceEdit to the document's text in-memory. */
function applyPlan(document: vscode.TextDocument, edit: vscode.WorkspaceEdit): string {
  const text = document.getText();
  const edits = (edit as unknown as { get(uri: unknown): Array<{ range: vscode.Range; newText: string }> })
    .get(document.uri)
    .map((change) => ({
      start: document.offsetAt(change.range.start),
      end: document.offsetAt(change.range.end),
      newText: change.newText,
    }))
    .sort((a, b) => b.start - a.start);
  let result = text;
  for (const change of edits) {
    result = result.slice(0, change.start) + change.newText + result.slice(change.end);
  }
  return result;
}

function parseAt(content: string, format: 'yaml' | 'json', pointer: string): unknown {
  const parsed = format === 'yaml' ? yaml.load(content) : JSON.parse(content);
  const resolved = getByJsonPointer(parsed, pointer);
  expect(resolved.found).toBe(true);
  return resolved.value;
}

const YAML_BASE = [
  'openapi: 3.1.0',
  'info:',
  '  title: T',
  '  version: 1.0.0',
  'paths:',
  '  /pets:',
  '    get:',
  '      responses:',
  "        '200':",
  '          description: OK',
  '  /health:',
  '    get:',
  '      responses:',
  "        '200':",
  '          description: OK',
  'servers:',
  '  - url: https://a.example',
  '  - url: https://b.example',
  '',
].join('\n');

const OPERATION = { responses: { '200': { description: 'OK' } } };

describe('specEdit — YAML', () => {
  function doc(content: string) {
    return createFakeTextDocument({ content, languageId: 'yaml', path: '/spec.yaml' });
  }

  it('inserts a member into an existing block map with matching indentation', () => {
    const document = doc(YAML_BASE);
    const plan = planInsertObjectMember(document, '/paths', '/users', { post: OPERATION })!;
    expect(plan.insertedPointer).toBe('/paths/~1users');
    const result = applyPlan(document, plan.edit);
    expect(parseAt(result, 'yaml', '/paths/~1users/post/responses/200/description')).toBe('OK');
    // Lands inside the paths block: after /health, before servers.
    expect(result.indexOf('  /users:')).toBeGreaterThan(result.indexOf('  /health:'));
    expect(result.indexOf('  /users:')).toBeLessThan(result.indexOf('servers:'));
    expect(result).toContain('  /users:\n    post:\n      responses:');
  });

  it('appends an item to an existing block sequence', () => {
    const document = doc(YAML_BASE);
    const plan = planInsertArrayItem(document, '/servers', { url: 'https://c.example' })!;
    expect(plan.insertedPointer).toBe('/servers/2');
    const result = applyPlan(document, plan.edit);
    expect(parseAt(result, 'yaml', '/servers/2/url')).toBe('https://c.example');
    expect(result).toContain('  - url: https://b.example\n  - url: https://c.example');
  });

  it('creates a missing root-level array (one absent level)', () => {
    const document = doc(YAML_BASE);
    const plan = planInsertArrayItem(document, '/tags', { name: 'pets' })!;
    expect(plan.insertedPointer).toBe('/tags/0');
    const result = applyPlan(document, plan.edit);
    expect(parseAt(result, 'yaml', '/tags/0/name')).toBe('pets');
  });

  it('creates two missing object levels at once', () => {
    const document = doc(YAML_BASE);
    const plan = planInsertObjectMember(document, '/components/schemas', 'Pet', { type: 'object' })!;
    expect(plan.insertedPointer).toBe('/components/schemas/Pet');
    const result = applyPlan(document, plan.edit);
    expect(parseAt(result, 'yaml', '/components/schemas/Pet/type')).toBe('object');
    expect(result).toContain('components:\n  schemas:\n    Pet:\n      type: object');
  });

  it('nests under an existing parent when only the leaf section is missing', () => {
    const content = YAML_BASE + 'components:\n  schemas:\n    Pet:\n      type: object\n';
    const document = doc(content);
    const plan = planInsertObjectMember(document, '/components/responses', 'NotFound', { description: 'Not found' })!;
    const result = applyPlan(document, plan.edit);
    expect(parseAt(result, 'yaml', '/components/responses/NotFound/description')).toBe('Not found');
    // The existing schema section is untouched.
    expect(parseAt(result, 'yaml', '/components/schemas/Pet/type')).toBe('object');
  });

  it('converts an empty (null) value to a block collection', () => {
    const document = doc('openapi: 3.1.0\ntags:\ninfo:\n  title: T\n  version: 1.0.0\n');
    const plan = planInsertArrayItem(document, '/tags', { name: 'x' })!;
    expect(plan.insertedPointer).toBe('/tags/0');
    const result = applyPlan(document, plan.edit);
    expect(parseAt(result, 'yaml', '/tags/0/name')).toBe('x');
    expect(parseAt(result, 'yaml', '/info/title')).toBe('T');
  });

  it('converts an empty flow collection ([]) to a block collection', () => {
    const document = doc('openapi: 3.1.0\ntags: []\ninfo:\n  title: T\n  version: 1.0.0\n');
    const plan = planInsertArrayItem(document, '/tags', { name: 'x' })!;
    const result = applyPlan(document, plan.edit);
    expect(parseAt(result, 'yaml', '/tags/0/name')).toBe('x');
    expect(parseAt(result, 'yaml', '/info/title')).toBe('T');
  });

  it('converts an empty flow map ({}) member target to a block map', () => {
    const document = doc('openapi: 3.1.0\ncomponents: {}\ninfo:\n  title: T\n  version: 1.0.0\n');
    const plan = planInsertObjectMember(document, '/components/schemas', 'Pet', { type: 'object' })!;
    const result = applyPlan(document, plan.edit);
    expect(parseAt(result, 'yaml', '/components/schemas/Pet/type')).toBe('object');
  });

  it('refuses to edit flow collections that contain items', () => {
    const document = doc('openapi: 3.1.0\nservers: [{url: https://a.example}]\n');
    expect(planInsertArrayItem(document, '/servers', { url: 'https://b.example' })).toBeUndefined();
    expect(planDeleteAtPointer(document, '/servers/0')).toBeUndefined();
  });

  it('refuses to insert a duplicate member', () => {
    const document = doc(YAML_BASE);
    expect(planInsertObjectMember(document, '/paths', '/pets', { get: OPERATION })).toBeUndefined();
  });

  it('refuses pointers traversing primitives', () => {
    const document = doc(YAML_BASE);
    expect(planInsertObjectMember(document, '/info/title/deep', 'x', {})).toBeUndefined();
    expect(planInsertArrayItem(document, '/info/title', {})).toBeUndefined();
  });

  it('honours 4-space indentation', () => {
    const document = doc([
      'openapi: 3.1.0',
      'info:',
      '    title: T',
      '    version: 1.0.0',
      'paths:',
      '    /pets:',
      '        get:',
      '            responses:',
      "                '200':",
      '                    description: OK',
      '',
    ].join('\n'));
    const plan = planInsertObjectMember(document, '/paths', '/users', { get: OPERATION })!;
    const result = applyPlan(document, plan.edit);
    expect(parseAt(result, 'yaml', '/paths/~1users/get/responses/200/description')).toBe('OK');
    expect(result).toContain('    /users:\n        get:\n            responses:');
  });

  it('honours non-indented sequence style', () => {
    const document = doc('openapi: 3.1.0\ntags:\n- name: a\ninfo:\n  title: T\n  version: 1.0.0\n');
    const plan = planInsertArrayItem(document, '/tags', { name: 'b' })!;
    const result = applyPlan(document, plan.edit);
    expect(parseAt(result, 'yaml', '/tags/1/name')).toBe('b');
    expect(result).toContain('- name: a\n- name: b\n');
  });

  it('uses CRLF line endings in CRLF documents', () => {
    const document = doc(YAML_BASE.replace(/\n/g, '\r\n'));
    const plan = planInsertObjectMember(document, '/paths', '/users', { get: OPERATION })!;
    const result = applyPlan(document, plan.edit);
    expect(result).toContain('  /users:\r\n    get:\r\n');
    expect(parseAt(result, 'yaml', '/paths/~1users/get/responses/200/description')).toBe('OK');
  });

  it('appends at document end without a trailing newline', () => {
    const document = doc('openapi: 3.1.0\ninfo:\n  title: T\n  version: 1.0.0');
    const plan = planInsertArrayItem(document, '/tags', { name: 'x' })!;
    const result = applyPlan(document, plan.edit);
    expect(parseAt(result, 'yaml', '/tags/0/name')).toBe('x');
  });

  it('deletes the first, middle, and last member of a map', () => {
    const content = [
      'openapi: 3.1.0',
      'components:',
      '  schemas:',
      '    A:',
      '      type: object',
      '    B:',
      '      type: string',
      '    C:',
      '      type: number',
      '',
    ].join('\n');
    for (const [name, survivors] of [['A', ['B', 'C']], ['B', ['A', 'C']], ['C', ['A', 'B']]] as const) {
      const document = doc(content);
      const edit = planDeleteAtPointer(document, `/components/schemas/${name}`)!;
      const result = applyPlan(document, edit);
      const schemas = parseAt(result, 'yaml', '/components/schemas') as Record<string, unknown>;
      expect(Object.keys(schemas)).toEqual([...survivors]);
    }
  });

  it('deletes a multi-line map entry as a whole', () => {
    const document = doc(YAML_BASE);
    const edit = planDeleteAtPointer(document, '/paths/~1pets')!;
    const result = applyPlan(document, edit);
    const paths = parseAt(result, 'yaml', '/paths') as Record<string, unknown>;
    expect(Object.keys(paths)).toEqual(['/health']);
    expect(parseAt(result, 'yaml', '/servers/0/url')).toBe('https://a.example');
  });

  it('deletes sequence items at every position', () => {
    for (const [index, survivor] of [['0', 'https://b.example'], ['1', 'https://a.example']] as const) {
      const document = doc(YAML_BASE);
      const edit = planDeleteAtPointer(document, `/servers/${index}`)!;
      const result = applyPlan(document, edit);
      const servers = parseAt(result, 'yaml', '/servers') as Array<{ url: string }>;
      expect(servers).toHaveLength(1);
      expect(servers[0].url).toBe(survivor);
    }
  });

  it('deleting the only member leaves the parent key with a null value', () => {
    const document = doc('openapi: 3.1.0\npaths:\n  /pets:\n    get:\n      responses:\n        \'200\':\n          description: OK\n');
    const edit = planDeleteAtPointer(document, '/paths/~1pets')!;
    const result = applyPlan(document, edit);
    const parsed = yaml.load(result) as Record<string, unknown>;
    expect(parsed.paths).toBeNull();
    expect(parsed.openapi).toBe('3.1.0');
  });

  it('returns undefined for unresolvable or root deletions', () => {
    const document = doc(YAML_BASE);
    expect(planDeleteAtPointer(document, '/paths/~1missing')).toBeUndefined();
    expect(planDeleteAtPointer(document, '/servers/9')).toBeUndefined();
    expect(planDeleteAtPointer(document, '/servers/x')).toBeUndefined();
    expect(planDeleteAtPointer(document, '')).toBeUndefined();
    expect(planDeleteAtPointer(document, '/info/title/deep')).toBeUndefined();
  });

  it('rejects kind mismatches between the target and the request', () => {
    const document = doc(YAML_BASE);
    // Array append into a map, member insert into a sequence.
    expect(planInsertArrayItem(document, '/paths', { get: OPERATION })).toBeUndefined();
    expect(planInsertObjectMember(document, '/servers', 'k', {})).toBeUndefined();
    // Missing segments below a sequence cannot be created.
    expect(planInsertObjectMember(document, '/servers/extra', 'k', {})).toBeUndefined();
  });

  it('converts an empty value at end-of-file without a trailing newline', () => {
    const document = doc('openapi: 3.1.0\ntags:');
    const plan = planInsertArrayItem(document, '/tags', { name: 'x' })!;
    const result = applyPlan(document, plan.edit);
    expect(parseAt(result, 'yaml', '/tags/0/name')).toBe('x');
  });

  it('rejects malformed pointers', () => {
    const document = doc(YAML_BASE);
    expect(planDeleteAtPointer(document, 'not-a-pointer')).toBeUndefined();
    expect(planInsertObjectMember(document, 'not-a-pointer', 'k', {})).toBeUndefined();
    expect(planInsertArrayItem(document, 'not-a-pointer', {})).toBeUndefined();
  });
});

const JSON_BASE = [
  '{',
  '  "openapi": "3.1.0",',
  '  "info": { "title": "T", "version": "1.0.0" },',
  '  "paths": {',
  '    "/pets": {',
  '      "get": { "responses": { "200": { "description": "OK" } } }',
  '    },',
  '    "/health": {',
  '      "get": { "responses": { "200": { "description": "OK" } } }',
  '    }',
  '  },',
  '  "servers": [',
  '    { "url": "https://a.example" },',
  '    { "url": "https://b.example" }',
  '  ]',
  '}',
  '',
].join('\n');

describe('specEdit — JSON', () => {
  function doc(content: string, languageId = 'json') {
    return createFakeTextDocument({ content, languageId, path: '/spec.json' });
  }

  it('inserts a member into an existing object', () => {
    const document = doc(JSON_BASE);
    const plan = planInsertObjectMember(document, '/paths', '/users', { post: OPERATION })!;
    expect(plan.insertedPointer).toBe('/paths/~1users');
    const result = applyPlan(document, plan.edit);
    expect(parseAt(result, 'json', '/paths/~1users/post/responses/200/description')).toBe('OK');
    expect(parseAt(result, 'json', '/paths/~1pets/get/responses/200/description')).toBe('OK');
  });

  it('creates missing parent objects on the way', () => {
    const document = doc(JSON_BASE);
    const plan = planInsertObjectMember(document, '/components/schemas', 'Pet', { type: 'object' })!;
    expect(plan.insertedPointer).toBe('/components/schemas/Pet');
    const result = applyPlan(document, plan.edit);
    expect(parseAt(result, 'json', '/components/schemas/Pet/type')).toBe('object');
  });

  it('appends to an existing array', () => {
    const document = doc(JSON_BASE);
    const plan = planInsertArrayItem(document, '/servers', { url: 'https://c.example' })!;
    expect(plan.insertedPointer).toBe('/servers/2');
    const result = applyPlan(document, plan.edit);
    expect((parseAt(result, 'json', '/servers') as unknown[]).length).toBe(3);
  });

  it('creates a missing array', () => {
    const document = doc(JSON_BASE);
    const plan = planInsertArrayItem(document, '/tags', { name: 'pets' })!;
    expect(plan.insertedPointer).toBe('/tags/0');
    const result = applyPlan(document, plan.edit);
    expect(parseAt(result, 'json', '/tags/0/name')).toBe('pets');
  });

  it('inserts into an empty object document region', () => {
    const document = doc('{\n  "openapi": "3.1.0",\n  "paths": {}\n}\n');
    const plan = planInsertObjectMember(document, '/paths', '/pets', { get: OPERATION })!;
    const result = applyPlan(document, plan.edit);
    expect(parseAt(result, 'json', '/paths/~1pets/get/responses/200/description')).toBe('OK');
  });

  it('keeps numeric-looking object keys as strings', () => {
    const document = doc(JSON_BASE);
    const edit = planDeleteAtPointer(document, '/paths/~1pets/get/responses/200')!;
    const result = applyPlan(document, edit);
    const responses = parseAt(result, 'json', '/paths/~1pets/get/responses') as Record<string, unknown>;
    expect(Object.keys(responses)).toEqual([]);
  });

  it('deletes members at every position with comma cleanup', () => {
    for (const [pointer, survivor] of [
      ['/paths/~1pets', '/health'],
      ['/paths/~1health', '/pets'],
    ] as const) {
      const document = doc(JSON_BASE);
      const edit = planDeleteAtPointer(document, pointer)!;
      const result = applyPlan(document, edit);
      const paths = parseAt(result, 'json', '/paths') as Record<string, unknown>;
      expect(Object.keys(paths)).toEqual([survivor]);
    }
  });

  it('deletes array items at every position', () => {
    for (const [index, survivor] of [['0', 'https://b.example'], ['1', 'https://a.example']] as const) {
      const document = doc(JSON_BASE);
      const edit = planDeleteAtPointer(document, `/servers/${index}`)!;
      const result = applyPlan(document, edit);
      const servers = parseAt(result, 'json', '/servers') as Array<{ url: string }>;
      expect(servers).toHaveLength(1);
      expect(servers[0].url).toBe(survivor);
    }
  });

  it('deletes the only member, leaving an empty object', () => {
    const document = doc('{\n  "openapi": "3.1.0",\n  "paths": {\n    "/pets": {}\n  }\n}\n');
    const edit = planDeleteAtPointer(document, '/paths/~1pets')!;
    const result = applyPlan(document, edit);
    expect(parseAt(result, 'json', '/paths')).toEqual({});
  });

  it('refuses duplicates, missing targets, and primitive traversal', () => {
    const document = doc(JSON_BASE);
    expect(planInsertObjectMember(document, '/paths', '/pets', {})).toBeUndefined();
    expect(planDeleteAtPointer(document, '/paths/~1missing')).toBeUndefined();
    expect(planInsertObjectMember(document, '/info/title/deep', 'x', {})).toBeUndefined();
    expect(planInsertArrayItem(document, '/info', {})).toBeUndefined();
  });

  it('works in CRLF documents', () => {
    const document = doc(JSON_BASE.replace(/\n/g, '\r\n'));
    const plan = planInsertObjectMember(document, '/paths', '/users', { get: OPERATION })!;
    const result = applyPlan(document, plan.edit);
    expect(parseAt(result, 'json', '/paths/~1users/get/responses/200/description')).toBe('OK');
  });

  it('tolerates comments in jsonc documents', () => {
    const document = doc('{\n  // spec\n  "openapi": "3.1.0",\n  "paths": {}\n}\n', 'jsonc');
    const plan = planInsertObjectMember(document, '/paths', '/pets', { get: OPERATION })!;
    const result = applyPlan(document, plan.edit);
    expect(result).toContain('// spec');
    expect(result).toContain('"/pets"');
  });
});
