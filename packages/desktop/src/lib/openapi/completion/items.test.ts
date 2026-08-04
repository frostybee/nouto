import { describe, it, expect } from 'vitest';
import { analyzeOpenApi } from '@nouto/core/services/openapi/analyze';
import { buildKeySuggestions, buildValueSuggestions } from './items';
import type { DetectedContext } from './context';

const YAML = `openapi: 3.1.0
info:
  title: Pets
  version: 1.0.0
paths:
  /pets:
    get:
      operationId: listPets
      responses:
        '200':
          description: OK
components:
  schemas:
    Pet:
      type: object
  responses:
    NotFound:
      description: Missing
  securitySchemes:
    apiKey:
      type: apiKey
      name: X-Key
      in: header
security:
  - apiKey: []
`;

const analysis = analyzeOpenApi(YAML, 'yaml');

function keyCtx(kind: string, containerPointer = ''): Extract<DetectedContext, { mode: 'key' }> {
  return { mode: 'key', kind: kind as never, containerPointer };
}

function valueCtx(
  parentKind: string,
  propertyName: string,
  inQuotes = false
): Extract<DetectedContext, { mode: 'value' }> {
  return { mode: 'value', parentKind: parentKind as never, propertyName, inQuotes };
}

describe('buildKeySuggestions — full (JSON)', () => {
  it('offers the curated properties with quoted-key snippets', () => {
    const items = buildKeySuggestions(keyCtx('Operation'), '3.1', analysis, { full: true });
    const summary = items.find((item) => item.name === 'summary');
    expect(summary).toBeDefined();
    expect(summary!.snippet).toBe('"summary": $0');
    expect(summary!.isSnippet).toBe(true);
    expect(summary!.docs).toBeTruthy();
  });

  it('filters out sibling keys that already exist', () => {
    const items = buildKeySuggestions(
      keyCtx('Operation', '/paths/~1pets/get'),
      '3.1',
      analysis,
      { full: true }
    );
    expect(items.map((item) => item.name)).not.toContain('operationId');
  });

  it('marks required properties in the detail string', () => {
    const items = buildKeySuggestions(keyCtx('Info'), '3.1', analysis, { full: true });
    const title = items.find((item) => item.name === 'title');
    expect(title!.detail).toContain('required');
  });

  it('offers dynamic security-scheme keys with a JSON snippet', () => {
    const items = buildKeySuggestions(keyCtx('SecurityRequirement'), '3.1', analysis, {
      full: true,
    });
    const dynamic = items.filter((item) => item.kind === 'dynamic-key');
    expect(dynamic.map((item) => item.name)).toEqual(['apiKey']);
    expect(dynamic[0].snippet).toBe('"apiKey": [$0]');
  });

  it('returns [] for tableless kinds', () => {
    expect(buildKeySuggestions(keyCtx('Paths'), '3.1', analysis, { full: true })).toEqual([]);
  });
});

describe('buildKeySuggestions — gap-only (YAML)', () => {
  it('offers NO curated properties (monaco-yaml owns those)', () => {
    expect(buildKeySuggestions(keyCtx('Operation'), '3.1', analysis, { full: false })).toEqual([]);
  });

  it('still offers dynamic security-scheme keys with a YAML snippet', () => {
    const items = buildKeySuggestions(keyCtx('SecurityRequirement'), '3.1', analysis, {
      full: false,
    });
    expect(items).toHaveLength(1);
    expect(items[0].snippet).toBe('apiKey:\n  - $0');
  });

  it('suppresses dynamic keys already present in the container', () => {
    const items = buildKeySuggestions(
      keyCtx('SecurityRequirement', '/security/0'),
      '3.1',
      analysis,
      { full: false }
    );
    expect(items).toEqual([]);
  });
});

describe('buildValueSuggestions — $ref targets (both formats)', () => {
  it('suggests section-matched component targets, quoted for YAML', () => {
    const items = buildValueSuggestions(valueCtx('Schema', '$ref'), '3.1', analysis, {
      full: false,
    });
    expect(items.map((item) => item.label)).toEqual(['#/components/schemas/Pet']);
    expect(items[0].insertText).toBe("'#/components/schemas/Pet'");
    expect(items[0].kind).toBe('ref');
  });

  it('quotes with double quotes for JSON outside a string', () => {
    const items = buildValueSuggestions(valueCtx('Response', '$ref'), '3.1', analysis, {
      full: true,
    });
    expect(items[0].insertText).toBe('"#/components/responses/NotFound"');
  });

  it('inserts bare text when the cursor already sits in quotes', () => {
    const items = buildValueSuggestions(valueCtx('Schema', '$ref', true), '3.1', analysis, {
      full: true,
    });
    expect(items[0].insertText).toBe('#/components/schemas/Pet');
  });

  it('returns [] when the document has no parsed spec', () => {
    const broken = analyzeOpenApi('openapi: [', 'yaml');
    expect(
      buildValueSuggestions(valueCtx('Schema', '$ref'), '3.1', broken, { full: false })
    ).toEqual([]);
  });

  it('never offers top-level fallback targets for component-less documents', () => {
    const bare = analyzeOpenApi('openapi: 3.1.0\ninfo:\n  title: X\n  version: 1.0.0\n', 'yaml');
    expect(
      buildValueSuggestions(valueCtx('Schema', '$ref'), '3.1', bare, { full: false })
    ).toEqual([]);
  });
});

describe('buildValueSuggestions — enum values', () => {
  it('offers enum values for JSON with quoting', () => {
    const items = buildValueSuggestions(valueCtx('Parameter', 'in'), '3.1', analysis, {
      full: true,
    });
    expect(items.map((item) => item.label).sort()).toEqual(['cookie', 'header', 'path', 'query']);
    expect(items[0].insertText).toMatch(/^"/);
  });

  it('offers NO enum values for YAML (monaco-yaml owns those)', () => {
    expect(
      buildValueSuggestions(valueCtx('Parameter', 'in'), '3.1', analysis, { full: false })
    ).toEqual([]);
  });

  it('returns [] for non-enum properties', () => {
    expect(
      buildValueSuggestions(valueCtx('Operation', 'summary'), '3.1', analysis, { full: true })
    ).toEqual([]);
  });
});
