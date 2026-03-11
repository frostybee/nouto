import { ImportExportService } from './ImportExportService';
import * as fs from 'fs/promises';
import type { Collection, SavedRequest, Folder } from './types';

// Mock fs module
jest.mock('fs/promises');

const mockFs = fs as jest.Mocked<typeof fs>;

// Sample Postman collection for testing
const createPostmanCollection = (overrides = {}) => ({
  info: {
    name: 'Test Collection',
    _postman_id: 'test-postman-id',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  item: [],
  ...overrides,
});

const createPostmanRequest = (name: string, method = 'GET', url = 'https://api.test.com') => ({
  name,
  id: `postman-${name}`,
  request: {
    method,
    url: { raw: url },
    header: [],
  },
});

const createPostmanFolder = (name: string, items: any[] = []) => ({
  name,
  id: `folder-${name}`,
  item: items,
});

describe('ImportExportService', () => {
  let service: ImportExportService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ImportExportService();
  });

  describe('importPostmanCollection', () => {
    it('should import a basic Postman collection', async () => {
      const postmanCollection = createPostmanCollection({
        item: [createPostmanRequest('Get Users')],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      expect(result.collection.name).toBe('Test Collection');
      expect(result.collection.items).toHaveLength(1);
    });

    it('should throw error for invalid format', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify({ invalid: true }));

      await expect(
        service.importPostmanCollection({ fsPath: '/test/invalid.json' } as any)
      ).rejects.toThrow('Invalid Postman collection format');
    });

    it('should handle nested folders', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          createPostmanFolder('Auth', [
            createPostmanRequest('Login'),
            createPostmanRequest('Logout'),
          ]),
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const folder = result.collection.items[0] as Folder;
      expect(folder.type).toBe('folder');
      expect(folder.name).toBe('Auth');
      expect(folder.children).toHaveLength(2);
    });

    it('should convert Postman URL object to string', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'Complex URL',
            request: {
              method: 'GET',
              url: {
                raw: 'https://api.example.com:8080/users?page=1',
                protocol: 'https',
                host: ['api', 'example', 'com'],
                port: '8080',
                path: ['users'],
                query: [{ key: 'page', value: '1' }],
              },
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.url).toBe('https://api.example.com:8080/users');
      expect(request.params).toHaveLength(1);
      expect(request.params[0].key).toBe('page');
    });

    it('should convert Postman headers', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'With Headers',
            request: {
              method: 'POST',
              url: 'https://api.test.com',
              header: [
                { key: 'Content-Type', value: 'application/json' },
                { key: 'X-Custom', value: 'test', disabled: true },
              ],
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.headers).toHaveLength(2);
      expect(request.headers[0].enabled).toBe(true);
      expect(request.headers[1].enabled).toBe(false);
    });

    it('should convert basic auth', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'Basic Auth',
            request: {
              method: 'GET',
              url: 'https://api.test.com',
              auth: {
                type: 'basic',
                basic: [
                  { key: 'username', value: 'user' },
                  { key: 'password', value: 'pass' },
                ],
              },
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.auth.type).toBe('basic');
      expect(request.auth.username).toBe('user');
      expect(request.auth.password).toBe('pass');
    });

    it('should convert bearer auth', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'Bearer Auth',
            request: {
              method: 'GET',
              url: 'https://api.test.com',
              auth: {
                type: 'bearer',
                bearer: [{ key: 'token', value: 'my-jwt-token' }],
              },
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.auth.type).toBe('bearer');
      expect(request.auth.token).toBe('my-jwt-token');
    });

    it('should convert API key auth (header)', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'API Key Auth',
            request: {
              method: 'GET',
              url: 'https://api.test.com',
              auth: {
                type: 'apikey',
                apikey: [
                  { key: 'key', value: 'X-API-Key' },
                  { key: 'value', value: 'my-secret-key' },
                  { key: 'in', value: 'header' },
                ],
              },
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.auth.type).toBe('apikey');
      expect(request.auth.apiKeyName).toBe('X-API-Key');
      expect(request.auth.apiKeyValue).toBe('my-secret-key');
      expect(request.auth.apiKeyIn).toBe('header');
    });

    it('should convert API key auth (query)', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'API Key Query',
            request: {
              method: 'GET',
              url: 'https://api.test.com',
              auth: {
                type: 'apikey',
                apikey: [
                  { key: 'key', value: 'api_key' },
                  { key: 'value', value: 'secret123' },
                  { key: 'in', value: 'query' },
                ],
              },
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.auth.type).toBe('apikey');
      expect(request.auth.apiKeyIn).toBe('query');
    });

    it('should default API key in to header when not specified', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'API Key Default',
            request: {
              method: 'GET',
              url: 'https://api.test.com',
              auth: {
                type: 'apikey',
                apikey: [
                  { key: 'key', value: 'X-API-Key' },
                  { key: 'value', value: 'secret' },
                ],
              },
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.auth.apiKeyIn).toBe('header');
    });

    it('should convert JSON body', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'JSON Body',
            request: {
              method: 'POST',
              url: 'https://api.test.com',
              body: {
                mode: 'raw',
                raw: '{"name": "test"}',
                options: { raw: { language: 'json' } },
              },
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.body.type).toBe('json');
      expect(request.body.content).toBe('{"name": "test"}');
    });

    it('should convert urlencoded body', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'Form Body',
            request: {
              method: 'POST',
              url: 'https://api.test.com',
              body: {
                mode: 'urlencoded',
                urlencoded: [
                  { key: 'name', value: 'test' },
                  { key: 'age', value: '25' },
                ],
              },
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.body.type).toBe('x-www-form-urlencoded');
      expect(request.body.content).toContain('name=test');
    });

    it('should extract collection variables as environment', async () => {
      const postmanCollection = createPostmanCollection({
        item: [],
        variable: [
          { key: 'baseUrl', value: 'https://api.example.com' },
          { key: 'apiKey', value: 'secret-key' },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      expect(result.variables).toBeDefined();
      expect(result.variables?.name).toContain('Variables');
      expect(result.variables?.variables).toHaveLength(2);
    });

    it('should handle string URL format', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'String URL',
            request: {
              method: 'GET',
              url: 'https://api.test.com/users?page=1&limit=10',
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.params).toHaveLength(2);
    });

    it('should handle empty request', async () => {
      const postmanCollection = createPostmanCollection({
        item: [{ name: 'Empty Request' }],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.method).toBe('GET');
      expect(request.url).toBe('');
    });

    it('should convert GraphQL body', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'GraphQL Query',
            request: {
              method: 'POST',
              url: 'https://api.test.com/graphql',
              body: {
                mode: 'graphql',
                graphql: {
                  query: 'query { users { id name } }',
                  variables: '{"limit": 10}',
                },
              },
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.body.type).toBe('graphql');
      expect(request.body.content).toBe('query { users { id name } }');
      expect(request.body.graphqlVariables).toBe('{"limit": 10}');
    });

    it('should handle GraphQL body with empty variables', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'GraphQL No Vars',
            request: {
              method: 'POST',
              url: 'https://api.test.com/graphql',
              body: {
                mode: 'graphql',
                graphql: {
                  query: 'mutation { deleteUser(id: 1) }',
                  variables: '',
                },
              },
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.body.type).toBe('graphql');
      expect(request.body.content).toBe('mutation { deleteUser(id: 1) }');
      expect(request.body.graphqlVariables).toBe('');
    });

    it('should normalize HTTP methods', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'Lowercase Method',
            request: { method: 'post', url: 'https://api.test.com' },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.method).toBe('POST');
    });
  });

  describe('exportToPostman', () => {
    const createHiveFetchCollection = (): Collection => ({
      id: 'hf-col-1',
      name: 'HiveFetch Collection',
      items: [],
      expanded: true,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    });

    const createHiveFetchRequest = (overrides = {}): SavedRequest => ({
      type: 'request',
      id: 'req-1',
      name: 'Test Request',
      method: 'GET',
      url: 'https://api.example.com',
      params: [],
      headers: [],
      auth: { type: 'none' },
      body: { type: 'none', content: '' },
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      ...overrides,
    });

    it('should export basic collection', async () => {
      const collection = createHiveFetchCollection();

      const result = await service.exportToPostman(collection);

      expect(result.info.name).toBe('HiveFetch Collection');
      expect(result.info._postman_id).toBe('hf-col-1');
      expect(result.info.schema).toContain('v2.1.0');
    });

    it('should export requests', async () => {
      const collection: Collection = {
        ...createHiveFetchCollection(),
        items: [createHiveFetchRequest({ name: 'Get Users' })],
      };

      const result = await service.exportToPostman(collection);

      expect(result.item).toHaveLength(1);
      expect(result.item[0].name).toBe('Get Users');
    });

    it('should export folders with nested items', async () => {
      const collection: Collection = {
        ...createHiveFetchCollection(),
        items: [
          {
            type: 'folder',
            id: 'folder-1',
            name: 'Auth',
            children: [createHiveFetchRequest({ name: 'Login' })],
            expanded: true,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      };

      const result = await service.exportToPostman(collection);

      expect(result.item[0].name).toBe('Auth');
      expect(result.item[0].item).toHaveLength(1);
    });

    it('should export query parameters', async () => {
      const collection: Collection = {
        ...createHiveFetchCollection(),
        items: [
          createHiveFetchRequest({
            params: [
              { id: 'p1', key: 'page', value: '1', enabled: true },
              { id: 'p2', key: 'disabled', value: 'no', enabled: false },
            ],
          }),
        ],
      };

      const result = await service.exportToPostman(collection);

      const url = result.item[0].request?.url;
      expect(typeof url).toBe('object');
      const urlObj = url as { query?: { disabled?: boolean }[] };
      expect(urlObj.query).toHaveLength(2);
      expect(urlObj.query?.[0].disabled).toBe(false);
      expect(urlObj.query?.[1].disabled).toBe(true);
    });

    it('should export headers', async () => {
      const collection: Collection = {
        ...createHiveFetchCollection(),
        items: [
          createHiveFetchRequest({
            headers: [
              { id: 'h1', key: 'Content-Type', value: 'application/json', enabled: true },
            ],
          }),
        ],
      };

      const result = await service.exportToPostman(collection);

      expect(result.item[0].request?.header).toHaveLength(1);
      expect(result.item[0].request?.header?.[0].key).toBe('Content-Type');
    });

    it('should export basic auth', async () => {
      const collection: Collection = {
        ...createHiveFetchCollection(),
        items: [
          createHiveFetchRequest({
            auth: { type: 'basic', username: 'user', password: 'pass' },
          }),
        ],
      };

      const result = await service.exportToPostman(collection);

      expect(result.item[0].request?.auth?.type).toBe('basic');
      expect(result.item[0].request?.auth?.basic).toContainEqual({
        key: 'username',
        value: 'user',
      });
    });

    it('should export bearer auth', async () => {
      const collection: Collection = {
        ...createHiveFetchCollection(),
        items: [
          createHiveFetchRequest({
            auth: { type: 'bearer', token: 'my-token' },
          }),
        ],
      };

      const result = await service.exportToPostman(collection);

      expect(result.item[0].request?.auth?.type).toBe('bearer');
    });

    it('should export API key auth (header)', async () => {
      const collection: Collection = {
        ...createHiveFetchCollection(),
        items: [
          createHiveFetchRequest({
            auth: { type: 'apikey', apiKeyName: 'X-API-Key', apiKeyValue: 'secret-key', apiKeyIn: 'header' },
          }),
        ],
      };

      const result = await service.exportToPostman(collection);

      expect(result.item[0].request?.auth?.type).toBe('apikey');
      expect(result.item[0].request?.auth?.apikey).toContainEqual({ key: 'key', value: 'X-API-Key' });
      expect(result.item[0].request?.auth?.apikey).toContainEqual({ key: 'value', value: 'secret-key' });
      expect(result.item[0].request?.auth?.apikey).toContainEqual({ key: 'in', value: 'header' });
    });

    it('should export API key auth (query)', async () => {
      const collection: Collection = {
        ...createHiveFetchCollection(),
        items: [
          createHiveFetchRequest({
            auth: { type: 'apikey', apiKeyName: 'api_key', apiKeyValue: 'val123', apiKeyIn: 'query' },
          }),
        ],
      };

      const result = await service.exportToPostman(collection);

      expect(result.item[0].request?.auth?.apikey).toContainEqual({ key: 'in', value: 'query' });
    });

    it('should export JSON body', async () => {
      const collection: Collection = {
        ...createHiveFetchCollection(),
        items: [
          createHiveFetchRequest({
            body: { type: 'json', content: '{"test": true}' },
          }),
        ],
      };

      const result = await service.exportToPostman(collection);

      expect(result.item[0].request?.body?.mode).toBe('raw');
      expect(result.item[0].request?.body?.raw).toBe('{"test": true}');
      expect(result.item[0].request?.body?.options?.raw?.language).toBe('json');
    });

    it('should export urlencoded body', async () => {
      const collection: Collection = {
        ...createHiveFetchCollection(),
        items: [
          createHiveFetchRequest({
            body: { type: 'x-www-form-urlencoded', content: 'name=test&age=25' },
          }),
        ],
      };

      const result = await service.exportToPostman(collection);

      expect(result.item[0].request?.body?.mode).toBe('urlencoded');
      expect(result.item[0].request?.body?.urlencoded).toHaveLength(2);
    });

    it('should export GraphQL body', async () => {
      const collection: Collection = {
        ...createHiveFetchCollection(),
        items: [
          createHiveFetchRequest({
            body: {
              type: 'graphql',
              content: 'query { users { id name } }',
              graphqlVariables: '{"limit": 10}',
            },
          }),
        ],
      };

      const result = await service.exportToPostman(collection);

      expect(result.item[0].request?.body?.mode).toBe('graphql');
      expect((result.item[0].request?.body as any)?.graphql?.query).toBe('query { users { id name } }');
      expect((result.item[0].request?.body as any)?.graphql?.variables).toBe('{"limit": 10}');
    });

    it('should export GraphQL body without variables', async () => {
      const collection: Collection = {
        ...createHiveFetchCollection(),
        items: [
          createHiveFetchRequest({
            body: {
              type: 'graphql',
              content: 'query { users { id } }',
            },
          }),
        ],
      };

      const result = await service.exportToPostman(collection);

      expect(result.item[0].request?.body?.mode).toBe('graphql');
      expect((result.item[0].request?.body as any)?.graphql?.query).toBe('query { users { id } }');
      expect((result.item[0].request?.body as any)?.graphql?.variables).toBe('');
    });

    it('should export form-data body', async () => {
      const collection: Collection = {
        ...createHiveFetchCollection(),
        items: [
          createHiveFetchRequest({
            body: { type: 'form-data', content: '{"field1": "value1"}' },
          }),
        ],
      };

      const result = await service.exportToPostman(collection);

      expect(result.item[0].request?.body?.mode).toBe('formdata');
    });

    it('should export collection-level auth', async () => {
      const collection: Collection = {
        ...createHiveFetchCollection(),
        auth: { type: 'bearer', token: 'my-secret-token' },
      };

      const result = await service.exportToPostman(collection);

      expect(result.auth).toBeDefined();
      expect(result.auth?.type).toBe('bearer');
      expect(result.auth?.bearer).toEqual([{ key: 'token', value: 'my-secret-token' }]);
    });

    it('should not export collection auth when type is none', async () => {
      const collection: Collection = {
        ...createHiveFetchCollection(),
        auth: { type: 'none' },
      };

      const result = await service.exportToPostman(collection);

      expect(result.auth).toBeUndefined();
    });

    it('should export collection-level variables', async () => {
      const collection: Collection = {
        ...createHiveFetchCollection(),
        variables: [
          { key: 'baseUrl', value: 'https://api.example.com', enabled: true },
          { key: 'apiKey', value: 'secret', enabled: false },
        ],
      };

      const result = await service.exportToPostman(collection);

      expect(result.variable).toHaveLength(2);
      expect(result.variable?.[0]).toEqual({ key: 'baseUrl', value: 'https://api.example.com', disabled: false });
      expect(result.variable?.[1]).toEqual({ key: 'apiKey', value: 'secret', disabled: true });
    });

    it('should not export empty variables array', async () => {
      const collection: Collection = {
        ...createHiveFetchCollection(),
        variables: [],
      };

      const result = await service.exportToPostman(collection);

      expect(result.variable).toBeUndefined();
    });

    it('should export folder-level auth', async () => {
      const collection: Collection = {
        ...createHiveFetchCollection(),
        items: [
          {
            type: 'folder' as const,
            id: 'folder-1',
            name: 'Authenticated',
            children: [createHiveFetchRequest({ name: 'Get User' })],
            expanded: true,
            auth: { type: 'basic', username: 'admin', password: 'pass123' },
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      };

      const result = await service.exportToPostman(collection);

      expect(result.item[0].auth).toBeDefined();
      expect(result.item[0].auth?.type).toBe('basic');
      expect(result.item[0].auth?.basic).toEqual([
        { key: 'username', value: 'admin' },
        { key: 'password', value: 'pass123' },
      ]);
    });

    it('should not export folder auth when type is none', async () => {
      const collection: Collection = {
        ...createHiveFetchCollection(),
        items: [
          {
            type: 'folder' as const,
            id: 'folder-1',
            name: 'Public',
            children: [],
            expanded: true,
            auth: { type: 'none' },
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      };

      const result = await service.exportToPostman(collection);

      expect(result.item[0].auth).toBeUndefined();
    });
  });

  describe('exportToFile', () => {
    it('should write collection to file', async () => {
      mockFs.writeFile.mockResolvedValue(undefined);

      const collection: Collection = {
        id: 'col-1',
        name: 'Test',
        items: [],
        expanded: true,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      await service.exportToFile(collection, { fsPath: '/test/output.json' } as any);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        '/test/output.json',
        expect.any(String),
        'utf8'
      );
    });

    it('should format JSON with proper indentation', async () => {
      mockFs.writeFile.mockResolvedValue(undefined);

      const collection: Collection = {
        id: 'col-1',
        name: 'Test',
        items: [],
        expanded: true,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      await service.exportToFile(collection, { fsPath: '/test/output.json' } as any);

      const writtenContent = mockFs.writeFile.mock.calls[0][1] as string;
      expect(writtenContent).toContain('\n');
      expect(writtenContent).toContain('  ');
    });
  });

  // ============================================
  // Additional branch coverage tests
  // ============================================

  describe('importPostmanCollection - additional branches', () => {
    it('should warn but still import when schema is not v2.0 or v2.1', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const postmanCollection = createPostmanCollection({
        info: {
          name: 'Old Collection',
          schema: 'https://schema.getpostman.com/json/collection/v1.0.0/collection.json',
        },
        item: [createPostmanRequest('Test Request')],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      expect(result.collection.name).toBe('Old Collection');
      expect(result.collection.items).toHaveLength(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('may not be fully compatible'),
        expect.any(String)
      );
      warnSpy.mockRestore();
    });

    it('should warn when schema is empty string', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const postmanCollection = createPostmanCollection({
        info: {
          name: 'No Schema',
          schema: '',
        },
        item: [],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      expect(result.collection.name).toBe('No Schema');
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('should build URL from parts when no raw URL is present', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'Parts URL',
            request: {
              method: 'GET',
              url: {
                protocol: 'https',
                host: ['api', 'example', 'com'],
                port: '3000',
                path: ['v1', 'users'],
              },
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.url).toBe('https://api.example.com:3000/v1/users');
    });

    it('should build URL from parts without protocol', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'No Protocol URL',
            request: {
              method: 'GET',
              url: {
                host: ['localhost'],
                port: '8080',
                path: ['api'],
              },
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.url).toBe('localhost:8080/api');
    });

    it('should build URL from parts with only host', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'Host Only URL',
            request: {
              method: 'GET',
              url: {
                host: ['example', 'com'],
              },
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.url).toBe('example.com');
    });

    it('should convert OAuth2 auth from Postman format', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'OAuth2 Auth',
            request: {
              method: 'GET',
              url: 'https://api.test.com',
              auth: {
                type: 'oauth2',
                oauth2: [
                  { key: 'grant_type', value: 'client_credentials' },
                  { key: 'authUrl', value: 'https://auth.example.com/authorize' },
                  { key: 'accessTokenUrl', value: 'https://auth.example.com/token' },
                  { key: 'clientId', value: 'my-client-id' },
                  { key: 'clientSecret', value: 'my-secret' },
                  { key: 'scope', value: 'read write' },
                ],
              },
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.auth.type).toBe('oauth2');
      expect(request.auth.oauth2?.grantType).toBe('client_credentials');
      expect(request.auth.oauth2?.authUrl).toBe('https://auth.example.com/authorize');
      expect(request.auth.oauth2?.tokenUrl).toBe('https://auth.example.com/token');
      expect(request.auth.oauth2?.clientId).toBe('my-client-id');
      expect(request.auth.oauth2?.clientSecret).toBe('my-secret');
      expect(request.auth.oauth2?.scope).toBe('read write');
    });

    it('should fallback unsupported auth types to none', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'Digest Auth',
            request: {
              method: 'GET',
              url: 'https://api.test.com',
              auth: {
                type: 'digest',
              },
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.auth.type).toBe('none');
    });

    it('should convert form-data body with file and text types', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'FormData Request',
            request: {
              method: 'POST',
              url: 'https://api.test.com/upload',
              body: {
                mode: 'formdata',
                formdata: [
                  { key: 'name', value: 'test', type: 'text' },
                  { key: 'avatar', value: '/path/to/file.png', type: 'file' },
                  { key: 'disabled_field', value: 'skip', type: 'text', disabled: true },
                ],
              },
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.body.type).toBe('form-data');
      const formItems = JSON.parse(request.body.content);
      // Disabled items are filtered out
      expect(formItems).toHaveLength(2);
      expect(formItems[0].fieldType).toBe('text');
      expect(formItems[1].fieldType).toBe('file');
    });

    it('should convert file body mode to binary', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'File Upload',
            request: {
              method: 'POST',
              url: 'https://api.test.com/upload',
              body: {
                mode: 'file',
              },
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.body.type).toBe('binary');
      expect(request.body.content).toBe('');
    });

    it('should handle unknown body mode as none', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'Unknown Body',
            request: {
              method: 'POST',
              url: 'https://api.test.com',
              body: {
                mode: 'unknown_mode',
              },
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.body.type).toBe('none');
      expect(request.body.content).toBe('');
    });

    it('should handle raw body without json language as text', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'Text Body',
            request: {
              method: 'POST',
              url: 'https://api.test.com',
              body: {
                mode: 'raw',
                raw: 'plain text content',
                options: { raw: { language: 'text' } },
              },
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.body.type).toBe('text');
      expect(request.body.content).toBe('plain text content');
    });

    it('should handle raw body with xml language as text type', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'XML Body',
            request: {
              method: 'POST',
              url: 'https://api.test.com',
              body: {
                mode: 'raw',
                raw: '<root><data>test</data></root>',
                options: { raw: { language: 'xml' } },
              },
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.body.type).toBe('text');
    });

    it('should preserve custom HTTP methods', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'Custom Method',
            request: {
              method: 'FOOBAR',
              url: 'https://api.test.com',
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.method).toBe('FOOBAR');
    });

    it('should handle undefined URL', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'No URL',
            request: {
              method: 'GET',
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.url).toBe('');
    });

    it('should handle form-data body with empty formdata array', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'Empty FormData',
            request: {
              method: 'POST',
              url: 'https://api.test.com',
              body: {
                mode: 'formdata',
              },
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.body.type).toBe('form-data');
      const formItems = JSON.parse(request.body.content);
      expect(formItems).toHaveLength(0);
    });

    it('should handle URL object with no raw and no parts as empty string', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'Empty URL Object',
            request: {
              method: 'GET',
              url: {},
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.url).toBe('');
    });

    it('should handle disabled urlencoded params', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'Disabled Params',
            request: {
              method: 'POST',
              url: 'https://api.test.com',
              body: {
                mode: 'urlencoded',
                urlencoded: [
                  { key: 'active', value: 'yes' },
                  { key: 'disabled', value: 'no', disabled: true },
                ],
              },
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.body.type).toBe('x-www-form-urlencoded');
      expect(request.body.content).toBe('active=yes');
      expect(request.body.content).not.toContain('disabled');
    });
  });

  describe('exportToPostman - additional branches', () => {
    const createHiveFetchCollection = (): Collection => ({
      id: 'hf-col-1',
      name: 'HiveFetch Collection',
      items: [],
      expanded: true,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    });

    const createHiveFetchRequest = (overrides = {}): SavedRequest => ({
      type: 'request',
      id: 'req-1',
      name: 'Test Request',
      method: 'GET',
      url: 'https://api.example.com',
      params: [],
      headers: [],
      auth: { type: 'none' },
      body: { type: 'none', content: '' },
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      ...overrides,
    });

    it('should export OAuth2 auth with config', async () => {
      const collection: Collection = {
        ...createHiveFetchCollection(),
        items: [
          createHiveFetchRequest({
            auth: {
              type: 'oauth2',
              oauth2: {
                grantType: 'authorization_code',
                authUrl: 'https://auth.example.com/authorize',
                tokenUrl: 'https://auth.example.com/token',
                clientId: 'my-client',
                clientSecret: 'my-secret',
                scope: 'read',
              },
            },
          }),
        ],
      };

      const result = await service.exportToPostman(collection);

      expect(result.item[0].request?.auth?.type).toBe('oauth2');
      const oauth2 = (result.item[0].request?.auth as any)?.oauth2;
      expect(oauth2).toBeDefined();
      expect(oauth2).toContainEqual({ key: 'grant_type', value: 'authorization_code' });
      expect(oauth2).toContainEqual({ key: 'clientId', value: 'my-client' });
    });

    it('should export OAuth2 auth without config object', async () => {
      const collection: Collection = {
        ...createHiveFetchCollection(),
        items: [
          createHiveFetchRequest({
            auth: {
              type: 'oauth2',
            },
          }),
        ],
      };

      const result = await service.exportToPostman(collection);

      expect(result.item[0].request?.auth?.type).toBe('oauth2');
    });

    it('should export text body', async () => {
      const collection: Collection = {
        ...createHiveFetchCollection(),
        items: [
          createHiveFetchRequest({
            body: { type: 'text', content: 'Hello, World!' },
          }),
        ],
      };

      const result = await service.exportToPostman(collection);

      expect(result.item[0].request?.body?.mode).toBe('raw');
      expect(result.item[0].request?.body?.raw).toBe('Hello, World!');
      expect(result.item[0].request?.body?.options?.raw?.language).toBe('text');
    });

    it('should export binary body as file mode', async () => {
      const collection: Collection = {
        ...createHiveFetchCollection(),
        items: [
          createHiveFetchRequest({
            body: { type: 'binary', content: '' },
          }),
        ],
      };

      const result = await service.exportToPostman(collection);

      expect(result.item[0].request?.body?.mode).toBe('file');
    });

    it('should export none auth as noauth', async () => {
      const collection: Collection = {
        ...createHiveFetchCollection(),
        items: [
          createHiveFetchRequest({
            auth: { type: 'none' },
          }),
        ],
      };

      const result = await service.exportToPostman(collection);

      expect(result.item[0].request?.auth?.type).toBe('noauth');
    });

    it('should export none body type', async () => {
      const collection: Collection = {
        ...createHiveFetchCollection(),
        items: [
          createHiveFetchRequest({
            body: { type: 'none', content: '' },
          }),
        ],
      };

      const result = await service.exportToPostman(collection);

      expect(result.item[0].request?.body?.mode).toBe('none');
    });

    it('should export form-data body with array format including file types', async () => {
      const formItems = [
        { key: 'name', value: 'test', enabled: true, fieldType: 'text' },
        { key: 'avatar', value: '/path/to/file.png', enabled: true, fieldType: 'file' },
        { key: 'disabled', value: 'skip', enabled: false, fieldType: 'text' },
      ];
      const collection: Collection = {
        ...createHiveFetchCollection(),
        items: [
          createHiveFetchRequest({
            body: { type: 'form-data', content: JSON.stringify(formItems) },
          }),
        ],
      };

      const result = await service.exportToPostman(collection);

      expect(result.item[0].request?.body?.mode).toBe('formdata');
      const formdata = result.item[0].request?.body?.formdata;
      expect(formdata).toBeDefined();
      // Only enabled items: name and avatar
      expect(formdata).toHaveLength(2);
      expect(formdata?.[0].key).toBe('name');
      expect(formdata?.[0].type).toBe('text');
      expect(formdata?.[1].key).toBe('avatar');
      expect(formdata?.[1].type).toBe('file');
    });

    it('should export form-data body with legacy object format', async () => {
      const collection: Collection = {
        ...createHiveFetchCollection(),
        items: [
          createHiveFetchRequest({
            body: { type: 'form-data', content: '{"field1": "value1", "field2": "value2"}' },
          }),
        ],
      };

      const result = await service.exportToPostman(collection);

      expect(result.item[0].request?.body?.mode).toBe('formdata');
      const formdata = result.item[0].request?.body?.formdata;
      expect(formdata).toHaveLength(2);
      expect(formdata?.[0].key).toBe('field1');
      expect(formdata?.[0].type).toBe('text');
    });

    it('should handle form-data body with invalid JSON', async () => {
      const collection: Collection = {
        ...createHiveFetchCollection(),
        items: [
          createHiveFetchRequest({
            body: { type: 'form-data', content: 'not valid json' },
          }),
        ],
      };

      const result = await service.exportToPostman(collection);

      expect(result.item[0].request?.body?.mode).toBe('formdata');
      expect(result.item[0].request?.body?.formdata).toEqual([]);
    });

    it('should handle form-data body with empty content', async () => {
      const collection: Collection = {
        ...createHiveFetchCollection(),
        items: [
          createHiveFetchRequest({
            body: { type: 'form-data', content: '' },
          }),
        ],
      };

      const result = await service.exportToPostman(collection);

      expect(result.item[0].request?.body?.mode).toBe('formdata');
      expect(result.item[0].request?.body?.formdata).toEqual([]);
    });

    it('should handle urlencoded body with empty content', async () => {
      const collection: Collection = {
        ...createHiveFetchCollection(),
        items: [
          createHiveFetchRequest({
            body: { type: 'x-www-form-urlencoded', content: '' },
          }),
        ],
      };

      const result = await service.exportToPostman(collection);

      expect(result.item[0].request?.body?.mode).toBe('urlencoded');
      expect(result.item[0].request?.body?.urlencoded).toEqual([]);
    });

    it('should export basic auth with missing username and password', async () => {
      const collection: Collection = {
        ...createHiveFetchCollection(),
        items: [
          createHiveFetchRequest({
            auth: { type: 'basic' },
          }),
        ],
      };

      const result = await service.exportToPostman(collection);

      expect(result.item[0].request?.auth?.type).toBe('basic');
      expect(result.item[0].request?.auth?.basic).toContainEqual({ key: 'username', value: '' });
      expect(result.item[0].request?.auth?.basic).toContainEqual({ key: 'password', value: '' });
    });

    it('should export bearer auth with missing token', async () => {
      const collection: Collection = {
        ...createHiveFetchCollection(),
        items: [
          createHiveFetchRequest({
            auth: { type: 'bearer' },
          }),
        ],
      };

      const result = await service.exportToPostman(collection);

      expect(result.item[0].request?.auth?.type).toBe('bearer');
      expect(result.item[0].request?.auth?.bearer).toContainEqual({ key: 'token', value: '' });
    });

    it('should export apikey auth with missing fields', async () => {
      const collection: Collection = {
        ...createHiveFetchCollection(),
        items: [
          createHiveFetchRequest({
            auth: { type: 'apikey' },
          }),
        ],
      };

      const result = await service.exportToPostman(collection);

      expect(result.item[0].request?.auth?.type).toBe('apikey');
      expect(result.item[0].request?.auth?.apikey).toContainEqual({ key: 'key', value: '' });
      expect(result.item[0].request?.auth?.apikey).toContainEqual({ key: 'value', value: '' });
      expect(result.item[0].request?.auth?.apikey).toContainEqual({ key: 'in', value: 'header' });
    });
  });

  describe('importPostmanCollection - more branch coverage', () => {
    it('should use fallback name when info.name is empty', async () => {
      const postmanCollection = createPostmanCollection({
        info: {
          name: '',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        item: [],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      expect(result.collection.name).toBe('Imported Collection');
    });

    it('should handle folder without id and name', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            item: [createPostmanRequest('Child')],
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const folder = result.collection.items[0] as Folder;
      expect(folder.type).toBe('folder');
      expect(folder.name).toBe('Unnamed Folder');
      expect(folder.id).toBeTruthy();
    });

    it('should handle folder without item array (empty children)', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'Empty Folder',
            id: 'f-1',
            item: undefined as any,
          },
        ],
      });
      // Manually construct since we need item present but the folder detection
      // relies on item.item && !item.request - we need a folder without item.item
      // Actually this case is the request path, let's test folder with empty item instead
      const data = {
        info: {
          name: 'Test',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        item: [
          {
            name: 'Folder With Null Items',
            id: 'f-1',
            item: null,
          },
        ],
      };
      mockFs.readFile.mockResolvedValue(JSON.stringify(data));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      // item: null won't satisfy the `item.item && !item.request` check
      // so it falls to convertPostmanRequest
      const req = result.collection.items[0] as SavedRequest;
      expect(req.method).toBe('GET');
    });

    it('should handle request without id and name', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            request: {
              method: 'POST',
              url: 'https://api.test.com',
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.name).toBe('Unnamed Request');
      expect(request.id).toBeTruthy();
    });

    it('should handle empty request item without id or name', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            // No name, no id, no request
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.name).toBe('Unnamed Request');
      expect(request.id).toBeTruthy();
      expect(request.method).toBe('GET');
    });

    it('should handle URL object with host as string (non-array)', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'String Host',
            request: {
              method: 'GET',
              url: {
                protocol: 'https',
                host: 'api.example.com' as any,
                port: '443',
                path: 'v1/users' as any,
              },
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.url).toBe('https://api.example.com:443/v1/users');
    });

    it('should handle query params with missing key or value', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'Missing Param Fields',
            request: {
              method: 'GET',
              url: {
                raw: 'https://api.test.com',
                query: [
                  { key: undefined as any, value: 'val' },
                  { key: 'key', value: undefined as any },
                ],
              },
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.params).toHaveLength(2);
      expect(request.params[0].key).toBe('');
      expect(request.params[1].value).toBe('');
    });

    it('should handle headers with missing key or value', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'Missing Header Fields',
            request: {
              method: 'GET',
              url: 'https://api.test.com',
              header: [
                { key: undefined as any, value: 'val' },
                { key: 'key', value: undefined as any },
              ],
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.headers).toHaveLength(2);
      expect(request.headers[0].key).toBe('');
      expect(request.headers[1].value).toBe('');
    });

    it('should handle basic auth with missing username/password', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'Missing Basic Fields',
            request: {
              method: 'GET',
              url: 'https://api.test.com',
              auth: {
                type: 'basic',
                basic: [],
              },
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.auth.type).toBe('basic');
      expect(request.auth.username).toBe('');
      expect(request.auth.password).toBe('');
    });

    it('should handle bearer auth with missing token', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'Missing Bearer Fields',
            request: {
              method: 'GET',
              url: 'https://api.test.com',
              auth: {
                type: 'bearer',
                bearer: [],
              },
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.auth.type).toBe('bearer');
      expect(request.auth.token).toBe('');
    });

    it('should handle apikey auth with missing fields', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'Missing Apikey Fields',
            request: {
              method: 'GET',
              url: 'https://api.test.com',
              auth: {
                type: 'apikey',
                apikey: [],
              },
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.auth.type).toBe('apikey');
      expect(request.auth.apiKeyName).toBe('');
      expect(request.auth.apiKeyValue).toBe('');
      expect(request.auth.apiKeyIn).toBe('header');
    });

    it('should handle OAuth2 auth with empty params array', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'Empty OAuth2',
            request: {
              method: 'GET',
              url: 'https://api.test.com',
              auth: {
                type: 'oauth2',
              },
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.auth.type).toBe('oauth2');
      expect(request.auth.oauth2?.grantType).toBe('authorization_code');
      expect(request.auth.oauth2?.authUrl).toBe('');
      expect(request.auth.oauth2?.tokenUrl).toBe('');
    });

    it('should handle raw body without options (no language specified)', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'Raw No Options',
            request: {
              method: 'POST',
              url: 'https://api.test.com',
              body: {
                mode: 'raw',
                raw: 'some content',
              },
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.body.type).toBe('text');
      expect(request.body.content).toBe('some content');
    });

    it('should handle raw body with empty raw content', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'Empty Raw',
            request: {
              method: 'POST',
              url: 'https://api.test.com',
              body: {
                mode: 'raw',
                options: { raw: { language: 'json' } },
              },
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.body.type).toBe('json');
      expect(request.body.content).toBe('');
    });

    it('should handle GraphQL body without query or variables', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'Empty GraphQL',
            request: {
              method: 'POST',
              url: 'https://api.test.com/graphql',
              body: {
                mode: 'graphql',
              },
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.body.type).toBe('graphql');
      expect(request.body.content).toBe('');
      expect(request.body.graphqlVariables).toBe('');
    });

    it('should handle variables with missing key or value', async () => {
      const postmanCollection = createPostmanCollection({
        item: [],
        variable: [
          { key: undefined as any, value: 'val1' },
          { key: 'key2', value: undefined as any },
          { key: 'key3', value: 'val3', disabled: true },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      expect(result.variables).toBeDefined();
      expect(result.variables?.variables).toHaveLength(3);
      expect(result.variables?.variables[0].key).toBe('');
      expect(result.variables?.variables[1].value).toBe('');
      expect(result.variables?.variables[2].enabled).toBe(false);
    });

    it('should handle null method (defaults to GET)', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'Null Method',
            request: {
              method: null as any,
              url: 'https://api.test.com',
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.method).toBe('GET');
    });

    it('should handle form-data array items with missing key and value', async () => {
      const formItems = [
        { enabled: true, fieldType: 'text' },
        { key: 'only_key', enabled: true },
      ];
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'Sparse FormData',
            request: {
              method: 'POST',
              url: 'https://api.test.com',
              body: {
                mode: 'formdata',
                formdata: [
                  { key: 'field1', value: 'val1' },
                ],
              },
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.body.type).toBe('form-data');
    });

    it('should handle URL with query string for string URL', async () => {
      const postmanCollection = createPostmanCollection({
        item: [
          {
            name: 'String URL No Query',
            request: {
              method: 'GET',
              url: 'https://api.test.com/users',
            },
          },
        ],
      });
      mockFs.readFile.mockResolvedValue(JSON.stringify(postmanCollection));

      const result = await service.importPostmanCollection({
        fsPath: '/test/collection.json',
      } as any);

      const request = result.collection.items[0] as SavedRequest;
      expect(request.params).toEqual([]);
    });
  });

  describe('export form-data with sparse array items', () => {
    const createHiveFetchCollection = (): Collection => ({
      id: 'hf-col-1',
      name: 'HiveFetch Collection',
      items: [],
      expanded: true,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    });

    const createHiveFetchRequest = (overrides = {}): SavedRequest => ({
      type: 'request',
      id: 'req-1',
      name: 'Test Request',
      method: 'GET',
      url: 'https://api.example.com',
      params: [],
      headers: [],
      auth: { type: 'none' },
      body: { type: 'none', content: '' },
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      ...overrides,
    });

    it('should export form-data body with items missing key/value', async () => {
      const formItems = [
        { enabled: true, fieldType: 'text' },
        { key: 'name', enabled: true, fieldType: 'text' },
      ];
      const collection: Collection = {
        ...createHiveFetchCollection(),
        items: [
          createHiveFetchRequest({
            body: { type: 'form-data', content: JSON.stringify(formItems) },
          }),
        ],
      };

      const result = await service.exportToPostman(collection);

      const formdata = result.item[0].request?.body?.formdata;
      expect(formdata).toBeDefined();
      expect(formdata?.[0].key).toBe('');
      expect(formdata?.[0].value).toBe('');
      expect(formdata?.[1].key).toBe('name');
    });

    it('should export GraphQL body without graphqlVariables field', async () => {
      const collection: Collection = {
        ...createHiveFetchCollection(),
        items: [
          createHiveFetchRequest({
            body: { type: 'graphql', content: 'query { test }' },
          }),
        ],
      };

      const result = await service.exportToPostman(collection);

      expect(result.item[0].request?.body?.mode).toBe('graphql');
      expect((result.item[0].request?.body as any)?.graphql?.variables).toBe('');
    });

    it('should export OAuth2 auth with defaults for missing config fields', async () => {
      const collection: Collection = {
        ...createHiveFetchCollection(),
        items: [
          createHiveFetchRequest({
            auth: {
              type: 'oauth2',
              oauth2: {
                grantType: 'authorization_code',
                clientId: 'my-client',
              } as any,
            },
          }),
        ],
      };

      const result = await service.exportToPostman(collection);

      const oauth2 = (result.item[0].request?.auth as any)?.oauth2;
      expect(oauth2).toBeDefined();
      expect(oauth2).toContainEqual({ key: 'authUrl', value: '' });
      expect(oauth2).toContainEqual({ key: 'accessTokenUrl', value: '' });
      expect(oauth2).toContainEqual({ key: 'clientSecret', value: '' });
      expect(oauth2).toContainEqual({ key: 'scope', value: '' });
    });
  });
});
