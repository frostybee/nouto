import { describe, it, expect } from 'vitest';
import { analyzeOpenApi } from '@nouto/core/services/openapi/analyze';
import { buildPointerMap } from '@nouto/core/services/openapi/pointerMap';
import { runLintRules } from '@nouto/core/services/openapi/lint/registry';
import type { SpecTextEdit } from '@nouto/core/services/openapi/specEdit';
import type { OpenApiAnalysis, OpenApiDiagnostic } from '@nouto/core/services/openapi/types';
import { buildQuickFixes, diagnosticMarkerRange, QUICK_FIX_BUILDERS } from './quickFixes';

function applyEdits(text: string, edits: SpecTextEdit[]): string {
  const sorted = [...edits].sort((a, b) => b.offset - a.offset);
  let result = text;
  for (const edit of sorted) {
    result = result.slice(0, edit.offset) + edit.text + result.slice(edit.offset + edit.length);
  }
  return result;
}

/** Fixes for every diagnostic with the given code, over the whole document. */
function fixesFor(text: string, code: string) {
  const analysis = analyzeOpenApi(text, 'yaml');
  const map = buildPointerMap(text, 'yaml');
  const diagnostics = analysis.diagnostics.filter((diagnostic) => diagnostic.code === code);
  expect(diagnostics.length).toBeGreaterThan(0);
  return buildQuickFixes({ text, format: 'yaml' }, diagnostics, analysis, map, {
    from: 0,
    to: text.length,
  });
}

describe('missing-root-sections', () => {
  const DOC = `openapi: 3.1.0
info:
  title: Pets
  version: 1.0.0
`;

  it('adds an empty paths object', () => {
    const fixes = fixesFor(DOC, 'missing-root-sections');
    expect(fixes).toHaveLength(1);
    expect(fixes[0].title).toBe('Add empty "paths" object');
    const result = applyEdits(DOC, fixes[0].edits);
    expect(result).toContain('paths:');
    expect(analyzeOpenApi(result, 'yaml').parsedSpec).toBeTruthy();
  });
});

describe('duplicate-operation-id', () => {
  const DOC = `openapi: 3.1.0
info:
  title: Pets
  version: 1.0.0
paths:
  /pets:
    get:
      operationId: listPets
      responses:
        '200': { description: OK }
    post:
      operationId: listPets
      responses:
        '200': { description: OK }
`;

  it('renames to the next free suffix', () => {
    const fixes = fixesFor(DOC, 'duplicate-operation-id');
    expect(fixes.length).toBeGreaterThan(0);
    expect(fixes[0].title).toBe('Rename operationId to "listPets-2"');
    const result = applyEdits(DOC, fixes[0].edits);
    expect(result).toContain('listPets-2');
  });

  it('refuses without an operationId payload', () => {
    const fix = QUICK_FIX_BUILDERS['duplicate-operation-id'](
      { text: DOC, format: 'yaml' },
      { source: 'semantic', severity: 'warning', message: 'x', pointer: '/paths' },
      analyzeOpenApi(DOC, 'yaml'),
    );
    expect(fix).toBeUndefined();
  });
});

describe('unused-path-param', () => {
  const DOC = `openapi: 3.1.0
info:
  title: Pets
  version: 1.0.0
paths:
  /pets:
    get:
      parameters:
        - name: petId
          in: path
          required: true
          schema: { type: string }
      responses:
        '200': { description: OK }
`;

  it('removes the unused parameter', () => {
    const fixes = fixesFor(DOC, 'unused-path-param');
    expect(fixes).toHaveLength(1);
    expect(fixes[0].title).toBe('Remove unused path parameter');
    const result = applyEdits(DOC, fixes[0].edits);
    expect(result).not.toContain('petId');
  });
});

