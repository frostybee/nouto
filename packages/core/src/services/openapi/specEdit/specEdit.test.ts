import { parse as parseYaml } from 'yaml';
import { planDeleteMany, planRenameObjectKey } from './index';
import type { SpecTextEdit } from './shared';

function applyEdits(text: string, edits: SpecTextEdit[]): string {
  let result = text;
  for (const edit of [...edits].sort((a, b) => b.offset - a.offset)) {
    result = result.slice(0, edit.offset) + edit.text + result.slice(edit.offset + edit.length);
  }
  return result;
}

function overlaps(edits: SpecTextEdit[]): boolean {
  const sorted = [...edits].sort((a, b) => a.offset - b.offset);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].offset < sorted[i - 1].offset + sorted[i - 1].length) return true;
  }
  return false;
}

const YAML = [
  'openapi: 3.1.0',
  'paths:',
  '  /users/:',
  '    get:',
  '      responses:',
  "        '200':",
  '          description: OK',
  "  '/items?x=1':",
  '    get: {}',
  'components:',
  '  schemas:',
  '    A:',
  '      type: string',
  '      enum:',
  '        - a',
  '        - b',
  '        - a',
  '        - c',
  '        - b',
  '    B:',
  '      $ref: "#/components/schemas/A"',
  '      description: d',
  '      title: t',
  '      example: x',
  '',
].join('\n');

const JSON_DOC = JSON.stringify(
  {
    openapi: '3.1.0',
    paths: { '/users/': { get: { responses: { '200': { description: 'OK' } } } }, '/items?x=1': { get: {} } },
    components: {
      schemas: {
        A: { type: 'string', enum: ['a', 'b', 'a', 'c', 'b'] },
        B: { $ref: '#/components/schemas/A', description: 'd', title: 't', example: 'x' },
      },
    },
  },
  null,
  2
);

describe('planRenameObjectKey', () => {
  it('renames a YAML path key in place, keeping the value', () => {
    const plan = planRenameObjectKey({ text: YAML, format: 'yaml' }, '/paths/~1users~1', '/users');
    expect(plan).toBeDefined();
    const fixed = applyEdits(YAML, plan!.edits);
    const parsed = parseYaml(fixed);
    expect(Object.keys(parsed.paths)).toEqual(['/users', '/items?x=1']);
    expect(parsed.paths['/users'].get.responses['200'].description).toBe('OK');
    expect(plan!.insertedPointer).toBe('/paths/~1users');
  });

  it('preserves single-quote style on a quoted YAML key', () => {
    const plan = planRenameObjectKey({ text: YAML, format: 'yaml' }, '/paths/~1items?x=1', '/items');
    const fixed = applyEdits(YAML, plan!.edits);
    expect(fixed).toContain("  '/items':");
    expect(Object.keys(parseYaml(fixed).paths)).toEqual(['/users/', '/items']);
  });

  it('quotes a plain YAML key when the new key needs it', () => {
    const plan = planRenameObjectKey({ text: YAML, format: 'yaml' }, '/components/schemas/A', 'a: b');
    const fixed = applyEdits(YAML, plan!.edits);
    expect(parseYaml(fixed).components.schemas['a: b'].type).toBe('string');
  });

  it('renames a JSON key in place, keeping position and value', () => {
    const plan = planRenameObjectKey({ text: JSON_DOC, format: 'json' }, '/paths/~1users~1', '/users');
    const fixed = applyEdits(JSON_DOC, plan!.edits);
    const parsed = JSON.parse(fixed);
    expect(Object.keys(parsed.paths)).toEqual(['/users', '/items?x=1']);
    expect(parsed.paths['/users'].get.responses['200'].description).toBe('OK');
  });

  it('refuses when the new key already exists or the pointer is missing', () => {
    expect(planRenameObjectKey({ text: YAML, format: 'yaml' }, '/components/schemas/A', 'B')).toBeUndefined();
    expect(planRenameObjectKey({ text: JSON_DOC, format: 'json' }, '/components/schemas/A', 'B')).toBeUndefined();
    expect(planRenameObjectKey({ text: YAML, format: 'yaml' }, '/components/schemas/Zzz', 'Y')).toBeUndefined();
    expect(planRenameObjectKey({ text: JSON_DOC, format: 'json' }, '/components/schemas/Zzz', 'Y')).toBeUndefined();
  });
});

describe('planDeleteMany', () => {
  it.each([
    ['yaml', YAML, (t: string) => parseYaml(t)],
    ['json', JSON_DOC, (t: string) => JSON.parse(t)],
  ] as const)('deletes adjacent array items in %s without overlapping edits', (format, text, parse) => {
    // Remove indices 2 and 4 (the duplicates) plus 3 (adjacent to both).
    const edits = planDeleteMany({ text, format }, [
      '/components/schemas/A/enum/2',
      '/components/schemas/A/enum/3',
      '/components/schemas/A/enum/4',
    ]);
    expect(edits).toBeDefined();
    expect(overlaps(edits!)).toBe(false);
    const parsed = parse(applyEdits(text, edits!));
    expect(parsed.components.schemas.A.enum).toEqual(['a', 'b']);
  });

  it.each([
    ['yaml', YAML, (t: string) => parseYaml(t)],
    ['json', JSON_DOC, (t: string) => JSON.parse(t)],
  ] as const)('deletes adjacent object members in %s (last members included)', (format, text, parse) => {
    const edits = planDeleteMany({ text, format }, [
      '/components/schemas/B/description',
      '/components/schemas/B/title',
      '/components/schemas/B/example',
    ]);
    expect(edits).toBeDefined();
    expect(overlaps(edits!)).toBe(false);
    const parsed = parse(applyEdits(text, edits!));
    expect(parsed.components.schemas.B).toEqual({ $ref: '#/components/schemas/A' });
  });

  it('deletes non-adjacent members and dedupes repeated pointers', () => {
    const edits = planDeleteMany({ text: JSON_DOC, format: 'json' }, [
      '/components/schemas/B/description',
      '/components/schemas/B/example',
      '/components/schemas/B/description',
    ]);
    const parsed = JSON.parse(applyEdits(JSON_DOC, edits!));
    expect(parsed.components.schemas.B).toEqual({ $ref: '#/components/schemas/A', title: 't' });
  });

  it('returns undefined for an empty list or an unresolvable pointer', () => {
    expect(planDeleteMany({ text: YAML, format: 'yaml' }, [])).toBeUndefined();
    expect(planDeleteMany({ text: YAML, format: 'yaml' }, ['/components/schemas/Nope'])).toBeUndefined();
  });
});
