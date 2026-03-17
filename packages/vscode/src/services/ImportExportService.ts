import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import type {
  Collection,
  CollectionItem,
  SavedRequest,
  Folder,
  KeyValue,
  AuthState,
  BodyState,
  HttpMethod,
  Environment,
  EnvironmentVariable,
} from './types';
import { isFolder, isRequest } from './types';

// ============================================
// Postman v2.1 Types
// ============================================

interface PostmanCollection {
  info: {
    name: string;
    _postman_id?: string;
    description?: string;
    schema: string;
  };
  item: PostmanItem[];
  variable?: PostmanVariable[];
  auth?: PostmanAuth;
  header?: PostmanHeader[];
}

interface PostmanItem {
  name: string;
  id?: string;
  item?: PostmanItem[]; // Folder with nested items
  request?: PostmanRequest; // Request item
  response?: PostmanResponse[];
  auth?: PostmanAuth; // Folder-level auth (Postman v2.1)
}

interface PostmanRequest {
  method: string;
  header?: PostmanHeader[];
  url: PostmanUrl | string;
  auth?: PostmanAuth;
  body?: PostmanBody;
  description?: string;
}

interface PostmanUrl {
  raw?: string;
  protocol?: string;
  host?: string[];
  port?: string;
  path?: string[];
  query?: PostmanQueryParam[];
}

interface PostmanHeader {
  key: string;
  value: string;
  disabled?: boolean;
  description?: string;
}

interface PostmanQueryParam {
  key: string;
  value: string;
  disabled?: boolean;
  description?: string;
}

interface PostmanBody {
  mode: 'raw' | 'urlencoded' | 'formdata' | 'file' | 'graphql' | 'none';
  raw?: string;
  urlencoded?: PostmanFormParam[];
  formdata?: PostmanFormParam[];
  options?: {
    raw?: {
      language?: 'json' | 'text' | 'xml' | 'html' | 'javascript';
    };
  };
}

interface PostmanFormParam {
  key: string;
  value: string;
  disabled?: boolean;
  type?: 'text' | 'file';
  description?: string;
}

interface PostmanAuth {
  type: 'noauth' | 'basic' | 'bearer' | 'apikey' | 'oauth2' | 'digest' | 'hawk' | 'aws' | 'ntlm';
  basic?: { key: string; value: string }[];
  bearer?: { key: string; value: string }[];
  apikey?: { key: string; value: string }[];
}

interface PostmanVariable {
  key: string;
  value: string;
  type?: string;
  disabled?: boolean;
}

interface PostmanResponse {
  name?: string;
  originalRequest?: PostmanRequest;
  status?: string;
  code?: number;
  body?: string;
  header?: PostmanHeader[];
}

// ============================================
// Import/Export Service
// ============================================

export class ImportExportService {
  /**
   * Import a Postman collection from a file
   */
  async importPostmanCollection(uri: vscode.Uri): Promise<{
    collection: Collection;
    variables?: Environment;
  }> {
    const content = await fs.readFile(uri.fsPath, 'utf8');
    const postmanData = JSON.parse(content) as PostmanCollection;

    // Validate it's a Postman collection
    if (!postmanData.info || !postmanData.item) {
      throw new Error('Invalid Postman collection format');
    }

    // Check schema version
    const schema = postmanData.info.schema || '';
    if (!schema.includes('v2.1') && !schema.includes('v2.0')) {
      // Still try to import, but warn
      console.warn('Postman collection schema may not be fully compatible:', schema);
    }

    const collection = this.convertPostmanToNouto(postmanData);

    // Convert collection variables to environment if present
    let variables: Environment | undefined;
    if (postmanData.variable && postmanData.variable.length > 0) {
      variables = this.convertPostmanVariables(postmanData.info.name, postmanData.variable);
    }

    return { collection, variables };
  }

  /**
   * Export a Nouto collection to Postman format
   */
  async exportToPostman(collection: Collection): Promise<PostmanCollection> {
    const result: PostmanCollection = {
      info: {
        name: collection.name,
        _postman_id: collection.id,
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      },
      item: this.convertToPostmanItems(collection.items),
    };

    // Export collection-level auth
    if (collection.auth && collection.auth.type !== 'none') {
      result.auth = this.convertAuthToPostman(collection.auth);
    }

    // Export collection-level headers
    if (collection.headers && collection.headers.length > 0) {
      result.header = this.convertHeadersToPostman(collection.headers);
    }

    // Export collection-level variables
    if (collection.variables && collection.variables.length > 0) {
      result.variable = collection.variables.map(v => ({
        key: v.key,
        value: v.value,
        disabled: !v.enabled,
      }));
    }

    return result;
  }

