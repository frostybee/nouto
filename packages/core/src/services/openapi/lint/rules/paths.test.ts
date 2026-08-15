import { parse as parseYaml } from 'yaml';
import { analyzeOpenApi } from '../../analyze';
import type { OpenApiFormat } from '../../types';
import { runLintRules } from '../registry';
import { planLintQuickFixes } from '../quickFixes';
import type { SpecTextEdit } from '../../specEdit';

/**
 * Phase 2 rules: paths / operations / tags / servers hygiene, plus their quick
 * fixes. Each rule gets a positive and a negative fixture; each fix is applied
 * and re-linted so the finding disappears.
 */

function analyze(text: string, format: OpenApiFormat = 'yaml') {
  const analysis = analyzeOpenApi(text, format);
  return { analysis, diagnostics: runLintRules(analysis, { disabledRules: [] }) };
}

function findings(text: string, code: string) {
  return analyze(text).diagnostics.filter((d) => d.code === code);
}

function applyEdits(text: string, edits: SpecTextEdit[]): string {
  let result = text;
  for (const edit of [...edits].sort((a, b) => b.offset - a.offset)) {
    result = result.slice(0, edit.offset) + edit.text + result.slice(edit.offset + edit.length);
  }
  return result;
}

/** Applies the first fix of the first `code` finding and returns the fixed text + remaining codes. */
function fixFirst(text: string, code: string, format: OpenApiFormat = 'yaml', pick = 0) {
  const { analysis, diagnostics } = analyze(text, format);
  const target = diagnostics.find((d) => d.code === code);
  expect(target).toBeDefined();
  const fixes = planLintQuickFixes({ text, format }, target!, analysis);
  expect(fixes.length).toBeGreaterThan(pick);
  const fixed = applyEdits(text, fixes[pick].edits);
  return { fix: fixes[pick], fixed, codesAfter: analyze(fixed, format).diagnostics.map((d) => d.code) };
}

const BASE = [
  'openapi: 3.1.0',
  'info:',
  '  title: T',
  '  version: 1.0.0',
  '  description: D',
  'servers:',
  '  - url: https://api.example.com',
  'tags:',
  '  - name: pets',
  '    description: Pets',
  'paths:',
  '  /pets:',
  '    get:',
  '      operationId: listPets',
  '      summary: List',
  '      tags: [pets]',
  '      responses:',
  "        '200':",
  '          description: OK',
  '        default:',
  '          description: Error',
  '',
];

function spec(replace: Record<string, string> = {}, extra: string[] = []): string {
  const lines = BASE.map((line) => (line in replace ? replace[line] : line)).filter((line) => line !== '');
  return [...lines, ...extra, ''].join('\n');
}

describe('metadata rules (Phase 2)', () => {
  it('operation-tag-undefined flags tags absent from root tags and fixes by declaring them', () => {
    const text = spec({ '      tags: [pets]': '      tags: [pets, store]' });
    const found = findings(text, 'operation-tag-undefined');
    expect(found).toHaveLength(1);
    expect(found[0].pointer).toBe('/paths/~1pets/get/tags/1');
    expect(findings(spec(), 'operation-tag-undefined')).toEqual([]);
    // No root tags at all: silent.
    expect(findings(spec({ 'tags:': '', '  - name: pets': '', '    description: Pets': '' }), 'operation-tag-undefined')).toEqual([]);

    const { fix, fixed, codesAfter } = fixFirst(text, 'operation-tag-undefined');
    expect(fix.key).toBe('declare-tag@store');
    expect(parseYaml(fixed).tags).toEqual([{ name: 'pets', description: 'Pets' }, { name: 'store' }]);
    expect(codesAfter).not.toContain('operation-tag-undefined');
  });

  it('operation-tag-undefined fix creates the root tags list when it is missing but tags key exists empty', () => {
    const text = spec({ 'tags:': 'tags: []', '  - name: pets': '', '    description: Pets': '' });
    const { fixed } = fixFirst(text, 'operation-tag-undefined');
    expect(parseYaml(fixed).tags).toEqual([{ name: 'pets' }]);
  });

  it('tag-duplicate-name flags repeats and fixes by removing the later entry', () => {
    const text = spec({}, []).replace('    description: Pets\n', '    description: Pets\n  - name: pets\n');
    const found = findings(text, 'tag-duplicate-name');
    expect(found.map((d) => d.pointer)).toEqual(['/tags/1']);
    const { fixed, codesAfter } = fixFirst(text, 'tag-duplicate-name');
    expect(parseYaml(fixed).tags).toHaveLength(1);
    expect(codesAfter).not.toContain('tag-duplicate-name');
  });

  it('tag-missing-description (opt-in) flags and fixes with a derived sentence', () => {
    const text = spec({ '    description: Pets': '' });
    expect(findings(text, 'tag-missing-description').map((d) => d.pointer)).toEqual(['/tags/0']);
    expect(runLintRules(analyzeOpenApi(text, 'yaml')).map((d) => d.code)).not.toContain('tag-missing-description');
    const { fixed, codesAfter } = fixFirst(text, 'tag-missing-description');
    expect(parseYaml(fixed).tags[0].description).toBe('Pets operations.');
    expect(codesAfter).not.toContain('tag-missing-description');
  });

  it('info-missing-contact / info-missing-license flag and fix', () => {
    const text = spec();
    expect(findings(text, 'info-missing-contact')).toHaveLength(1);
    expect(findings(text, 'info-missing-license')).toHaveLength(1);
    const contact = fixFirst(text, 'info-missing-contact');
    expect(parseYaml(contact.fixed).info.contact).toEqual({ name: 'API Support' });
    expect(contact.codesAfter).not.toContain('info-missing-contact');
    const license = fixFirst(text, 'info-missing-license');
    expect(parseYaml(license.fixed).info.license.name).toBe('Apache 2.0');
    expect(license.codesAfter).not.toContain('info-missing-license');
    const complete = spec({}, []).replace('  description: D\n', '  description: D\n  contact: { name: X }\n  license: { name: MIT }\n');
    expect(findings(complete, 'info-missing-contact')).toEqual([]);
    expect(findings(complete, 'info-missing-license')).toEqual([]);
  });
});

