import * as fs from 'fs';
import type { Collection, SavedRequest, Folder, KeyValue, AuthState, BodyState, HttpMethod } from './types';

interface HoppscotchRequest {
  v?: string;
  name?: string;
  endpoint?: string;
  method?: string;
  headers?: Array<{ key: string; value: string; active: boolean }>;
  params?: Array<{ key: string; value: string; active: boolean }>;
  body?: {
    contentType?: string | null;
    body?: string | null;
  };
  auth?: {
    authType?: string;
    authActive?: boolean;
    token?: string;
    username?: string;
    password?: string;
    key?: string;
    value?: string;
    addTo?: string;
  };
}

interface HoppscotchFolder {
  v?: number;
  name?: string;
  folders?: HoppscotchFolder[];
  requests?: HoppscotchRequest[];
}

interface HoppscotchCollection {
  v?: number;
  name?: string;
  folders?: HoppscotchFolder[];
  requests?: HoppscotchRequest[];
}

export class HoppscotchImportService {
  async importFromFile(filePath: string): Promise<{ collections: Collection[] }> {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return this.importFromString(content);
  }

  importFromString(content: string): { collections: Collection[] } {
    const data = JSON.parse(content);
    const now = new Date().toISOString();

    // Hoppscotch can export a single collection or an array of collections
    const rawCollections: HoppscotchCollection[] = Array.isArray(data) ? data : [data];

    const collections: Collection[] = rawCollections.map(hc => this.convertCollection(hc, now));
    return { collections };
  }

  private convertCollection(hc: HoppscotchCollection, now: string): Collection {
    const collection: Collection = {
      id: `hoppscotch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: hc.name || 'Imported Collection',
      items: [],
      expanded: true,
      createdAt: now,
      updatedAt: now,
    };

    // Convert folders
    if (hc.folders) {
      for (const f of hc.folders) {
        collection.items.push(this.convertFolder(f, now));
      }
    }

    // Convert root-level requests
    if (hc.requests) {
      for (const r of hc.requests) {
        collection.items.push(this.convertRequest(r, now));
      }
    }

    return collection;
  }

  private convertFolder(hf: HoppscotchFolder, now: string): Folder {
    const folder: Folder = {
      type: 'folder',
      id: `hoppscotch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: hf.name || 'Folder',
      children: [],
      expanded: true,
      createdAt: now,
      updatedAt: now,
    };

    // Nested folders
    if (hf.folders) {
      for (const f of hf.folders) {
        folder.children.push(this.convertFolder(f, now));
      }
    }

    // Requests in this folder
    if (hf.requests) {
      for (const r of hf.requests) {
        folder.children.push(this.convertRequest(r, now));
      }
    }

    return folder;
  }

  private convertRequest(hr: HoppscotchRequest, now: string): SavedRequest {
    return {
      type: 'request',
      id: `hoppscotch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: hr.name || 'Untitled Request',
      method: (hr.method?.toUpperCase() || 'GET') as HttpMethod,
      url: hr.endpoint || '',
      params: this.convertKeyValues(hr.params),
      headers: this.convertKeyValues(hr.headers),
      auth: this.convertAuth(hr.auth),
      body: this.convertBody(hr.body),
      createdAt: now,
      updatedAt: now,
    };
  }

  private convertKeyValues(items?: Array<{ key: string; value: string; active: boolean }>): KeyValue[] {
    if (!items) return [];
    return items
      .filter(item => item.key) // Skip empty keys
      .map(item => ({
        id: `kv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        key: item.key,
        value: item.value,
        enabled: item.active !== false,
      }));
  }

  private convertAuth(auth?: HoppscotchRequest['auth']): AuthState {
    if (!auth || !auth.authType || !auth.authActive) return { type: 'none' };

    switch (auth.authType) {
      case 'basic':
        return {
          type: 'basic',
          username: auth.username || '',
          password: auth.password || '',
        };

      case 'bearer':
        return {
          type: 'bearer',
          token: auth.token || '',
        };

      case 'api-key':
        return {
          type: 'apikey',
          apiKeyName: auth.key || '',
          apiKeyValue: auth.value || '',
          apiKeyIn: auth.addTo === 'query' ? 'query' : 'header',
        };

      default:
        return { type: 'none' };
    }
  }

  private convertBody(body?: HoppscotchRequest['body']): BodyState {
    if (!body || !body.contentType || !body.body) {
      return { type: 'none', content: '' };
    }

    const contentType = body.contentType.toLowerCase();

    if (contentType.includes('application/json')) {
      return { type: 'json', content: body.body };
    }

    if (contentType.includes('application/x-www-form-urlencoded')) {
      return { type: 'x-www-form-urlencoded', content: body.body };
    }

    if (contentType.includes('multipart/form-data')) {
      return { type: 'form-data', content: body.body };
    }

    if (contentType.includes('application/graphql')) {
      return { type: 'graphql', content: body.body };
    }

    return { type: 'text', content: body.body };
  }
}
