import * as fs from 'fs';
import type { Collection, SavedRequest, Folder, KeyValue, AuthState, BodyState, HttpMethod } from '../types';

/**
 * Thunder Client collection format (v1/v2).
 * Thunder Client stores collections in `thunder-tests/thunderCollection.json`
 * and environments in `thunder-tests/thunderEnvironment.json`.
 */

interface ThunderRequest {
  _id: string;
  colId: string;
  containerId?: string; // folder id
  name: string;
  url: string;
  method: string;
  sortNum?: number;
  created?: string;
  modified?: string;
  headers?: Array<{ name: string; value: string; isDisabled?: boolean }>;
  params?: Array<{ name: string; value: string; isDisabled?: boolean }>;
  body?: {
    type?: string; // 'json', 'text', 'xml', 'formdata', 'formencoded', 'graphql', 'binary'
    raw?: string;
    form?: Array<{ name: string; value: string; isDisabled?: boolean }>;
    graphql?: { query?: string; variables?: string };
    files?: Array<{ name: string; value: string }>;
  };
  auth?: {
    type?: string; // 'basic', 'bearer', 'oauth2', 'apikey', 'aws', 'digest', 'ntlm'
    bearer?: string;
    basic?: { username: string; password: string };
    oauth2?: {
      grantType?: string;
      authUrl?: string;
      tokenUrl?: string;
      clientId?: string;
      clientSecret?: string;
      scope?: string;
    };
    apikey?: { key: string; value: string; addTo?: string };
    aws?: { accessKey?: string; secretKey?: string; region?: string; service?: string; sessionToken?: string };
  };
  tests?: any[];
}

interface ThunderFolder {
  _id: string;
  name: string;
  containerId?: string;
  colId: string;
  sortNum?: number;
  created?: string;
  modified?: string;
}

interface ThunderCollection {
  _id: string;
  colName: string;
  created?: string;
  modified?: string;
  sortNum?: number;
  folders?: ThunderFolder[];
  requests?: ThunderRequest[];
  // Alternative: some versions store as flat arrays
}

interface ThunderEnvironment {
  _id: string;
  name: string;
  default?: boolean;
  data?: Array<{ name: string; value: string; isDisabled?: boolean }>;
}

export class ThunderClientImportService {
  async importFromFile(filePath: string): Promise<{ collections: Collection[] }> {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return this.importFromString(content);
  }

  /**
   * Import from the combined JSON format (array of collections or single collection).
   * Thunder Client can export as a single JSON file with collections, folders, and requests.
   */
  importFromString(content: string): { collections: Collection[] } {
    const parsed = JSON.parse(content);

    // Handle array of collections
    if (Array.isArray(parsed)) {
      return { collections: parsed.map(c => this.convertCollection(c)) };
    }

    // Handle single collection
    if (parsed.colName || parsed._id) {
      return { collections: [this.convertCollection(parsed)] };
    }

    // Handle the flat file format: { client, collections, folders, requests }
    if (parsed.collections && Array.isArray(parsed.collections)) {
      return this.importFlatFormat(parsed);
    }

    throw new Error('Unrecognized Thunder Client format');
  }

  /**
   * Import from Thunder Client's folder-based format.
   * Expects separate arrays for collections, folders, and requests.
   */
  async importFromFolder(folderPath: string): Promise<{ collections: Collection[] }> {
    const collectionPath = `${folderPath}/thunderCollection.json`;
    const requestPath = `${folderPath}/thunderRequestCollection.json`;

    if (!fs.existsSync(collectionPath)) {
      throw new Error(`Thunder Client collection file not found: ${collectionPath}`);
    }

    const collections: ThunderCollection[] = JSON.parse(
      await fs.promises.readFile(collectionPath, 'utf-8')
    );

    let requests: ThunderRequest[] = [];
    if (fs.existsSync(requestPath)) {
      requests = JSON.parse(
        await fs.promises.readFile(requestPath, 'utf-8')
      );
    }

    // Build folder lookup from collections that have embedded folders
    const allFolders: ThunderFolder[] = [];
    for (const col of collections) {
      if (col.folders) {
        allFolders.push(...col.folders);
      }
    }

    return {
      collections: collections.map(col => {
        const colRequests = requests.filter(r => r.colId === col._id);
        const colFolders = allFolders.filter(f => f.colId === col._id);
        return this.buildCollection(col, colFolders, colRequests);
      }),
    };
  }

  private importFlatFormat(data: {
    collections: ThunderCollection[];
    folders?: ThunderFolder[];
    requests?: ThunderRequest[];
  }): { collections: Collection[] } {
    const folders = data.folders || [];
    const requests = data.requests || [];

    return {
      collections: data.collections.map(col => {
        const colFolders = folders.filter(f => f.colId === col._id);
        const colRequests = requests.filter(r => r.colId === col._id);
        return this.buildCollection(col, colFolders, colRequests);
      }),
    };
  }

  private convertCollection(col: ThunderCollection): Collection {
    const folders = col.folders || [];
    const requests = col.requests || [];
    return this.buildCollection(col, folders, requests);
  }

