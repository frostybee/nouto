import type { Collection, SavedRequest, HttpMethod, KeyValue, AuthState, BodyState, ConnectionMode, GrpcConfig } from '../types';
import { generateId } from '../types';
import { extractPathname } from '../utils/formatters';

const DRAFTS_COLLECTION_ID = '__drafts__';
const MAX_DRAFTS_ENTRIES = 50;

export class DraftsCollectionService {
  /**
   * Ensures a Drafts collection exists in the collections array.
   * Creates it if missing, moves it to index 0 if not already there.
   */
  static ensureDraftsCollection(collections: Collection[]): Collection[] {
    const existingIndex = collections.findIndex(c => c.id === DRAFTS_COLLECTION_ID);

    if (existingIndex === -1) {
      // Create the Drafts collection
      const now = new Date().toISOString();
      const drafts: Collection = {
        id: DRAFTS_COLLECTION_ID,
        name: 'Drafts',
        items: [],
        expanded: true,
        builtin: 'drafts',
        createdAt: now,
        updatedAt: now,
      };
      return [drafts, ...collections];
    }

    if (existingIndex === 0) {
      return collections;
    }

    // Move to index 0
    const result = [...collections];
    const [drafts] = result.splice(existingIndex, 1);
    result.unshift(drafts);
    return result;
  }

  /**
   * Adds a request to the Drafts collection with response metadata.
   * Deduplicates by url+method (removes older entry, prepends new one).
   * Caps at MAX_DRAFTS_ENTRIES.
   */
  static addToDrafts(
    collections: Collection[],
    requestData: {
      method: HttpMethod;
      url: string;
      params: KeyValue[];
      headers: KeyValue[];
      auth: AuthState;
      body: BodyState;
      connectionMode?: ConnectionMode;
      grpc?: GrpcConfig;
      name?: string;
    },
    responseData: {
      status: number;
      duration: number;
      size: number;
    }
  ): Collection[] {
    const result = this.ensureDraftsCollection(collections);
    const drafts = result[0];

    // Remove existing entry with same url+method+grpc service/method (deduplication)
    const filteredItems = drafts.items.filter(item => {
      if (item.type === 'folder') return true;
      const req = item as SavedRequest;
      if (req.url !== requestData.url || req.method !== requestData.method) return true;
      if (requestData.grpc) {
        return !(req.grpc?.serviceName === requestData.grpc.serviceName && req.grpc?.methodName === requestData.grpc.methodName);
      }
      return false;
    });

    // Derive name from method/mode + URL path
    // Use extractPathname to avoid URL parser encoding {param} placeholders
    const modeLabels: Record<string, string> = { websocket: 'WS', sse: 'SSE', 'graphql-ws': 'GQL-S', grpc: 'gRPC' };
    const namePrefix = (requestData.connectionMode && modeLabels[requestData.connectionMode]) || requestData.method;
    const grpcSuffix = requestData.grpc ? `/${requestData.grpc.serviceName}/${requestData.grpc.methodName}` : '';
    const name = requestData.name || `${namePrefix} ${extractPathname(requestData.url)}${grpcSuffix}`;

    const now = new Date().toISOString();
    const newEntry: SavedRequest = {
      type: 'request',
      id: generateId(),
      name,
      method: requestData.method,
      url: requestData.url,
      params: requestData.params,
      headers: requestData.headers,
      auth: requestData.auth,
      body: requestData.body,
      connectionMode: requestData.connectionMode,
      grpc: requestData.grpc,
      lastResponseStatus: responseData.status,
      lastResponseDuration: responseData.duration,
      lastResponseSize: responseData.size,
      lastResponseTime: now,
      createdAt: now,
      updatedAt: now,
    };

    // Prepend new entry, cap at limit
    drafts.items = [newEntry, ...filteredItems].slice(0, MAX_DRAFTS_ENTRIES);
    drafts.updatedAt = now;

    return result;
  }

  /**
   * Updates response metadata on an existing draft in-place.
   * Returns true if a matching draft was found and updated (no persist needed for new entry).
   */
  static updateDraftResponseMeta(
    collections: Collection[],
    url: string,
    method: string,
    grpc: GrpcConfig | undefined,
    responseData: { status: number; duration: number; size: number }
  ): boolean {
    const drafts = collections.find(c => c.id === DRAFTS_COLLECTION_ID);
    if (!drafts) return false;

    const existing = drafts.items.find(item => {
      if (item.type === 'folder') return false;
      const req = item as SavedRequest;
      if (req.url !== url || req.method !== method) return false;
      if (grpc) {
        return req.grpc?.serviceName === grpc.serviceName && req.grpc?.methodName === grpc.methodName;
      }
      return true;
    }) as SavedRequest | undefined;

    if (!existing) return false;

    existing.lastResponseStatus = responseData.status;
    existing.lastResponseDuration = responseData.duration;
    existing.lastResponseSize = responseData.size;
    existing.lastResponseTime = new Date().toISOString();
    return true;
  }

  /**
   * Removes a request from the Drafts collection by url+method match.
   */
  static removeFromDrafts(collections: Collection[], url: string, method: string): Collection[] {
    return collections.map(c => {
      if (c.id !== DRAFTS_COLLECTION_ID) return c;
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
   * Checks if a collection is the built-in Drafts collection.
   */
  static isDraftsCollection(collection: Collection): boolean {
    return collection.builtin === 'drafts';
  }

  /**
   * Clears all entries from the Drafts collection.
   */
  static clearDrafts(collections: Collection[]): Collection[] {
    return collections.map(c => {
      if (c.id === DRAFTS_COLLECTION_ID) {
        return { ...c, items: [], updatedAt: new Date().toISOString() };
      }
      return c;
    });
  }

  /**
   * The fixed ID for the Drafts collection.
   */
  static readonly DRAFTS_ID = DRAFTS_COLLECTION_ID;

  // ── Migration: support old 'recent' / '__recent__' data ──────

  /**
   * Migrates legacy Recent collection data to Drafts.
   * Call once during load to handle existing user data.
   */
  static migrateFromRecent(collections: Collection[]): Collection[] {
    return collections.map(c => {
      if (c.id === '__recent__' || c.builtin === ('recent' as any)) {
        return {
          ...c,
          id: DRAFTS_COLLECTION_ID,
          name: 'Drafts',
          builtin: 'drafts' as const,
        };
      }
      return c;
    });
  }
}