  /**
   * Export and save a collection to a file
   */
  async exportToFile(collection: Collection, uri: vscode.Uri): Promise<void> {
    const postmanCollection = await this.exportToPostman(collection);
    const content = JSON.stringify(postmanCollection, null, 2);
    await fs.writeFile(uri.fsPath, content, 'utf8');
  }

  // ============================================
  // Postman -> Nouto Converters
  // ============================================

  private convertPostmanToNouto(postman: PostmanCollection): Collection {
    const now = new Date().toISOString();

    const collection: Collection = {
      id: this.generateId(),
      name: postman.info.name || 'Imported Collection',
      items: this.convertPostmanItems(postman.item),
      expanded: true,
      createdAt: now,
      updatedAt: now,
    };

    if (postman.auth && postman.auth.type !== 'noauth') {
      collection.auth = this.convertPostmanAuth(postman.auth);
    }

    if (postman.header && postman.header.length > 0) {
      collection.headers = this.convertPostmanHeaders(postman.header);
    }

    return collection;
  }

  private convertPostmanItems(items: PostmanItem[]): CollectionItem[] {
    return items.map(item => {
      // Check if it's a folder (has nested items without a request)
      if (item.item && !item.request) {
        return this.convertPostmanFolder(item);
      }
      // It's a request
      return this.convertPostmanRequest(item);
    });
  }

  private convertPostmanFolder(item: PostmanItem): Folder {
    const now = new Date().toISOString();

    return {
      type: 'folder',
      id: item.id || this.generateId(),
      name: item.name || 'Unnamed Folder',
      children: item.item ? this.convertPostmanItems(item.item) : [],
      expanded: true,
      createdAt: now,
      updatedAt: now,
    };
  }

  private convertPostmanRequest(item: PostmanItem): SavedRequest {
    const now = new Date().toISOString();
    const request = item.request;

    if (!request) {
      // Empty request placeholder
      return {
        type: 'request',
        id: item.id || this.generateId(),
        name: item.name || 'Unnamed Request',
        method: 'GET',
        url: '',
        params: [],
        headers: [],
        auth: { type: 'none' },
        body: { type: 'none', content: '' },
        createdAt: now,
        updatedAt: now,
      };
    }

    return {
      type: 'request',
      id: item.id || this.generateId(),
      name: item.name || 'Unnamed Request',
      method: this.normalizeMethod(request.method),
      url: this.extractUrl(request.url),
      params: this.convertPostmanQuery(request.url),
      headers: this.convertPostmanHeaders(request.header),
      auth: this.convertPostmanAuth(request.auth),
      body: this.convertPostmanBody(request.body),
      description: request.description,
      createdAt: now,
      updatedAt: now,
    };
  }

  private normalizeMethod(method: string): HttpMethod {
    return (method || 'GET').toUpperCase();
  }

  private extractUrl(url: PostmanUrl | string | undefined): string {
    if (!url) return '';

    if (typeof url === 'string') {
      return url;
    }

    if (url.raw) {
      // Remove query string from raw URL (we handle params separately)
      const rawUrl = url.raw;
      const queryIndex = rawUrl.indexOf('?');
      return queryIndex >= 0 ? rawUrl.substring(0, queryIndex) : rawUrl;
    }

    // Build URL from parts
    let result = '';
    if (url.protocol) {
      result += url.protocol + '://';
    }
    if (url.host) {
      result += Array.isArray(url.host) ? url.host.join('.') : url.host;
    }
    if (url.port) {
      result += ':' + url.port;
    }
    if (url.path) {
      const pathStr = Array.isArray(url.path) ? url.path.join('/') : url.path;
      result += '/' + pathStr;
    }

    return result;
  }

  private convertPostmanQuery(url: PostmanUrl | string | undefined): KeyValue[] {
    if (!url || typeof url === 'string') {
      // Try to parse query from string URL
      if (typeof url === 'string' && url.includes('?')) {
        const queryString = url.split('?')[1];
        return this.parseQueryString(queryString);
      }
      return [];
    }

    if (!url.query) return [];

    return url.query.map(param => ({
      id: this.generateId(),
      key: param.key || '',
      value: param.value || '',
      enabled: !param.disabled,
    }));
  }

  private parseQueryString(queryString: string): KeyValue[] {
    if (!queryString) return [];

    const params = new URLSearchParams(queryString);
    const result: KeyValue[] = [];

    params.forEach((value, key) => {
      result.push({
        id: this.generateId(),
        key,
        value,
        enabled: true,
      });
    });

    return result;
  }

