import { RecentCollectionService } from './RecentCollectionService';
import type { Collection, SavedRequest } from './types';

function makeCollection(id: string, name: string, items: any[] = []): Collection {
  return {
    id,
    name,
    items,
    expanded: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

function makeRequest(method: string, url: string): any {
  return {
    method,
    url,
    params: [],
    headers: [],
    auth: { type: 'none' },
    body: { type: 'none', content: '' },
  };
}

function makeResponse(status = 200, duration = 100, size = 1024) {
  return { status, duration, size };
}

describe('RecentCollectionService', () => {
  describe('ensureRecentCollection', () => {
    it('creates Recent collection when missing', () => {
      const collections = [makeCollection('c1', 'My Collection')];
      const result = RecentCollectionService.ensureRecentCollection(collections);

      expect(result.length).toBe(2);
      expect(result[0].id).toBe('__recent__');
      expect(result[0].name).toBe('Recent');
      expect(result[0].builtin).toBe('recent');
      expect(result[1].id).toBe('c1');
    });

    it('moves existing Recent to index 0', () => {
      const recent = makeCollection('__recent__', 'Recent');
      recent.builtin = 'recent';
      const collections = [makeCollection('c1', 'First'), recent];
      const result = RecentCollectionService.ensureRecentCollection(collections);

      expect(result[0].id).toBe('__recent__');
      expect(result[1].id).toBe('c1');
    });

    it('does nothing if Recent is already at index 0', () => {
      const recent = makeCollection('__recent__', 'Recent');
      recent.builtin = 'recent';
      const collections = [recent, makeCollection('c1', 'First')];
      const result = RecentCollectionService.ensureRecentCollection(collections);

      expect(result).toBe(collections); // Same reference
    });

    it('creates Recent when collections array is empty', () => {
      const result = RecentCollectionService.ensureRecentCollection([]);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('__recent__');
    });
  });

  describe('addToRecent', () => {
    it('adds request with response metadata', () => {
      const collections = [makeCollection('c1', 'Test')];
      const result = RecentCollectionService.addToRecent(
        collections,
        makeRequest('GET', 'https://api.example.com/users'),
        makeResponse(200, 150, 2048)
      );

      const recent = result[0];
      expect(recent.id).toBe('__recent__');
      expect(recent.items.length).toBe(1);

      const entry = recent.items[0] as SavedRequest;
      expect(entry.method).toBe('GET');
      expect(entry.url).toBe('https://api.example.com/users');
      expect(entry.lastResponseStatus).toBe(200);
      expect(entry.lastResponseDuration).toBe(150);
      expect(entry.lastResponseSize).toBe(2048);
      expect(entry.lastResponseTime).toBeDefined();
      expect(entry.name).toBe('GET /users');
    });

    it('deduplicates by url+method (keeps newer)', () => {
      const recent = makeCollection('__recent__', 'Recent');
      recent.builtin = 'recent';
      // Add initial entry
      let collections = [recent];
      collections = RecentCollectionService.addToRecent(
        collections,
        makeRequest('GET', 'https://api.example.com/users'),
        makeResponse(200, 100, 1000)
      );

      expect(collections[0].items.length).toBe(1);

      // Add same URL+method again
      collections = RecentCollectionService.addToRecent(
        collections,
        makeRequest('GET', 'https://api.example.com/users'),
        makeResponse(201, 200, 2000)
      );

      expect(collections[0].items.length).toBe(1);
      const entry = collections[0].items[0] as SavedRequest;
      expect(entry.lastResponseStatus).toBe(201);
      expect(entry.lastResponseDuration).toBe(200);
    });

    it('does not deduplicate different methods', () => {
      let collections: Collection[] = [];
      collections = RecentCollectionService.addToRecent(
        collections,
        makeRequest('GET', 'https://api.example.com/users'),
        makeResponse()
      );
      collections = RecentCollectionService.addToRecent(
        collections,
        makeRequest('POST', 'https://api.example.com/users'),
        makeResponse()
      );

      expect(collections[0].items.length).toBe(2);
    });

    it('caps at 50 entries', () => {
      let collections: Collection[] = [];
      for (let i = 0; i < 60; i++) {
        collections = RecentCollectionService.addToRecent(
          collections,
          makeRequest('GET', `https://api.example.com/item/${i}`),
          makeResponse()
        );
      }

      expect(collections[0].items.length).toBe(50);
      // Most recent should be first
      const first = collections[0].items[0] as SavedRequest;
      expect(first.url).toBe('https://api.example.com/item/59');
    });
  });

  describe('clearRecent', () => {
    it('empties Recent collection items', () => {
      let collections: Collection[] = [];
      collections = RecentCollectionService.addToRecent(
        collections,
        makeRequest('GET', 'https://example.com'),
        makeResponse()
      );
      expect(collections[0].items.length).toBe(1);

      collections = RecentCollectionService.clearRecent(collections);
      expect(collections[0].items.length).toBe(0);
    });

    it('does not affect other collections', () => {
      const other = makeCollection('c1', 'Test');
      other.items = [{ type: 'request', id: 'r1', name: 'R1', method: 'GET', url: '', params: [], headers: [], auth: { type: 'none' }, body: { type: 'none', content: '' }, createdAt: '', updatedAt: '' } as SavedRequest];

      let collections = [other];
      collections = RecentCollectionService.addToRecent(
        collections,
        makeRequest('GET', 'https://example.com'),
        makeResponse()
      );

      collections = RecentCollectionService.clearRecent(collections);
      expect(collections[0].items.length).toBe(0); // Recent cleared
      expect(collections[1].items.length).toBe(1); // Other untouched
    });
  });

  describe('removeFromRecent', () => {
    it('removes entry matching url+method from Recent', () => {
      let collections = RecentCollectionService.ensureRecentCollection([]);
      collections = RecentCollectionService.addToRecent(
        collections,
        makeRequest('GET', 'https://example.com/api'),
        makeResponse()
      );
      collections = RecentCollectionService.addToRecent(
        collections,
        makeRequest('POST', 'https://example.com/api'),
        makeResponse()
      );
      expect(collections[0].items.length).toBe(2);

      collections = RecentCollectionService.removeFromRecent(collections, 'https://example.com/api', 'GET');
      expect(collections[0].items.length).toBe(1);
      expect((collections[0].items[0] as SavedRequest).method).toBe('POST');
    });

    it('does not remove entries with different url or method', () => {
      let collections = RecentCollectionService.ensureRecentCollection([]);
      collections = RecentCollectionService.addToRecent(
        collections,
        makeRequest('GET', 'https://example.com/a'),
        makeResponse()
      );
      collections = RecentCollectionService.removeFromRecent(collections, 'https://example.com/b', 'GET');
      expect(collections[0].items.length).toBe(1);
    });
  });

  describe('isRecentCollection', () => {
    it('returns true for Recent collection', () => {
      const recent = makeCollection('__recent__', 'Recent');
      recent.builtin = 'recent';
      expect(RecentCollectionService.isRecentCollection(recent)).toBe(true);
    });

    it('returns false for regular collection', () => {
      const col = makeCollection('c1', 'Test');
      expect(RecentCollectionService.isRecentCollection(col)).toBe(false);
    });
  });
});
