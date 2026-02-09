import { executeRequest } from './HttpClient';
import type { GraphQLSchema, AuthState, KeyValue } from './types';

const INTROSPECTION_QUERY = `
  query IntrospectionQuery {
    __schema {
      queryType { name }
      mutationType { name }
      subscriptionType { name }
      types {
        kind
        name
        description
        fields(includeDeprecated: true) {
          name
          description
          type { ...TypeRef }
          args {
            name
            description
            type { ...TypeRef }
            defaultValue
          }
          isDeprecated
          deprecationReason
        }
        interfaces { ...TypeRef }
        possibleTypes { ...TypeRef }
        enumValues(includeDeprecated: true) {
          name
          description
          isDeprecated
          deprecationReason
        }
        inputFields {
          name
          description
          type { ...TypeRef }
          defaultValue
        }
      }
    }
  }

  fragment TypeRef on __Type {
    kind
    name
    ofType {
      kind
      name
      ofType {
        kind
        name
        ofType {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                }
              }
            }
          }
        }
      }
    }
  }
`;

interface CacheEntry {
  schema: GraphQLSchema;
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class GraphQLSchemaService {
  private cache: Map<string, CacheEntry> = new Map();

  async introspect(
    url: string,
    headers: KeyValue[],
    auth: AuthState
  ): Promise<GraphQLSchema> {
    // Check cache
    const cacheKey = url;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.schema;
    }

    // Build headers
    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    for (const h of headers) {
      if (h.enabled && h.key) {
        reqHeaders[h.key] = h.value;
      }
    }

    // Apply auth
    if (auth.type === 'bearer' && auth.token) {
      reqHeaders['Authorization'] = `Bearer ${auth.token}`;
    } else if (auth.type === 'basic' && auth.username) {
      const encoded = Buffer.from(`${auth.username}:${auth.password || ''}`).toString('base64');
      reqHeaders['Authorization'] = `Basic ${encoded}`;
    } else if (auth.type === 'apikey' && auth.apiKeyName && auth.apiKeyValue) {
      if (auth.apiKeyIn === 'header' || !auth.apiKeyIn) {
        reqHeaders[auth.apiKeyName] = auth.apiKeyValue;
      }
    }

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 15000);

    try {
      const result = await executeRequest({
        method: 'POST',
        url,
        headers: reqHeaders,
        params: {},
        data: JSON.stringify({ query: INTROSPECTION_QUERY }),
        timeout: 15000,
        signal: abortController.signal,
      });

      const body = typeof result.data === 'string' ? JSON.parse(result.data) : result.data;

      if (body.errors && body.errors.length > 0) {
        const messages = body.errors.map((e: any) => e.message).join('; ');
        throw new Error(`GraphQL errors: ${messages}`);
      }

      if (!body.data?.__schema) {
        throw new Error('Invalid introspection response: missing __schema');
      }

      const schema: GraphQLSchema = body.data.__schema;

      // Store in cache
      this.cache.set(cacheKey, { schema, timestamp: Date.now() });

      return schema;
    } finally {
      clearTimeout(timeout);
    }
  }

  clearCache(): void {
    this.cache.clear();
  }
}