  private buildCollection(
    col: ThunderCollection,
    folders: ThunderFolder[],
    requests: ThunderRequest[]
  ): Collection {
    const now = new Date().toISOString();

    // Build folder map for nesting
    const folderMap = new Map<string, Folder>();
    for (const f of folders) {
      folderMap.set(f._id, {
        type: 'folder',
        id: f._id,
        name: f.name,
        children: [],
        expanded: true,
        createdAt: f.created || now,
        updatedAt: f.modified || now,
      });
    }

    // Convert requests
    const requestMap = new Map<string, SavedRequest>();
    for (const r of requests) {
      const converted = this.convertRequest(r);
      requestMap.set(r._id, converted);
    }

    // Build tree: assign requests and folders to their parents
    const rootItems: (SavedRequest | Folder)[] = [];

    // Place requests into folders or root
    for (const r of requests) {
      const converted = requestMap.get(r._id)!;
      if (r.containerId && folderMap.has(r.containerId)) {
        folderMap.get(r.containerId)!.children.push(converted);
      } else {
        rootItems.push(converted);
      }
    }

    // Place sub-folders into parent folders or root
    for (const f of folders) {
      const folder = folderMap.get(f._id)!;
      if (f.containerId && folderMap.has(f.containerId)) {
        folderMap.get(f.containerId)!.children.push(folder);
      } else {
        rootItems.push(folder);
      }
    }

    return {
      id: col._id || `tc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: col.colName || 'Thunder Client Collection',
      items: rootItems,
      expanded: true,
      createdAt: col.created || now,
      updatedAt: col.modified || now,
    };
  }

  private convertRequest(r: ThunderRequest): SavedRequest {
    const now = new Date().toISOString();
    return {
      type: 'request',
      id: r._id || `tc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: r.name || `${r.method || 'GET'} Request`,
      method: (r.method?.toUpperCase() || 'GET') as HttpMethod,
      url: r.url || '',
      params: this.convertParams(r.params),
      headers: this.convertHeaders(r.headers),
      auth: this.convertAuth(r.auth),
      body: this.convertBody(r.body),
      createdAt: r.created || now,
      updatedAt: r.modified || now,
    };
  }

  private convertParams(params?: Array<{ name: string; value: string; isDisabled?: boolean }>): KeyValue[] {
    if (!params) return [];
    return params.map((p, i) => ({
      id: `p-${i}`,
      key: p.name,
      value: p.value,
      enabled: !p.isDisabled,
    }));
  }

  private convertHeaders(headers?: Array<{ name: string; value: string; isDisabled?: boolean }>): KeyValue[] {
    if (!headers) return [];
    return headers.map((h, i) => ({
      id: `h-${i}`,
      key: h.name,
      value: h.value,
      enabled: !h.isDisabled,
    }));
  }

  private convertAuth(auth?: ThunderRequest['auth']): AuthState {
    if (!auth || !auth.type) return { type: 'none' };

    switch (auth.type) {
      case 'bearer':
        return { type: 'bearer', token: auth.bearer || '' };
      case 'basic':
        return {
          type: 'basic',
          username: auth.basic?.username || '',
          password: auth.basic?.password || '',
        };
      case 'oauth2':
        return {
          type: 'oauth2',
          oauth2: {
            grantType: (auth.oauth2?.grantType as any) || 'authorization_code',
            authUrl: auth.oauth2?.authUrl,
            tokenUrl: auth.oauth2?.tokenUrl,
            clientId: auth.oauth2?.clientId || '',
            clientSecret: auth.oauth2?.clientSecret,
            scope: auth.oauth2?.scope,
          },
        };
      case 'apikey':
        return {
          type: 'apikey',
          apiKeyName: auth.apikey?.key || '',
          apiKeyValue: auth.apikey?.value || '',
          apiKeyIn: auth.apikey?.addTo === 'queryparams' ? 'query' : 'header',
        };
      case 'aws':
        return {
          type: 'aws',
          awsAccessKey: auth.aws?.accessKey || '',
          awsSecretKey: auth.aws?.secretKey || '',
          awsRegion: auth.aws?.region || 'us-east-1',
          awsService: auth.aws?.service || 's3',
          awsSessionToken: auth.aws?.sessionToken || '',
        };
      default:
        return { type: 'none' };
    }
  }

  private convertBody(body?: ThunderRequest['body']): BodyState {
    if (!body || !body.type) return { type: 'none', content: '' };

    switch (body.type) {
      case 'json':
        return { type: 'json', content: body.raw || '' };
      case 'text':
      case 'xml':
        return { type: 'text', content: body.raw || '' };
      case 'formencoded':
        if (body.form) {
          const items = body.form.map((f, i) => ({
            id: `f-${i}`,
            key: f.name,
            value: f.value,
            enabled: !f.isDisabled,
          }));
          return { type: 'x-www-form-urlencoded', content: JSON.stringify(items) };
        }
        return { type: 'x-www-form-urlencoded', content: body.raw || '' };
      case 'formdata':
        if (body.form) {
          const items = body.form.map((f, i) => ({
            id: `f-${i}`,
            key: f.name,
            value: f.value,
            enabled: !f.isDisabled,
            fieldType: 'text',
          }));
          return { type: 'form-data', content: JSON.stringify(items) };
        }
        return { type: 'form-data', content: '[]' };
      case 'graphql':
        return {
          type: 'graphql',
          content: body.graphql?.query || body.raw || '',
          graphqlVariables: body.graphql?.variables || '',
        };
      default:
        return { type: 'text', content: body.raw || '' };
    }
  }
}
