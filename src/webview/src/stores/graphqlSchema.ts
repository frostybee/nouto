import { writable, derived } from 'svelte/store';
import type { GraphQLSchema, GraphQLType } from '../types';

interface GraphQLSchemaState {
  schema: GraphQLSchema | null;
  loading: boolean;
  error: string | null;
  url: string | null;
}

const initialState: GraphQLSchemaState = {
  schema: null,
  loading: false,
  error: null,
  url: null,
};

export const graphqlSchemaStore = writable<GraphQLSchemaState>(initialState);

export function setSchemaLoading(url: string) {
  graphqlSchemaStore.set({ schema: null, loading: true, error: null, url });
}

export function setSchema(schema: GraphQLSchema) {
  graphqlSchemaStore.update(s => ({ ...s, schema, loading: false, error: null }));
}

export function setSchemaError(message: string) {
  graphqlSchemaStore.update(s => ({ ...s, schema: null, loading: false, error: message }));
}

export function clearSchema() {
  graphqlSchemaStore.set(initialState);
}

// Filter out built-in types (prefixed with __)
function isUserType(t: GraphQLType): boolean {
  return !t.name.startsWith('__');
}

export const queryFields = derived(graphqlSchemaStore, ($store) => {
  if (!$store.schema) return [];
  const queryTypeName = $store.schema.queryType?.name;
  if (!queryTypeName) return [];
  const queryType = $store.schema.types.find(t => t.name === queryTypeName);
  return queryType?.fields ?? [];
});

export const mutationFields = derived(graphqlSchemaStore, ($store) => {
  if (!$store.schema) return [];
  const mutTypeName = $store.schema.mutationType?.name;
  if (!mutTypeName) return [];
  const mutType = $store.schema.types.find(t => t.name === mutTypeName);
  return mutType?.fields ?? [];
});

export const subscriptionFields = derived(graphqlSchemaStore, ($store) => {
  if (!$store.schema) return [];
  const subTypeName = $store.schema.subscriptionType?.name;
  if (!subTypeName) return [];
  const subType = $store.schema.types.find(t => t.name === subTypeName);
  return subType?.fields ?? [];
});

export const userTypes = derived(graphqlSchemaStore, ($store) => {
  if (!$store.schema) return [];
  const rootNames = new Set<string>();
  if ($store.schema.queryType?.name) rootNames.add($store.schema.queryType.name);
  if ($store.schema.mutationType?.name) rootNames.add($store.schema.mutationType.name);
  if ($store.schema.subscriptionType?.name) rootNames.add($store.schema.subscriptionType.name);

  return $store.schema.types
    .filter(t => isUserType(t) && !rootNames.has(t.name))
    .sort((a, b) => a.name.localeCompare(b.name));
});
