import type { CollectionItem, SavedRequest, Folder, Collection } from '../../services/types';

jest.mock('@hivefetch/core', () => ({
  extractPathname: jest.fn((url: string) => {
    const protoEnd = url.indexOf('://');
    if (protoEnd !== -1) {
      const pathStart = url.indexOf('/', protoEnd + 3);
      if (pathStart === -1) return '/';
      const queryStart = url.indexOf('?', pathStart);
      return queryStart !== -1 ? url.substring(pathStart, queryStart) : url.substring(pathStart);
    }
    return '/';
  }),
  isRequest: jest.fn((item: any) => item?.type === 'request'),
  isFolder: jest.fn((item: any) => item?.type === 'folder'),
  generateId: jest.fn(() => `mock-id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
}));

import {
  generateId,
  findRequestRecursive,
  findRequestInCollection,
  findRequestAcrossCollections,
  addItemToContainer,
  insertAfterItem,
  removeItemFromTree,
  duplicateItemsRecursive,
  updateItemInTree,
  findFolderRecursive,
  getAllRequestsFromItems,
  countAllItems,
  deriveNameFromUrl,
} from './CollectionTreeOps';

// ── Helpers ─────────────────────────────────────────────────────────

function makeRequest(id: string, name = 'Test Request'): SavedRequest {
  return {
    type: 'request',
    id,
    name,
    method: 'GET',
    url: 'https://api.example.com',
    params: [],
    headers: [],
    auth: { type: 'none' },
    body: { type: 'none', content: '' },
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

function makeFolder(id: string, name: string, children: CollectionItem[] = []): Folder {
  return {
    type: 'folder',
    id,
    name,
    children,
    expanded: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

function makeCollection(id: string, name: string, items: CollectionItem[] = []): Collection {
  return {
    id,
    name,
    items,
    expanded: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

// =====================================================================
// Tests
// =====================================================================

describe('CollectionTreeOps', () => {

  // ── generateId ──────────────────────────────────────────────────

  describe('generateId', () => {
    it('should return a non-empty string', () => {
      const id = generateId();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('should generate unique IDs', () => {
      const ids = new Set(Array.from({ length: 50 }, () => generateId()));
      expect(ids.size).toBe(50);
    });

    it('should contain a timestamp and random part separated by a dash', () => {
      const id = generateId();
      expect(id).toMatch(/^\d+-[a-z0-9]+$/);
    });
  });

  // ── findRequestRecursive ────────────────────────────────────────

  describe('findRequestRecursive', () => {
    it('should find a request at the top level', () => {
      const req = makeRequest('r1');
      const result = findRequestRecursive([req], 'r1');
      expect(result).toBe(req);
    });

    it('should find a request nested inside a folder', () => {
      const req = makeRequest('r1');
      const folder = makeFolder('f1', 'Folder', [req]);
      const result = findRequestRecursive([folder], 'r1');
      expect(result).toBe(req);
    });

    it('should find a request nested multiple levels deep', () => {
      const req = makeRequest('r1');
      const inner = makeFolder('f2', 'Inner', [req]);
      const outer = makeFolder('f1', 'Outer', [inner]);
      const result = findRequestRecursive([outer], 'r1');
      expect(result).toBe(req);
    });

    it('should return null when request is not found', () => {
      const req = makeRequest('r1');
      expect(findRequestRecursive([req], 'nonexistent')).toBeNull();
    });

    it('should return null for empty items', () => {
      expect(findRequestRecursive([], 'r1')).toBeNull();
    });

    it('should not match a folder id', () => {
      const folder = makeFolder('f1', 'Folder', []);
      expect(findRequestRecursive([folder], 'f1')).toBeNull();
    });
  });

  // ── findRequestInCollection ─────────────────────────────────────

  describe('findRequestInCollection', () => {
    it('should find a request within a collection', () => {
      const req = makeRequest('r1');
      const col = makeCollection('c1', 'Test', [req]);
      expect(findRequestInCollection(col, 'r1')).toBe(req);
    });

    it('should return null when request is not in collection', () => {
      const col = makeCollection('c1', 'Test', []);
      expect(findRequestInCollection(col, 'r1')).toBeNull();
    });
  });

  // ── findRequestAcrossCollections ────────────────────────────────

  describe('findRequestAcrossCollections', () => {
    it('should find a request in the first collection', () => {
      const req = makeRequest('r1');
      const col1 = makeCollection('c1', 'Col1', [req]);
      const col2 = makeCollection('c2', 'Col2', []);

      const result = findRequestAcrossCollections([col1, col2], 'r1');
      expect(result).toEqual({ collection: col1, request: req });
    });

    it('should find a request in the second collection', () => {
      const req = makeRequest('r1');
      const col1 = makeCollection('c1', 'Col1', []);
      const col2 = makeCollection('c2', 'Col2', [req]);

      const result = findRequestAcrossCollections([col1, col2], 'r1');
      expect(result).toEqual({ collection: col2, request: req });
    });

    it('should return null when request is not in any collection', () => {
      const col = makeCollection('c1', 'Col1', []);
      expect(findRequestAcrossCollections([col], 'r1')).toBeNull();
    });

    it('should return null for empty collections array', () => {
      expect(findRequestAcrossCollections([], 'r1')).toBeNull();
    });
  });

  // ── addItemToContainer ──────────────────────────────────────────

  describe('addItemToContainer', () => {
    it('should append item to root when no targetFolderId', () => {
      const existing = makeRequest('r1');
      const newItem = makeRequest('r2');
      const result = addItemToContainer([existing], newItem);
      expect(result).toHaveLength(2);
      expect(result[1].id).toBe('r2');
    });

    it('should add item to specific folder', () => {
      const folder = makeFolder('f1', 'Folder', []);
      const newItem = makeRequest('r1');
      const result = addItemToContainer([folder], newItem, 'f1');
      const updatedFolder = result[0] as Folder;
      expect(updatedFolder.children).toHaveLength(1);
      expect(updatedFolder.children[0].id).toBe('r1');
    });

    it('should add item to nested folder', () => {
      const inner = makeFolder('f2', 'Inner', []);
      const outer = makeFolder('f1', 'Outer', [inner]);
      const newItem = makeRequest('r1');
      const result = addItemToContainer([outer], newItem, 'f2');
      const outerResult = result[0] as Folder;
      const innerResult = outerResult.children[0] as Folder;
      expect(innerResult.children).toHaveLength(1);
      expect(innerResult.children[0].id).toBe('r1');
    });

    it('should not modify original items (immutable)', () => {
      const items = [makeRequest('r1')];
      const newItem = makeRequest('r2');
      const result = addItemToContainer(items, newItem);
      expect(items).toHaveLength(1);
      expect(result).toHaveLength(2);
    });

    it('should not add to folder when targetFolderId does not match', () => {
      const folder = makeFolder('f1', 'Folder', [makeRequest('r1')]);
      const newItem = makeRequest('r2');
      const result = addItemToContainer([folder], newItem, 'nonexistent');
      const resultFolder = result[0] as Folder;
      expect(resultFolder.children).toHaveLength(1);
    });
  });

  // ── insertAfterItem ─────────────────────────────────────────────

  describe('insertAfterItem', () => {
    it('should insert after target item at root level', () => {
      const items: CollectionItem[] = [makeRequest('r1'), makeRequest('r3')];
      const newItem = makeRequest('r2');
      const result = insertAfterItem(items, 'r1', newItem);
      expect(result.map(i => i.id)).toEqual(['r1', 'r2', 'r3']);
    });

    it('should insert after the last item', () => {
      const items: CollectionItem[] = [makeRequest('r1')];
      const newItem = makeRequest('r2');
      const result = insertAfterItem(items, 'r1', newItem);
      expect(result.map(i => i.id)).toEqual(['r1', 'r2']);
    });

    it('should insert inside a folder when target is nested', () => {
      const folder = makeFolder('f1', 'Folder', [makeRequest('r1')]);
      const newItem = makeRequest('r2');
      const result = insertAfterItem([folder], 'r1', newItem);
      const resultFolder = result[0] as Folder;
      expect(resultFolder.children.map(i => i.id)).toEqual(['r1', 'r2']);
    });

    it('should not modify if target not found', () => {
      const items: CollectionItem[] = [makeRequest('r1')];
      const newItem = makeRequest('r2');
      const result = insertAfterItem(items, 'nonexistent', newItem);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('r1');
    });
  });

  // ── removeItemFromTree ──────────────────────────────────────────

  describe('removeItemFromTree', () => {
    it('should remove a top-level request', () => {
      const items: CollectionItem[] = [makeRequest('r1'), makeRequest('r2')];
      const result = removeItemFromTree(items, 'r1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('r2');
    });

    it('should remove a top-level folder', () => {
      const items: CollectionItem[] = [makeFolder('f1', 'Folder', [makeRequest('r1')])];
      const result = removeItemFromTree(items, 'f1');
      expect(result).toHaveLength(0);
    });

    it('should remove a nested request inside a folder', () => {
      const folder = makeFolder('f1', 'Folder', [makeRequest('r1'), makeRequest('r2')]);
      const result = removeItemFromTree([folder], 'r1');
      const resultFolder = result[0] as Folder;
      expect(resultFolder.children).toHaveLength(1);
      expect(resultFolder.children[0].id).toBe('r2');
    });

    it('should handle removing from deeply nested structure', () => {
      const inner = makeFolder('f2', 'Inner', [makeRequest('r1')]);
      const outer = makeFolder('f1', 'Outer', [inner]);
      const result = removeItemFromTree([outer], 'r1');
      const outerResult = result[0] as Folder;
      const innerResult = outerResult.children[0] as Folder;
      expect(innerResult.children).toHaveLength(0);
    });

    it('should return unchanged items when id not found', () => {
      const items: CollectionItem[] = [makeRequest('r1')];
      const result = removeItemFromTree(items, 'nonexistent');
      expect(result).toHaveLength(1);
    });
  });

  // ── duplicateItemsRecursive ─────────────────────────────────────

  describe('duplicateItemsRecursive', () => {
    it('should duplicate requests with new IDs', () => {
      const items: CollectionItem[] = [makeRequest('r1'), makeRequest('r2')];
      const result = duplicateItemsRecursive(items);
      expect(result).toHaveLength(2);
      expect(result[0].id).not.toBe('r1');
      expect(result[1].id).not.toBe('r2');
    });

    it('should duplicate folders and their children recursively', () => {
      const folder = makeFolder('f1', 'Folder', [makeRequest('r1')]);
      const result = duplicateItemsRecursive([folder]);
      expect(result).toHaveLength(1);
      const dupFolder = result[0] as Folder;
      expect(dupFolder.id).not.toBe('f1');
      expect(dupFolder.children).toHaveLength(1);
      expect(dupFolder.children[0].id).not.toBe('r1');
    });

    it('should preserve item properties except id and timestamps', () => {
      const req = makeRequest('r1', 'My Request');
      const result = duplicateItemsRecursive([req]);
      const dup = result[0] as SavedRequest;
      expect(dup.name).toBe('My Request');
      expect(dup.method).toBe('GET');
      expect(dup.type).toBe('request');
    });

    it('should return empty array for empty input', () => {
      expect(duplicateItemsRecursive([])).toEqual([]);
    });

    it('should set new timestamps on duplicated items', () => {
      const req = makeRequest('r1');
      req.createdAt = '2020-01-01T00:00:00.000Z';
      const result = duplicateItemsRecursive([req]);
      expect(result[0].createdAt).not.toBe('2020-01-01T00:00:00.000Z');
    });
  });

  // ── updateItemInTree ────────────────────────────────────────────

  describe('updateItemInTree', () => {
    it('should update a top-level request', () => {
      const req = makeRequest('r1', 'Old Name');
      const result = updateItemInTree<SavedRequest>([req], 'r1', (item) => ({
        ...item,
        name: 'New Name',
      }));
      expect((result[0] as SavedRequest).name).toBe('New Name');
    });

    it('should update a nested request inside a folder', () => {
      const req = makeRequest('r1', 'Old Name');
      const folder = makeFolder('f1', 'Folder', [req]);
      const result = updateItemInTree<SavedRequest>([folder], 'r1', (item) => ({
        ...item,
        name: 'Updated',
      }));
      const resultFolder = result[0] as Folder;
      expect((resultFolder.children[0] as SavedRequest).name).toBe('Updated');
    });

    it('should update a folder itself', () => {
      const folder = makeFolder('f1', 'Old Folder', []);
      const result = updateItemInTree<Folder>([folder], 'f1', (item) => ({
        ...item,
        name: 'Renamed Folder',
      }));
      expect((result[0] as Folder).name).toBe('Renamed Folder');
    });

    it('should not modify items that do not match', () => {
      const r1 = makeRequest('r1', 'Keep');
      const r2 = makeRequest('r2', 'Also Keep');
      const result = updateItemInTree<SavedRequest>([r1, r2], 'r1', (item) => ({
        ...item,
        name: 'Changed',
      }));
      expect((result[0] as SavedRequest).name).toBe('Changed');
      expect((result[1] as SavedRequest).name).toBe('Also Keep');
    });
  });

  // ── findFolderRecursive ─────────────────────────────────────────

  describe('findFolderRecursive', () => {
    it('should find a top-level folder', () => {
      const folder = makeFolder('f1', 'Test Folder', []);
      expect(findFolderRecursive([folder], 'f1')).toBe(folder);
    });

    it('should find a nested folder', () => {
      const inner = makeFolder('f2', 'Inner', []);
      const outer = makeFolder('f1', 'Outer', [inner]);
      expect(findFolderRecursive([outer], 'f2')).toBe(inner);
    });

    it('should return null when folder is not found', () => {
      const items: CollectionItem[] = [makeRequest('r1'), makeFolder('f1', 'F', [])];
      expect(findFolderRecursive(items, 'nonexistent')).toBeNull();
    });

    it('should return null for empty items', () => {
      expect(findFolderRecursive([], 'f1')).toBeNull();
    });

    it('should not match a request id', () => {
      const req = makeRequest('r1');
      expect(findFolderRecursive([req], 'r1')).toBeNull();
    });
  });

  // ── getAllRequestsFromItems ──────────────────────────────────────

  describe('getAllRequestsFromItems', () => {
    it('should return all top-level requests', () => {
      const items: CollectionItem[] = [makeRequest('r1'), makeRequest('r2')];
      const result = getAllRequestsFromItems(items);
      expect(result).toHaveLength(2);
    });

    it('should return requests from nested folders', () => {
      const folder = makeFolder('f1', 'F', [makeRequest('r1'), makeRequest('r2')]);
      const result = getAllRequestsFromItems([folder, makeRequest('r3')]);
      expect(result).toHaveLength(3);
    });

    it('should return requests from deeply nested structure', () => {
      const inner = makeFolder('f2', 'Inner', [makeRequest('r1')]);
      const outer = makeFolder('f1', 'Outer', [inner, makeRequest('r2')]);
      const result = getAllRequestsFromItems([outer]);
      expect(result).toHaveLength(2);
      expect(result.map(r => r.id).sort()).toEqual(['r1', 'r2']);
    });

    it('should return empty array when no requests exist', () => {
      const folder = makeFolder('f1', 'Empty', []);
      expect(getAllRequestsFromItems([folder])).toEqual([]);
    });

    it('should return empty array for empty items', () => {
      expect(getAllRequestsFromItems([])).toEqual([]);
    });
  });

  // ── countAllItems ───────────────────────────────────────────────

  describe('countAllItems', () => {
    it('should count top-level requests', () => {
      expect(countAllItems([makeRequest('r1'), makeRequest('r2')])).toBe(2);
    });

    it('should count requests inside folders (not the folders themselves)', () => {
      const folder = makeFolder('f1', 'F', [makeRequest('r1'), makeRequest('r2')]);
      expect(countAllItems([folder])).toBe(2);
    });

    it('should count across nested folders', () => {
      const inner = makeFolder('f2', 'Inner', [makeRequest('r1')]);
      const outer = makeFolder('f1', 'Outer', [inner, makeRequest('r2')]);
      expect(countAllItems([outer, makeRequest('r3')])).toBe(3);
    });

    it('should return 0 for empty items', () => {
      expect(countAllItems([])).toBe(0);
    });

    it('should return 0 for empty folders', () => {
      expect(countAllItems([makeFolder('f1', 'Empty', [])])).toBe(0);
    });
  });

  // ── deriveNameFromUrl ───────────────────────────────────────────

  describe('deriveNameFromUrl', () => {
    it('should derive name from a URL with path', () => {
      const name = deriveNameFromUrl('https://api.example.com/users');
      expect(name).toBe('Request from api.example.com/users');
    });

    it('should derive name from a URL with only hostname', () => {
      const name = deriveNameFromUrl('https://api.example.com');
      expect(name).toBe('Request from api.example.com');
    });

    it('should derive name with nested path', () => {
      const name = deriveNameFromUrl('https://api.example.com/v1/users/123');
      expect(name).toBe('Request from api.example.com/v1/users/123');
    });

    it('should return fallback for empty or invalid URL', () => {
      const name = deriveNameFromUrl('not-a-url');
      expect(name).toBe('New Request from URL');
    });

    it('should handle URL with trailing slash', () => {
      const name = deriveNameFromUrl('https://api.example.com/');
      expect(name).toBe('Request from api.example.com');
    });
  });
});
