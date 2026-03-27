import { HoppscotchImportService } from './HoppscotchImportService';
import type { Folder, SavedRequest } from '../types';
import { isFolder, isRequest } from '../types';

const service = new HoppscotchImportService();

describe('HoppscotchImportService', () => {
  it('should import a basic collection with requests', () => {
    const json = JSON.stringify({
      v: 2,
      name: 'My Collection',
      folders: [],
      requests: [
        {
          v: '4',
          name: 'Get Users',
          endpoint: 'https://api.example.com/users',
          method: 'GET',
          headers: [{ key: 'Accept', value: 'application/json', active: true }],
          params: [{ key: 'page', value: '1', active: true }],
          body: { contentType: null, body: null },
          auth: { authType: 'none', authActive: false },
        },
      ],
    });

    const result = service.importFromString(json);
    expect(result.collections).toHaveLength(1);
    expect(result.collections[0].name).toBe('My Collection');
    expect(result.collections[0].items).toHaveLength(1);

    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.name).toBe('Get Users');
    expect(req.method).toBe('GET');
    expect(req.url).toBe('https://api.example.com/users');
    expect(req.headers).toHaveLength(1);
    expect(req.params).toHaveLength(1);
  });

  it('should import nested folders', () => {
    const json = JSON.stringify({
      v: 2,
      name: 'API',
      folders: [
        {
          v: 2,
          name: 'Auth',
          folders: [],
          requests: [
            {
              name: 'Login',
              endpoint: '/login',
              method: 'POST',
              headers: [],
              params: [],
              body: { contentType: 'application/json', body: '{"user":"admin"}' },
              auth: { authType: 'none', authActive: false },
            },
          ],
        },
      ],
      requests: [
        {
          name: 'Health',
          endpoint: '/health',
          method: 'GET',
          headers: [],
          params: [],
          body: { contentType: null, body: null },
          auth: { authType: 'none', authActive: false },
        },
      ],
    });

    const result = service.importFromString(json);
    expect(result.collections[0].items).toHaveLength(2);

    const folder = result.collections[0].items[0] as Folder;
    expect(isFolder(folder)).toBe(true);
    expect(folder.name).toBe('Auth');
    expect(folder.children).toHaveLength(1);

    const rootReq = result.collections[0].items[1] as SavedRequest;
    expect(rootReq.name).toBe('Health');
  });

  it('should convert bearer auth', () => {
    const json = JSON.stringify({
      name: 'API',
      folders: [],
      requests: [
        {
          name: 'Protected',
          endpoint: '/api',
          method: 'GET',
          headers: [],
          params: [],
          body: { contentType: null, body: null },
          auth: { authType: 'bearer', authActive: true, token: 'my-token' },
        },
      ],
    });

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.auth.type).toBe('bearer');
    expect(req.auth.token).toBe('my-token');
  });

  it('should convert basic auth', () => {
    const json = JSON.stringify({
      name: 'API',
      folders: [],
      requests: [
        {
          name: 'Basic',
          endpoint: '/api',
          method: 'GET',
          headers: [],
          params: [],
          body: { contentType: null, body: null },
          auth: { authType: 'basic', authActive: true, username: 'user', password: 'pass' },
        },
      ],
    });

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.auth.type).toBe('basic');
    expect(req.auth.username).toBe('user');
    expect(req.auth.password).toBe('pass');
  });

  it('should convert JSON body', () => {
    const json = JSON.stringify({
      name: 'API',
      folders: [],
      requests: [
        {
          name: 'Post',
          endpoint: '/data',
          method: 'POST',
          headers: [],
          params: [],
          body: { contentType: 'application/json', body: '{"key":"value"}' },
          auth: { authType: 'none', authActive: false },
        },
      ],
    });

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.body.type).toBe('json');
    expect(req.body.content).toBe('{"key":"value"}');
  });

  it('should handle an array of collections', () => {
    const json = JSON.stringify([
      { name: 'Collection 1', folders: [], requests: [] },
      { name: 'Collection 2', folders: [], requests: [] },
    ]);

    const result = service.importFromString(json);
    expect(result.collections).toHaveLength(2);
    expect(result.collections[0].name).toBe('Collection 1');
    expect(result.collections[1].name).toBe('Collection 2');
  });

  it('should skip headers with empty keys', () => {
    const json = JSON.stringify({
      name: 'API',
      folders: [],
      requests: [
        {
          name: 'Test',
          endpoint: '/test',
          method: 'GET',
          headers: [
            { key: 'Valid', value: 'yes', active: true },
            { key: '', value: 'no', active: true },
          ],
          params: [],
          body: { contentType: null, body: null },
          auth: { authType: 'none', authActive: false },
        },
      ],
    });

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.headers).toHaveLength(1);
    expect(req.headers[0].key).toBe('Valid');
  });

  it('should handle inactive auth', () => {
    const json = JSON.stringify({
      name: 'API',
      folders: [],
      requests: [
        {
          name: 'No Auth',
          endpoint: '/api',
          method: 'GET',
          headers: [],
          params: [],
          body: { contentType: null, body: null },
          auth: { authType: 'bearer', authActive: false, token: 'unused' },
        },
      ],
    });

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    // Auth config is preserved even when inactive (authActive: false)
    expect(req.auth.type).toBe('bearer');
    expect((req.auth as any).token).toBe('unused');
  });

  // ============================================
  // Additional branch coverage tests
  // ============================================

  it('should handle deeply nested sub-folders', () => {
    const json = JSON.stringify({
      name: 'API',
      folders: [
        {
          name: 'Level 1',
          folders: [
            {
              name: 'Level 2',
              folders: [
                {
                  name: 'Level 3',
                  folders: [],
                  requests: [
                    {
                      name: 'Deep Request',
                      endpoint: '/deep',
                      method: 'GET',
                      headers: [],
                      params: [],
                      body: { contentType: null, body: null },
                      auth: { authType: 'none', authActive: false },
                    },
                  ],
                },
              ],
              requests: [],
            },
          ],
          requests: [
            {
              name: 'Level 1 Request',
              endpoint: '/l1',
              method: 'GET',
              headers: [],
              params: [],
              body: { contentType: null, body: null },
              auth: { authType: 'none', authActive: false },
            },
          ],
        },
      ],
      requests: [],
    });

    const result = service.importFromString(json);
    const level1 = result.collections[0].items[0] as Folder;
    expect(isFolder(level1)).toBe(true);
    expect(level1.name).toBe('Level 1');
    expect(level1.children).toHaveLength(2); // Level 2 folder + Level 1 Request

    const level2 = level1.children[0] as Folder;
    expect(isFolder(level2)).toBe(true);
    expect(level2.name).toBe('Level 2');

    const level3 = level2.children[0] as Folder;
    expect(isFolder(level3)).toBe(true);
    expect(level3.name).toBe('Level 3');
    expect(level3.children).toHaveLength(1);

    const deepReq = level3.children[0] as SavedRequest;
    expect(deepReq.name).toBe('Deep Request');
  });

  it('should convert api-key auth', () => {
    const json = JSON.stringify({
      name: 'API',
      folders: [],
      requests: [
        {
          name: 'API Key',
          endpoint: '/api',
          method: 'GET',
          headers: [],
          params: [],
          body: { contentType: null, body: null },
          auth: { authType: 'api-key', authActive: true, key: 'X-API-Key', value: 'secret123', addTo: 'header' },
        },
      ],
    });

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.auth.type).toBe('apikey');
    expect(req.auth.apiKeyName).toBe('X-API-Key');
    expect(req.auth.apiKeyValue).toBe('secret123');
    expect(req.auth.apiKeyIn).toBe('header');
  });

  it('should convert api-key auth with addTo query', () => {
    const json = JSON.stringify({
      name: 'API',
      folders: [],
      requests: [
        {
          name: 'API Key Query',
          endpoint: '/api',
          method: 'GET',
          headers: [],
          params: [],
          body: { contentType: null, body: null },
          auth: { authType: 'api-key', authActive: true, key: 'api_key', value: 'val', addTo: 'query' },
        },
      ],
    });

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.auth.type).toBe('apikey');
    expect(req.auth.apiKeyIn).toBe('query');
  });

  it('should fallback unsupported auth types to none', () => {
    const json = JSON.stringify({
      name: 'API',
      folders: [],
      requests: [
        {
          name: 'Unknown Auth',
          endpoint: '/api',
          method: 'GET',
          headers: [],
          params: [],
          body: { contentType: null, body: null },
          auth: { authType: 'digest', authActive: true },
        },
      ],
    });

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.auth.type).toBe('none');
  });

  it('should convert form-urlencoded body', () => {
    const json = JSON.stringify({
      name: 'API',
      folders: [],
      requests: [
        {
          name: 'Form',
          endpoint: '/form',
          method: 'POST',
          headers: [],
          params: [],
          body: { contentType: 'application/x-www-form-urlencoded', body: 'key1=val1&key2=val2' },
          auth: { authType: 'none', authActive: false },
        },
      ],
    });

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.body.type).toBe('x-www-form-urlencoded');
    const items = JSON.parse(req.body.content);
    expect(items).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'key1', value: 'val1', enabled: true }),
      expect.objectContaining({ key: 'key2', value: 'val2', enabled: true }),
    ]));
  });

  it('should convert multipart/form-data body', () => {
    const json = JSON.stringify({
      name: 'API',
      folders: [],
      requests: [
        {
          name: 'Upload',
          endpoint: '/upload',
          method: 'POST',
          headers: [],
          params: [],
          body: { contentType: 'multipart/form-data', body: '[{"key":"file","value":"data"}]' },
          auth: { authType: 'none', authActive: false },
        },
      ],
    });

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.body.type).toBe('form-data');
    expect(req.body.content).toBe('[{"key":"file","value":"data"}]');
  });

  it('should convert graphql body', () => {
    const json = JSON.stringify({
      name: 'API',
      folders: [],
      requests: [
        {
          name: 'GraphQL',
          endpoint: '/graphql',
          method: 'POST',
          headers: [],
          params: [],
          body: { contentType: 'application/graphql', body: 'query { users { id } }' },
          auth: { authType: 'none', authActive: false },
        },
      ],
    });

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.body.type).toBe('graphql');
    expect(req.body.content).toBe('query { users { id } }');
  });

  it('should convert unrecognized content type as text', () => {
    const json = JSON.stringify({
      name: 'API',
      folders: [],
      requests: [
        {
          name: 'XML',
          endpoint: '/xml',
          method: 'POST',
          headers: [],
          params: [],
          body: { contentType: 'application/xml', body: '<root><data>test</data></root>' },
          auth: { authType: 'none', authActive: false },
        },
      ],
    });

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.body.type).toBe('text');
    expect(req.body.content).toBe('<root><data>test</data></root>');
  });

  it('should handle body with null contentType and null body', () => {
    const json = JSON.stringify({
      name: 'API',
      folders: [],
      requests: [
        {
          name: 'Null Body',
          endpoint: '/test',
          method: 'GET',
          headers: [],
          params: [],
          body: { contentType: null, body: null },
          auth: { authType: 'none', authActive: false },
        },
      ],
    });

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.body.type).toBe('none');
    expect(req.body.content).toBe('');
  });

  it('should handle body with contentType but no body text', () => {
    const json = JSON.stringify({
      name: 'API',
      folders: [],
      requests: [
        {
          name: 'Empty Body',
          endpoint: '/test',
          method: 'POST',
          headers: [],
          params: [],
          body: { contentType: 'application/json', body: null },
          auth: { authType: 'none', authActive: false },
        },
      ],
    });

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.body.type).toBe('none');
    expect(req.body.content).toBe('');
  });

  it('should handle request with no name, method, or endpoint', () => {
    const json = JSON.stringify({
      name: 'API',
      folders: [],
      requests: [
        {
          headers: [],
          params: [],
          body: { contentType: null, body: null },
          auth: { authType: 'none', authActive: false },
        },
      ],
    });

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.name).toBe('Untitled Request');
    expect(req.method).toBe('GET');
    expect(req.url).toBe('');
  });

  it('should handle collection with no name', () => {
    const json = JSON.stringify({
      folders: [],
      requests: [],
    });

    const result = service.importFromString(json);
    expect(result.collections[0].name).toBe('Imported Collection');
  });

  it('should handle folder with no name', () => {
    const json = JSON.stringify({
      name: 'API',
      folders: [
        {
          folders: [],
          requests: [],
        },
      ],
      requests: [],
    });

    const result = service.importFromString(json);
    const folder = result.collections[0].items[0] as Folder;
    expect(folder.name).toBe('Folder');
  });

  it('should handle collection with no folders or requests arrays', () => {
    const json = JSON.stringify({
      name: 'Empty Collection',
    });

    const result = service.importFromString(json);
    expect(result.collections[0].name).toBe('Empty Collection');
    expect(result.collections[0].items).toHaveLength(0);
  });

  it('should handle auth with no authType', () => {
    const json = JSON.stringify({
      name: 'API',
      folders: [],
      requests: [
        {
          name: 'No Auth Type',
          endpoint: '/test',
          method: 'GET',
          headers: [],
          params: [],
          body: { contentType: null, body: null },
          auth: { authActive: true },
        },
      ],
    });

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.auth.type).toBe('none');
  });

  it('should handle request with no auth object', () => {
    const json = JSON.stringify({
      name: 'API',
      folders: [],
      requests: [
        {
          name: 'No Auth',
          endpoint: '/test',
          method: 'GET',
          headers: [],
          params: [],
          body: { contentType: null, body: null },
        },
      ],
    });

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.auth.type).toBe('none');
  });

  it('should handle request with no body object', () => {
    const json = JSON.stringify({
      name: 'API',
      folders: [],
      requests: [
        {
          name: 'No Body',
          endpoint: '/test',
          method: 'GET',
          headers: [],
          params: [],
        },
      ],
    });

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.body.type).toBe('none');
    expect(req.body.content).toBe('');
  });

  it('should handle request with no headers or params arrays', () => {
    const json = JSON.stringify({
      name: 'API',
      folders: [],
      requests: [
        {
          name: 'No KVs',
          endpoint: '/test',
          method: 'GET',
          body: { contentType: null, body: null },
          auth: { authType: 'none', authActive: false },
        },
      ],
    });

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.headers).toEqual([]);
    expect(req.params).toEqual([]);
  });

  it('should convert api-key auth with missing optional fields', () => {
    const json = JSON.stringify({
      name: 'API',
      folders: [],
      requests: [
        {
          name: 'Sparse API Key',
          endpoint: '/api',
          method: 'GET',
          headers: [],
          params: [],
          body: { contentType: null, body: null },
          auth: { authType: 'api-key', authActive: true },
        },
      ],
    });

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.auth.type).toBe('apikey');
    expect(req.auth.apiKeyName).toBe('');
    expect(req.auth.apiKeyValue).toBe('');
    expect(req.auth.apiKeyIn).toBe('header');
  });

  it('should convert basic auth with missing username and password', () => {
    const json = JSON.stringify({
      name: 'API',
      folders: [],
      requests: [
        {
          name: 'Sparse Basic',
          endpoint: '/api',
          method: 'GET',
          headers: [],
          params: [],
          body: { contentType: null, body: null },
          auth: { authType: 'basic', authActive: true },
        },
      ],
    });

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.auth.type).toBe('basic');
    expect(req.auth.username).toBe('');
    expect(req.auth.password).toBe('');
  });

  it('should convert bearer auth with missing token', () => {
    const json = JSON.stringify({
      name: 'API',
      folders: [],
      requests: [
        {
          name: 'Sparse Bearer',
          endpoint: '/api',
          method: 'GET',
          headers: [],
          params: [],
          body: { contentType: null, body: null },
          auth: { authType: 'bearer', authActive: true },
        },
      ],
    });

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.auth.type).toBe('bearer');
    expect(req.auth.token).toBe('');
  });

  it('should handle params with active false', () => {
    const json = JSON.stringify({
      name: 'API',
      folders: [],
      requests: [
        {
          name: 'Inactive Params',
          endpoint: '/test',
          method: 'GET',
          headers: [{ key: 'X-Custom', value: 'val', active: false }],
          params: [{ key: 'page', value: '1', active: false }],
          body: { contentType: null, body: null },
          auth: { authType: 'none', authActive: false },
        },
      ],
    });

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.headers[0].enabled).toBe(false);
    expect(req.params[0].enabled).toBe(false);
  });

  it('should handle text/plain content type as text body', () => {
    const json = JSON.stringify({
      name: 'API',
      folders: [],
      requests: [
        {
          name: 'Text Plain',
          endpoint: '/text',
          method: 'POST',
          headers: [],
          params: [],
          body: { contentType: 'text/plain', body: 'Hello world' },
          auth: { authType: 'none', authActive: false },
        },
      ],
    });

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.body.type).toBe('text');
    expect(req.body.content).toBe('Hello world');
  });

  it('should handle folder without folders or requests arrays', () => {
    const json = JSON.stringify({
      name: 'API',
      folders: [
        {
          name: 'Empty Folder',
        },
      ],
      requests: [],
    });

    const result = service.importFromString(json);
    const folder = result.collections[0].items[0] as Folder;
    expect(isFolder(folder)).toBe(true);
    expect(folder.name).toBe('Empty Folder');
    expect(folder.children).toHaveLength(0);
  });
});