  private convertPostmanHeaders(headers: PostmanHeader[] | undefined): KeyValue[] {
    if (!headers) return [];

    return headers.map(header => ({
      id: this.generateId(),
      key: header.key || '',
      value: header.value || '',
      enabled: !header.disabled,
    }));
  }

  private convertPostmanAuth(auth: PostmanAuth | undefined): AuthState {
    if (!auth || auth.type === 'noauth') {
      return { type: 'none' };
    }

    switch (auth.type) {
      case 'basic': {
        const username = auth.basic?.find(p => p.key === 'username')?.value || '';
        const password = auth.basic?.find(p => p.key === 'password')?.value || '';
        return { type: 'basic', username, password };
      }
      case 'bearer': {
        const token = auth.bearer?.find(p => p.key === 'token')?.value || '';
        return { type: 'bearer', token };
      }
      case 'apikey': {
        const apiKeyName = auth.apikey?.find(p => p.key === 'key')?.value || '';
        const apiKeyValue = auth.apikey?.find(p => p.key === 'value')?.value || '';
        const apiKeyIn = (auth.apikey?.find(p => p.key === 'in')?.value || 'header') as 'header' | 'query';
        return { type: 'apikey', apiKeyName, apiKeyValue, apiKeyIn };
      }
      case 'oauth2': {
        // Map Postman OAuth2 config to Nouto format
        const oauth2Params = (auth as any).oauth2 || [];
        const getVal = (key: string) => oauth2Params.find?.((p: any) => p.key === key)?.value || '';
        return {
          type: 'oauth2',
          oauth2: {
            grantType: (getVal('grant_type') || 'authorization_code') as any,
            authUrl: getVal('authUrl') || getVal('auth_url'),
            tokenUrl: getVal('accessTokenUrl') || getVal('token_url'),
            clientId: getVal('clientId') || getVal('client_id'),
            clientSecret: getVal('clientSecret') || getVal('client_secret'),
            scope: getVal('scope'),
          },
        };
      }
      default:
        // Unsupported auth types fall back to none
        return { type: 'none' };
    }
  }

  private convertPostmanBody(body: PostmanBody | undefined): BodyState {
    if (!body || body.mode === 'none') {
      return { type: 'none', content: '' };
    }

    switch (body.mode) {
      case 'raw': {
        const language = body.options?.raw?.language;
        const type = language === 'json' ? 'json' : 'text';
        return { type, content: body.raw || '' };
      }
      case 'urlencoded': {
        const params = body.urlencoded || [];
        const content = params
          .filter(p => !p.disabled)
          .map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
          .join('&');
        return { type: 'x-www-form-urlencoded', content };
      }
      case 'formdata': {
        // Convert form-data to JSON array with fieldType support
        const formParams = body.formdata || [];
        const formItems = formParams
          .filter(p => !p.disabled)
          .map(p => ({
            key: p.key,
            value: p.value,
            enabled: true,
            fieldType: p.type === 'file' ? 'file' : 'text',
          }));
        return { type: 'form-data', content: JSON.stringify(formItems) };
      }
      case 'graphql': {
        const graphqlBody = body as any;
        const query = graphqlBody.graphql?.query || '';
        const variables = graphqlBody.graphql?.variables || '';
        return {
          type: 'graphql',
          content: query,
          graphqlVariables: variables,
        };
      }
      case 'file': {
        return { type: 'binary', content: '' };
      }
      default:
        return { type: 'none', content: '' };
    }
  }

  private convertPostmanVariables(name: string, variables: PostmanVariable[]): Environment {
    return {
      id: this.generateId(),
      name: `${name} Variables`,
      variables: variables.map(v => ({
        key: v.key || '',
        value: v.value || '',
        enabled: !v.disabled,
      })),
    };
  }

  // ============================================
  // Nouto -> Postman Converters
  // ============================================

  private convertToPostmanItems(items: CollectionItem[]): PostmanItem[] {
    return items.map(item => {
      if (isFolder(item)) {
        return this.convertFolderToPostman(item);
      }
      return this.convertRequestToPostman(item);
    });
  }

  private convertFolderToPostman(folder: Folder): PostmanItem {
    const result: PostmanItem = {
      name: folder.name,
      id: folder.id,
      item: this.convertToPostmanItems(folder.children),
    };

    // Export folder-level auth (Postman v2.1 supports folder auth)
    if (folder.auth && folder.auth.type !== 'none') {
      result.auth = this.convertAuthToPostman(folder.auth);
    }

    return result;
  }

