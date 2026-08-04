import { describe, it, expect } from 'vitest';
import { analyzeOpenApi } from '@nouto/core/services/openapi/analyze';
import { buildPointerMap } from '@nouto/core/services/openapi/pointerMap';
import { resolveExternalRefUri } from '@nouto/core/services/openapi/externalRefs';
import type { FileResolver } from '@nouto/core/services/openapi/externalRefs';
import { resolveRefDefinition } from './definition';
import { pathToFileUri } from './pathUtils';

const YAML = [
  'openapi: 3.1.0',
  'info:',
  '  title: T',
  '  version: 1.0.0',
  'paths: {}',
  'components:',
  '  schemas:',
  '    Pet:',
  '      type: object',
  '    Local:',
  '      $ref: "#/components/schemas/Pet"',
  '    Missing:',
  '      $ref: "#/components/schemas/Nope"',
  '    External:',
  '      $ref: ./common.yaml#/components/schemas/Pet',
  '    Whole:',
  '      $ref: ./common.yaml',
  '    Remote:',
  '      $ref: https://example.com/x.yaml#/a',
  '',
].join('\n');

const resolver: FileResolver = {
  resolve: (fromUri, refPath) => resolveExternalRefUri(fromUri, refPath),
  load: async () => undefined,
};

const FROM_URI = pathToFileUri('C:\\specs\\api.yaml');

function setup() {
  return { map: buildPointerMap(YAML, 'yaml'), analysis: analyzeOpenApi(YAML, 'yaml') };
}

/** Offset of the character right after the given needle's `$ref: ` value start. */
function valueOffset(needle: string): number {
  const index = YAML.indexOf(needle);
  expect(index).toBeGreaterThan(-1);
  return index + 2; // inside the value text
}

describe('resolveRefDefinition', () => {
  it('resolves an internal ref to the target range', () => {
    const { map, analysis } = setup();
    const def = resolveRefDefinition(map, analysis, valueOffset('"#/components/schemas/Pet"'), FROM_URI, resolver);
    expect(def?.kind).toBe('internal');
    if (def?.kind === 'internal') {
      const petEntry = map.entries.get('/components/schemas/Pet')!;
      expect(def.range).toEqual({ from: petEntry.valueFrom, to: petEntry.valueTo });
    }
  });

  it('yields nothing for a missing internal target', () => {
    const { map, analysis } = setup();
    expect(
      resolveRefDefinition(map, analysis, valueOffset('"#/components/schemas/Nope"'), FROM_URI, resolver)
    ).toBeUndefined();
  });

  it('resolves an external ref with a pointer', () => {
    const { map, analysis } = setup();
    const def = resolveRefDefinition(
      map,
      analysis,
      valueOffset('./common.yaml#/components/schemas/Pet'),
      FROM_URI,
      resolver
    );
    expect(def).toEqual({
      kind: 'external',
      targetFileUri: pathToFileUri('C:\\specs\\common.yaml'),
      targetPointer: '/components/schemas/Pet',
    });
  });

  it('resolves a whole-document external ref with an empty pointer', () => {
    const { map, analysis } = setup();
    const index = YAML.indexOf('$ref: ./common.yaml\n');
    const def = resolveRefDefinition(map, analysis, index + 8, FROM_URI, resolver);
    expect(def).toEqual({
      kind: 'external',
      targetFileUri: pathToFileUri('C:\\specs\\common.yaml'),
      targetPointer: '',
    });
  });

  it("yields nothing for scheme'd refs", () => {
    const { map, analysis } = setup();
    expect(
      resolveRefDefinition(map, analysis, valueOffset('https://example.com/x.yaml#/a'), FROM_URI, resolver)
    ).toBeUndefined();
  });

  it('yields nothing for external refs in untitled documents (no base URI)', () => {
    const { map, analysis } = setup();
    expect(
      resolveRefDefinition(
        map,
        analysis,
        valueOffset('./common.yaml#/components/schemas/Pet'),
        undefined,
        resolver
      )
    ).toBeUndefined();
  });

  it('yields nothing when the cursor is not on a $ref value', () => {
    const { map, analysis } = setup();
    expect(resolveRefDefinition(map, analysis, YAML.indexOf('title: T') + 3, FROM_URI, resolver)).toBeUndefined();
    // On the $ref KEY, not its value.
    const keyOffset = YAML.indexOf('$ref: "#/components/schemas/Pet"');
    expect(resolveRefDefinition(map, analysis, keyOffset, FROM_URI, resolver)).toBeUndefined();
  });

  it('yields nothing without a parsed spec', () => {
    const { map } = setup();
    expect(
      resolveRefDefinition(map, null, valueOffset('"#/components/schemas/Pet"'), FROM_URI, resolver)
    ).toBeUndefined();
  });
});
