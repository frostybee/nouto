import { ThunderClientImportService } from './ThunderClientImportService';
import type { SavedRequest, Folder } from './types';

describe('ThunderClientImportService', () => {
  let service: ThunderClientImportService;

  beforeEach(() => {
    service = new ThunderClientImportService();
  });

  function makeCollection(overrides?: any) {
    return {
      _id: 'col-1',
      colName: 'Test Collection',
      created: '2024-01-01T00:00:00.000Z',
      modified: '2024-01-02T00:00:00.000Z',
      folders: [],
      requests: [],
      ...overrides,
    };
  }

  function makeRequest(overrides?: any) {
    return {
      _id: 'req-1',
      colId: 'col-1',
      name: 'Get Users',
      url: 'https://api.example.com/users',
      method: 'GET',
      ...overrides,
    };
  }

  it('should import a single collection', () => {
    const input = JSON.stringify(makeCollection({
      requests: [makeRequest()],
    }));
    const result = service.importFromString(input);
    expect(result.collections).toHaveLength(1);
    expect(result.collections[0].name).toBe('Test Collection');
    expect(result.collections[0].items).toHaveLength(1);
  });

  it('should import an array of collections', () => {
    const input = JSON.stringify([
      makeCollection({ _id: 'col-1', colName: 'Collection A' }),
      makeCollection({ _id: 'col-2', colName: 'Collection B' }),
    ]);
    const result = service.importFromString(input);
    expect(result.collections).toHaveLength(2);
    expect(result.collections[0].name).toBe('Collection A');
    expect(result.collections[1].name).toBe('Collection B');
  });

  it('should import flat format with separate arrays', () => {
    const input = JSON.stringify({
      collections: [makeCollection()],
      folders: [],
      requests: [makeRequest()],
    });
    const result = service.importFromString(input);
    expect(result.collections).toHaveLength(1);
    expect(result.collections[0].items).toHaveLength(1);
  });

  it('should convert request method, url, name', () => {
    const input = JSON.stringify(makeCollection({
      requests: [makeRequest({ method: 'POST', url: 'https://api.example.com/users', name: 'Create User' })],
    }));
    const result = service.importFromString(input);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.method).toBe('POST');
    expect(req.url).toBe('https://api.example.com/users');
    expect(req.name).toBe('Create User');
  });

  it('should convert headers', () => {
    const input = JSON.stringify(makeCollection({
      requests: [makeRequest({
        headers: [
          { name: 'Content-Type', value: 'application/json' },
          { name: 'X-Disabled', value: 'yes', isDisabled: true },
        ],
      })],
    }));
    const result = service.importFromString(input);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.headers).toHaveLength(2);
    expect(req.headers[0]).toMatchObject({ key: 'Content-Type', value: 'application/json', enabled: true });
    expect(req.headers[1]).toMatchObject({ key: 'X-Disabled', enabled: false });
  });

  it('should convert query params', () => {
    const input = JSON.stringify(makeCollection({
      requests: [makeRequest({
        params: [{ name: 'page', value: '1' }],
      })],
    }));
    const result = service.importFromString(input);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.params).toHaveLength(1);
    expect(req.params[0]).toMatchObject({ key: 'page', value: '1', enabled: true });
  });

  it('should convert bearer auth', () => {
    const input = JSON.stringify(makeCollection({
      requests: [makeRequest({
        auth: { type: 'bearer', bearer: 'my-token' },
      })],
    }));
    const result = service.importFromString(input);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.auth).toEqual({ type: 'bearer', token: 'my-token' });
  });

  it('should convert basic auth', () => {
    const input = JSON.stringify(makeCollection({
      requests: [makeRequest({
        auth: { type: 'basic', basic: { username: 'admin', password: 'secret' } },
      })],
    }));
    const result = service.importFromString(input);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.auth).toEqual({ type: 'basic', username: 'admin', password: 'secret' });
  });

  it('should convert apikey auth', () => {
    const input = JSON.stringify(makeCollection({
      requests: [makeRequest({
        auth: { type: 'apikey', apikey: { key: 'X-API-Key', value: 'secret', addTo: 'header' } },
      })],
    }));
    const result = service.importFromString(input);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.auth).toEqual({ type: 'apikey', apiKeyName: 'X-API-Key', apiKeyValue: 'secret', apiKeyIn: 'header' });
  });

  it('should convert AWS auth', () => {
    const input = JSON.stringify(makeCollection({
      requests: [makeRequest({
        auth: { type: 'aws', aws: { accessKey: 'AKIA...', secretKey: 'wJal...', region: 'eu-west-1', service: 'execute-api' } },
      })],
    }));
    const result = service.importFromString(input);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.auth.type).toBe('aws');
    expect(req.auth.awsRegion).toBe('eu-west-1');
    expect(req.auth.awsService).toBe('execute-api');
  });

  it('should convert JSON body', () => {
    const input = JSON.stringify(makeCollection({
      requests: [makeRequest({
        body: { type: 'json', raw: '{"name":"test"}' },
      })],
    }));
    const result = service.importFromString(input);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.body).toEqual({ type: 'json', content: '{"name":"test"}' });
  });

  it('should convert form-encoded body', () => {
    const input = JSON.stringify(makeCollection({
      requests: [makeRequest({
        body: { type: 'formencoded', form: [{ name: 'user', value: 'admin' }] },
      })],
    }));
    const result = service.importFromString(input);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.body.type).toBe('x-www-form-urlencoded');
    const parsed = JSON.parse(req.body.content);
    expect(parsed[0]).toMatchObject({ key: 'user', value: 'admin' });
  });

  it('should convert GraphQL body', () => {
    const input = JSON.stringify(makeCollection({
      requests: [makeRequest({
        body: { type: 'graphql', graphql: { query: '{ users { id } }', variables: '{"limit":10}' } },
      })],
    }));
    const result = service.importFromString(input);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.body.type).toBe('graphql');
    expect(req.body.content).toBe('{ users { id } }');
    expect(req.body.graphqlVariables).toBe('{"limit":10}');
  });

  it('should nest requests into folders', () => {
    const input = JSON.stringify(makeCollection({
      folders: [{ _id: 'folder-1', name: 'Auth', colId: 'col-1' }],
      requests: [
        makeRequest({ _id: 'req-1', containerId: 'folder-1', name: 'Login' }),
        makeRequest({ _id: 'req-2', name: 'Root Request' }),
      ],
    }));
    const result = service.importFromString(input);
    const col = result.collections[0];
    expect(col.items).toHaveLength(2); // folder + root request
    const folder = col.items.find(i => (i as Folder).type === 'folder') as Folder;
    expect(folder).toBeDefined();
    expect(folder.name).toBe('Auth');
    expect(folder.children).toHaveLength(1);
    expect((folder.children[0] as SavedRequest).name).toBe('Login');
  });

  it('should handle nested folders', () => {
    const input = JSON.stringify(makeCollection({
      folders: [
        { _id: 'f-1', name: 'Parent', colId: 'col-1' },
        { _id: 'f-2', name: 'Child', colId: 'col-1', containerId: 'f-1' },
      ],
      requests: [
        makeRequest({ _id: 'req-1', containerId: 'f-2', name: 'Deep Request' }),
      ],
    }));
    const result = service.importFromString(input);
    const col = result.collections[0];
    const parent = col.items.find(i => (i as Folder).type === 'folder') as Folder;
    expect(parent.name).toBe('Parent');
    expect(parent.children).toHaveLength(1);
    const child = parent.children[0] as Folder;
    expect(child.name).toBe('Child');
    expect(child.children).toHaveLength(1);
    expect((child.children[0] as SavedRequest).name).toBe('Deep Request');
  });

  it('should handle no auth as none', () => {
    const input = JSON.stringify(makeCollection({
      requests: [makeRequest({ auth: null })],
    }));
    const result = service.importFromString(input);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.auth.type).toBe('none');
  });

  it('should handle unknown auth type as none', () => {
    const input = JSON.stringify(makeCollection({
      requests: [makeRequest({ auth: { type: 'ntlm' } })],
    }));
    const result = service.importFromString(input);
    const req = result.collections[0].items[0] as SavedRequest;
    expect(req.auth.type).toBe('none');
  });

  it('should throw for unrecognized format', () => {
    expect(() => service.importFromString('{"unknown":"data"}')).toThrow('Unrecognized Thunder Client format');
  });
});
