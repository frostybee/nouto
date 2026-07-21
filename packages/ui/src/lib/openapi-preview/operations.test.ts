import { describe, it, expect } from 'vitest';
import { listPreviewOperations, operationLabel, resolveSelection } from './operations';

const SPEC = {
  openapi: '3.2.0',
  info: { title: 'Pets', version: '1.0.0' },
  paths: {
    '/pets': {
      get: { summary: 'List pets' },
      post: { operationId: 'createPet' },
      query: { summary: 'Query pets' },
      additionalOperations: { PURGE: { summary: 'Purge pets' } },
    },
    '/pets/{petId}': {
      get: { summary: 'Get pet' },
    },
  },
};

describe('listPreviewOperations', () => {
  it('lists every operation with host-identical pointers', () => {
    expect(listPreviewOperations(SPEC).map((operation) => operation.pointer)).toEqual([
      '/paths/~1pets/get',
      '/paths/~1pets/post',
      '/paths/~1pets/query',
      '/paths/~1pets/additionalOperations/PURGE',
      '/paths/~1pets~1{petId}/get',
    ]);
  });

  it('keeps declared method names, including 3.2 additional operations', () => {
    expect(listPreviewOperations(SPEC).map((operation) => operation.method)).toEqual([
      'get',
      'post',
      'query',
      'PURGE',
      'get',
    ]);
  });

  it('excludes webhooks', () => {
    const operations = listPreviewOperations({
      ...SPEC,
      webhooks: { petAdded: { post: { summary: 'Added' } } },
    });
    expect(operations.every((operation) => operation.path.startsWith('/pets'))).toBe(true);
    expect(operations).toHaveLength(5);
  });

  it('returns nothing for absent or non-object specifications', () => {
    expect(listPreviewOperations(undefined)).toEqual([]);
    expect(listPreviewOperations(null)).toEqual([]);
    expect(listPreviewOperations(['not a spec'])).toEqual([]);
    expect(listPreviewOperations({ openapi: '3.1.0' })).toEqual([]);
  });
});

describe('resolveSelection', () => {
  const operations = listPreviewOperations(SPEC);

  it('retains a selection that still exists', () => {
    expect(resolveSelection(operations, '/paths/~1pets/query')).toBe('/paths/~1pets/query');
  });

  it('falls back to the first operation when the selection disappeared', () => {
    expect(resolveSelection(operations, '/paths/~1gone/get')).toBe('/paths/~1pets/get');
  });

  it('selects the first operation when nothing was selected yet', () => {
    expect(resolveSelection(operations, '')).toBe('/paths/~1pets/get');
  });

  it('clears the selection when the document has no operations', () => {
    expect(resolveSelection([], '/paths/~1pets/get')).toBe('');
  });
});

describe('operationLabel', () => {
  it('uppercases the method and appends the summary', () => {
    const [get, post] = listPreviewOperations(SPEC);
    expect(operationLabel(get)).toBe('GET /pets — List pets');
    expect(operationLabel(post)).toBe('POST /pets');
  });
});
