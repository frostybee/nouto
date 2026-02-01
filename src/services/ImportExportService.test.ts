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
      expect(url?.query).toHaveLength(2);
      expect(url?.query?.[0].disabled).toBe(false);
      expect(url?.query?.[1].disabled).toBe(true);
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
});
