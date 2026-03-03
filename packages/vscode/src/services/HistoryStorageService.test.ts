import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { HistoryStorageService } from './HistoryStorageService';
import type { HistoryEntry } from '@hivefetch/core/services';

let tmpDir: string;
let service: HistoryStorageService;

function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: `id-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    method: 'GET',
    url: 'https://api.example.com/users',
    headers: [{ id: '1', key: 'Content-Type', value: 'application/json', enabled: true }],
    params: [],
    responseStatus: 200,
    responseDuration: 150,
    responseSize: 1024,
    ...overrides,
  };
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hf-history-'));
  service = new HistoryStorageService(tmpDir);
  await service.load();
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('HistoryStorageService', () => {
  describe('append', () => {
    it('should append an entry and return index entry', async () => {
      const entry = makeEntry({ id: 'test-1', method: 'POST', url: 'https://example.com/api' });
      const indexEntry = await service.append(entry);

      expect(indexEntry.id).toBe('test-1');
      expect(indexEntry.method).toBe('POST');
      expect(indexEntry.url).toBe('https://example.com/api');
      expect(service.getTotal()).toBe(1);
    });

    it('should prepend new entries (newest first)', async () => {
      await service.append(makeEntry({ id: 'old', timestamp: '2024-01-01T00:00:00Z' }));
      await service.append(makeEntry({ id: 'new', timestamp: '2024-06-01T00:00:00Z' }));

      const result = await service.search();
      expect(result.entries[0].id).toBe('new');
      expect(result.entries[1].id).toBe('old');
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      await service.append(makeEntry({ id: '1', method: 'GET', url: 'https://api.example.com/users', responseStatus: 200 }));
      await service.append(makeEntry({ id: '2', method: 'POST', url: 'https://api.example.com/users', responseStatus: 201 }));
      await service.append(makeEntry({ id: '3', method: 'GET', url: 'https://api.example.com/products', responseStatus: 404 }));
      await service.append(makeEntry({ id: '4', method: 'DELETE', url: 'https://api.example.com/users/1', responseStatus: 500 }));
    });

    it('should return all entries with no params', async () => {
      const result = await service.search();
      expect(result.entries).toHaveLength(4);
      expect(result.total).toBe(4);
      expect(result.hasMore).toBe(false);
    });

    it('should filter by query (URL)', async () => {
      const result = await service.search({ query: 'products' });
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].id).toBe('3');
    });

    it('should filter by method', async () => {
      const result = await service.search({ methods: ['GET'] });
      expect(result.entries).toHaveLength(2);
    });

    it('should filter by multiple methods', async () => {
      const result = await service.search({ methods: ['GET', 'POST'] });
      expect(result.entries).toHaveLength(3);
    });

    it('should filter by statusRange success', async () => {
      const result = await service.search({ statusRange: 'success' });
      expect(result.entries).toHaveLength(2); // 200, 201
    });

    it('should filter by statusRange clientError', async () => {
      const result = await service.search({ statusRange: 'clientError' });
      expect(result.entries).toHaveLength(1); // 404
    });

    it('should filter by statusRange serverError', async () => {
      const result = await service.search({ statusRange: 'serverError' });
      expect(result.entries).toHaveLength(1); // 500
    });

    it('should support pagination with limit and offset', async () => {
      const result = await service.search({ limit: 2, offset: 0 });
      expect(result.entries).toHaveLength(2);
      expect(result.hasMore).toBe(true);

      const page2 = await service.search({ limit: 2, offset: 2 });
      expect(page2.entries).toHaveLength(2);
      expect(page2.hasMore).toBe(false);
    });
  });

  describe('getEntry', () => {
    it('should return full entry by id', async () => {
      const entry = makeEntry({ id: 'find-me', responseBody: '{"ok":true}' });
      await service.append(entry);

      const found = await service.getEntry('find-me');
      expect(found).not.toBeNull();
      expect(found!.id).toBe('find-me');
      expect(found!.responseBody).toBe('{"ok":true}');
    });

    it('should return null for non-existent id', async () => {
      const found = await service.getEntry('does-not-exist');
      expect(found).toBeNull();
    });
  });

  describe('deleteEntry', () => {
    it('should delete an entry', async () => {
      await service.append(makeEntry({ id: 'to-delete' }));
      await service.append(makeEntry({ id: 'to-keep' }));

      expect(service.getTotal()).toBe(2);

      const deleted = await service.deleteEntry('to-delete');
      expect(deleted).toBe(true);
      expect(service.getTotal()).toBe(1);

      const found = await service.getEntry('to-delete');
      expect(found).toBeNull();
    });

    it('should return false for non-existent id', async () => {
      const deleted = await service.deleteEntry('nope');
      expect(deleted).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all history', async () => {
      await service.append(makeEntry({ id: '1' }));
      await service.append(makeEntry({ id: '2' }));
      expect(service.getTotal()).toBe(2);

      await service.clear();
      expect(service.getTotal()).toBe(0);

      const result = await service.search();
      expect(result.entries).toHaveLength(0);
    });
  });

  describe('prune', () => {
    it('should remove entries older than 90 days', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 91);

      await service.append(makeEntry({ id: 'old', timestamp: oldDate.toISOString() }));
      await service.append(makeEntry({ id: 'recent', timestamp: new Date().toISOString() }));

      const removed = await service.prune();
      expect(removed).toBe(1);
      expect(service.getTotal()).toBe(1);

      const found = await service.getEntry('old');
      expect(found).toBeNull();
    });
  });

  describe('capResponseBody', () => {
    it('should return body unchanged if under limit', () => {
      const result = HistoryStorageService.capResponseBody('hello');
      expect(result.body).toBe('hello');
      expect(result.truncated).toBe(false);
    });

    it('should truncate body over 256 KB', () => {
      const bigBody = 'x'.repeat(300 * 1024);
      const result = HistoryStorageService.capResponseBody(bigBody);
      expect(result.body!.length).toBe(256 * 1024);
      expect(result.truncated).toBe(true);
    });

    it('should handle undefined body', () => {
      const result = HistoryStorageService.capResponseBody(undefined);
      expect(result.body).toBeUndefined();
      expect(result.truncated).toBe(false);
    });
  });

  describe('index rebuild', () => {
    it('should rebuild index from JSONL when index is missing', async () => {
      // Append entries
      await service.append(makeEntry({ id: 'r1' }));
      await service.append(makeEntry({ id: 'r2' }));

      // Delete the index file
      const indexPath = path.join(tmpDir, 'hivefetch-history-index.json');
      await fs.unlink(indexPath);

      // Reload - should rebuild from JSONL
      const service2 = new HistoryStorageService(tmpDir);
      await service2.load();

      expect(service2.getTotal()).toBe(2);
    });
  });

  describe('seedFromRecent', () => {
    it('should seed history from recent collection items', async () => {
      const recentItems = [
        { method: 'GET', url: 'https://api.example.com/users', name: 'Get Users', headers: [], params: [], lastResponseStatus: 200, lastResponseDuration: 100, lastResponseSize: 512 },
        { method: 'POST', url: 'https://api.example.com/users', name: 'Create User', headers: [], params: [] },
      ];

      const count = await service.seedFromRecent(recentItems);
      expect(count).toBe(2);
      expect(service.getTotal()).toBe(2);
    });

    it('should skip items without url or method', async () => {
      const items = [
        { url: 'https://example.com', method: '' },
        { url: '', method: 'GET' },
        { url: 'https://valid.com', method: 'GET', headers: [], params: [] },
      ];

      const count = await service.seedFromRecent(items);
      expect(count).toBe(1);
    });
  });

  describe('collectionId filter', () => {
    beforeEach(async () => {
      await service.append(makeEntry({ id: 'c1', collectionId: 'col-A' }));
      await service.append(makeEntry({ id: 'c2', collectionId: 'col-A' }));
      await service.append(makeEntry({ id: 'c3', collectionId: 'col-B' }));
      await service.append(makeEntry({ id: 'c4' })); // no collectionId
    });

    it('should filter by collectionId', async () => {
      const result = await service.search({ collectionId: 'col-A' });
      expect(result.entries).toHaveLength(2);
      expect(result.entries.every(e => e.collectionId === 'col-A')).toBe(true);
    });

    it('should return empty for non-existent collectionId', async () => {
      const result = await service.search({ collectionId: 'col-Z' });
      expect(result.entries).toHaveLength(0);
    });
  });

  describe('regex search', () => {
    beforeEach(async () => {
      await service.append(makeEntry({ id: 'r1', url: 'https://api.example.com/users/123' }));
      await service.append(makeEntry({ id: 'r2', url: 'https://api.example.com/users/456' }));
      await service.append(makeEntry({ id: 'r3', url: 'https://api.example.com/products' }));
    });

    it('should support regex matching', async () => {
      const result = await service.search({ query: 'users/\\d+', isRegex: true });
      expect(result.entries).toHaveLength(2);
    });

    it('should return empty for invalid regex', async () => {
      const result = await service.search({ query: '[invalid', isRegex: true });
      expect(result.entries).toHaveLength(0);
    });
  });

  describe('similarTo', () => {
    beforeEach(async () => {
      await service.append(makeEntry({ id: 's1', url: 'https://api.example.com/users?page=1' }));
      await service.append(makeEntry({ id: 's2', url: 'https://api.example.com/users?page=2' }));
      await service.append(makeEntry({ id: 's3', url: 'https://api.example.com/products' }));
    });

    it('should find entries with same base URL', async () => {
      const result = await service.search({ similarTo: 's1' });
      expect(result.entries).toHaveLength(2);
      expect(result.entries.map(e => e.id).sort()).toEqual(['s1', 's2']);
    });

    it('should return empty for non-existent source', async () => {
      const result = await service.search({ similarTo: 'nope' });
      expect(result.entries).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('updateEntryCollectionId', () => {
    it('should update collectionId on index and full entry', async () => {
      await service.append(makeEntry({ id: 'upd-1' }));

      const updated = await service.updateEntryCollectionId('upd-1', 'col-X', 'My Request');
      expect(updated).toBe(true);

      // Verify in search
      const result = await service.search({ collectionId: 'col-X' });
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].requestName).toBe('My Request');

      // Verify full entry
      const full = await service.getEntry('upd-1');
      expect(full!.collectionId).toBe('col-X');
    });

    it('should return false for non-existent id', async () => {
      const result = await service.updateEntryCollectionId('nope', 'col-X');
      expect(result).toBe(false);
    });
  });

  describe('getAllEntries', () => {
    it('should return all full entries', async () => {
      await service.append(makeEntry({ id: 'all-1', responseBody: '{"a":1}' }));
      await service.append(makeEntry({ id: 'all-2', responseBody: '{"b":2}' }));

      const entries = await service.getAllEntries();
      expect(entries).toHaveLength(2);
      expect(entries.find(e => e.id === 'all-1')!.responseBody).toBe('{"a":1}');
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      const now = Date.now();
      await service.append(makeEntry({ id: 'st1', method: 'GET', url: 'https://api.com/users', responseStatus: 200, responseDuration: 100, timestamp: new Date(now - 1000).toISOString() }));
      await service.append(makeEntry({ id: 'st2', method: 'GET', url: 'https://api.com/users', responseStatus: 200, responseDuration: 200, timestamp: new Date(now - 2000).toISOString() }));
      await service.append(makeEntry({ id: 'st3', method: 'POST', url: 'https://api.com/users', responseStatus: 201, responseDuration: 300, timestamp: new Date(now - 3000).toISOString() }));
      await service.append(makeEntry({ id: 'st4', method: 'GET', url: 'https://api.com/products', responseStatus: 404, responseDuration: 50, timestamp: new Date(now - 4000).toISOString() }));
      await service.append(makeEntry({ id: 'st5', method: 'DELETE', url: 'https://api.com/users/1', responseStatus: 500, responseDuration: 10, timestamp: new Date(now - 5000).toISOString() }));
    });

    it('should return correct totalRequests', () => {
      const stats = service.getStats();
      expect(stats.totalRequests).toBe(5);
    });

    it('should compute status distribution', () => {
      const stats = service.getStats();
      expect(stats.statusDistribution['2xx']).toBe(3); // 200, 200, 201
      expect(stats.statusDistribution['4xx']).toBe(1); // 404
      expect(stats.statusDistribution['5xx']).toBe(1); // 500
    });

    it('should compute average response time', () => {
      const stats = service.getStats();
      expect(stats.avgResponseTime).toBe(Math.round((100 + 200 + 300 + 50 + 10) / 5));
    });

    it('should compute error rate', () => {
      const stats = service.getStats();
      // 2 errors (404, 500) out of 5
      expect(stats.errorRate).toBe(Math.round((2 / 5) * 100));
    });

    it('should return top endpoints sorted by count', () => {
      const stats = service.getStats();
      expect(stats.topEndpoints.length).toBeGreaterThan(0);
      // GET /users should be first (2 hits)
      expect(stats.topEndpoints[0].method).toBe('GET');
      expect(stats.topEndpoints[0].count).toBe(2);
    });

    it('should return empty stats for empty history', async () => {
      await service.clear();
      const stats = service.getStats();
      expect(stats.totalRequests).toBe(0);
      expect(stats.topEndpoints).toHaveLength(0);
    });

    it('should respect days filter', async () => {
      await service.clear();
      const old = new Date();
      old.setDate(old.getDate() - 60);
      await service.append(makeEntry({ id: 'old-stat', timestamp: old.toISOString() }));
      await service.append(makeEntry({ id: 'new-stat', timestamp: new Date().toISOString() }));

      const stats30 = service.getStats(30);
      expect(stats30.totalRequests).toBe(1);

      const statsAll = service.getStats();
      expect(statsAll.totalRequests).toBe(2);
    });
  });
});
