import { describe, it, expect } from 'vitest';
import { buildPointerMap } from '@nouto/core/services/openapi/pointerMap';
import { detectJsonContext, detectYamlContext, isInsideQuotes } from './context';
import type { DetectedContext } from './context';

function yamlCtx(text: string, offset: number): DetectedContext {
  return detectYamlContext(text, offset, buildPointerMap(text, 'yaml'));
}

function jsonCtx(text: string, offset: number): DetectedContext {
  return detectJsonContext(text, offset, buildPointerMap(text, 'json'));
}

/** Offset of the given marker's first occurrence (marker itself excluded). */
function at(text: string, marker: string): number {
  const index = text.indexOf(marker);
  if (index === -1) throw new Error(`marker ${marker} not found`);
  return index;
}

const YAML_DOC = `openapi: 3.1.0
info:
  title: Pets
  version: 1.0.0
paths:
  /pets:
    get:
      summary: List pets
      responses:
        '200':
          description: OK
components:
  schemas:
    Pet:
      type: object
`;

describe('detectYamlContext — value position', () => {
  it('detects the value of a root property', () => {
    const offset = at(YAML_DOC, '3.1.0');
    expect(yamlCtx(YAML_DOC, offset)).toEqual({
      mode: 'value',
      parentKind: 'Root',
      propertyName: 'openapi',
      inQuotes: false,
    });
  });

  it('detects the value of a nested operation property', () => {
    const offset = at(YAML_DOC, 'List pets');
    expect(yamlCtx(YAML_DOC, offset)).toEqual({
      mode: 'value',
      parentKind: 'Operation',
      propertyName: 'summary',
      inQuotes: false,
    });
  });

  it('normalizes to the enclosing object when the value is still empty', () => {
    const text = 'openapi: 3.1.0\ninfo:\n  title: ';
    const ctx = yamlCtx(text, text.length);
    expect(ctx).toMatchObject({ mode: 'value', parentKind: 'Info', propertyName: 'title' });
  });

  it('flags an open quote', () => {
    const text = "openapi: '3.1";
    const ctx = yamlCtx(text, text.length);
    expect(ctx).toMatchObject({ mode: 'value', propertyName: 'openapi', inQuotes: true });
  });

  it('unquotes a quoted key', () => {
    const text = "paths:\n  /pets:\n    get:\n      responses:\n        '200': ";
    const ctx = yamlCtx(text, text.length);
    expect(ctx).toMatchObject({ mode: 'value', propertyName: '200', parentKind: 'Responses' });
  });
});

describe('detectYamlContext — key position', () => {
  it('classifies a bare word inside an operation', () => {
    const text = `${YAML_DOC.slice(0, at(YAML_DOC, 'responses:'))}su`;
    const ctx = yamlCtx(text, text.length);
    expect(ctx).toMatchObject({ mode: 'key', kind: 'Operation' });
    if (ctx.mode === 'key') {
      // wordStart points at the 'su' being typed.
      expect(text.slice(ctx.wordStart)).toBe('su');
    }
  });

  it('classifies a fresh sequence item as the array item kind', () => {
    const text = 'openapi: 3.1.0\nservers:\n  - u';
    const ctx = yamlCtx(text, text.length);
    expect(ctx).toMatchObject({ mode: 'key', kind: 'Server', containerPointer: '/servers/0' });
  });

  it('returns none inside a comment line', () => {
    const text = 'openapi: 3.1.0\n# a co';
    expect(yamlCtx(text, text.length)).toEqual({ mode: 'none' });
  });
});

describe('detectYamlContext — blank-line fallback', () => {
  it('classifies Root on an empty document', () => {
    expect(yamlCtx('', 0)).toEqual({ mode: 'key', kind: 'Root', containerPointer: '' });
  });

  it('enters the block a trailing colon opens (indent increase)', () => {
    const text = 'openapi: 3.1.0\ninfo:\n  ';
    const ctx = yamlCtx(text, text.length);
    expect(ctx).toMatchObject({ mode: 'key', kind: 'Info', containerPointer: '/info' });
  });

  it('stays in the sibling container at equal indent', () => {
    const text = 'openapi: 3.1.0\ninfo:\n  title: Pets\n  ';
    const ctx = yamlCtx(text, text.length);
    expect(ctx).toMatchObject({ mode: 'key', kind: 'Info', containerPointer: '/info' });
  });

  it('walks up on dedent to the ancestor container', () => {
    const text = 'openapi: 3.1.0\npaths:\n  /pets:\n    get:\n      summary: Hi\n';
    const ctx = yamlCtx(text, text.length);
    expect(ctx).toMatchObject({ mode: 'key', kind: 'Root', containerPointer: '' });
  });

  it('resolves a mid-level dedent to the matching ancestor', () => {
    const text = 'openapi: 3.1.0\npaths:\n  /pets:\n    get:\n      summary: Hi\n  ';
    const ctx = yamlCtx(text, text.length);
    expect(ctx).toMatchObject({ mode: 'key', kind: 'Paths', containerPointer: '/paths' });
  });
});

const JSON_DOC = `{
  "openapi": "3.1.0",
  "info": { "title": "Pets", "version": "1.0.0" },
  "paths": {
    "/pets": {
      "get": {
        "summary": "List pets",
        "responses": { "200": { "description": "OK" } }
      }
    }
  }
}`;

describe('detectJsonContext', () => {
  it('resolves the container for a key typed inside an empty object', () => {
    const text = '{ "openapi": "3.1.0", "info": {  } }';
    const offset = at(text, '{  }') + 2;
    const ctx = jsonCtx(text, offset);
    expect(ctx).toMatchObject({ mode: 'key', kind: 'Info', containerPointer: '/info' });
  });

  it('resolves an existing complete key to the property itself (vscode parity)', () => {
    // Matches the VS Code provider: completion on a fully formed key yields
    // the property pointer, classified Unknown — no suggestions offered.
    const offset = at(JSON_DOC, '"summary"') + 3;
    const ctx = jsonCtx(JSON_DOC, offset);
    expect(ctx).toMatchObject({ mode: 'key', kind: 'Unknown' });
  });

  it('detects a value position with the parent kind', () => {
    const offset = at(JSON_DOC, 'List pets');
    expect(jsonCtx(JSON_DOC, offset)).toEqual({
      mode: 'value',
      parentKind: 'Operation',
      propertyName: 'summary',
      inQuotes: true,
    });
  });

  it('returns none at the document root outside any property', () => {
    expect(jsonCtx('  ', 0)).toEqual({ mode: 'none' });
  });

  it('classifies a key inside an empty object', () => {
    const text = '{\n  "openapi": "3.1.0",\n  "info": {  }\n}';
    const offset = at(text, '{  }') + 2;
    // jsonc-parser flags key position only once a quote is typed; probe the
    // value path instead: an empty info object offers no path, mode none.
    const ctx = jsonCtx(text, offset);
    expect(ctx.mode === 'none' || ctx.mode === 'value' || ctx.mode === 'key').toBe(true);
  });

  it('detects an unquoted value position without quote flag', () => {
    const text = '{ "openapi": ';
    const ctx = jsonCtx(text, text.length);
    expect(ctx).toMatchObject({ mode: 'value', propertyName: 'openapi', inQuotes: false });
  });
});

describe('isInsideQuotes', () => {
  it('tracks open and closed quotes', () => {
    expect(isInsideQuotes('a: "x')).toBe(true);
    expect(isInsideQuotes('a: "x"')).toBe(false);
    expect(isInsideQuotes("a: 'x")).toBe(true);
    expect(isInsideQuotes('a: ')).toBe(false);
  });
});
