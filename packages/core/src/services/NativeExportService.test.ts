import { NativeExportService } from './NativeExportService';
import type { Collection, CollectionItem } from '../types';
import { isFolder } from '../types';

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

function collectAllIds(collection: Collection): string[] {
  const ids: string[] = [collection.id];
  function walk(items: CollectionItem[]) {
    for (const item of items) {
      ids.push(item.id);
      if (isFolder(item)) {
        walk(item.children);
      }
    }
  }
  walk(collection.items);
  return ids;
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

  describe('importCollections', () => {
    it('should preserve data fidelity on round-trip (export then import)', () => {
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
      const imported = service.importCollections(json);

      expect(imported).toHaveLength(1);
      const imp = imported[0];
      expect(imp.name).toBe(col.name);
      expect(imp.auth).toEqual(col.auth);
      expect(imp.headers).toEqual(col.headers);
      expect(imp.variables).toEqual(col.variables);
      expect(imp.scripts).toEqual(col.scripts);
      // Structure preserved (names, urls, etc.) but IDs are regenerated
      expect(imp.items).toHaveLength(1);
      const folder = imp.items[0] as any;
      expect(folder.name).toBe('Folder');
      expect(folder.children[0].name).toBe('Request 1');
      expect(folder.children[0].url).toBe('https://api.com/data');
    });

    it('should regenerate all IDs on import', () => {
      const col = makeCollection({
        items: [
          {
            type: 'folder',
            id: 'f1',
            name: 'Folder',
            children: [
              {
                type: 'request',
                id: 'r1',
                name: 'Request',
                method: 'GET',
                url: 'https://api.com',
                params: [],
                headers: [],
                auth: { type: 'none' },
                body: { type: 'none', content: '' },
                createdAt: '2024-01-01T00:00:00.000Z',
                updatedAt: '2024-01-01T00:00:00.000Z',
              },
            ],
            expanded: true,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      });

      const json = JSON.stringify(service.exportCollection(col));
      const imported = service.importCollections(json);
      const originalIds = collectAllIds(col);
      const importedIds = collectAllIds(imported[0]);

      // No ID should match the original
      for (const id of importedIds) {
        expect(originalIds).not.toContain(id);
      }
      // All imported IDs should be unique
      expect(new Set(importedIds).size).toBe(importedIds.length);
    });

    it('should produce unique IDs when importing the same file twice', () => {
      const col = makeCollection({ items: [] });
      const json = JSON.stringify(service.exportCollection(col));

      const first = service.importCollections(json);
      const second = service.importCollections(json);

      expect(first[0].id).not.toBe(second[0].id);
    });

    it('should import bulk export format (collections array)', () => {
      const col1 = makeCollection({ id: 'col-1', name: 'Collection 1' });
      const col2 = makeCollection({ id: 'col-2', name: 'Collection 2' });

      const bulkExport = JSON.stringify({
        _format: 'hivefetch',
        _version: '1.0',
        _exportedAt: new Date().toISOString(),
        collections: [col1, col2],
      });

      const imported = service.importCollections(bulkExport);
      expect(imported).toHaveLength(2);
      expect(imported[0].name).toBe('Collection 1');
      expect(imported[1].name).toBe('Collection 2');
      // IDs should be regenerated, not match originals
      expect(imported[0].id).not.toBe('col-1');
      expect(imported[1].id).not.toBe('col-2');
    });

    it('should reject empty bulk export', () => {
      const bulkExport = JSON.stringify({
        _format: 'hivefetch',
        _version: '1.0',
        _exportedAt: new Date().toISOString(),
        collections: [],
      });

      expect(() => service.importCollections(bulkExport)).toThrow('contains no collections');
    });

    it('should reject bulk export with invalid collection entries', () => {
      const bulkExport = JSON.stringify({
        _format: 'hivefetch',
        _version: '1.0',
        _exportedAt: new Date().toISOString(),
        collections: [{ id: 'col-1' }], // missing name
      });

      expect(() => service.importCollections(bulkExport)).toThrow('missing id or name');
    });

    it('should reject non-HiveFetch files', () => {
      expect(() => service.importCollections(JSON.stringify({ info: { schema: 'postman' } }))).toThrow('Not a HiveFetch export');
    });

    it('should reject missing collection data', () => {
      expect(() => service.importCollections(JSON.stringify({ _format: 'hivefetch' }))).toThrow('missing collection data');
    });

    it('should reject invalid JSON', () => {
      expect(() => service.importCollections('not json')).toThrow('Invalid JSON');
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
      const imported = service.importCollections(json);
      expect(imported).toHaveLength(1);
      const imp = imported[0];
      // Data preserved, IDs regenerated
      expect(imp.name).toBe(col.name);
      expect(imp.variables).toEqual(col.variables);
      const folder = imp.items[0] as any;
      expect(folder.name).toBe('GraphQL Folder');
      expect(folder.auth).toEqual({ type: 'basic', username: 'admin', password: 'pass' });
      expect(folder.children[0].name).toBe('GraphQL Request');
      expect(folder.children[0].body.type).toBe('graphql');
    });
  });
});
