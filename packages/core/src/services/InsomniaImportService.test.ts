import { InsomniaImportService } from './InsomniaImportService';
import type { Folder, SavedRequest } from '../types';
import { isFolder, isRequest } from '../types';

const service = new InsomniaImportService();

function makeExport(resources: any[]): string {
  return JSON.stringify({
    _type: 'export',
    __export_format: 4,
    resources,
  });
}

describe('InsomniaImportService', () => {
  it('should import a basic workspace with requests', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'My API', parentId: null },
      {
        _id: 'req_1', _type: 'request', parentId: 'wrk_1',
        name: 'Get Users', method: 'GET', url: 'https://api.example.com/users',
        headers: [{ name: 'Accept', value: 'application/json', disabled: false }],
        parameters: [{ name: 'page', value: '1', disabled: false }],
      },
    ]);

    const result = service.importFromString(json);
    expect(result.collections).toHaveLength(1);
    expect(result.collections[0].name).toBe('My API');
    expect(result.collections[0].items).toHaveLength(1);

    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.name).toBe('Get Users');
    expect(req.method).toBe('GET');
    expect(req.url).toBe('https://api.example.com/users');
    expect(req.headers).toHaveLength(1);
    expect(req.headers[0].key).toBe('Accept');
    expect(req.params).toHaveLength(1);
    expect(req.params[0].key).toBe('page');
  });

  it('should import nested folders', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
      { _id: 'fld_1', _type: 'request_group', name: 'Auth', parentId: 'wrk_1' },
      { _id: 'req_1', _type: 'request', parentId: 'fld_1', name: 'Login', method: 'POST', url: '/login' },
      { _id: 'req_2', _type: 'request', parentId: 'wrk_1', name: 'Health', method: 'GET', url: '/health' },
    ]);

    const result = service.importFromString(json);
    expect(result.collections[0].items).toHaveLength(2);

    const folder = result.collections[0].items.find(i => isFolder(i)) as Folder;
    expect(folder.name).toBe('Auth');
    expect(folder.children).toHaveLength(1);

    const rootReq = result.collections[0].items.find(i => isRequest(i)) as SavedRequest;
    expect(rootReq.name).toBe('Health');
  });

  it('should convert basic auth', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
      {
        _id: 'req_1', _type: 'request', parentId: 'wrk_1',
        name: 'Auth Request', method: 'GET', url: '/test',
        authentication: { type: 'basic', username: 'user', password: 'pass' },
      },
    ]);

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.auth.type).toBe('basic');
    expect(req.auth.username).toBe('user');
    expect(req.auth.password).toBe('pass');
  });

  it('should convert bearer auth', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
      {
        _id: 'req_1', _type: 'request', parentId: 'wrk_1',
        name: 'Auth Request', method: 'GET', url: '/test',
        authentication: { type: 'bearer', token: 'my-token' },
      },
    ]);

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.auth.type).toBe('bearer');
    expect(req.auth.token).toBe('my-token');
  });

  it('should convert JSON body', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
      {
        _id: 'req_1', _type: 'request', parentId: 'wrk_1',
        name: 'Post Data', method: 'POST', url: '/data',
        body: { mimeType: 'application/json', text: '{"key":"value"}' },
      },
    ]);

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.body.type).toBe('json');
    expect(req.body.content).toBe('{"key":"value"}');
  });

  it('should convert form-urlencoded body', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
      {
        _id: 'req_1', _type: 'request', parentId: 'wrk_1',
        name: 'Form Submit', method: 'POST', url: '/form',
        body: {
          mimeType: 'application/x-www-form-urlencoded',
          params: [
            { name: 'username', value: 'admin', disabled: false },
            { name: 'password', value: 'secret', disabled: false },
          ],
        },
      },
    ]);

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.body.type).toBe('x-www-form-urlencoded');
    expect(req.body.content).toContain('username=admin');
  });

  it('should throw on invalid data', () => {
    expect(() => service.importFromString('{}')).toThrow('Invalid Insomnia export');
  });

  it('should throw on missing workspaces', () => {
    expect(() => service.importFromString(JSON.stringify({ resources: [] }))).toThrow('No workspaces found');
  });

  it('should handle disabled headers and params', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
      {
        _id: 'req_1', _type: 'request', parentId: 'wrk_1',
        name: 'Test', method: 'GET', url: '/test',
        headers: [
          { name: 'Active', value: 'yes', disabled: false },
          { name: 'Disabled', value: 'no', disabled: true },
        ],
        parameters: [
          { name: 'active', value: 'yes', disabled: false },
          { name: 'disabled', value: 'no', disabled: true },
        ],
      },
    ]);

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.headers[0].enabled).toBe(true);
    expect(req.headers[1].enabled).toBe(false);
    expect(req.params[0].enabled).toBe(true);
    expect(req.params[1].enabled).toBe(false);
  });

  // ============================================
  // Additional branch coverage tests
  // ============================================

  it('should convert apikey auth', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
      {
        _id: 'req_1', _type: 'request', parentId: 'wrk_1',
        name: 'API Key Request', method: 'GET', url: '/test',
        authentication: { type: 'apikey', key: 'X-API-Key', value: 'secret123', addTo: 'header' },
      },
    ]);

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.auth.type).toBe('apikey');
    expect(req.auth.apiKeyName).toBe('X-API-Key');
    expect(req.auth.apiKeyValue).toBe('secret123');
    expect(req.auth.apiKeyIn).toBe('header');
  });

  it('should convert apikey auth with addTo query', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
      {
        _id: 'req_1', _type: 'request', parentId: 'wrk_1',
        name: 'API Key Query', method: 'GET', url: '/test',
        authentication: { type: 'apikey', key: 'api_key', value: 'val', addTo: 'query' },
      },
    ]);

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.auth.type).toBe('apikey');
    expect(req.auth.apiKeyIn).toBe('query');
  });

  it('should convert oauth2 auth', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
      {
        _id: 'req_1', _type: 'request', parentId: 'wrk_1',
        name: 'OAuth Request', method: 'GET', url: '/test',
        authentication: {
          type: 'oauth2',
          grantType: 'client_credentials',
          authorizationUrl: 'https://auth.example.com/authorize',
          accessTokenUrl: 'https://auth.example.com/token',
          clientId: 'my-client',
          clientSecret: 'my-secret',
          scope: 'read write',
        },
      },
    ]);

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.auth.type).toBe('oauth2');
    expect(req.auth.oauth2?.grantType).toBe('client_credentials');
    expect(req.auth.oauth2?.authUrl).toBe('https://auth.example.com/authorize');
    expect(req.auth.oauth2?.tokenUrl).toBe('https://auth.example.com/token');
    expect(req.auth.oauth2?.clientId).toBe('my-client');
    expect(req.auth.oauth2?.clientSecret).toBe('my-secret');
    expect(req.auth.oauth2?.scope).toBe('read write');
  });

  it('should fallback unsupported auth types to none', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
      {
        _id: 'req_1', _type: 'request', parentId: 'wrk_1',
        name: 'Digest Auth', method: 'GET', url: '/test',
        authentication: { type: 'digest' },
      },
    ]);

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.auth.type).toBe('none');
  });

  it('should convert form-urlencoded body without params (text fallback)', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
      {
        _id: 'req_1', _type: 'request', parentId: 'wrk_1',
        name: 'Form Text', method: 'POST', url: '/form',
        body: {
          mimeType: 'application/x-www-form-urlencoded',
          text: 'key1=val1&key2=val2',
        },
      },
    ]);

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.body.type).toBe('x-www-form-urlencoded');
    expect(req.body.content).toBe('key1=val1&key2=val2');
  });

  it('should convert multipart/form-data body', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
      {
        _id: 'req_1', _type: 'request', parentId: 'wrk_1',
        name: 'Upload', method: 'POST', url: '/upload',
        body: {
          mimeType: 'multipart/form-data',
          params: [
            { name: 'file', value: '/path/to/file.txt', disabled: false, type: 'file' },
            { name: 'description', value: 'My file', disabled: false },
            { name: 'skip_me', value: 'ignored', disabled: true },
          ],
        },
      },
    ]);

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.body.type).toBe('form-data');
    const formData = JSON.parse(req.body.content);
    expect(formData).toHaveLength(3);
    expect(formData[0].key).toBe('file');
    expect(formData[1].key).toBe('description');
    expect(formData[2].enabled).toBe(false);
  });

  it('should convert application/graphql body', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
      {
        _id: 'req_1', _type: 'request', parentId: 'wrk_1',
        name: 'GraphQL Query', method: 'POST', url: '/graphql',
        body: {
          mimeType: 'application/graphql',
          text: 'query { users { id name } }',
        },
      },
    ]);

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.body.type).toBe('graphql');
    expect(req.body.content).toBe('query { users { id name } }');
  });

  it('should convert plain text body', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
      {
        _id: 'req_1', _type: 'request', parentId: 'wrk_1',
        name: 'Text Request', method: 'POST', url: '/text',
        body: {
          mimeType: 'text/plain',
          text: 'Hello world',
        },
      },
    ]);

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.body.type).toBe('text');
    expect(req.body.content).toBe('Hello world');
  });

  it('should return none body when body has no text and unrecognized mimeType', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
      {
        _id: 'req_1', _type: 'request', parentId: 'wrk_1',
        name: 'Empty Body', method: 'POST', url: '/empty',
        body: {
          mimeType: 'application/octet-stream',
        },
      },
    ]);

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.body.type).toBe('none');
    expect(req.body.content).toBe('');
  });

  it('should return none body when body is undefined', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
      {
        _id: 'req_1', _type: 'request', parentId: 'wrk_1',
        name: 'No Body', method: 'GET', url: '/test',
      },
    ]);

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.body.type).toBe('none');
    expect(req.body.content).toBe('');
  });

  it('should return none auth when authentication is undefined', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
      {
        _id: 'req_1', _type: 'request', parentId: 'wrk_1',
        name: 'No Auth', method: 'GET', url: '/test',
      },
    ]);

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.auth.type).toBe('none');
  });

  it('should return none auth when authentication has no type', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
      {
        _id: 'req_1', _type: 'request', parentId: 'wrk_1',
        name: 'Empty Auth', method: 'GET', url: '/test',
        authentication: {},
      },
    ]);

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.auth.type).toBe('none');
  });

  it('should handle body with empty mimeType', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
      {
        _id: 'req_1', _type: 'request', parentId: 'wrk_1',
        name: 'Empty Mime', method: 'POST', url: '/test',
        body: {
          mimeType: '',
          text: 'some content',
        },
      },
    ]);

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    // Empty mimeType with text falls through to the text check
    expect(req.body.type).toBe('text');
    expect(req.body.content).toBe('some content');
  });

  it('should handle request with no name, method, or url', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
      {
        _id: 'req_1', _type: 'request', parentId: 'wrk_1',
      },
    ]);

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.name).toBe('Untitled Request');
    expect(req.method).toBe('GET');
    expect(req.url).toBe('');
  });

  it('should handle workspace with no name', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', parentId: null },
      {
        _id: 'req_1', _type: 'request', parentId: 'wrk_1',
        name: 'Test', method: 'GET', url: '/test',
      },
    ]);

    const result = service.importFromString(json);
    expect(result.collections[0].name).toBe('Imported Collection');
  });

  it('should handle folder with no name', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
      { _id: 'fld_1', _type: 'request_group', parentId: 'wrk_1' },
    ]);

    const result = service.importFromString(json);
    const folder = result.collections[0].items[0] as Folder;
    expect(folder.name).toBe('Folder');
  });

  it('should handle multiple workspaces', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API v1', parentId: null },
      { _id: 'wrk_2', _type: 'workspace', name: 'API v2', parentId: null },
      { _id: 'req_1', _type: 'request', parentId: 'wrk_1', name: 'v1 Request', method: 'GET', url: '/v1' },
      { _id: 'req_2', _type: 'request', parentId: 'wrk_2', name: 'v2 Request', method: 'GET', url: '/v2' },
    ]);

    const result = service.importFromString(json);
    expect(result.collections).toHaveLength(2);
    expect(result.collections[0].name).toBe('API v1');
    expect(result.collections[1].name).toBe('API v2');
  });

  it('should handle form-urlencoded body with disabled params filtered out', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
      {
        _id: 'req_1', _type: 'request', parentId: 'wrk_1',
        name: 'Form', method: 'POST', url: '/form',
        body: {
          mimeType: 'application/x-www-form-urlencoded',
          params: [
            { name: 'active', value: 'yes', disabled: false },
            { name: 'disabled', value: 'no', disabled: true },
          ],
        },
      },
    ]);

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.body.type).toBe('x-www-form-urlencoded');
    expect(req.body.content).toBe('active=yes');
    expect(req.body.content).not.toContain('disabled');
  });

  it('should convert apikey auth with missing optional fields', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
      {
        _id: 'req_1', _type: 'request', parentId: 'wrk_1',
        name: 'Sparse API Key', method: 'GET', url: '/test',
        authentication: { type: 'apikey' },
      },
    ]);

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.auth.type).toBe('apikey');
    expect(req.auth.apiKeyName).toBe('');
    expect(req.auth.apiKeyValue).toBe('');
    expect(req.auth.apiKeyIn).toBe('header');
  });

  it('should convert oauth2 auth with missing optional fields', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
      {
        _id: 'req_1', _type: 'request', parentId: 'wrk_1',
        name: 'Sparse OAuth2', method: 'GET', url: '/test',
        authentication: { type: 'oauth2' },
      },
    ]);

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.auth.type).toBe('oauth2');
    expect(req.auth.oauth2?.grantType).toBe('authorization_code');
    expect(req.auth.oauth2?.authUrl).toBe('');
    expect(req.auth.oauth2?.tokenUrl).toBe('');
    expect(req.auth.oauth2?.clientId).toBe('');
    expect(req.auth.oauth2?.clientSecret).toBe('');
    expect(req.auth.oauth2?.scope).toBe('');
  });

  it('should convert bearer auth with missing token', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
      {
        _id: 'req_1', _type: 'request', parentId: 'wrk_1',
        name: 'Bearer No Token', method: 'GET', url: '/test',
        authentication: { type: 'bearer' },
      },
    ]);

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.auth.type).toBe('bearer');
    expect(req.auth.token).toBe('');
  });

  it('should convert basic auth with missing username and password', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
      {
        _id: 'req_1', _type: 'request', parentId: 'wrk_1',
        name: 'Basic No Creds', method: 'GET', url: '/test',
        authentication: { type: 'basic' },
      },
    ]);

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.auth.type).toBe('basic');
    expect(req.auth.username).toBe('');
    expect(req.auth.password).toBe('');
  });

  it('should handle multipart/form-data body with no params', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
      {
        _id: 'req_1', _type: 'request', parentId: 'wrk_1',
        name: 'Empty Multipart', method: 'POST', url: '/upload',
        body: {
          mimeType: 'multipart/form-data',
        },
      },
    ]);

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.body.type).toBe('form-data');
    const formData = JSON.parse(req.body.content);
    expect(formData).toHaveLength(0);
  });

  it('should handle graphql body with missing text', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
      {
        _id: 'req_1', _type: 'request', parentId: 'wrk_1',
        name: 'Empty GraphQL', method: 'POST', url: '/graphql',
        body: {
          mimeType: 'application/graphql',
        },
      },
    ]);

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.body.type).toBe('graphql');
    expect(req.body.content).toBe('');
  });

  it('should handle form-urlencoded body with empty text fallback', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
      {
        _id: 'req_1', _type: 'request', parentId: 'wrk_1',
        name: 'Empty URL Encoded', method: 'POST', url: '/form',
        body: {
          mimeType: 'application/x-www-form-urlencoded',
        },
      },
    ]);

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.body.type).toBe('x-www-form-urlencoded');
    expect(req.body.content).toBe('');
  });

  it('should handle request with no headers or parameters', () => {
    const json = makeExport([
      { _id: 'wrk_1', _type: 'workspace', name: 'API', parentId: null },
      {
        _id: 'req_1', _type: 'request', parentId: 'wrk_1',
        name: 'Minimal', method: 'GET', url: '/test',
      },
    ]);

    const result = service.importFromString(json);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.headers).toEqual([]);
    expect(req.params).toEqual([]);
  });
});
