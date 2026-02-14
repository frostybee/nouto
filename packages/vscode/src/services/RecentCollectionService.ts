import type { Collection, SavedRequest, HttpMethod, KeyValue, AuthState, BodyState } from './types';

const RECENT_COLLECTION_ID = '__recent__';
const MAX_RECENT_ENTRIES = 50;

export class RecentCollectionService {
  /**
   * Ensures a Recent collection exists in the collections array.
   * Creates it if missing, moves it to index 0 if not already there.
   */
  static ensureRecentCollection(collections: Collection[]): Collection[] {
    const existingIndex = collections.findIndex(c => c.id === RECENT_COLLECTION_ID);

    if (existingIndex === -1) {
      // Create the Recent collection
      const now = new Date().toISOString();
      const recent: Collection = {
        id: RECENT_COLLECTION_ID,
        name: 'Recent',
        items: [],
        expanded: true,
        builtin: 'recent',
        createdAt: now,
        updatedAt: now,
      };
      return [recent, ...collections];
    }

    if (existingIndex === 0) {
      return collections;
    }

    // Move to index 0
    const result = [...collections];
    const [recent] = result.splice(existingIndex, 1);
    result.unshift(recent);
    return result;
  }

  /**
   * Adds a request to the Recent collection with response metadata.
   * Deduplicates by url+method (removes older entry, prepends new one).
   * Caps at MAX_RECENT_ENTRIES.
   */
  static addToRecent(
    collections: Collection[],
    requestData: {
      method: HttpMethod;
      url: string;
      params: KeyValue[];
      headers: KeyValue[];
      auth: AuthState;
      body: BodyState;
      connectionMode?: 'http' | 'websocket' | 'sse';
      name?: string;
    },
    responseData: {
      status: number;
      duration: number;
      size: number;
    }
  ): Collection[] {
    const result = this.ensureRecentCollection(collections);
    const recent = result[0];

    // Remove existing entry with same url+method (deduplication)
    const filteredItems = recent.items.filter(item => {
      if (item.type === 'folder') return true;
      const req = item as SavedRequest;
      return !(req.url === requestData.url && req.method === requestData.method);
    });

    // Derive name from method + URL path
    let name = requestData.name || `${requestData.method} ${requestData.url}`;
    try {
      const urlObj = new URL(requestData.url);
      name = `${requestData.method} ${urlObj.pathname}`;
    } catch {
      // Keep derived name
    }

    const now = new Date().toISOString();
    const newEntry: SavedRequest = {
      type: 'request',
      id: `recent-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      name,
      method: requestData.method,
      url: requestData.url,
      params: requestData.params,
      headers: requestData.headers,
      auth: requestData.auth,
      body: requestData.body,
      connectionMode: requestData.connectionMode,
      lastResponseStatus: responseData.status,
      lastResponseDuration: responseData.duration,
      lastResponseSize: responseData.size,
      lastResponseTime: now,
      createdAt: now,
      updatedAt: now,
    };

    // Prepend new entry, cap at limit
    recent.items = [newEntry, ...filteredItems].slice(0, MAX_RECENT_ENTRIES);
    recent.updatedAt = now;

    return result;
  }

  /**
   * Removes a request from the Recent collection by url+method match.
   */
  static removeFromRecent(collections: Collection[], url: string, method: string): Collection[] {
    return collections.map(c => {
      if (c.id !== RECENT_COLLECTION_ID) return c;
      return {
        ...c,
        items: c.items.filter(item => {
          if (item.type === 'folder') return true;
          const req = item as SavedRequest;
          return !(req.url === url && req.method === method);
        }),
        updatedAt: new Date().toISOString(),
      };
    });
  }

  /**
   * Checks if a collection is the built-in Recent collection.
   */
  static isRecentCollection(collection: Collection): boolean {
    return collection.builtin === 'recent';
  }

  /**
   * Clears all entries from the Recent collection.
   */
  static clearRecent(collections: Collection[]): Collection[] {
    return collections.map(c => {
      if (c.id === RECENT_COLLECTION_ID) {
        return { ...c, items: [], updatedAt: new Date().toISOString() };
      }
      return c;
    });
  }

  /**
   * The fixed ID for the Recent collection.
   */
  static readonly RECENT_ID = RECENT_COLLECTION_ID;
}
