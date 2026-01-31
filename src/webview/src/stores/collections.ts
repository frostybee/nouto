import { writable, derived, get } from 'svelte/store';
import type { Collection, SavedRequest, HttpMethod, KeyValue, AuthState, BodyState } from '../types';
import { generateId, createCollection } from '../types';
import { postMessage } from '../lib/vscode';

// Collections store
export const collections = writable<Collection[]>([]);

// Currently selected collection ID
export const selectedCollectionId = writable<string | null>(null);

// Currently selected request ID
export const selectedRequestId = writable<string | null>(null);

// Derived store for selected collection
export const selectedCollection = derived(
  [collections, selectedCollectionId],
  ([$collections, $selectedCollectionId]) => {
    if (!$selectedCollectionId) return null;
    return $collections.find(c => c.id === $selectedCollectionId) || null;
  }
);

// Derived store for selected request
export const selectedRequest = derived(
  [collections, selectedRequestId],
  ([$collections, $selectedRequestId]) => {
    if (!$selectedRequestId) return null;
    for (const collection of $collections) {
      const request = collection.requests.find(r => r.id === $selectedRequestId);
      if (request) return request;
    }
    return null;
  }
);

// Initialize collections from extension
export function initCollections(data: Collection[]) {
  collections.set(data);
}

// Add a new collection
export function addCollection(name: string): Collection {
  const newCollection = createCollection(name);
  collections.update(cols => [...cols, newCollection]);

  // Notify extension to persist
  postMessage({
    type: 'saveCollections',
    data: get(collections),
  });

  return newCollection;
}

// Update collection name
export function renameCollection(id: string, name: string) {
  collections.update(cols => cols.map(col => {
    if (col.id === id) {
      return { ...col, name, updatedAt: new Date().toISOString() };
    }
    return col;
  }));

  postMessage({
    type: 'saveCollections',
    data: get(collections),
  });
}

// Delete a collection
export function deleteCollection(id: string) {
  collections.update(cols => cols.filter(col => col.id !== id));

  // Clear selection if deleted collection was selected
  if (get(selectedCollectionId) === id) {
    selectedCollectionId.set(null);
    selectedRequestId.set(null);
  }

  postMessage({
    type: 'saveCollections',
    data: get(collections),
  });
}

// Toggle collection expanded state
export function toggleCollectionExpanded(id: string) {
  collections.update(cols => cols.map(col => {
    if (col.id === id) {
      return { ...col, expanded: !col.expanded };
    }
    return col;
  }));
}

// Add request to collection
export function addRequestToCollection(
  collectionId: string,
  request: {
    name: string;
    method: HttpMethod;
    url: string;
    params: KeyValue[];
    headers: KeyValue[];
    auth: AuthState;
    body: BodyState;
  }
): SavedRequest {
  const now = new Date().toISOString();
  const newRequest: SavedRequest = {
    id: generateId(),
    ...request,
    createdAt: now,
    updatedAt: now,
  };

  collections.update(cols => cols.map(col => {
    if (col.id === collectionId) {
      return {
        ...col,
        requests: [...col.requests, newRequest],
        updatedAt: now,
      };
    }
    return col;
  }));

  postMessage({
    type: 'saveCollections',
    data: get(collections),
  });

  return newRequest;
}

// Update an existing request
export function updateRequest(
  requestId: string,
  updates: Partial<Omit<SavedRequest, 'id' | 'createdAt'>>
) {
  collections.update(cols => cols.map(col => {
    const requestIndex = col.requests.findIndex(r => r.id === requestId);
    if (requestIndex !== -1) {
      const updatedRequests = [...col.requests];
      updatedRequests[requestIndex] = {
        ...updatedRequests[requestIndex],
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      return { ...col, requests: updatedRequests, updatedAt: new Date().toISOString() };
    }
    return col;
  }));

  postMessage({
    type: 'saveCollections',
    data: get(collections),
  });
}

// Delete a request from collection
export function deleteRequest(requestId: string) {
  collections.update(cols => cols.map(col => ({
    ...col,
    requests: col.requests.filter(r => r.id !== requestId),
    updatedAt: new Date().toISOString(),
  })));

  // Clear selection if deleted request was selected
  if (get(selectedRequestId) === requestId) {
    selectedRequestId.set(null);
  }

  postMessage({
    type: 'saveCollections',
    data: get(collections),
  });
}

// Select a request (and its parent collection)
export function selectRequest(collectionId: string, requestId: string) {
  selectedCollectionId.set(collectionId);
  selectedRequestId.set(requestId);
}

// Find collection containing a request
export function findCollectionForRequest(requestId: string): Collection | null {
  const cols = get(collections);
  for (const col of cols) {
    if (col.requests.some(r => r.id === requestId)) {
      return col;
    }
  }
  return null;
}
