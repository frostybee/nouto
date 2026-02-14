import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  collections,
  selectedCollectionId,
  selectedRequestId,
  selectedFolderId,
  selectedCollection,
  selectedRequest,
  selectedFolder,
  findItemRecursive,
  findItemById,
  findParentContainer,
  getAllRequests,
  initCollections,
  addCollection,
  renameCollection,
  deleteCollection,
  toggleCollectionExpanded,
  toggleFolderExpanded,
  addFolder,
  renameFolder,
  deleteFolder,
  addRequestToCollection,
  updateRequest,
  deleteRequest,
  moveItem,
  selectRequest,
  selectFolder,
  findCollectionForRequest,
  findCollectionForItem,
} from './collections';
import type { Collection, SavedRequest, Folder, CollectionItem } from '../types';
import { vscodeApiMocks } from '../test/setup';

// Helper functions to create test data
const createMockRequest = (id: string, name: string, overrides = {}): SavedRequest => ({
  type: 'request',
  id,
  name,
  method: 'GET',
  url: 'https://api.example.com',
  params: [],
  headers: [],
  auth: { type: 'none' },
  body: { type: 'none', content: '' },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const createMockFolder = (id: string, name: string, children: CollectionItem[] = []): Folder => ({
  type: 'folder',
  id,
  name,
  children,
  expanded: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const createMockCollection = (id: string, name: string, items: CollectionItem[] = []): Collection => ({
  id,
  name,
  items,
  expanded: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

describe('collections store', () => {
  beforeEach(() => {
    collections.set([]);
    selectedCollectionId.set(null);
    selectedRequestId.set(null);
    selectedFolderId.set(null);
    vscodeApiMocks.postMessage.mockClear();
  });

  describe('initCollections', () => {
    it('should initialize with provided collections', () => {
      const cols: Collection[] = [
        createMockCollection('1', 'API Tests'),
        createMockCollection('2', 'User Tests'),
      ];

      initCollections(cols);

      expect(get(collections)).toEqual(cols);
    });
  });

  describe('findItemRecursive', () => {
    it('should find item at root level', () => {
      const request = createMockRequest('req-1', 'Test Request');
      const items: CollectionItem[] = [request];

      const found = findItemRecursive(items, 'req-1');

      expect(found).toEqual(request);
    });

    it('should find item in nested folder', () => {
      const request = createMockRequest('req-1', 'Nested Request');
      const folder = createMockFolder('folder-1', 'Auth', [request]);
      const items: CollectionItem[] = [folder];

      const found = findItemRecursive(items, 'req-1');

      expect(found).toEqual(request);
    });

    it('should find deeply nested item', () => {
      const request = createMockRequest('deep-req', 'Deep Request');
      const innerFolder = createMockFolder('inner', 'Inner', [request]);
      const outerFolder = createMockFolder('outer', 'Outer', [innerFolder]);
      const items: CollectionItem[] = [outerFolder];

      const found = findItemRecursive(items, 'deep-req');

      expect(found).toEqual(request);
    });

    it('should return null for non-existent item', () => {
      const items: CollectionItem[] = [createMockRequest('req-1', 'Test')];

      const found = findItemRecursive(items, 'non-existent');

      expect(found).toBeNull();
    });
  });

  describe('findItemById', () => {
    it('should find item across all collections', () => {
      const request = createMockRequest('target', 'Target Request');
      initCollections([
        createMockCollection('col-1', 'First', [createMockRequest('other', 'Other')]),
        createMockCollection('col-2', 'Second', [request]),
      ]);

      const result = findItemById('target');

      expect(result).not.toBeNull();
      expect(result?.item).toEqual(request);
      expect(result?.collection.id).toBe('col-2');
    });
  });

  describe('findParentContainer', () => {
    it('should find collection as parent for root-level item', () => {
      const request = createMockRequest('req-1', 'Test');
      const collection = createMockCollection('col-1', 'Test Col', [request]);
      initCollections([collection]);

      const result = findParentContainer('col-1', 'req-1');

      expect(result?.type).toBe('collection');
    });

    it('should find folder as parent for nested item', () => {
      const request = createMockRequest('req-1', 'Test');
      const folder = createMockFolder('folder-1', 'Folder', [request]);
      const collection = createMockCollection('col-1', 'Test', [folder]);
      initCollections([collection]);

      const result = findParentContainer('col-1', 'req-1');

      expect(result?.type).toBe('folder');
      if (result?.type === 'folder') {
        expect(result.folder.id).toBe('folder-1');
      }
    });
  });

  describe('getAllRequests', () => {
    it('should flatten all requests from nested structure', () => {
      const req1 = createMockRequest('req-1', 'First');
      const req2 = createMockRequest('req-2', 'Second');
      const req3 = createMockRequest('req-3', 'Nested');
      const folder = createMockFolder('folder', 'Folder', [req3]);
      const items: CollectionItem[] = [req1, folder, req2];

      const allRequests = getAllRequests(items);

      expect(allRequests).toHaveLength(3);
      expect(allRequests.map(r => r.id)).toContain('req-1');
      expect(allRequests.map(r => r.id)).toContain('req-2');
      expect(allRequests.map(r => r.id)).toContain('req-3');
    });
  });

  describe('derived stores', () => {
    it('selectedCollection should return the selected collection', () => {
      const collection = createMockCollection('col-1', 'Test');
      initCollections([collection]);
      selectedCollectionId.set('col-1');

      expect(get(selectedCollection)).toEqual(collection);
    });

    it('selectedRequest should return the selected request', () => {
      const request = createMockRequest('req-1', 'Test');
      const collection = createMockCollection('col-1', 'Test', [request]);
      initCollections([collection]);
      selectedRequestId.set('req-1');

      expect(get(selectedRequest)).toEqual(request);
    });

    it('selectedFolder should return the selected folder', () => {
      const folder = createMockFolder('folder-1', 'Test Folder');
      const collection = createMockCollection('col-1', 'Test', [folder]);
      initCollections([collection]);
      selectedFolderId.set('folder-1');

      expect(get(selectedFolder)).toEqual(folder);
    });
  });

  describe('addCollection', () => {
    it('should create and add a new collection', () => {
      const newCol = addCollection('New Collection');

      expect(newCol.name).toBe('New Collection');
      expect(get(collections)).toHaveLength(1);
    });

    it('should notify extension to save', () => {
      addCollection('Test');

      expect(vscodeApiMocks.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'saveCollections',
        })
      );
    });
  });

  describe('renameCollection', () => {
    it('should rename an existing collection', () => {
      const collection = createMockCollection('col-1', 'Old Name');
      initCollections([collection]);

      renameCollection('col-1', 'New Name');

      expect(get(collections)[0].name).toBe('New Name');
    });
  });

  describe('deleteCollection', () => {
    it('should remove a collection', () => {
      initCollections([
        createMockCollection('col-1', 'First'),
        createMockCollection('col-2', 'Second'),
      ]);

      deleteCollection('col-1');

      expect(get(collections)).toHaveLength(1);
      expect(get(collections)[0].id).toBe('col-2');
    });

    it('should clear selection if deleted collection was selected', () => {
      initCollections([createMockCollection('col-1', 'Test')]);
      selectedCollectionId.set('col-1');

      deleteCollection('col-1');

      expect(get(selectedCollectionId)).toBeNull();
    });
  });

  describe('toggleCollectionExpanded', () => {
    it('should toggle collection expanded state', () => {
      initCollections([createMockCollection('col-1', 'Test')]);

      toggleCollectionExpanded('col-1');
      expect(get(collections)[0].expanded).toBe(false);

      toggleCollectionExpanded('col-1');
      expect(get(collections)[0].expanded).toBe(true);
    });
  });

  describe('addFolder', () => {
    it('should add folder to collection root', () => {
      initCollections([createMockCollection('col-1', 'Test')]);

      const folder = addFolder('col-1', 'New Folder');

      expect(folder.name).toBe('New Folder');
      expect(get(collections)[0].items).toHaveLength(1);
    });

    it('should add folder inside another folder', () => {
      const parentFolder = createMockFolder('parent', 'Parent');
      initCollections([createMockCollection('col-1', 'Test', [parentFolder])]);

      addFolder('col-1', 'Child Folder', 'parent');

      const parent = get(collections)[0].items[0] as Folder;
      expect(parent.children).toHaveLength(1);
    });
  });

  describe('renameFolder', () => {
    it('should rename a folder', () => {
      const folder = createMockFolder('folder-1', 'Old Name');
      initCollections([createMockCollection('col-1', 'Test', [folder])]);

      renameFolder('folder-1', 'New Name');

      const updatedFolder = get(collections)[0].items[0] as Folder;
      expect(updatedFolder.name).toBe('New Name');
    });
  });

  describe('deleteFolder', () => {
    it('should delete a folder and its contents', () => {
      const request = createMockRequest('req-1', 'Test');
      const folder = createMockFolder('folder-1', 'To Delete', [request]);
      initCollections([createMockCollection('col-1', 'Test', [folder])]);

      deleteFolder('folder-1');

      expect(get(collections)[0].items).toHaveLength(0);
    });

    it('should clear selection if deleted folder was selected', () => {
      const folder = createMockFolder('folder-1', 'Test');
      initCollections([createMockCollection('col-1', 'Test', [folder])]);
      selectedFolderId.set('folder-1');

      deleteFolder('folder-1');

      expect(get(selectedFolderId)).toBeNull();
    });
  });

  describe('addRequestToCollection', () => {
    it('should add request to collection root', () => {
      initCollections([createMockCollection('col-1', 'Test')]);

      const request = addRequestToCollection('col-1', {
        name: 'New Request',
        method: 'POST',
        url: 'https://api.test.com',
        params: [],
        headers: [],
        auth: { type: 'none' },
        body: { type: 'json', content: '{}' },
      });

      expect(request.name).toBe('New Request');
      expect(get(collections)[0].items).toHaveLength(1);
    });

    it('should add request to folder', () => {
      const folder = createMockFolder('folder-1', 'Auth');
      initCollections([createMockCollection('col-1', 'Test', [folder])]);

      addRequestToCollection('col-1', {
        name: 'Auth Request',
        method: 'POST',
        url: 'https://api.test.com/auth',
        params: [],
        headers: [],
        auth: { type: 'none' },
        body: { type: 'none', content: '' },
      }, 'folder-1');

      const updatedFolder = get(collections)[0].items[0] as Folder;
      expect(updatedFolder.children).toHaveLength(1);
    });
  });

  describe('updateRequest', () => {
    it('should update request properties', () => {
      const request = createMockRequest('req-1', 'Test');
      initCollections([createMockCollection('col-1', 'Test', [request])]);

      updateRequest('req-1', { name: 'Updated Name', method: 'PUT' });

      const updated = get(collections)[0].items[0] as SavedRequest;
      expect(updated.name).toBe('Updated Name');
      expect(updated.method).toBe('PUT');
    });
  });

  describe('deleteRequest', () => {
    it('should delete a request', () => {
      const request = createMockRequest('req-1', 'Test');
      initCollections([createMockCollection('col-1', 'Test', [request])]);

      deleteRequest('req-1');

      expect(get(collections)[0].items).toHaveLength(0);
    });

    it('should clear selection if deleted request was selected', () => {
      const request = createMockRequest('req-1', 'Test');
      initCollections([createMockCollection('col-1', 'Test', [request])]);
      selectedRequestId.set('req-1');

      deleteRequest('req-1');

      expect(get(selectedRequestId)).toBeNull();
    });
  });

  describe('moveItem', () => {
    it('should move request between collections', () => {
      const request = createMockRequest('req-1', 'Test');
      initCollections([
        createMockCollection('col-1', 'Source', [request]),
        createMockCollection('col-2', 'Target'),
      ]);

      moveItem('req-1', 'col-2');

      expect(get(collections)[0].items).toHaveLength(0);
      expect(get(collections)[1].items).toHaveLength(1);
    });

    it('should move request into folder', () => {
      const request = createMockRequest('req-1', 'Test');
      const folder = createMockFolder('folder-1', 'Target Folder');
      initCollections([createMockCollection('col-1', 'Test', [request, folder])]);

      moveItem('req-1', 'col-1', 'folder-1');

      expect(get(collections)[0].items).toHaveLength(1);
      const updatedFolder = get(collections)[0].items[0] as Folder;
      expect(updatedFolder.children).toHaveLength(1);
    });
  });

  describe('selectRequest', () => {
    it('should set collection and request selection', () => {
      selectRequest('col-1', 'req-1');

      expect(get(selectedCollectionId)).toBe('col-1');
      expect(get(selectedRequestId)).toBe('req-1');
      expect(get(selectedFolderId)).toBeNull();
    });
  });

  describe('selectFolder', () => {
    it('should set collection and folder selection', () => {
      selectFolder('col-1', 'folder-1');

      expect(get(selectedCollectionId)).toBe('col-1');
      expect(get(selectedFolderId)).toBe('folder-1');
      expect(get(selectedRequestId)).toBeNull();
    });
  });

  describe('findCollectionForRequest', () => {
    it('should find the collection containing a request', () => {
      const request = createMockRequest('req-1', 'Test');
      const collection = createMockCollection('col-1', 'Test', [request]);
      initCollections([collection]);

      const found = findCollectionForRequest('req-1');

      expect(found?.id).toBe('col-1');
    });
  });

  describe('findCollectionForItem', () => {
    it('should find collection for any item type', () => {
      const folder = createMockFolder('folder-1', 'Test Folder');
      const collection = createMockCollection('col-1', 'Test', [folder]);
      initCollections([collection]);

      const found = findCollectionForItem('folder-1');

      expect(found?.id).toBe('col-1');
    });
  });

  describe('toggleFolderExpanded', () => {
    it('should toggle folder expanded state', () => {
      const folder = createMockFolder('folder-1', 'Test');
      initCollections([createMockCollection('col-1', 'Test', [folder])]);

      toggleFolderExpanded('folder-1');

      const updated = get(collections)[0].items[0] as Folder;
      expect(updated.expanded).toBe(false);
    });
  });
});