describe('path rules (Phase 2)', () => {
  it('operation-duplicate-parameter flags a repeated name+in on the operation, not path-level overrides', () => {
    const text = spec({}, []).replace(
      '      operationId: listPets\n',
      [
        '      operationId: listPets',
        '      parameters:',
        '        - { name: limit, in: query, schema: { type: integer } }',
        '        - { name: limit, in: header, schema: { type: integer } }',
        '        - { name: limit, in: query, schema: { type: integer } }',
        '',
      ].join('\n')
    );
    const found = findings(text, 'operation-duplicate-parameter');
    expect(found.map((d) => d.pointer)).toEqual(['/paths/~1pets/get/parameters/2']);
    const { fixed, codesAfter } = fixFirst(text, 'operation-duplicate-parameter');
    expect(parseYaml(fixed).paths['/pets'].get.parameters).toHaveLength(2);
    expect(codesAfter).not.toContain('operation-duplicate-parameter');

    const override = spec({}, []).replace(
      '  /pets:\n',
      '  /pets:\n    parameters:\n      - { name: limit, in: query, schema: { type: integer } }\n'
    ).replace('      operationId: listPets\n', '      operationId: listPets\n      parameters:\n        - { name: limit, in: query, schema: { type: string } }\n');
    expect(findings(override, 'operation-duplicate-parameter')).toEqual([]);
  });

  it('path-template-empty flags {} and repeated variables', () => {
    const empty = spec({ '  /pets:': '  /pets/{}:' });
    expect(findings(empty, 'path-template-empty')).toHaveLength(1);
    const repeated = spec({ '  /pets:': '  /pets/{id}/x/{id}:' });
    expect(findings(repeated, 'path-template-empty')).toHaveLength(1);
    expect(findings(spec({ '  /pets:': '  /pets/{id}:' }), 'path-template-empty')).toEqual([]);
  });

  it('path-key-trailing-slash flags and renames the key (yaml + json)', () => {
    const text = spec({ '  /pets:': '  /pets/:' });
    expect(findings(text, 'path-key-trailing-slash').map((d) => d.pointer)).toEqual(['/paths/~1pets~1']);
    const { fixed, codesAfter } = fixFirst(text, 'path-key-trailing-slash');
    expect(Object.keys(parseYaml(fixed).paths)).toEqual(['/pets']);
    expect(codesAfter).not.toContain('path-key-trailing-slash');

    const json = JSON.stringify(parseYaml(text), null, 2);
    const jsonFix = fixFirst(json, 'path-key-trailing-slash', 'json');
    expect(Object.keys(JSON.parse(jsonFix.fixed).paths)).toEqual(['/pets']);
    // Root "/" is fine.
    expect(findings(spec({ '  /pets:': '  /:' }), 'path-key-trailing-slash')).toEqual([]);
  });

  it('path-key-has-query flags and strips the query', () => {
    const text = spec({ '  /pets:': "  '/pets?limit=1':" });
    expect(findings(text, 'path-key-has-query')).toHaveLength(1);
    const { fixed, codesAfter } = fixFirst(text, 'path-key-has-query');
    expect(Object.keys(parseYaml(fixed).paths)).toEqual(['/pets']);
    expect(codesAfter).not.toContain('path-key-has-query');
  });

  it('path-duplicate and path-ambiguous detect overlapping keys', () => {
    const extra = [
      '  /pets/{id}:',
      '    get: { responses: { default: { description: E } } }',
      '  /pets/{petId}:',
      '    get: { responses: { default: { description: E } } }',
      '  /pets/mine:',
      '    get: { responses: { default: { description: E } } }',
      '  /pets/{id}/toys:',
      '    get: { responses: { default: { description: E } } }',
    ];
    const text = spec({}, []).replace(/\n$/, '\n' + extra.join('\n') + '\n');
    const duplicate = findings(text, 'path-duplicate');
    expect(duplicate.map((d) => d.pointer)).toEqual(['/paths/~1pets~1{petId}']);
    const ambiguousFindings = findings(text, 'path-ambiguous');
    expect(ambiguousFindings.map((d) => d.pointer)).toEqual([
      '/paths/~1pets~1mine',
      '/paths/~1pets~1mine',
    ]);
    // Different segment counts never conflict.
    expect(ambiguousFindings.some((d) => d.pointer?.includes('toys'))).toBe(false);
  });
});