describe('missing-path-param', () => {
  const DOC = `openapi: 3.1.0
info:
  title: Pets
  version: 1.0.0
paths:
  /pets/{petId}:
    get:
      responses:
        '200': { description: OK }
`;

  it('adds the parameter from the skeleton with the right name', () => {
    const fixes = fixesFor(DOC, 'missing-path-param');
    expect(fixes).toHaveLength(1);
    expect(fixes[0].title).toBe('Add path parameter "petId"');
    const result = applyEdits(DOC, fixes[0].edits);
    const reanalysis = analyzeOpenApi(result, 'yaml');
    expect(reanalysis.diagnostics.some((d) => d.code === 'missing-path-param')).toBe(false);
    expect(result).toContain('name: petId');
    expect(result).toContain('in: path');
  });
});

describe('ref-not-found', () => {
  const DOC = `openapi: 3.1.0
info:
  title: Pets
  version: 1.0.0
paths:
  /pets:
    get:
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Missing'
components:
  schemas:
    Pet:
      type: object
`;

  it('scaffolds the missing component from its section preset', () => {
    const fixes = fixesFor(DOC, 'ref-not-found');
    expect(fixes).toHaveLength(1);
    expect(fixes[0].title).toBe('Create missing component "Missing"');
    const result = applyEdits(DOC, fixes[0].edits);
    const reanalysis = analyzeOpenApi(result, 'yaml');
    expect(reanalysis.diagnostics.some((d) => d.code === 'ref-not-found')).toBe(false);
    expect(result).toContain('Missing:');
  });

  it('refuses non-components targets', () => {
    const fix = QUICK_FIX_BUILDERS['ref-not-found'](
      { text: DOC, format: 'yaml' },
      {
        source: 'reference',
        severity: 'error',
        message: 'x',
        pointer: '/paths',
        data: { ref: '#/info/title', targetPointer: '/info/title' },
      },
      analyzeOpenApi(DOC, 'yaml'),
    );
    expect(fix).toBeUndefined();
  });
});

describe('buildQuickFixes matching', () => {
  const DOC = `openapi: 3.1.0
info:
  title: Pets
  version: 1.0.0
paths:
  /pets/{petId}:
    get:
      responses:
        '200': { description: OK }
`;

  it('skips diagnostics whose range does not overlap the request', () => {
    const analysis = analyzeOpenApi(DOC, 'yaml');
    const map = buildPointerMap(DOC, 'yaml');
    const diagnostics = analysis.diagnostics.filter((d) => d.code === 'missing-path-param');
    const fixes = buildQuickFixes(
      { text: DOC, format: 'yaml' },
      diagnostics,
      analysis,
      map,
      { from: 0, to: 5 }, // inside `openapi`, far from the diagnostic
    );
    expect(fixes).toEqual([]);
  });

  it('skips unfixable codes and diagnostics without code', () => {
    const analysis = analyzeOpenApi(DOC, 'yaml');
    const map = buildPointerMap(DOC, 'yaml');
    const noise: OpenApiDiagnostic[] = [
      {
        source: 'lint',
        severity: 'info',
        message: 'x',
        pointer: '/components/securitySchemes/k',
        code: 'http-basic-scheme',
      },
      { source: 'schema', severity: 'error', message: 'x', pointer: '/info' },
    ];
    expect(
      buildQuickFixes({ text: DOC, format: 'yaml' }, noise, analysis, map, {
        from: 0,
        to: DOC.length,
      }),
    ).toEqual([]);
  });

  it('returns [] when the document has no parsed spec', () => {
    const broken = 'openapi: [';
    const analysis = analyzeOpenApi(broken, 'yaml');
    expect(
      buildQuickFixes(
        { text: broken, format: 'yaml' },
        [{ source: 'semantic', severity: 'warning', message: 'x', code: 'missing-root-sections' }],
        analysis,
        buildPointerMap(broken, 'yaml'),
        { from: 0, to: broken.length },
      ),
    ).toEqual([]);
  });

  it('exposes the marker range of each candidate', () => {
    const analysis = analyzeOpenApi(DOC, 'yaml') as OpenApiAnalysis;
    const map = buildPointerMap(DOC, 'yaml');
    const diagnostic = analysis.diagnostics.find((d) => d.code === 'missing-path-param')!;
    const range = diagnosticMarkerRange(diagnostic, map)!;
    expect(range.to).toBeGreaterThan(range.from);
    const fixes = buildQuickFixes(
      { text: DOC, format: 'yaml' },
      [diagnostic],
      analysis,
      map,
      range,
    );
    expect(fixes).toHaveLength(1);
    expect(fixes[0].range).toEqual(range);
  });
});

