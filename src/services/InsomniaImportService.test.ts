import { InsomniaImportService } from './InsomniaImportService';
import type { Folder, SavedRequest } from './types';
import { isFolder, isRequest } from './types';

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
});
