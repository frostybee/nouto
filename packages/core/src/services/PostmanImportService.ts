import type {
  Collection, CollectionItem, SavedRequest, Folder, KeyValue,
  AuthState, BodyState, HttpMethod, Environment, EnvironmentVariable,
} from '../types';
import { generateId } from '../types';

// --- Postman types ---

interface PostmanCollection {
  info: { name: string; _postman_id?: string; description?: string; schema: string };
  item: PostmanItem[];
  variable?: PostmanVariable[];
  auth?: PostmanAuth;
  header?: PostmanHeader[];
}

interface PostmanItem {
  name: string;
  id?: string;
  item?: PostmanItem[];
  request?: PostmanRequest;
  response?: PostmanResponse[];
  auth?: PostmanAuth;
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
  options?: { raw?: { language?: 'json' | 'text' | 'xml' | 'html' | 'javascript' } };
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

// --- Service ---

export class PostmanImportService {

  importFromString(content: string): { collection: Collection; variables?: Environment } {
    const postmanData = JSON.parse(content) as PostmanCollection;

    if (!postmanData.info || !postmanData.item) {
      throw new Error('Invalid Postman collection format');
    }

    const schema = postmanData.info.schema || '';
    if (!schema.includes('v2.1') && !schema.includes('v2.0')) {
      console.warn('Postman collection schema may not be fully compatible:', schema);
    }

    const collection = this.convertPostmanToNouto(postmanData);

    let variables: Environment | undefined;
    if (postmanData.variable && postmanData.variable.length > 0) {
      variables = this.convertPostmanVariables(postmanData.info.name, postmanData.variable);
    }

    return { collection, variables };
  }

  private convertPostmanToNouto(postman: PostmanCollection): Collection {
    const now = new Date().toISOString();

    const collection: Collection = {
      id: generateId(),
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
      if (item.item && !item.request) {
        return this.convertPostmanFolder(item);
      }
      return this.convertPostmanRequest(item);
    });
  }

  private convertPostmanFolder(item: PostmanItem): Folder {
    const now = new Date().toISOString();

    const folder: Folder = {
      type: 'folder',
      id: item.id || generateId(),
      name: item.name || 'Unnamed Folder',
      children: item.item ? this.convertPostmanItems(item.item) : [],
      expanded: true,
      createdAt: now,
      updatedAt: now,
    };

    if (item.auth && item.auth.type !== 'noauth') {
      folder.auth = this.convertPostmanAuth(item.auth);
    }

    return folder;
  }

  private convertPostmanRequest(item: PostmanItem): SavedRequest {
    const now = new Date().toISOString();
    const request = item.request;

    if (!request) {
      return {
        type: 'request',
        id: item.id || generateId(),
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
      id: item.id || generateId(),
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
      if (typeof url === 'string' && url.includes('?')) {
        const queryString = url.split('?')[1];
        return this.parseQueryString(queryString);
      }
      return [];
    }

    if (!url.query) return [];

    return url.query.map(param => ({
      id: generateId(),
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
        id: generateId(),
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
      id: generateId(),
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
      id: generateId(),
      name: name,
      variables: variables.map(v => ({
        key: v.key || '',
        value: v.value || '',
        enabled: !v.disabled,
      })),
    };
  }
}
