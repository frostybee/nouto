import * as path from 'path';
import { buildCache, diffCollections } from './CollectionDiffer';
import type { Collection, SavedRequest, Folder } from '../types';

const COLLECTIONS_DIR = '/test/collections';

// ── Helpers ─────────────────────────────────────────────────────────

const makeRequest = (id: string, name: string, method = 'GET', url = 'https://example.com'): SavedRequest => ({
  type: 'request',
  id,
  name,
  method,
  url,
  params: [],
  headers: [],
  auth: { type: 'none' },
  body: { type: 'none', content: '' },
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
});

const makeFolder = (id: string, name: string, children: (SavedRequest | Folder)[] = []): Folder => ({
  type: 'folder',
  id,
  name,
  children,
  expanded: true,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
});

const makeCollection = (id: string, name: string, items: (SavedRequest | Folder)[] = []): Collection => ({
  id,
  name,
  items,
  expanded: true,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
});

function opPaths(ops: { type: string; path: string }[]): string[] {
  return ops.map(o => `${o.type}:${path.basename(o.path)}`);
}

function opsOfType(ops: { type: string; path: string }[], type: string): string[] {
  return ops.filter(o => o.type === type).map(o => o.path);
}

describe('CollectionDiffer', () => {
  describe('buildCache', () => {
    it('should build a cache from empty collections', () => {
      const cache = buildCache([]);
      expect(cache.size).toBe(0);
    });

    it('should build a cache from collections with requests', () => {
      const col = makeCollection('c1', 'API', [
        makeRequest('r1', 'Login'),
        makeRequest('r2', 'Register'),
      ]);
      const cache = buildCache([col]);
      expect(cache.size).toBe(1);
      const cachedCol = cache.get('c1')!;
      expect(cachedCol.dirName).toBe('API');
      expect(cachedCol.items.size).toBe(2);
      expect(cachedCol.items.get('r1')!.fileName).toBe('Login');
      expect(cachedCol.items.get('r2')!.fileName).toBe('Register');
    });

    it('should build a cache from collections with nested folders', () => {
      const col = makeCollection('c1', 'API', [
        makeFolder('f1', 'auth', [
          makeRequest('r1', 'Login'),
        ]),
      ]);
      const cache = buildCache([col]);
      const cachedCol = cache.get('c1')!;
      const folder = cachedCol.items.get('f1')!;
      expect(folder.type).toBe('folder');
      expect(folder.fileName).toBe('auth');
      expect(folder.children!.size).toBe(1);
      expect(folder.children!.get('r1')!.fileName).toBe('Login');
    });

    it('should handle filename collisions in cache', () => {
      const col = makeCollection('c1', 'API', [
        makeRequest('r1', 'Login'),
        makeRequest('r2', 'Login'),
      ]);
      const cache = buildCache([col]);
      const cachedCol = cache.get('c1')!;
      expect(cachedCol.items.get('r1')!.fileName).toBe('Login');
      expect(cachedCol.items.get('r2')!.fileName).toBe('Login_2');
    });
  });

  describe('diffCollections - no changes', () => {
    it('should produce no ops when collections are identical', () => {
      const col = makeCollection('c1', 'API', [
        makeRequest('r1', 'Login'),
        makeRequest('r2', 'Register'),
      ]);
      const cache = buildCache([col]);
      const { ops } = diffCollections(cache, [col], COLLECTIONS_DIR);
      expect(ops).toHaveLength(0);
    });

    it('should produce no ops for empty collections', () => {
      const cache = buildCache([]);
      const { ops } = diffCollections(cache, [], COLLECTIONS_DIR);
      expect(ops).toHaveLength(0);
    });

    it('should produce no ops for identical nested structures', () => {
      const col = makeCollection('c1', 'API', [
        makeFolder('f1', 'auth', [
          makeRequest('r1', 'Login'),
          makeFolder('f2', 'nested', [
            makeRequest('r2', 'Deep'),
          ]),
        ]),
      ]);
      const cache = buildCache([col]);
      const { ops } = diffCollections(cache, [col], COLLECTIONS_DIR);
      expect(ops).toHaveLength(0);
    });
  });

  describe('diffCollections - request modifications', () => {
    it('should detect a single request content change', () => {
      const col = makeCollection('c1', 'API', [
        makeRequest('r1', 'Login', 'GET', 'https://old.com'),
      ]);
      const cache = buildCache([col]);

      const updated = makeCollection('c1', 'API', [
        makeRequest('r1', 'Login', 'POST', 'https://new.com'),
      ]);
      const { ops } = diffCollections(cache, [updated], COLLECTIONS_DIR);

      // Should only write the request file (and _collection.json if updatedAt changed)
      const writeOps = opsOfType(ops, 'write');
      expect(writeOps.some(p => p.endsWith('Login.json'))).toBe(true);
      // No deletes, no mkdirs
      expect(opsOfType(ops, 'rmFile')).toHaveLength(0);
      expect(opsOfType(ops, 'rmDir')).toHaveLength(0);
      expect(opsOfType(ops, 'mkdir')).toHaveLength(0);
    });

    it('should not write unchanged requests when one sibling changes', () => {
      const col = makeCollection('c1', 'API', [
        makeRequest('r1', 'Login', 'GET', 'https://example.com'),
        makeRequest('r2', 'Register', 'POST', 'https://example.com'),
      ]);
      const cache = buildCache([col]);

      const updated = makeCollection('c1', 'API', [
        makeRequest('r1', 'Login', 'GET', 'https://example.com'), // unchanged
        makeRequest('r2', 'Register', 'PUT', 'https://changed.com'), // changed
      ]);
      const { ops } = diffCollections(cache, [updated], COLLECTIONS_DIR);

      const writeOps = opsOfType(ops, 'write');
      expect(writeOps.some(p => p.endsWith('Register.json'))).toBe(true);
      expect(writeOps.some(p => p.endsWith('Login.json'))).toBe(false);
    });
  });

  describe('diffCollections - request add/delete', () => {
    it('should detect a new request', () => {
      const col = makeCollection('c1', 'API', [
        makeRequest('r1', 'Login'),
      ]);
      const cache = buildCache([col]);

      const updated = makeCollection('c1', 'API', [
        makeRequest('r1', 'Login'),
        makeRequest('r2', 'Register'),
      ]);
      const { ops } = diffCollections(cache, [updated], COLLECTIONS_DIR);

      const writeOps = opsOfType(ops, 'write');
      expect(writeOps.some(p => p.endsWith('Register.json'))).toBe(true);
      // Order should be updated
      expect(writeOps.some(p => p.endsWith('_order.json'))).toBe(true);
      // Login should NOT be rewritten
      expect(writeOps.some(p => p.endsWith('Login.json'))).toBe(false);
    });

    it('should detect a deleted request', () => {
      const col = makeCollection('c1', 'API', [
        makeRequest('r1', 'Login'),
        makeRequest('r2', 'Register'),
      ]);
      const cache = buildCache([col]);

      const updated = makeCollection('c1', 'API', [
        makeRequest('r1', 'Login'),
      ]);
      const { ops } = diffCollections(cache, [updated], COLLECTIONS_DIR);

      const rmOps = opsOfType(ops, 'rmFile');
      expect(rmOps.some(p => p.endsWith('Register.json'))).toBe(true);
      // Order should be updated
      expect(opsOfType(ops, 'write').some(p => p.endsWith('_order.json'))).toBe(true);
    });
  });

  describe('diffCollections - request rename', () => {
    it('should detect a request rename (same ID, different name)', () => {
      const col = makeCollection('c1', 'API', [
        makeRequest('r1', 'OldName'),
      ]);
      const cache = buildCache([col]);

      const updated = makeCollection('c1', 'API', [
        makeRequest('r1', 'NewName'),
      ]);
      const { ops } = diffCollections(cache, [updated], COLLECTIONS_DIR);

      const rmOps = opsOfType(ops, 'rmFile');
      const writeOps = opsOfType(ops, 'write');
      expect(rmOps.some(p => p.endsWith('OldName.json'))).toBe(true);
      expect(writeOps.some(p => p.endsWith('NewName.json'))).toBe(true);
    });
  });

  describe('diffCollections - order changes', () => {
    it('should detect reordering (no content changes)', () => {
      const col = makeCollection('c1', 'API', [
        makeRequest('r1', 'Alpha'),
        makeRequest('r2', 'Beta'),
        makeRequest('r3', 'Gamma'),
      ]);
      const cache = buildCache([col]);

      const reordered = makeCollection('c1', 'API', [
        makeRequest('r3', 'Gamma'),
        makeRequest('r1', 'Alpha'),
        makeRequest('r2', 'Beta'),
      ]);
      const { ops } = diffCollections(cache, [reordered], COLLECTIONS_DIR);

      // Only _order.json should be written, no request files
      const writeOps = opsOfType(ops, 'write');
      expect(writeOps).toHaveLength(1);
      expect(writeOps[0]).toContain('_order.json');
    });
  });

  describe('diffCollections - collection add/delete', () => {
    it('should detect a new collection', () => {
      const col1 = makeCollection('c1', 'API', [makeRequest('r1', 'Test')]);
      const cache = buildCache([col1]);

      const col2 = makeCollection('c2', 'NewAPI', [makeRequest('r2', 'New')]);
      const { ops } = diffCollections(cache, [col1, col2], COLLECTIONS_DIR);

      const mkdirOps = opsOfType(ops, 'mkdir');
      expect(mkdirOps.some(p => p.endsWith('NewAPI'))).toBe(true);
      // Should not touch the existing collection
      expect(opsOfType(ops, 'write').every(p => !p.includes('API' + path.sep + 'Test.json') || p.includes('NewAPI'))).toBe(true);
    });

    it('should detect a deleted collection', () => {
      const col1 = makeCollection('c1', 'API', [makeRequest('r1', 'Test')]);
      const col2 = makeCollection('c2', 'Other', [makeRequest('r2', 'Other')]);
      const cache = buildCache([col1, col2]);

      const { ops } = diffCollections(cache, [col1], COLLECTIONS_DIR);

      const rmDirOps = opsOfType(ops, 'rmDir');
      expect(rmDirOps.some(p => p.endsWith('Other'))).toBe(true);
    });
  });

  describe('diffCollections - collection rename', () => {
    it('should detect a collection rename (same ID, different name)', () => {
      const col = makeCollection('c1', 'OldName', [makeRequest('r1', 'Test')]);
      const cache = buildCache([col]);

      const renamed = makeCollection('c1', 'NewName', [makeRequest('r1', 'Test')]);
      const { ops } = diffCollections(cache, [renamed], COLLECTIONS_DIR);

      const rmDirOps = opsOfType(ops, 'rmDir');
      const mkdirOps = opsOfType(ops, 'mkdir');
      expect(rmDirOps.some(p => p.endsWith('OldName'))).toBe(true);
      expect(mkdirOps.some(p => p.endsWith('NewName'))).toBe(true);
    });
  });

  describe('diffCollections - folder operations', () => {
    it('should detect a new folder', () => {
      const col = makeCollection('c1', 'API', [
        makeRequest('r1', 'Root'),
      ]);
      const cache = buildCache([col]);

      const updated = makeCollection('c1', 'API', [
        makeRequest('r1', 'Root'),
        makeFolder('f1', 'auth', [makeRequest('r2', 'Login')]),
      ]);
      const { ops } = diffCollections(cache, [updated], COLLECTIONS_DIR);

      const mkdirOps = opsOfType(ops, 'mkdir');
      expect(mkdirOps.some(p => p.endsWith('auth'))).toBe(true);
      const writeOps = opsOfType(ops, 'write');
      expect(writeOps.some(p => p.endsWith('_folder.json'))).toBe(true);
      expect(writeOps.some(p => p.endsWith('Login.json'))).toBe(true);
    });

    it('should detect a deleted folder', () => {
      const col = makeCollection('c1', 'API', [
        makeFolder('f1', 'auth', [makeRequest('r1', 'Login')]),
      ]);
      const cache = buildCache([col]);

      const updated = makeCollection('c1', 'API', []);
      const { ops } = diffCollections(cache, [updated], COLLECTIONS_DIR);

      const rmDirOps = opsOfType(ops, 'rmDir');
      expect(rmDirOps.some(p => p.endsWith('auth'))).toBe(true);
    });

    it('should detect a folder rename', () => {
      const col = makeCollection('c1', 'API', [
        makeFolder('f1', 'OldFolder', [makeRequest('r1', 'Test')]),
      ]);
      const cache = buildCache([col]);

      const updated = makeCollection('c1', 'API', [
        makeFolder('f1', 'NewFolder', [makeRequest('r1', 'Test')]),
      ]);
      const { ops } = diffCollections(cache, [updated], COLLECTIONS_DIR);

      const rmDirOps = opsOfType(ops, 'rmDir');
      const mkdirOps = opsOfType(ops, 'mkdir');
      expect(rmDirOps.some(p => p.endsWith('OldFolder'))).toBe(true);
      expect(mkdirOps.some(p => p.endsWith('NewFolder'))).toBe(true);
    });

    it('should detect changes inside a folder without touching the folder itself', () => {
      const col = makeCollection('c1', 'API', [
        makeFolder('f1', 'auth', [
          makeRequest('r1', 'Login', 'GET', 'https://old.com'),
        ]),
      ]);
      const cache = buildCache([col]);

      const updated = makeCollection('c1', 'API', [
        makeFolder('f1', 'auth', [
          makeRequest('r1', 'Login', 'POST', 'https://new.com'),
        ]),
      ]);
      const { ops } = diffCollections(cache, [updated], COLLECTIONS_DIR);

      const writeOps = opsOfType(ops, 'write');
      expect(writeOps.some(p => p.endsWith('Login.json'))).toBe(true);
      // Folder meta and collection meta should not be rewritten
      expect(writeOps.some(p => p.endsWith('_folder.json'))).toBe(false);
      expect(writeOps.some(p => p.endsWith('_collection.json'))).toBe(false);
    });
  });

  describe('diffCollections - collection metadata changes', () => {
    it('should detect collection metadata change without touching items', () => {
      const col = makeCollection('c1', 'API', [makeRequest('r1', 'Test')]);
      const cache = buildCache([col]);

      const updated = makeCollection('c1', 'API', [makeRequest('r1', 'Test')]);
      updated.description = 'Updated description';
      const { ops } = diffCollections(cache, [updated], COLLECTIONS_DIR);

      const writeOps = opsOfType(ops, 'write');
      expect(writeOps.some(p => p.endsWith('_collection.json'))).toBe(true);
      expect(writeOps.some(p => p.endsWith('Test.json'))).toBe(false);
    });
  });

  describe('diffCollections - cache update', () => {
    it('should return an updated cache that reflects the new state', () => {
      const col = makeCollection('c1', 'API', [makeRequest('r1', 'Login')]);
      const cache = buildCache([col]);

      const updated = makeCollection('c1', 'API', [
        makeRequest('r1', 'Login'),
        makeRequest('r2', 'Register'),
      ]);
      const { newCache } = diffCollections(cache, [updated], COLLECTIONS_DIR);

      expect(newCache.get('c1')!.items.size).toBe(2);
      expect(newCache.get('c1')!.items.has('r2')).toBe(true);
    });

    it('should produce no ops when diffing against the returned cache', () => {
      const col = makeCollection('c1', 'API', [
        makeRequest('r1', 'Login'),
        makeRequest('r2', 'Register'),
      ]);
      const cache = buildCache([col]);

      const updated = makeCollection('c1', 'API', [
        makeRequest('r1', 'Login', 'POST', 'https://changed.com'),
        makeRequest('r2', 'Register'),
      ]);
      const { newCache } = diffCollections(cache, [updated], COLLECTIONS_DIR);

      // Diffing the same state against the new cache should produce no ops
      const { ops: secondOps } = diffCollections(newCache, [updated], COLLECTIONS_DIR);
      expect(secondOps).toHaveLength(0);
    });
  });

  describe('diffCollections - filename collision handling', () => {
    it('should handle two requests that sanitize to the same filename', () => {
      const col = makeCollection('c1', 'API', [
        makeRequest('r1', 'GET /api/test'),
        makeRequest('r2', 'GET /api/test'),
      ]);
      const cache = buildCache([col]);

      // Verify the cache has different filenames
      const items = cache.get('c1')!.items;
      const fileNames = [...items.values()].map(i => i.fileName);
      expect(new Set(fileNames).size).toBe(2);

      // No changes should produce no ops
      const { ops } = diffCollections(cache, [col], COLLECTIONS_DIR);
      expect(ops).toHaveLength(0);
    });
  });
});
