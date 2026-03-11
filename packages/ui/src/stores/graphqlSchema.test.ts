import { describe, it, expect, beforeEach } from 'vitest';
import {
  graphqlSchemaStore,
  setSchemaLoading,
  setSchema,
  setSchemaError,
  clearSchema,
  queryFields,
  mutationFields,
  subscriptionFields,
  userTypes,
} from './graphqlSchema.svelte';
import type { GraphQLSchema, GraphQLType, GraphQLField } from '../types';

function makeField(name: string, typeName: string = 'String'): GraphQLField {
  return {
    name,
    type: { kind: 'SCALAR', name: typeName },
    args: [],
    isDeprecated: false,
  };
}

function makeType(name: string, kind: GraphQLType['kind'] = 'OBJECT', fields?: GraphQLField[]): GraphQLType {
  return {
    kind,
    name,
    fields: fields ?? [makeField('id', 'ID')],
  };
}

function makeSchema(overrides?: Partial<GraphQLSchema>): GraphQLSchema {
  return {
    queryType: { name: 'Query' },
    mutationType: { name: 'Mutation' },
    subscriptionType: { name: 'Subscription' },
    types: [
      makeType('Query', 'OBJECT', [makeField('users'), makeField('user')]),
      makeType('Mutation', 'OBJECT', [makeField('createUser')]),
      makeType('Subscription', 'OBJECT', [makeField('userCreated')]),
      makeType('User', 'OBJECT', [makeField('id', 'ID'), makeField('name')]),
      makeType('Role', 'ENUM'),
      makeType('__Schema', 'OBJECT'),
      makeType('__Type', 'OBJECT'),
    ],
    ...overrides,
  };
}

describe('graphqlSchema store', () => {
  beforeEach(() => {
    clearSchema();
  });

  describe('setSchemaLoading', () => {
    it('should set loading state with url', () => {
      setSchemaLoading('https://api.example.com/graphql');
      const state = graphqlSchemaStore;

      expect(state.loading).toBe(true);
      expect(state.url).toBe('https://api.example.com/graphql');
      expect(state.schema).toBeNull();
      expect(state.error).toBeNull();
    });

    it('should clear previous schema when loading', () => {
      setSchema(makeSchema());
      setSchemaLoading('https://api.example.com/graphql');
      const state = graphqlSchemaStore;

      expect(state.schema).toBeNull();
      expect(state.loading).toBe(true);
    });
  });

  describe('setSchema', () => {
    it('should store the schema and clear loading', () => {
      setSchemaLoading('https://api.example.com/graphql');
      const schema = makeSchema();
      setSchema(schema);
      const state = graphqlSchemaStore;

      expect(state.schema).toEqual(schema);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('should preserve the url from loading state', () => {
      setSchemaLoading('https://api.example.com/graphql');
      setSchema(makeSchema());
      const state = graphqlSchemaStore;

      expect(state.url).toBe('https://api.example.com/graphql');
    });
  });

  describe('setSchemaError', () => {
    it('should set error and clear loading and schema', () => {
      setSchemaLoading('https://api.example.com/graphql');
      setSchemaError('Introspection disabled');
      const state = graphqlSchemaStore;

      expect(state.error).toBe('Introspection disabled');
      expect(state.loading).toBe(false);
      expect(state.schema).toBeNull();
    });
  });

  describe('clearSchema', () => {
    it('should reset to initial state', () => {
      setSchema(makeSchema());
      clearSchema();
      const state = graphqlSchemaStore;

      expect(state.schema).toBeNull();
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.url).toBeNull();
    });
  });

  describe('queryFields derived store', () => {
    it('should return empty array when no schema', () => {
      expect(queryFields()).toEqual([]);
    });

    it('should return query type fields', () => {
      setSchema(makeSchema());
      const fields = queryFields();

      expect(fields).toHaveLength(2);
      expect(fields[0].name).toBe('users');
      expect(fields[1].name).toBe('user');
    });

    it('should return empty array when no queryType defined', () => {
      setSchema(makeSchema({ queryType: undefined }));
      expect(queryFields()).toEqual([]);
    });

    it('should return empty array when query type not found in types', () => {
      setSchema(makeSchema({
        queryType: { name: 'NonExistent' },
      }));
      expect(queryFields()).toEqual([]);
    });
  });

  describe('mutationFields derived store', () => {
    it('should return empty array when no schema', () => {
      expect(mutationFields()).toEqual([]);
    });

    it('should return mutation type fields', () => {
      setSchema(makeSchema());
      const fields = mutationFields();

      expect(fields).toHaveLength(1);
      expect(fields[0].name).toBe('createUser');
    });

    it('should return empty array when no mutationType defined', () => {
      setSchema(makeSchema({ mutationType: undefined }));
      expect(mutationFields()).toEqual([]);
    });
  });

  describe('subscriptionFields derived store', () => {
    it('should return empty array when no schema', () => {
      expect(subscriptionFields()).toEqual([]);
    });

    it('should return subscription type fields', () => {
      setSchema(makeSchema());
      const fields = subscriptionFields();

      expect(fields).toHaveLength(1);
      expect(fields[0].name).toBe('userCreated');
    });

    it('should return empty array when no subscriptionType defined', () => {
      setSchema(makeSchema({ subscriptionType: undefined }));
      expect(subscriptionFields()).toEqual([]);
    });
  });

  describe('userTypes derived store', () => {
    it('should return empty array when no schema', () => {
      expect(userTypes()).toEqual([]);
    });

    it('should exclude root types (Query, Mutation, Subscription)', () => {
      setSchema(makeSchema());
      const types = userTypes();

      const names = types.map(t => t.name);
      expect(names).not.toContain('Query');
      expect(names).not.toContain('Mutation');
      expect(names).not.toContain('Subscription');
    });

    it('should exclude built-in types starting with __', () => {
      setSchema(makeSchema());
      const types = userTypes();

      const names = types.map(t => t.name);
      expect(names).not.toContain('__Schema');
      expect(names).not.toContain('__Type');
    });

    it('should include user-defined types', () => {
      setSchema(makeSchema());
      const types = userTypes();

      const names = types.map(t => t.name);
      expect(names).toContain('User');
      expect(names).toContain('Role');
    });

    it('should sort types alphabetically', () => {
      setSchema(makeSchema());
      const types = userTypes();

      const names = types.map(t => t.name);
      expect(names).toEqual([...names].sort());
    });
  });
});
