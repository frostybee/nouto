import { OpenApiImportService } from './OpenApiImportService';
import * as vscode from 'vscode';

// Mock vscode
jest.mock('vscode', () => ({
  Uri: { file: (f: string) => ({ fsPath: f }) },
  workspace: { workspaceFolders: undefined },
}), { virtual: true });

// Mock fs
jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
}));

// Mock axios
jest.mock('axios', () => ({
  default: { get: jest.fn() },
  get: jest.fn(),
}));

const fsPromises = require('fs/promises');
const axios = require('axios');

describe('OpenApiImportService', () => {
  let service: OpenApiImportService;

  beforeEach(() => {
    service = new OpenApiImportService();
    jest.clearAllMocks();
  });

  const minimalSpec = {
    openapi: '3.0.0',
    info: { title: 'Test API', version: '1.0.0' },
    paths: {
      '/users': {
        get: {
          summary: 'List Users',
          tags: ['Users'],
          parameters: [
            { name: 'limit', in: 'query' as const, schema: { type: 'integer', default: 10 } },
          ],
          responses: { '200': { description: 'OK' } },
        },
        post: {
          summary: 'Create User',
          tags: ['Users'],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', example: 'John' },
                    email: { type: 'string', example: 'john@example.com' },
                  },
                },
              },
            },
          },
          responses: { '201': { description: 'Created' } },
        },
      },
      '/users/{id}': {
        get: {
          summary: 'Get User',
          tags: ['Users'],
          parameters: [
            { name: 'id', in: 'path' as const, required: true },
          ],
          responses: { '200': { description: 'OK' } },
        },
      },
      '/health': {
        get: {
          summary: 'Health Check',
          responses: { '200': { description: 'OK' } },
        },
      },
    },
    servers: [
      {
        url: 'https://api.example.com/v1',
        variables: {
          version: { default: 'v1' },
        },
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http' as const, scheme: 'bearer' },
        apiKey: { type: 'apiKey' as const, name: 'X-API-Key', in: 'header' as const },
      },
    },
    security: [{ bearerAuth: [] }],
  };

  describe('importFromFile', () => {
    it('should import a JSON OpenAPI spec', async () => {
      fsPromises.readFile.mockResolvedValue(JSON.stringify(minimalSpec));

      const result = await service.importFromFile({ fsPath: '/test/spec.json' } as any);

      expect(result.collection).toBeDefined();
      expect(result.collection.name).toBe('Test API v1.0.0');
      expect(result.collection.items.length).toBeGreaterThan(0);
    });

    it('should import a YAML OpenAPI spec', async () => {
      const yamlContent = `
openapi: "3.0.0"
info:
  title: YAML API
  version: "2.0.0"
paths:
  /hello:
    get:
      summary: Say Hello
      responses:
        "200":
          description: OK
`;
      fsPromises.readFile.mockResolvedValue(yamlContent);

      const result = await service.importFromFile({ fsPath: '/test/spec.yaml' } as any);

      expect(result.collection).toBeDefined();
      expect(result.collection.name).toBe('YAML API v2.0.0');
    });

    it('should reject non-v3 specs', async () => {
      const v2Spec = JSON.stringify({
        swagger: '2.0',
        info: { title: 'Old', version: '1.0' },
        paths: {},
      });
      fsPromises.readFile.mockResolvedValue(v2Spec);

      await expect(service.importFromFile({ fsPath: '/test/old.json' } as any))
        .rejects.toThrow('Unsupported OpenAPI version');
    });
  });

  describe('importFromUrl', () => {
    it('should fetch and import from URL', async () => {
      axios.get.mockResolvedValue({ data: JSON.stringify(minimalSpec) });

      const result = await service.importFromUrl('https://example.com/spec.json');

      expect(result.collection).toBeDefined();
      expect(result.collection.name).toBe('Test API v1.0.0');
    });
  });

  describe('conversion', () => {
    let result: any;

    beforeEach(async () => {
      fsPromises.readFile.mockResolvedValue(JSON.stringify(minimalSpec));
      result = await service.importFromFile({ fsPath: '/test/spec.json' } as any);
    });

    it('should group operations by tag into folders', () => {
      const usersFolder = result.collection.items.find((i: any) => i.type === 'folder' && i.name === 'Users');
      expect(usersFolder).toBeDefined();
      expect(usersFolder.children.length).toBe(3); // GET /users, POST /users, GET /users/{id}
    });

    it('should put untagged operations at root level', () => {
      const healthCheck = result.collection.items.find((i: any) => i.type !== 'folder' && i.name === 'Health Check');
      expect(healthCheck).toBeDefined();
    });

    it('should convert query parameters', () => {
      const usersFolder = result.collection.items.find((i: any) => i.name === 'Users');
      const listUsers = usersFolder.children.find((i: any) => i.name === 'List Users');
      expect(listUsers.params.length).toBe(1);
      expect(listUsers.params[0].key).toBe('limit');
      expect(listUsers.params[0].value).toBe('10');
    });

    it('should convert path params to {{param}} format', () => {
      const usersFolder = result.collection.items.find((i: any) => i.name === 'Users');
      const getUser = usersFolder.children.find((i: any) => i.name === 'Get User');
      expect(getUser.url).toContain('{{id}}');
    });

    it('should convert JSON request body with example', () => {
      const usersFolder = result.collection.items.find((i: any) => i.name === 'Users');
      const createUser = usersFolder.children.find((i: any) => i.name === 'Create User');
      expect(createUser.body.type).toBe('json');
      const parsed = JSON.parse(createUser.body.content);
      expect(parsed.name).toBe('John');
      expect(parsed.email).toBe('john@example.com');
    });

    it('should resolve base URL from servers', () => {
      const usersFolder = result.collection.items.find((i: any) => i.name === 'Users');
      const listUsers = usersFolder.children.find((i: any) => i.name === 'List Users');
      expect(listUsers.url).toContain('https://api.example.com/v1');
    });

    it('should convert security to auth', () => {
      const usersFolder = result.collection.items.find((i: any) => i.name === 'Users');
      const listUsers = usersFolder.children.find((i: any) => i.name === 'List Users');
      expect(listUsers.auth.type).toBe('bearer');
    });

    it('should extract server variables as environment', () => {
      expect(result.variables).toBeDefined();
      expect(result.variables.name).toBe('Test API Variables');
      expect(result.variables.variables.some((v: any) => v.key === 'version')).toBe(true);
    });
  });

  describe('security scheme conversion', () => {
    it('should convert basic auth', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Auth API', version: '1.0' },
        paths: { '/test': { get: { summary: 'Test', responses: {} } } },
        components: { securitySchemes: { basic: { type: 'http', scheme: 'basic' } } },
        security: [{ basic: [] }],
      };
      fsPromises.readFile.mockResolvedValue(JSON.stringify(spec));
      const result = await service.importFromFile({ fsPath: '/test/auth.json' } as any);
      const request = result.collection.items[0] as any;
      expect(request.auth.type).toBe('basic');
    });

    it('should convert apiKey auth', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Auth API', version: '1.0' },
        paths: { '/test': { get: { summary: 'Test', responses: {} } } },
        components: { securitySchemes: { key: { type: 'apiKey', name: 'X-Key', in: 'header' } } },
        security: [{ key: [] }],
      };
      fsPromises.readFile.mockResolvedValue(JSON.stringify(spec));
      const result = await service.importFromFile({ fsPath: '/test/auth.json' } as any);
      const request = result.collection.items[0] as any;
      expect(request.auth.type).toBe('apikey');
      expect(request.auth.apiKeyName).toBe('X-Key');
    });

    it('should convert OAuth2 authorization code', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Auth API', version: '1.0' },
        paths: { '/test': { get: { summary: 'Test', responses: {} } } },
        components: {
          securitySchemes: {
            oauth: {
              type: 'oauth2',
              flows: {
                authorizationCode: {
                  authorizationUrl: 'https://auth.example.com/authorize',
                  tokenUrl: 'https://auth.example.com/token',
                  scopes: { read: 'Read access' },
                },
              },
            },
          },
        },
        security: [{ oauth: ['read'] }],
      };
      fsPromises.readFile.mockResolvedValue(JSON.stringify(spec));
      const result = await service.importFromFile({ fsPath: '/test/auth.json' } as any);
      const request = result.collection.items[0] as any;
      expect(request.auth.type).toBe('oauth2');
      expect(request.auth.oauth2.grantType).toBe('authorization_code');
      expect(request.auth.oauth2.authUrl).toBe('https://auth.example.com/authorize');
    });
  });

  describe('content type handling', () => {
    it('should handle form-data request body', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Form API', version: '1.0' },
        paths: {
          '/upload': {
            post: {
              summary: 'Upload',
              requestBody: {
                content: {
                  'multipart/form-data': {
                    schema: {
                      type: 'object',
                      properties: {
                        file: { type: 'string', format: 'binary' },
                        name: { type: 'string' },
                      },
                    },
                  },
                },
              },
              responses: {},
            },
          },
        },
      };
      fsPromises.readFile.mockResolvedValue(JSON.stringify(spec));
      const result = await service.importFromFile({ fsPath: '/test/form.json' } as any);
      const request = result.collection.items[0] as any;
      expect(request.body.type).toBe('form-data');
      const formItems = JSON.parse(request.body.content);
      expect(formItems).toHaveLength(2);
      expect(formItems[0].key).toBe('file');
      expect(formItems[0].fieldType).toBe('file');
    });

    it('should handle text/plain request body', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Text API', version: '1.0' },
        paths: {
          '/text': {
            post: {
              summary: 'Send Text',
              requestBody: {
                content: {
                  'text/plain': { example: 'hello world' },
                },
              },
              responses: {},
            },
          },
        },
      };
      fsPromises.readFile.mockResolvedValue(JSON.stringify(spec));
      const result = await service.importFromFile({ fsPath: '/test/text.json' } as any);
      const request = result.collection.items[0] as any;
      expect(request.body.type).toBe('text');
      expect(request.body.content).toBe('hello world');
    });
  });
});