describe('server rules (Phase 2)', () => {
  it('server-url-trailing-slash flags and strips (root "/" allowed)', () => {
    const text = spec({ '  - url: https://api.example.com': '  - url: https://api.example.com/' });
    expect(findings(text, 'server-url-trailing-slash')).toHaveLength(1);
    const { fixed, codesAfter } = fixFirst(text, 'server-url-trailing-slash');
    expect(parseYaml(fixed).servers[0].url).toBe('https://api.example.com');
    expect(codesAfter).not.toContain('server-url-trailing-slash');
    expect(findings(spec({ '  - url: https://api.example.com': '  - url: /' }), 'server-url-trailing-slash')).toEqual([]);
  });

  it('servers-empty flags missing or empty servers (not components-only docs) and fixes', () => {
    const missing = spec({ 'servers:': '', '  - url: https://api.example.com': '' });
    expect(findings(missing, 'servers-empty').map((d) => d.pointer)).toEqual(['']);
    const empty = spec({ 'servers:': 'servers: []', '  - url: https://api.example.com': '' });
    expect(findings(empty, 'servers-empty').map((d) => d.pointer)).toEqual(['/servers']);
    const fixedMissing = fixFirst(missing, 'servers-empty');
    expect(parseYaml(fixedMissing.fixed).servers).toEqual([{ url: 'https://api.example.com' }]);
    expect(fixedMissing.codesAfter).not.toContain('servers-empty');
    const fixedEmpty = fixFirst(empty, 'servers-empty');
    expect(parseYaml(fixedEmpty.fixed).servers).toEqual([{ url: 'https://api.example.com' }]);
    const componentsOnly = 'openapi: 3.1.0\ninfo: { title: T, version: 1 }\ncomponents: { schemas: { A: { type: string } } }\n';
    expect(findings(componentsOnly, 'servers-empty')).toEqual([]);
  });

  it('server-variable-undefined flags each missing {var} and fixes by declaring it', () => {
    const text = spec({ '  - url: https://api.example.com': '  - url: https://{region}.{host}/v1' });
    const found = findings(text, 'server-variable-undefined');
    expect(found).toHaveLength(2);
    // Without a variables map only one fix is offered (creating the map).
    const first = fixFirst(text, 'server-variable-undefined');
    expect(parseYaml(first.fixed).servers[0].variables).toEqual({ region: { default: '' } });
    // With the map present, remaining variables each get their own fix.
    const second = fixFirst(first.fixed, 'server-variable-undefined');
    expect(parseYaml(second.fixed).servers[0].variables).toEqual({ region: { default: '' }, host: { default: '' } });
    expect(second.codesAfter).not.toContain('server-variable-undefined');
  });

  it('server-variable-empty-enum flags empty enums and defaults outside the enum', () => {
    const text = spec({
      '  - url: https://api.example.com': [
        '  - url: https://{env}.example.com',
        '    variables:',
        '      env: { default: prod, enum: [] }',
        '      other: { default: x, enum: [a, b] }',
      ].join('\n'),
    });
    const found = findings(text, 'server-variable-empty-enum');
    expect(found.map((d) => d.pointer)).toEqual(['/servers/0/variables/env/enum', '/servers/0/variables/other/default']);
  });
});

describe('markdown-unsafe', () => {
  it('flags script tags, eval and javascript: in description-like fields anywhere', () => {
    const text = spec({ '  description: D': '  description: "<script>alert(1)</script>"' }, [
      'components:',
      '  schemas:',
      '    A:',
      '      type: string',
      '      description: "click [here](javascript:alert(1))"',
      '      title: "eval(x)"',
      '      pattern: "<script>"',
    ]);
    const found = findings(text, 'markdown-unsafe');
    expect(found.map((d) => d.pointer)).toEqual([
      '/info/description',
      '/components/schemas/A/description',
      '/components/schemas/A/title',
    ]);
    expect(findings(spec(), 'markdown-unsafe')).toEqual([]);
  });
});
