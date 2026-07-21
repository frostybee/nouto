import {
  buildPointer,
  escapePointerSegment,
  getByPointer,
  parsePointer,
  unescapePointerSegment,
} from './pointer';

describe('RFC 6901 pointer helpers', () => {
  describe('escaping', () => {
    it('escapes ~ and /', () => {
      expect(escapePointerSegment('a~b')).toBe('a~0b');
      expect(escapePointerSegment('a/b')).toBe('a~1b');
      expect(escapePointerSegment('~/')).toBe('~0~1');
      expect(escapePointerSegment('plain')).toBe('plain');
    });

    it('unescapes ~1 before ~0 (RFC 6901 ordering)', () => {
      expect(unescapePointerSegment('a~0b')).toBe('a~b');
      expect(unescapePointerSegment('a~1b')).toBe('a/b');
      // '~01' must decode to the literal '~1', not '/'
      expect(unescapePointerSegment('~01')).toBe('~1');
    });

    it('round-trips arbitrary segments', () => {
      for (const segment of ['a/b', 'a~b', '~1', '~0', '/~/~', '', 'x']) {
        expect(unescapePointerSegment(escapePointerSegment(segment))).toBe(segment);
      }
    });
  });

  describe('buildPointer / parsePointer', () => {
    it('builds the root pointer from no segments', () => {
      expect(buildPointer([])).toBe('');
    });

    it('builds and parses nested pointers with escaping', () => {
      const segments = ['paths', '/users/{id}', 'get'];
      const pointer = buildPointer(segments);
      expect(pointer).toBe('/paths/~1users~1{id}/get');
      expect(parsePointer(pointer)).toEqual(segments);
    });

    it('parses the empty pointer as the document root', () => {
      expect(parsePointer('')).toEqual([]);
    });

    it('rejects pointers missing the leading slash', () => {
      expect(parsePointer('paths/get')).toBeUndefined();
    });

    it('parses pointers with empty segments', () => {
      expect(parsePointer('//')).toEqual(['', '']);
    });
  });

  describe('getByPointer', () => {
    const doc = {
      paths: {
        '/users/{id}': { get: { operationId: 'getUser' } },
      },
      'a~b': { 'c/d': 1 },
      list: [10, 20],
      nothing: undefined,
    };

    it('resolves the root', () => {
      expect(getByPointer(doc, '')).toEqual({ found: true, value: doc });
    });

    it('resolves nested object paths with escaped segments', () => {
      expect(getByPointer(doc, '/paths/~1users~1{id}/get/operationId')).toEqual({
        found: true,
        value: 'getUser',
      });
      expect(getByPointer(doc, '/a~0b/c~1d')).toEqual({ found: true, value: 1 });
    });

    it('resolves array indices', () => {
      expect(getByPointer(doc, '/list/1')).toEqual({ found: true, value: 20 });
    });

    it('rejects invalid array indices', () => {
      expect(getByPointer(doc, '/list/01').found).toBe(false);
      expect(getByPointer(doc, '/list/-1').found).toBe(false);
      expect(getByPointer(doc, '/list/2').found).toBe(false);
      expect(getByPointer(doc, '/list/x').found).toBe(false);
    });

    it('reports missing properties as not found', () => {
      expect(getByPointer(doc, '/missing').found).toBe(false);
      expect(getByPointer(doc, '/paths/missing').found).toBe(false);
    });

    it('distinguishes present-but-undefined from missing', () => {
      expect(getByPointer(doc, '/nothing')).toEqual({ found: true, value: undefined });
    });

    it('does not traverse into primitives', () => {
      expect(getByPointer(doc, '/paths/~1users~1{id}/get/operationId/x').found).toBe(false);
    });
  });
});
