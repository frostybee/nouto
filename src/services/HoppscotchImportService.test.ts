import { HoppscotchImportService } from './HoppscotchImportService';
import type { Folder, SavedRequest } from './types';
import { isFolder, isRequest } from './types';

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
    expect(req.auth.type).toBe('none');
  });
});
