import { NativeExportService } from './NativeExportService';
import type { Collection } from '../types';

const service = new NativeExportService();

function makeCollection(overrides: Partial<Collection> = {}): Collection {
  return {
    id: 'col-1',
    name: 'Test Collection',
    items: [],
    expanded: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('NativeExportService', () => {
  describe('exportCollection', () => {
    it('should have correct _format and _version', () => {
      const col = makeCollection();
      const result = service.exportCollection(col);
      expect(result._format).toBe('hivefetch');
      expect(result._version).toBe('1.0');
      expect(result._exportedAt).toBeDefined();
    });

    it('should deep copy (mutation isolation)', () => {
      const col = makeCollection({ name: 'Original' });
      const result = service.exportCollection(col);
      result.collection.name = 'Modified';
      expect(col.name).toBe('Original');
    });
  });

  describe('importCollection', () => {
    it('should round-trip fidelity (export → import → identical)', () => {
      const col = makeCollection({
        auth: { type: 'bearer', token: 'my-token' },
        headers: [{ id: 'h1', key: 'X-Custom', value: 'val', enabled: true }],
        variables: [{ key: 'baseUrl', value: 'https://api.com', enabled: true }],
        scripts: { preRequest: 'console.log("pre")', postResponse: 'console.log("post")' },
        items: [
          {
            type: 'folder',
            id: 'f1',
            name: 'Folder',
            children: [
              {
                type: 'request',
                id: 'r1',
                name: 'Request 1',
                method: 'POST',
                url: 'https://api.com/data',
                params: [],
                headers: [],
                auth: { type: 'none' },
                body: { type: 'json', content: '{"key": "value"}' },
                assertions: [
                  { id: 'a1', enabled: true, target: 'status', operator: 'equals', expected: '200' },
                ],
                createdAt: '2024-01-01T00:00:00.000Z',
                updatedAt: '2024-01-01T00:00:00.000Z',
              },
            ],
            expanded: true,
            variables: [{ key: 'folderVar', value: 'val', enabled: true }],
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      });

      const exported = service.exportCollection(col);
      const json = JSON.stringify(exported);
      const imported = service.importCollection(json);

      expect(imported.id).toBe(col.id);
      expect(imported.name).toBe(col.name);
      expect(imported.auth).toEqual(col.auth);
      expect(imported.headers).toEqual(col.headers);
      expect(imported.variables).toEqual(col.variables);
      expect(imported.scripts).toEqual(col.scripts);
      expect(imported.items).toEqual(col.items);
    });

    it('should reject non-HiveFetch files', () => {
      expect(() => service.importCollection(JSON.stringify({ info: { schema: 'postman' } }))).toThrow('Not a HiveFetch export');
    });

    it('should reject missing collection data', () => {
      expect(() => service.importCollection(JSON.stringify({ _format: 'hivefetch' }))).toThrow('missing collection data');
    });

    it('should reject invalid JSON', () => {
      expect(() => service.importCollection('not json')).toThrow('Invalid JSON');
    });

    it('should handle nested collections with all feature fields', () => {
      const col = makeCollection({
        variables: [{ key: 'v1', value: 'val1', enabled: true }],
        items: [
          {
            type: 'folder',
            id: 'f1',
            name: 'GraphQL Folder',
            children: [
              {
                type: 'request',
                id: 'r-gql',
                name: 'GraphQL Request',
                method: 'POST',
                url: 'https://api.com/graphql',
                params: [],
                headers: [],
                auth: { type: 'bearer', token: '{{token}}' },
                body: { type: 'graphql', content: 'query { users { id } }', graphqlVariables: '{}' },
                connectionMode: 'http',
                authInheritance: 'inherit',
                createdAt: '2024-01-01T00:00:00.000Z',
                updatedAt: '2024-01-01T00:00:00.000Z',
              },
            ],
            expanded: true,
            auth: { type: 'basic', username: 'admin', password: 'pass' },
            authInheritance: 'own',
            scripts: { preRequest: '', postResponse: 'hf.test("ok", () => {})' },
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      });

      const json = JSON.stringify(service.exportCollection(col));
      const imported = service.importCollection(json);
      expect(imported).toEqual(col);
    });
  });
});
