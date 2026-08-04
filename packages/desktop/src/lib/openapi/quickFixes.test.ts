import { describe, it, expect } from 'vitest';
import { analyzeOpenApi } from '@nouto/core/services/openapi/analyze';
import { buildPointerMap } from '@nouto/core/services/openapi/pointerMap';
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
  return buildQuickFixes(
    { text, format: 'yaml' },
    diagnostics,
    analysis,
    map,
    { from: 0, to: text.length }
  );
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
      analyzeOpenApi(DOC, 'yaml')
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
      analyzeOpenApi(DOC, 'yaml')
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
      { from: 0, to: 5 } // inside `openapi`, far from the diagnostic
    );
    expect(fixes).toEqual([]);
  });

  it('skips unfixable codes and diagnostics without code', () => {
    const analysis = analyzeOpenApi(DOC, 'yaml');
    const map = buildPointerMap(DOC, 'yaml');
    const noise: OpenApiDiagnostic[] = [
      { source: 'lint', severity: 'info', message: 'x', pointer: '/info', code: 'missing-info-description' },
      { source: 'schema', severity: 'error', message: 'x', pointer: '/info' },
    ];
    expect(
      buildQuickFixes({ text: DOC, format: 'yaml' }, noise, analysis, map, {
        from: 0,
        to: DOC.length,
      })
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
        { from: 0, to: broken.length }
      )
    ).toEqual([]);
  });

  it('exposes the marker range of each candidate', () => {
    const analysis = analyzeOpenApi(DOC, 'yaml') as OpenApiAnalysis;
    const map = buildPointerMap(DOC, 'yaml');
    const diagnostic = analysis.diagnostics.find((d) => d.code === 'missing-path-param')!;
    const range = diagnosticMarkerRange(diagnostic, map)!;
    expect(range.to).toBeGreaterThan(range.from);
    const fixes = buildQuickFixes({ text: DOC, format: 'yaml' }, [diagnostic], analysis, map, range);
    expect(fixes).toHaveLength(1);
    expect(fixes[0].range).toEqual(range);
  });
});
