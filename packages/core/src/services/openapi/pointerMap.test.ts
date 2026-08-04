import {
  buildPointerMap,
  offsetToPointer,
  pointerToAnchorOffsetRange,
  pointerToOffsetRange,
} from './pointerMap';

const YAML_DOC = `openapi: 3.1.0
info:
  title: Pet Store
  version: 1.0.0
paths:
  /pets:
    get:
      responses:
        '200':
          description: OK
servers:
  - url: https://api.example.com
  - url: https://staging.example.com
`;

const JSON_DOC = JSON.stringify(
  {
    openapi: '3.1.0',
    info: { title: 'Pet Store', version: '1.0.0' },
    paths: {
      '/pets': {
        get: { responses: { '200': { description: 'OK' } } },
      },
    },
    servers: [{ url: 'https://api.example.com' }, { url: 'https://staging.example.com' }],
  },
  null,
  2
);

describe('buildPointerMap', () => {
  it.each([
    ['yaml', YAML_DOC],
    ['json', JSON_DOC],
  ] as const)('maps nested pointers with %s content', (format, content) => {
    const map = buildPointerMap(content, format);

    const title = pointerToOffsetRange(map, '/info/title');
    expect(title).toBeDefined();
    expect(content.slice(title!.from, title!.to)).toContain('Pet Store');

    // Escaped path segment (`/pets` → `~1pets`) round-trips.
    const get = pointerToOffsetRange(map, '/paths/~1pets/get');
    expect(get).toBeDefined();
    expect(content.slice(get!.from, get!.to)).toContain('responses');

    // Array index pointers.
    const server1 = pointerToOffsetRange(map, '/servers/1');
    expect(server1).toBeDefined();
    expect(content.slice(server1!.from, server1!.to)).toContain('staging.example.com');
  });

  it('always contains a root entry spanning the document', () => {
    const map = buildPointerMap(YAML_DOC, 'yaml');
    expect(pointerToOffsetRange(map, '')).toEqual({ from: 0, to: YAML_DOC.length });
  });

  it('returns undefined for unknown pointers', () => {
    const map = buildPointerMap(YAML_DOC, 'yaml');
    expect(pointerToOffsetRange(map, '/nope')).toBeUndefined();
  });

  it('survives unparseable content with the root fallback', () => {
    const map = buildPointerMap('{{{{', 'json');
    expect(pointerToOffsetRange(map, '')).toEqual({ from: 0, to: 4 });
  });
});

describe('pointerToAnchorOffsetRange', () => {
  it.each([
    ['yaml', YAML_DOC],
    ['json', JSON_DOC],
  ] as const)('anchors a keyed node at its key (%s)', (format, content) => {
    const map = buildPointerMap(content, format);
    const anchor = pointerToAnchorOffsetRange(map, '/paths/~1pets/get');
    expect(anchor).toBeDefined();
    expect(content.slice(anchor!.from, anchor!.to)).toContain('get');
  });

  it.each([
    ['yaml', YAML_DOC],
    ['json', JSON_DOC],
  ] as const)('anchors a keyless array item at its first inner key (%s)', (format, content) => {
    const map = buildPointerMap(content, format);
    const anchor = pointerToAnchorOffsetRange(map, '/servers/0');
    expect(anchor).toBeDefined();
    expect(content.slice(anchor!.from, anchor!.to)).toContain('url');
  });

  it('anchors the root at the first document key, not the whole file', () => {
    const map = buildPointerMap(YAML_DOC, 'yaml');
    const anchor = pointerToAnchorOffsetRange(map, '');
    expect(anchor).toBeDefined();
    expect(YAML_DOC.slice(anchor!.from, anchor!.to)).toBe('openapi');
  });
});

describe('offsetToPointer', () => {
  it.each([
    ['yaml', YAML_DOC],
    ['json', JSON_DOC],
  ] as const)('recovers the pointer from an offset inside a value (%s)', (format, content) => {
    const map = buildPointerMap(content, format);
    const inTitle = content.indexOf('Pet Store') + 2;
    expect(offsetToPointer(map, inTitle)).toBe('/info/title');
  });

  it('recovers the pointer from an offset inside a key', () => {
    const map = buildPointerMap(YAML_DOC, 'yaml');
    const inKey = YAML_DOC.indexOf('description');
    expect(offsetToPointer(map, inKey)).toBe(
      '/paths/~1pets/get/responses/200/description'
    );
  });

  it('clamps out-of-content offsets instead of throwing', () => {
    const map = buildPointerMap('openapi: 3.1.0\n', 'yaml');
    expect(() => offsetToPointer(map, 9999)).not.toThrow();
    expect(offsetToPointer(map, -5)).toBe('/openapi');
  });
});
