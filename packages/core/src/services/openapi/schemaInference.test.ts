import {
  inferJsonSchema,
  inferJsonSchemaFromSamples,
  deriveSchemaName,
  classifyPathSegment,
} from './schemaInference';
import type { SchemaInferenceDialect, PathSegmentClass } from './schemaInference';

const SCHEMA_2020_12 = 'https://json-schema.org/draft/2020-12/schema';

const standalone = (value: unknown) => inferJsonSchema(value, { dialect: 'standalone' });

describe('inferJsonSchema', () => {
  describe('primitives', () => {
    it.each<[string, unknown, Record<string, unknown>]>([
      ['string', 'x', { type: 'string' }],
      ['integer', 1, { type: 'integer' }],
      ['number', 1.5, { type: 'number' }],
      ['boolean', true, { type: 'boolean' }],
    ])('infers a %s', (_label, value, expected) => {
      expect(standalone(value)).toEqual({ $schema: SCHEMA_2020_12, ...expected });
    });

    it('reports a whole float as integer (JSON 1.0 parses to 1)', () => {
      expect(standalone(1.0)).toMatchObject({ type: 'integer' });
    });

    it('renders a root null per dialect', () => {
      expect(standalone(null)).toEqual({ $schema: SCHEMA_2020_12, type: 'null' });
      expect(inferJsonSchema(null, { dialect: '3.1' })).toEqual({ type: 'null' });
      expect(inferJsonSchema(null, { dialect: '3.0' })).toEqual({ nullable: true });
    });
  });

  describe('objects', () => {
    it('recurses properties in insertion order and requires every present key', () => {
      const schema = standalone({ id: 7, name: 'a', active: false });
      expect(schema).toEqual({
        $schema: SCHEMA_2020_12,
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          active: { type: 'boolean' },
        },
        required: ['id', 'name', 'active'],
      });
      expect(Object.keys(schema.properties as object)).toEqual(['id', 'name', 'active']);
    });

    it('renders an empty object without required (matches the component preset shape)', () => {
      expect(standalone({})).toEqual({ $schema: SCHEMA_2020_12, type: 'object', properties: {} });
    });

    it('handles nesting', () => {
      expect(standalone({ user: { id: 1 } })).toMatchObject({
        properties: { user: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] } },
      });
    });
  });

  describe('arrays', () => {
    it('renders an empty array with permissive items (items is mandatory in 3.0)', () => {
      expect(inferJsonSchema([], { dialect: '3.0' })).toEqual({ type: 'array', items: {} });
    });

    it('merges homogeneous object items', () => {
      expect(standalone([{ a: 1 }, { a: 2 }])).toMatchObject({
        type: 'array',
        items: { type: 'object', properties: { a: { type: 'integer' } }, required: ['a'] },
      });
    });

    it('intersects required across items with partial keys', () => {
      const schema = standalone([{ a: 1, b: 2 }, { a: 3 }]);
      expect(schema).toMatchObject({
        items: {
          properties: { a: { type: 'integer' }, b: { type: 'integer' } },
          required: ['a'],
        },
      });
    });

    it('widens an integer/number mix to number', () => {
      expect(standalone([1, 2.5])).toMatchObject({ items: { type: 'number' } });
    });

    it('renders nullable items per dialect', () => {
      expect(inferJsonSchema(['a', null], { dialect: '3.1' })).toEqual({
        type: 'array',
        items: { type: ['string', 'null'] },
      });
      expect(inferJsonSchema(['a', null], { dialect: '3.0' })).toEqual({
        type: 'array',
        items: { type: 'string', nullable: true },
      });
    });

    it('degrades heterogeneous items to a type union (or {} on 3.0)', () => {
      expect(inferJsonSchema([{ a: 1 }, 'x'], { dialect: '3.1' })).toEqual({
        type: 'array',
        items: { type: ['object', 'string'] },
      });
      expect(inferJsonSchema([{ a: 1 }, 'x'], { dialect: '3.0' })).toEqual({
        type: 'array',
        items: {},
      });
    });

    it('ignores empty arrays when unifying nested array items', () => {
      expect(standalone([[], [1]])).toMatchObject({
        items: { type: 'array', items: { type: 'integer' } },
      });
    });
  });

  describe('nullability of object properties', () => {
    const body = [{ note: 'x' }, { note: null }];

    it('3.1 uses a type array', () => {
      expect(inferJsonSchema(body, { dialect: '3.1' })).toMatchObject({
        items: { properties: { note: { type: ['string', 'null'] } } },
      });
    });

    it('3.2 matches 3.1', () => {
      expect(inferJsonSchema(body, { dialect: '3.2' })).toEqual(
        inferJsonSchema(body, { dialect: '3.1' })
      );
    });

    it('3.0 uses nullable: true and never a type array', () => {
      expect(inferJsonSchema(body, { dialect: '3.0' })).toMatchObject({
        items: { properties: { note: { type: 'string', nullable: true } } },
      });
    });
  });

  describe('formats', () => {
    it.each<[string, string]>([
      ['date-time', '2024-01-15T10:30:00Z'],
      ['date-time', '2024-01-15T10:30:00.123+02:00'],
      ['date', '2024-01-15'],
      ['uuid', '9f8b3c1e-2d4a-4f6b-8c0d-1e2f3a4b5c6d'],
      ['email', 'user@example.com'],
      ['uri', 'https://example.com/a/b?c=1'],
    ])('detects %s', (format, value) => {
      expect(standalone(value)).toMatchObject({ type: 'string', format });
    });

    it.each<[string, string]>([
      ['almost a date', '2024-13-99x'],
      ['a bare word', 'hello'],
      ['a relative path', 'a/b/c'],
      ['a truncated uuid', '9f8b3c1e-2d4a-4f6b-8c0d'],
    ])('does not invent a format for %s', (_label, value) => {
      expect(standalone(value)).toEqual({ $schema: SCHEMA_2020_12, type: 'string' });
    });

    it('keeps a format only when every sample matches', () => {
      expect(standalone(['2024-01-15T10:30:00Z', '2025-02-16T11:31:01Z'])).toMatchObject({
        items: { type: 'string', format: 'date-time' },
      });
      expect(standalone(['2024-01-15T10:30:00Z', 'hello'])).toMatchObject({
        items: { type: 'string' },
      });
      expect(
        (standalone(['2024-01-15T10:30:00Z', 'hello']) as { items: Record<string, unknown> }).items.format
      ).toBeUndefined();
    });

    it('drops a format when samples disagree on which format', () => {
      expect(standalone(['2024-01-15', 'user@example.com'])).toMatchObject({
        items: { type: 'string' },
      });
    });
  });

  describe('dialect envelope', () => {
    it.each<SchemaInferenceDialect>(['3.0', '3.1', '3.2'])(
      'never emits $schema when embedded in %s',
      (dialect) => {
        expect(inferJsonSchema({ a: 1 }, { dialect })).not.toHaveProperty('$schema');
      }
    );

    it('emits $schema first for standalone', () => {
      expect(Object.keys(standalone({ a: 1 }))[0]).toBe('$schema');
    });
  });

  describe('guards', () => {
    it('truncates past maxDepth', () => {
      const deep = { a: { b: { c: { d: 1 } } } };
      expect(inferJsonSchema(deep, { dialect: 'standalone', maxDepth: 2 })).toMatchObject({
        properties: { a: { properties: { b: { properties: { c: {} } } } } },
      });
    });

    it('survives a cyclic live object instead of recursing forever', () => {
      const cyclic: Record<string, unknown> = { name: 'x' };
      cyclic.self = cyclic;
      expect(standalone(cyclic)).toMatchObject({
        type: 'object',
        properties: { name: { type: 'string' }, self: {} },
      });
    });

    it('completes on a large flat array', () => {
      const big = Array.from({ length: 5000 }, (_, i) => ({ i }));
      expect(standalone(big)).toMatchObject({ type: 'array' });
    });
  });
});

