import type { GraphQLSchema, GraphQLType } from '../types';

interface GraphQLSchemaState {
  schema: GraphQLSchema | null;
  loading: boolean;
  error: string | null;
  url: string | null;
}

export const graphqlSchemaStore = $state<GraphQLSchemaState>({
  schema: null,
  loading: false,
  error: null,
  url: null,
});

export function setSchemaLoading(url: string) {
  graphqlSchemaStore.schema = null;
  graphqlSchemaStore.loading = true;
  graphqlSchemaStore.error = null;
  graphqlSchemaStore.url = url;
}

export function setSchema(schema: GraphQLSchema) {
  graphqlSchemaStore.schema = schema;
  graphqlSchemaStore.loading = false;
  graphqlSchemaStore.error = null;
}

export function setSchemaError(message: string) {
  graphqlSchemaStore.schema = null;
  graphqlSchemaStore.loading = false;
  graphqlSchemaStore.error = message;
}

export function clearSchema() {
  graphqlSchemaStore.schema = null;
  graphqlSchemaStore.loading = false;
  graphqlSchemaStore.error = null;
  graphqlSchemaStore.url = null;
}

// Filter out built-in types (prefixed with __)
function isUserType(t: GraphQLType): boolean {
  return !t.name.startsWith('__');
}

export function queryFields() {
  if (!graphqlSchemaStore.schema) return [];
  const queryTypeName = graphqlSchemaStore.schema.queryType?.name;
  if (!queryTypeName) return [];
  const queryType = graphqlSchemaStore.schema.types.find(t => t.name === queryTypeName);
  return queryType?.fields ?? [];
}

export function mutationFields() {
  if (!graphqlSchemaStore.schema) return [];
  const mutTypeName = graphqlSchemaStore.schema.mutationType?.name;
  if (!mutTypeName) return [];
  const mutType = graphqlSchemaStore.schema.types.find(t => t.name === mutTypeName);
  return mutType?.fields ?? [];
}

export function subscriptionFields() {
  if (!graphqlSchemaStore.schema) return [];
  const subTypeName = graphqlSchemaStore.schema.subscriptionType?.name;
  if (!subTypeName) return [];
  const subType = graphqlSchemaStore.schema.types.find(t => t.name === subTypeName);
  return subType?.fields ?? [];
}

export function userTypes() {
  if (!graphqlSchemaStore.schema) return [];
  const rootNames = new Set<string>();
  if (graphqlSchemaStore.schema.queryType?.name) rootNames.add(graphqlSchemaStore.schema.queryType.name);
  if (graphqlSchemaStore.schema.mutationType?.name) rootNames.add(graphqlSchemaStore.schema.mutationType.name);
  if (graphqlSchemaStore.schema.subscriptionType?.name) rootNames.add(graphqlSchemaStore.schema.subscriptionType.name);

  return graphqlSchemaStore.schema.types
    .filter(t => isUserType(t) && !rootNames.has(t.name))
    .sort((a, b) => a.name.localeCompare(b.name));
}