describe('lint quick fixes', () => {
  const LINTABLE = `openapi: 3.1.0
info: { title: T, version: 1.0.0, description: d }
security: [{ key: [] }]
paths:
  /store/order/{orderId}:
    get:
      parameters:
        - name: tags
          in: query
          schema:
            type: array
            items: { type: string }
      responses:
        '200': { description: OK }
components:
  securitySchemes:
    key: { type: apiKey, in: header, name: X-Key }
  schemas:
    Pet:
      type: object
`;

  function lintFixesFor(text: string, codes: string[]) {
    const analysis = analyzeOpenApi(text, 'yaml');
    const map = buildPointerMap(text, 'yaml');
    const diagnostics = runLintRules(analysis, { disabledRules: [] }).filter(
      (diagnostic) => diagnostic.code !== undefined && codes.includes(diagnostic.code),
    );
    expect(diagnostics.length).toBeGreaterThan(0);
    return buildQuickFixes({ text, format: 'yaml' }, diagnostics, analysis, map, {
      from: 0,
      to: text.length,
    });
  }

  function lintCodes(text: string): Array<string | undefined> {
    return runLintRules(analyzeOpenApi(text, 'yaml'), { disabledRules: [] }).map((d) => d.code);
  }

  it('offers the default-response fix once for the 4xx and 5xx findings', () => {
    const fixes = lintFixesFor(LINTABLE, ['operation-missing-4xx', 'operation-missing-5xx']);
    expect(fixes).toHaveLength(1);
    expect(fixes[0].title).toBe('Add "default" response');
    const result = applyEdits(LINTABLE, fixes[0].edits);
    expect(lintCodes(result)).not.toContain('operation-missing-4xx');
    expect(lintCodes(result)).not.toContain('operation-missing-5xx');
  });

  it('bounds an array parameter, constrains additionalProperties, adds tag and operationId', () => {
    const arr = lintFixesFor(LINTABLE, ['parameter-unbounded']);
    expect(arr[0].title).toBe('Add maxItems: 100');
    expect(lintCodes(applyEdits(LINTABLE, arr[0].edits))).not.toContain('parameter-unbounded');

    const ap = lintFixesFor(LINTABLE, ['schema-unconstrained-additional-properties']);
    expect(applyEdits(LINTABLE, ap[0].edits)).toContain('additionalProperties: false');

    const tags = lintFixesFor(LINTABLE, ['operation-missing-tags']);
    expect(tags[0].title).toBe('Add tag "store"');

    const id = lintFixesFor(LINTABLE, ['operation-missing-operation-id']);
    expect(id[0].title).toBe('Add operationId "getStoreOrderByOrderId"');
    expect(lintCodes(applyEdits(LINTABLE, id[0].edits))).not.toContain(
      'operation-missing-operation-id',
    );
  });

  it('adds rate-limit headers to the 2xx responses of an operation', () => {
    // Block-style response: the YAML planner does not splice into flow maps.
    const spec = LINTABLE.replace(
      "        '200': { description: OK }",
      "        '200':\n          description: OK",
    );
    const [fix] = lintFixesFor(spec, ['rate-limit-headers']);
    expect(fix.title).toBe('Add rate-limit headers to 2xx responses');
    const fixed = applyEdits(spec, fix.edits);
    expect(fixed).toContain('X-RateLimit-Remaining:');
    expect(lintCodes(fixed)).not.toContain('rate-limit-headers');
  });

  it('adds a derived summary to an operation without one', () => {
    const spec = LINTABLE.replace(
      '    get:\n      parameters:',
      '    get:\n      operationId: getOrderById\n      parameters:',
    );
    const [fix] = lintFixesFor(spec, ['operation-missing-description']);
    expect(fix.title).toBe('Add summary "Get order by id"');
    expect(lintCodes(applyEdits(spec, fix.edits))).not.toContain('operation-missing-description');
  });

  it('places the candidate on the anchored (key) range', () => {
    const analysis = analyzeOpenApi(LINTABLE, 'yaml');
    const map = buildPointerMap(LINTABLE, 'yaml');
    const [diagnostic] = runLintRules(analysis, { disabledRules: [] }).filter(
      (d) => d.code === 'operation-missing-tags',
    );
    const [fix] = buildQuickFixes({ text: LINTABLE, format: 'yaml' }, [diagnostic], analysis, map, {
      from: 0,
      to: LINTABLE.length,
    });
    expect(LINTABLE.slice(fix.range.from, fix.range.to)).toBe('get');
  });

  it('offers nothing for lint rules without a fix', () => {
    const analysis = analyzeOpenApi(LINTABLE, 'yaml');
    const map = buildPointerMap(LINTABLE, 'yaml');
    const diagnostics: OpenApiDiagnostic[] = [
      {
        source: 'lint',
        severity: 'warning',
        message: 'x',
        code: 'http-basic-scheme',
        pointer: '/components/securitySchemes/key',
      },
    ];
    expect(
      buildQuickFixes({ text: LINTABLE, format: 'yaml' }, diagnostics, analysis, map, {
        from: 0,
        to: LINTABLE.length,
      }),
    ).toEqual([]);
  });

  it('offers per-scheme security requirements, https rewrite, and unused-schema removal', () => {
    const SPEC = `openapi: 3.0.4
info: { title: T, version: 1.0.0, description: d }
servers:
  - url: http://petstore.example/api/v3
paths:
  /store/order:
    post:
      operationId: placeOrder
      summary: Place
      tags: [store]
      responses:
        '200': { description: OK }
        '400': { description: Bad }
        default: { description: Err }
components:
  securitySchemes:
    petstore_auth: { type: apiKey, in: header, name: X-A }
    api_key: { type: apiKey, in: header, name: X-B }
  schemas:
    Unused: { type: object, additionalProperties: false }
`;
    const analysis = analyzeOpenApi(SPEC, 'yaml');
    const map = buildPointerMap(SPEC, 'yaml');
    const all = runLintRules(analysis, { disabledRules: [] });
    const whole = { from: 0, to: SPEC.length };
    const doc = { text: SPEC, format: 'yaml' as const };

    const sec = buildQuickFixes(
      doc,
      all.filter((d) => d.code === 'operation-without-security'),
      analysis,
      map,
      whole,
    );
    expect(sec.map((f) => f.title)).toEqual([
      'Require "petstore_auth" for this operation',
      'Require "api_key" for this operation',
      'Require "petstore_auth" for all operations',
      'Require "api_key" for all operations',
    ]);
    const secured = applyEdits(SPEC, sec[2].edits);
    expect(
      runLintRules(analyzeOpenApi(secured, 'yaml'), { disabledRules: [] }).map((d) => d.code),
    ).not.toContain('operation-without-security');

    const [https] = buildQuickFixes(
      doc,
      all.filter((d) => d.code === 'server-uses-http'),
      analysis,
      map,
      whole,
    );
    expect(https.title).toBe('Use https://');
    expect(applyEdits(SPEC, https.edits)).toContain('url: https://petstore.example/api/v3');

    const [remove] = buildQuickFixes(
      doc,
      all.filter((d) => d.code === 'unused-component-schema'),
      analysis,
      map,
      whole,
    );
    expect(remove.title).toBe('Remove unused schema "Unused"');
    const removed = applyEdits(SPEC, remove.edits);
    expect(removed).not.toContain('Unused');
    expect(analyzeOpenApi(removed, 'yaml').parsedSpec).toBeTruthy();
  });
});