describe('inferJsonSchemaFromSamples', () => {
  it('matches inferJsonSchema for a single sample', () => {
    const sample = { id: 1, tags: ['a'], when: '2024-01-15' };
    expect(inferJsonSchemaFromSamples([sample], { dialect: 'standalone' })).toEqual(
      inferJsonSchema(sample, { dialect: 'standalone' })
    );
  });

  it('unions keys and intersects required across samples', () => {
    const schema = inferJsonSchemaFromSamples(
      [{ a: 1, b: 'x' }, { a: 2 }],
      { dialect: '3.1' }
    );
    expect(schema).toEqual({
      type: 'object',
      properties: { a: { type: 'integer' }, b: { type: 'string' } },
      required: ['a'],
    });
  });

  it('widens an integer/number mix and drops disagreeing formats', () => {
    expect(inferJsonSchemaFromSamples([1, 2.5], { dialect: '3.1' })).toEqual({ type: 'number' });
    expect(
      inferJsonSchemaFromSamples(['2024-01-15', 'hello'], { dialect: '3.1' })
    ).toEqual({ type: 'string' });
  });

  it('degrades heterogeneous samples to a type union (or {} on 3.0)', () => {
    expect(inferJsonSchemaFromSamples([{ a: 1 }, 'x'], { dialect: '3.1' })).toEqual({
      type: ['object', 'string'],
    });
    expect(inferJsonSchemaFromSamples([{ a: 1 }, 'x'], { dialect: '3.0' })).toEqual({});
  });

  it('renders no samples as the empty schema, with the standalone envelope', () => {
    expect(inferJsonSchemaFromSamples([], { dialect: '3.1' })).toEqual({});
    expect(inferJsonSchemaFromSamples([], { dialect: 'standalone' })).toEqual({
      $schema: SCHEMA_2020_12,
    });
  });
});

describe('classifyPathSegment', () => {
  it.each<[string, PathSegmentClass]>([
    ['{id}', 'param'],
    ['{{baseUrl}}', 'param'],
    [':userId', 'param'],
    ['42', 'numeric'],
    ['9f8b3c1e-2d4a-4f6b-8c0d-1e2f3a4b5c6d', 'uuid'],
    ['v1', 'version'],
    ['V12', 'version'],
    ['users', 'static'],
    ['user-profiles', 'static'],
    ['v1x', 'static'],
  ])('%s → %s', (segment, expected) => {
    expect(classifyPathSegment(segment)).toBe(expected);
  });
});

describe('deriveSchemaName', () => {
  it.each<[string, string | undefined]>([
    ['https://api.example.com/api/v1/users', 'UsersResponse'],
    ['https://api.example.com/api/v1/users/42', 'UsersResponse'],
    ['https://api.example.com/orders/{id}/items', 'ItemsResponse'],
    ['/api/v1/users?limit=2', 'UsersResponse'],
    ['{{baseUrl}}/user-profiles', 'UserProfilesResponse'],
    ['https://api.example.com/things/9f8b3c1e-2d4a-4f6b-8c0d-1e2f3a4b5c6d', 'ThingsResponse'],
    ['https://api.example.com/api/v2', 'ApiResponse'],
    ['https://api.example.com/', undefined],
    ['https://api.example.com/{id}/42', undefined],
    ['', undefined],
  ])('%s → %s', (url, expected) => {
    expect(deriveSchemaName(url)).toBe(expected);
  });

  it('returns undefined for undefined input', () => {
    expect(deriveSchemaName(undefined)).toBeUndefined();
  });
});
