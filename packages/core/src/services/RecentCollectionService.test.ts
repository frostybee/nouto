import { DraftsCollectionService } from './RecentCollectionService';
import type { Collection, SavedRequest } from '../types';

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

describe('DraftsCollectionService', () => {
  describe('ensureDraftsCollection', () => {
    it('creates Drafts collection when missing', () => {
      const collections = [makeCollection('c1', 'My Collection')];
      const result = DraftsCollectionService.ensureDraftsCollection(collections);

      expect(result.length).toBe(2);
      expect(result[0].id).toBe('__drafts__');
      expect(result[0].name).toBe('Drafts');
      expect(result[0].builtin).toBe('drafts');
      expect(result[1].id).toBe('c1');
    });

    it('moves existing Drafts to index 0', () => {
      const drafts = makeCollection('__drafts__', 'Drafts');
      drafts.builtin = 'drafts';
      const collections = [makeCollection('c1', 'First'), drafts];
      const result = DraftsCollectionService.ensureDraftsCollection(collections);

      expect(result[0].id).toBe('__drafts__');
      expect(result[1].id).toBe('c1');
    });

    it('does nothing if Drafts is already at index 0', () => {
      const drafts = makeCollection('__drafts__', 'Drafts');
      drafts.builtin = 'drafts';
      const collections = [drafts, makeCollection('c1', 'First')];
      const result = DraftsCollectionService.ensureDraftsCollection(collections);

      expect(result).toBe(collections); // Same reference
    });

    it('creates Drafts when collections array is empty', () => {
      const result = DraftsCollectionService.ensureDraftsCollection([]);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('__drafts__');
    });
  });

  describe('addToDrafts', () => {
    it('adds request with response metadata', () => {
      const collections = [makeCollection('c1', 'Test')];
      const result = DraftsCollectionService.addToDrafts(
        collections,
        makeRequest('GET', 'https://api.example.com/users'),
        makeResponse(200, 150, 2048)
      );

      const drafts = result[0];
      expect(drafts.id).toBe('__drafts__');
      expect(drafts.items.length).toBe(1);

      const entry = drafts.items[0] as SavedRequest;
      expect(entry.method).toBe('GET');
      expect(entry.url).toBe('https://api.example.com/users');
      expect(entry.lastResponseStatus).toBe(200);
      expect(entry.lastResponseDuration).toBe(150);
      expect(entry.lastResponseSize).toBe(2048);
      expect(entry.lastResponseTime).toBeDefined();
      expect(entry.name).toBe('GET /users');
    });

    it('deduplicates by url+method (keeps newer)', () => {
      const drafts = makeCollection('__drafts__', 'Drafts');
      drafts.builtin = 'drafts';
      // Add initial entry
      let collections = [drafts];
      collections = DraftsCollectionService.addToDrafts(
        collections,
        makeRequest('GET', 'https://api.example.com/users'),
        makeResponse(200, 100, 1000)
      );

      expect(collections[0].items.length).toBe(1);

      // Add same URL+method again
      collections = DraftsCollectionService.addToDrafts(
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
      collections = DraftsCollectionService.addToDrafts(
        collections,
        makeRequest('GET', 'https://api.example.com/users'),
        makeResponse()
      );
      collections = DraftsCollectionService.addToDrafts(
        collections,
        makeRequest('POST', 'https://api.example.com/users'),
        makeResponse()
      );

      expect(collections[0].items.length).toBe(2);
    });

    it('caps at 50 entries', () => {
      let collections: Collection[] = [];
      for (let i = 0; i < 60; i++) {
        collections = DraftsCollectionService.addToDrafts(
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

  describe('clearDrafts', () => {
    it('empties Drafts collection items', () => {
      let collections: Collection[] = [];
      collections = DraftsCollectionService.addToDrafts(
        collections,
        makeRequest('GET', 'https://example.com'),
        makeResponse()
      );
      expect(collections[0].items.length).toBe(1);

      collections = DraftsCollectionService.clearDrafts(collections);
      expect(collections[0].items.length).toBe(0);
    });

    it('does not affect other collections', () => {
      const other = makeCollection('c1', 'Test');
      other.items = [{ type: 'request', id: 'r1', name: 'R1', method: 'GET', url: '', params: [], headers: [], auth: { type: 'none' }, body: { type: 'none', content: '' }, createdAt: '', updatedAt: '' } as SavedRequest];

      let collections = [other];
      collections = DraftsCollectionService.addToDrafts(
        collections,
        makeRequest('GET', 'https://example.com'),
        makeResponse()
      );

      collections = DraftsCollectionService.clearDrafts(collections);
      expect(collections[0].items.length).toBe(0); // Drafts cleared
      expect(collections[1].items.length).toBe(1); // Other untouched
    });
  });

  describe('removeFromDrafts', () => {
    it('removes entry matching url+method from Drafts', () => {
      let collections = DraftsCollectionService.ensureDraftsCollection([]);
      collections = DraftsCollectionService.addToDrafts(
        collections,
        makeRequest('GET', 'https://example.com/api'),
        makeResponse()
      );
      collections = DraftsCollectionService.addToDrafts(
        collections,
        makeRequest('POST', 'https://example.com/api'),
        makeResponse()
      );
      expect(collections[0].items.length).toBe(2);

      collections = DraftsCollectionService.removeFromDrafts(collections, 'https://example.com/api', 'GET');
      expect(collections[0].items.length).toBe(1);
      expect((collections[0].items[0] as SavedRequest).method).toBe('POST');
    });

    it('does not remove entries with different url or method', () => {
      let collections = DraftsCollectionService.ensureDraftsCollection([]);
      collections = DraftsCollectionService.addToDrafts(
        collections,
        makeRequest('GET', 'https://example.com/a'),
        makeResponse()
      );
      collections = DraftsCollectionService.removeFromDrafts(collections, 'https://example.com/b', 'GET');
      expect(collections[0].items.length).toBe(1);
    });
  });

  describe('isDraftsCollection', () => {
    it('returns true for Drafts collection', () => {
      const drafts = makeCollection('__drafts__', 'Drafts');
      drafts.builtin = 'drafts';
      expect(DraftsCollectionService.isDraftsCollection(drafts)).toBe(true);
    });

    it('returns false for regular collection', () => {
      const col = makeCollection('c1', 'Test');
      expect(DraftsCollectionService.isDraftsCollection(col)).toBe(false);
    });
  });

  describe('migrateFromRecent', () => {
    it('migrates legacy __recent__ collection to __drafts__', () => {
      const legacy = makeCollection('__recent__', 'Recent');
      (legacy as any).builtin = 'recent';
      const collections = [legacy, makeCollection('c1', 'Test')];

      const result = DraftsCollectionService.migrateFromRecent(collections);
      expect(result[0].id).toBe('__drafts__');
      expect(result[0].name).toBe('Drafts');
      expect(result[0].builtin).toBe('drafts');
      expect(result[1].id).toBe('c1');
    });

    it('does nothing when no legacy data exists', () => {
      const collections = [makeCollection('c1', 'Test')];
      const result = DraftsCollectionService.migrateFromRecent(collections);
      expect(result[0].id).toBe('c1');
    });
  });
});
