import * as yaml from 'js-yaml';
import type { Collection, SavedRequest, Folder, KeyValue, AuthState, BodyState, HttpMethod } from '../types';
import { generateId } from '../types';

interface InsomniaResource {
  _id: string;
  _type: string;
  parentId: string;
  name?: string;
  url?: string;
  method?: string;
  body?: {
    mimeType?: string;
    text?: string;
    params?: Array<{ name: string; value: string; disabled?: boolean; type?: string }>;
  };
  headers?: Array<{ name: string; value: string; disabled?: boolean }>;
  parameters?: Array<{ name: string; value: string; disabled?: boolean }>;
  authentication?: {
    type?: string;
    token?: string;
    username?: string;
    password?: string;
    prefix?: string;
    key?: string;
    value?: string;
    addTo?: string;
    grantType?: string;
    authorizationUrl?: string;
    accessTokenUrl?: string;
    clientId?: string;
    clientSecret?: string;
    scope?: string;
  };
}

interface InsomniaExport {
  _type?: string;
  __export_format?: number;
  resources: InsomniaResource[];
}

export class InsomniaImportService {
  importFromString(content: string): { collections: Collection[] } {
    let data: InsomniaExport;
    try {
      data = JSON.parse(content);
    } catch {
      // JSON failed, try YAML (newer Insomnia exports use YAML)
      data = yaml.load(content) as InsomniaExport;
    }

    if (!data || !data.resources || !Array.isArray(data.resources)) {
      throw new Error('Invalid Insomnia export: missing resources array');
    }

    const now = new Date().toISOString();
    const resourceMap = new Map<string, InsomniaResource>();
    for (const r of data.resources) {
      resourceMap.set(r._id, r);
    }

    // Find workspaces (top-level collections)
    const workspaces = data.resources.filter(r => r._type === 'workspace');
    if (workspaces.length === 0) {
      throw new Error('No workspaces found in Insomnia export');
    }

    const collections: Collection[] = [];

    for (const ws of workspaces) {
      const collection: Collection = {
        id: generateId(),
        name: ws.name || 'Imported Collection',
        items: [],
        expanded: true,
        createdAt: now,
        updatedAt: now,
      };

      // Build children for this workspace
      collection.items = this.buildChildren(ws._id, data.resources, now);
      collections.push(collection);
    }

    return { collections };
  }

  private buildChildren(parentId: string, resources: InsomniaResource[], now: string): Array<SavedRequest | Folder> {
    const children: Array<SavedRequest | Folder> = [];

    // Find direct children
    const directChildren = resources.filter(r => r.parentId === parentId);

    for (const child of directChildren) {
      if (child._type === 'request_group') {
        // Folder
        const folder: Folder = {
          type: 'folder',
          id: generateId(),
          name: child.name || 'Folder',
          children: this.buildChildren(child._id, resources, now),
          expanded: true,
          createdAt: now,
          updatedAt: now,
        };
        children.push(folder);
      } else if (child._type === 'request') {
        children.push(this.convertRequest(child, now));
      }
    }

    return children;
  }

  private convertRequest(resource: InsomniaResource, now: string): SavedRequest {
    return {
      type: 'request',
      id: generateId(),
      name: resource.name || 'Untitled Request',
      method: (resource.method?.toUpperCase() || 'GET') as HttpMethod,
      url: resource.url || '',
      params: this.convertParams(resource.parameters),
      headers: this.convertHeaders(resource.headers),
      auth: this.convertAuth(resource.authentication),
      body: this.convertBody(resource.body),
      createdAt: now,
      updatedAt: now,
    };
  }

  private convertParams(params?: Array<{ name: string; value: string; disabled?: boolean }>): KeyValue[] {
    if (!params) return [];
    return params.map(p => ({
      id: generateId(),
      key: p.name,
      value: p.value,
      enabled: !p.disabled,
    }));
  }

  private convertHeaders(headers?: Array<{ name: string; value: string; disabled?: boolean }>): KeyValue[] {
    if (!headers) return [];
    return headers.map(h => ({
      id: generateId(),
      key: h.name,
      value: h.value,
      enabled: !h.disabled,
    }));
  }

  private convertAuth(auth?: InsomniaResource['authentication']): AuthState {
    if (!auth || !auth.type) return { type: 'none' };

    switch (auth.type) {
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

      case 'apikey':
        return {
          type: 'apikey',
          apiKeyName: auth.key || '',
          apiKeyValue: auth.value || '',
          apiKeyIn: auth.addTo === 'query' ? 'query' : 'header',
        };

      case 'oauth2':
        return {
          type: 'oauth2',
          oauth2: {
            grantType: (auth.grantType as any) || 'authorization_code',
            authUrl: auth.authorizationUrl || '',
            tokenUrl: auth.accessTokenUrl || '',
            clientId: auth.clientId || '',
            clientSecret: auth.clientSecret || '',
            scope: auth.scope || '',
          },
        };

      default:
        return { type: 'none' };
    }
  }

  private convertBody(body?: InsomniaResource['body']): BodyState {
    if (!body) return { type: 'none', content: '' };

    const mimeType = body.mimeType || '';

    if (mimeType.includes('application/json')) {
      return { type: 'json', content: body.text || '' };
    }

    if (mimeType.includes('application/x-www-form-urlencoded')) {
      if (body.params) {
        const items = body.params
          .filter(p => !p.disabled)
          .map(p => ({
            id: generateId(),
            key: p.name,
            value: p.value,
            enabled: true,
          }));
        return { type: 'x-www-form-urlencoded', content: JSON.stringify(items) };
      }
      if (body.text) {
        try {
          const parsed = new URLSearchParams(body.text);
          const items = Array.from(parsed.entries()).map(([key, value]) => ({
            id: generateId(),
            key,
            value,
            enabled: true,
          }));
          return { type: 'x-www-form-urlencoded', content: JSON.stringify(items) };
        } catch {
          return { type: 'x-www-form-urlencoded', content: '' };
        }
      }
      return { type: 'x-www-form-urlencoded', content: '' };
    }

    if (mimeType.includes('multipart/form-data')) {
      const formData = (body.params || []).map(p => ({
        id: generateId(),
        key: p.name,
        value: p.value,
        enabled: !p.disabled,
      }));
      return { type: 'form-data', content: JSON.stringify(formData) };
    }

    if (mimeType.includes('application/graphql')) {
      return { type: 'graphql', content: body.text || '' };
    }

    if (body.text) {
      return { type: 'text', content: body.text };
    }

    return { type: 'none', content: '' };
  }
}
