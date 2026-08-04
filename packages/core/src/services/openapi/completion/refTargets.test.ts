import { ALL_REF_SECTIONS, COMPONENT_SECTION_FOR_KIND, enumerateRefTargets } from './refTargets';

const doc = {
  openapi: '3.1.0',
  components: {
    schemas: { Pet: {}, 'Pet/Owner': {} },
    responses: { NotFound: {} },
    parameters: { limit: {} },
  },
};

describe('enumerateRefTargets', () => {
  it('restricts targets to the section matching the referencing kind', () => {
    expect(enumerateRefTargets(doc, 'Schema')).toEqual([
      '#/components/schemas/Pet',
      '#/components/schemas/Pet~1Owner',
    ]);
    expect(enumerateRefTargets(doc, 'Response')).toEqual(['#/components/responses/NotFound']);
  });

  it('offers every section when the kind has no dedicated bucket', () => {
    const targets = enumerateRefTargets(doc, 'Operation');
    expect(targets).toEqual(
      expect.arrayContaining([
        '#/components/schemas/Pet',
        '#/components/responses/NotFound',
        '#/components/parameters/limit',
      ])
    );
  });

  it('escapes JSON Pointer special characters in component names', () => {
    expect(enumerateRefTargets(doc, 'Schema')).toContain('#/components/schemas/Pet~1Owner');
  });

  it('falls back to top-level keys for bare-schema files without components', () => {
    expect(enumerateRefTargets({ type: 'object', properties: {} }, 'Schema')).toEqual([
      '#/type',
      '#/properties',
    ]);
  });

  it('returns [] for non-object documents', () => {
    expect(enumerateRefTargets(null, 'Schema')).toEqual([]);
    expect(enumerateRefTargets('text', 'Schema')).toEqual([]);
    expect(enumerateRefTargets([1, 2], 'Schema')).toEqual([]);
  });

  it('ignores malformed components buckets', () => {
    const malformed = { components: { schemas: 'nope', responses: null } };
    // Falls back to top-level keys since no valid bucket produced targets.
    expect(enumerateRefTargets(malformed, 'Schema')).toEqual(['#/components']);
  });
});

describe('COMPONENT_SECTION_FOR_KIND', () => {
  it('covers exactly the nine referenceable component sections', () => {
    expect(ALL_REF_SECTIONS).toHaveLength(9);
    expect(COMPONENT_SECTION_FOR_KIND.Schema).toBe('schemas');
    expect(COMPONENT_SECTION_FOR_KIND.PathItem).toBe('pathItems');
  });
});