  private convertRequestToPostman(request: SavedRequest): PostmanItem {
    return {
      name: request.name,
      id: request.id,
      request: {
        method: request.method,
        url: this.convertUrlToPostman(request.url, request.params),
        header: this.convertHeadersToPostman(request.headers),
        auth: this.convertAuthToPostman(request.auth),
        body: this.convertBodyToPostman(request.body),
        description: request.description,
      },
    };
  }

  private convertUrlToPostman(url: string, params: KeyValue[]): PostmanUrl {
    const enabledParams = params.filter(p => p.enabled);
    const queryString = enabledParams.length > 0
      ? '?' + enabledParams.map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&')
      : '';

    return {
      raw: url + queryString,
      query: params.map(p => ({
        key: p.key,
        value: p.value,
        disabled: !p.enabled,
      })),
    };
  }

  private convertHeadersToPostman(headers: KeyValue[]): PostmanHeader[] {
    return headers.map(h => ({
      key: h.key,
      value: h.value,
      disabled: !h.enabled,
    }));
  }

  private convertAuthToPostman(auth: AuthState): PostmanAuth {
    switch (auth.type) {
      case 'basic':
        return {
          type: 'basic',
          basic: [
            { key: 'username', value: auth.username || '' },
            { key: 'password', value: auth.password || '' },
          ],
        };
      case 'bearer':
        return {
          type: 'bearer',
          bearer: [{ key: 'token', value: auth.token || '' }],
        };
      case 'apikey':
        return {
          type: 'apikey',
          apikey: [
            { key: 'key', value: auth.apiKeyName || '' },
            { key: 'value', value: auth.apiKeyValue || '' },
            { key: 'in', value: auth.apiKeyIn || 'header' },
          ],
        };
      case 'oauth2':
        return {
          type: 'oauth2',
          ...(auth.oauth2 ? {
            oauth2: [
              { key: 'grant_type', value: auth.oauth2.grantType || 'authorization_code' },
              { key: 'authUrl', value: auth.oauth2.authUrl || '' },
              { key: 'accessTokenUrl', value: auth.oauth2.tokenUrl || '' },
              { key: 'clientId', value: auth.oauth2.clientId || '' },
              { key: 'clientSecret', value: auth.oauth2.clientSecret || '' },
              { key: 'scope', value: auth.oauth2.scope || '' },
            ],
          } : {}),
        } as PostmanAuth;
      default:
        return { type: 'noauth' };
    }
  }

  private convertBodyToPostman(body: BodyState): PostmanBody {
    switch (body.type) {
      case 'json':
        return {
          mode: 'raw',
          raw: body.content,
          options: { raw: { language: 'json' } },
        };
      case 'text':
        return {
          mode: 'raw',
          raw: body.content,
          options: { raw: { language: 'text' } },
        };
      case 'x-www-form-urlencoded': {
        const params = this.parseUrlEncodedBody(body.content);
        return {
          mode: 'urlencoded',
          urlencoded: params,
        };
      }
      case 'form-data': {
        const formParams = this.parseFormDataBody(body.content);
        return {
          mode: 'formdata',
          formdata: formParams,
        };
      }
      case 'binary':
        return { mode: 'file' };
      case 'graphql':
        return {
          mode: 'graphql',
          graphql: {
            query: body.content,
            variables: body.graphqlVariables || '',
          },
        } as any;
      default:
        return { mode: 'none' };
    }
  }

  private parseUrlEncodedBody(content: string): PostmanFormParam[] {
    if (!content) return [];

    const params = new URLSearchParams(content);
    const result: PostmanFormParam[] = [];

    params.forEach((value, key) => {
      result.push({ key, value, type: 'text' });
    });

    return result;
  }

  private parseFormDataBody(content: string): PostmanFormParam[] {
    if (!content) return [];

    try {
      const data = JSON.parse(content);
      // Handle new array format with fieldType
      if (Array.isArray(data)) {
        return data
          .filter((item: any) => item.enabled !== false)
          .map((item: any) => ({
            key: item.key || '',
            value: item.value || '',
            type: (item.fieldType === 'file' ? 'file' : 'text') as 'text' | 'file',
          }));
      }
      // Legacy object format
      return Object.entries(data).map(([key, value]) => ({
        key,
        value: String(value),
        type: 'text' as const,
      }));
    } catch {
      return [];
    }
  }

  // ============================================
  // Utility
  // ============================================

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
