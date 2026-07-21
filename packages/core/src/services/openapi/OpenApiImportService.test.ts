import { OpenApiImportService } from './OpenApiImportService';

describe('OpenApiImportService', () => {
  let service: OpenApiImportService;

  beforeEach(() => {
    service = new OpenApiImportService();
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

  describe('conversion', () => {
    let result: any;

    beforeEach(() => {
      result = service.importFromString(JSON.stringify(minimalSpec));
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
    it('should convert basic auth', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Auth API', version: '1.0' },
        paths: { '/test': { get: { summary: 'Test', responses: {} } } },
        components: { securitySchemes: { basic: { type: 'http', scheme: 'basic' } } },
        security: [{ basic: [] }],
      };
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      expect(request.auth.type).toBe('basic');
    });

    it('should convert apiKey auth', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Auth API', version: '1.0' },
        paths: { '/test': { get: { summary: 'Test', responses: {} } } },
        components: { securitySchemes: { key: { type: 'apiKey', name: 'X-Key', in: 'header' } } },
        security: [{ key: [] }],
      };
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      expect(request.auth.type).toBe('apikey');
      expect(request.auth.apiKeyName).toBe('X-Key');
    });

    it('should convert OAuth2 authorization code', () => {
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
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      expect(request.auth.type).toBe('oauth2');
      expect(request.auth.oauth2.grantType).toBe('authorization_code');
      expect(request.auth.oauth2.authUrl).toBe('https://auth.example.com/authorize');
    });
  });

  describe('content type handling', () => {
    it('should handle form-data request body', () => {
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
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      expect(request.body.type).toBe('form-data');
      const formItems = JSON.parse(request.body.content);
      expect(formItems).toHaveLength(2);
      expect(formItems[0].key).toBe('file');
      expect(formItems[0].fieldType).toBe('file');
    });

    it('should handle text/plain request body', () => {
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
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      expect(request.body.type).toBe('text');
      expect(request.body.content).toBe('hello world');
    });
  });

  // =====================================================
  // Additional tests for branch coverage
  // =====================================================

  describe('validation edge cases', () => {
    it('should reject spec that is not a valid object (line 130)', () => {
      expect(() => service.importFromString('"just a string"'))
        .toThrow('Invalid OpenAPI spec: not a valid object');
    });

    it('should reject null spec (line 130)', () => {
      expect(() => service.importFromString('null'))
        .toThrow('Invalid OpenAPI spec: not a valid object');
    });

    it('should reject spec with missing paths section (line 138)', () => {
      const spec = { openapi: '3.0.0', info: { title: 'No Paths', version: '1.0' } };
      expect(() => service.importFromString(JSON.stringify(spec)))
        .toThrow('Invalid OpenAPI spec: missing "paths" section');
    });

    it('should reject spec where paths is not an object (line 138)', () => {
      const spec = { openapi: '3.0.0', info: { title: 'Bad Paths', version: '1.0' }, paths: 'not-an-object' };
      expect(() => service.importFromString(JSON.stringify(spec)))
        .toThrow('Invalid OpenAPI spec: missing "paths" section');
    });
  });

  describe('header parameters (line 278)', () => {
    it('should convert header parameters', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Header API', version: '1.0' },
        paths: {
          '/test': {
            get: {
              summary: 'Test',
              parameters: [
                { name: 'X-Request-Id', in: 'header', required: true, example: 'abc123' },
                { name: 'X-Optional', in: 'header', required: false, schema: { default: 'default-val' } },
              ],
              responses: {},
            },
          },
        },
      };
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      expect(request.headers.length).toBe(2);
      expect(request.headers[0].key).toBe('X-Request-Id');
      expect(request.headers[0].value).toBe('abc123');
      expect(request.headers[0].enabled).toBe(true);
      expect(request.headers[1].key).toBe('X-Optional');
      expect(request.headers[1].value).toBe('default-val');
    });
  });

  describe('request body edge cases', () => {
    it('should return body type none when requestBody has no content (line 289)', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Empty Body API', version: '1.0' },
        paths: {
          '/test': {
            post: {
              summary: 'Test',
              requestBody: {},
              responses: {},
            },
          },
        },
      };
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      expect(request.body.type).toBe('none');
    });

    it('should handle application/graphql content type (line 305)', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'GraphQL API', version: '1.0' },
        paths: {
          '/graphql': {
            post: {
              summary: 'GraphQL',
              requestBody: {
                content: {
                  'application/graphql': { schema: { type: 'string' } },
                },
              },
              responses: {},
            },
          },
        },
      };
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      expect(request.body.type).toBe('graphql');
      expect(request.body.content).toBe('');
    });

    it('should handle application/graphql+json content type (line 305)', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'GraphQL JSON API', version: '1.0' },
        paths: {
          '/graphql': {
            post: {
              summary: 'GraphQL JSON',
              requestBody: {
                content: {
                  'application/graphql+json': { schema: { type: 'object' } },
                },
              },
              responses: {},
            },
          },
        },
      };
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      expect(request.body.type).toBe('graphql');
    });

    it('should handle application/x-www-form-urlencoded content type (lines 318-320)', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Form URL API', version: '1.0' },
        paths: {
          '/login': {
            post: {
              summary: 'Login',
              requestBody: {
                content: {
                  'application/x-www-form-urlencoded': {
                    schema: {
                      type: 'object',
                      properties: {
                        username: { type: 'string', example: 'admin' },
                        password: { type: 'string', default: 'secret' },
                      },
                      required: ['username'],
                    },
                  },
                },
              },
              responses: {},
            },
          },
        },
      };
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      expect(request.body.type).toBe('x-www-form-urlencoded');
      const formItems = JSON.parse(request.body.content);
      expect(formItems).toHaveLength(2);
      expect(formItems[0].key).toBe('username');
      expect(formItems[0].value).toBe('admin');
      expect(formItems[0].fieldType).toBe('text');
      expect(formItems[1].key).toBe('password');
      expect(formItems[1].value).toBe('secret');
    });

    it('should handle fallback content type that contains json (lines 336-345)', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Custom JSON API', version: '1.0' },
        paths: {
          '/test': {
            post: {
              summary: 'Custom JSON',
              requestBody: {
                content: {
                  'application/vnd.api+json': {
                    example: { data: { type: 'test', id: '1' } },
                  },
                },
              },
              responses: {},
            },
          },
        },
      };
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      expect(request.body.type).toBe('json');
      const parsed = JSON.parse(request.body.content);
      expect(parsed.data.type).toBe('test');
    });

    it('should handle fallback content type that is not json (lines 346-349)', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'XML API', version: '1.0' },
        paths: {
          '/test': {
            post: {
              summary: 'XML',
              requestBody: {
                content: {
                  'application/xml': {
                    example: '<root><item>1</item></root>',
                  },
                },
              },
              responses: {},
            },
          },
        },
      };
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      expect(request.body.type).toBe('text');
      expect(request.body.content).toBe('<root><item>1</item></root>');
    });

    it('should handle fallback with no example in non-json type (lines 346-349)', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'XML API', version: '1.0' },
        paths: {
          '/test': {
            post: {
              summary: 'XML No Example',
              requestBody: {
                content: {
                  'application/xml': {},
                },
              },
              responses: {},
            },
          },
        },
      };
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      expect(request.body.type).toBe('text');
      expect(request.body.content).toBe('');
    });

    it('should return none for empty content object (line 352)', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Empty Content API', version: '1.0' },
        paths: {
          '/test': {
            post: {
              summary: 'Empty',
              requestBody: { content: {} },
              responses: {},
            },
          },
        },
      };
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      expect(request.body.type).toBe('none');
    });
  });

  describe('extractExample edge cases', () => {
    it('should use media.examples when media.example is not set (lines 369-370)', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Examples API', version: '1.0' },
        paths: {
          '/test': {
            post: {
              summary: 'Test',
              requestBody: {
                content: {
                  'application/json': {
                    examples: {
                      first: { value: { name: 'from-examples' } },
                    },
                  },
                },
              },
              responses: {},
            },
          },
        },
      };
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      expect(request.body.type).toBe('json');
      const parsed = JSON.parse(request.body.content);
      expect(parsed.name).toBe('from-examples');
    });

    it('should return undefined when no example, examples, or schema (line 375)', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'No Example API', version: '1.0' },
        paths: {
          '/test': {
            post: {
              summary: 'Test',
              requestBody: {
                content: {
                  'text/plain': {},
                },
              },
              responses: {},
            },
          },
        },
      };
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      expect(request.body.type).toBe('text');
      expect(request.body.content).toBe('');
    });
  });

  describe('generateExampleFromSchema edge cases', () => {
    it('should generate example for array type (lines 392-395)', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Array API', version: '1.0' },
        paths: {
          '/test': {
            post: {
              summary: 'Test',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        tags: {
                          type: 'array',
                          items: { type: 'string' },
                        },
                        emptyArray: {
                          type: 'array',
                        },
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
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      const parsed = JSON.parse(request.body.content);
      expect(parsed.tags).toEqual(['']);
      // Array without items: generateExampleFromSchema returns undefined for items,
      // which wraps as [undefined] -> JSON serializes to [null]
      expect(parsed.emptyArray).toEqual([null]);
    });

    it('should generate example for string with enum (line 397)', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Enum API', version: '1.0' },
        paths: {
          '/test': {
            post: {
              summary: 'Test',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: {
                          type: 'string',
                          enum: ['active', 'inactive', 'pending'],
                        },
                        plainString: {
                          type: 'string',
                        },
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
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      const parsed = JSON.parse(request.body.content);
      expect(parsed.status).toBe('active');
      expect(parsed.plainString).toBe('');
    });

    it('should generate examples for integer, number, boolean types (lines 399-403)', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Primitive API', version: '1.0' },
        paths: {
          '/test': {
            post: {
              summary: 'Test',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        count: { type: 'integer' },
                        price: { type: 'number' },
                        active: { type: 'boolean' },
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
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      const parsed = JSON.parse(request.body.content);
      expect(parsed.count).toBe(0);
      expect(parsed.price).toBe(0);
      expect(parsed.active).toBe(false);
    });

    it('should return undefined for unknown schema type (lines 404-405)', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Unknown Type API', version: '1.0' },
        paths: {
          '/test': {
            post: {
              summary: 'Test',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        mystery: { type: 'customType' },
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
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      const parsed = JSON.parse(request.body.content);
      // unknown type generates undefined which becomes null in JSON
      expect(parsed.mystery).toBeUndefined();
    });

    it('should use schema example and default before generating (line 380-381)', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Default API', version: '1.0' },
        paths: {
          '/test': {
            post: {
              summary: 'Test',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        withExample: { type: 'string', example: 'my-example' },
                        withDefault: { type: 'integer', default: 42 },
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
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      const parsed = JSON.parse(request.body.content);
      expect(parsed.withExample).toBe('my-example');
      expect(parsed.withDefault).toBe(42);
    });

    it('should return {} for object schema without properties (line 385)', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Empty Obj API', version: '1.0' },
        paths: {
          '/test': {
            post: {
              summary: 'Test',
              requestBody: {
                content: {
                  'application/json': {
                    schema: { type: 'object' },
                  },
                },
              },
              responses: {},
            },
          },
        },
      };
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      const parsed = JSON.parse(request.body.content);
      expect(parsed).toEqual({});
    });
  });

  describe('security scheme edge cases', () => {
    it('should return none for http scheme that is neither basic nor bearer (line 429)', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Auth API', version: '1.0' },
        paths: { '/test': { get: { summary: 'Test', responses: {} } } },
        components: { securitySchemes: { digest: { type: 'http', scheme: 'digest' } } },
        security: [{ digest: [] }],
      };
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      expect(request.auth.type).toBe('none');
    });

    it('should convert OAuth2 client_credentials flow (lines 453-463)', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Auth API', version: '1.0' },
        paths: { '/test': { get: { summary: 'Test', responses: {} } } },
        components: {
          securitySchemes: {
            oauth: {
              type: 'oauth2',
              flows: {
                clientCredentials: {
                  tokenUrl: 'https://auth.example.com/token',
                  scopes: { admin: 'Admin access' },
                },
              },
            },
          },
        },
        security: [{ oauth: [] }],
      };
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      expect(request.auth.type).toBe('oauth2');
      expect(request.auth.oauth2.grantType).toBe('client_credentials');
      expect(request.auth.oauth2.tokenUrl).toBe('https://auth.example.com/token');
      expect(request.auth.oauth2.scope).toBe('admin');
    });

    it('should convert OAuth2 implicit flow (lines 464-474)', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Auth API', version: '1.0' },
        paths: { '/test': { get: { summary: 'Test', responses: {} } } },
        components: {
          securitySchemes: {
            oauth: {
              type: 'oauth2',
              flows: {
                implicit: {
                  authorizationUrl: 'https://auth.example.com/authorize',
                  scopes: { read: 'Read access', write: 'Write access' },
                },
              },
            },
          },
        },
        security: [{ oauth: [] }],
      };
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      expect(request.auth.type).toBe('oauth2');
      expect(request.auth.oauth2.grantType).toBe('implicit');
      expect(request.auth.oauth2.authUrl).toBe('https://auth.example.com/authorize');
      expect(request.auth.oauth2.scope).toBe('read write');
    });

    it('should convert OAuth2 password flow (lines 475-484)', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Auth API', version: '1.0' },
        paths: { '/test': { get: { summary: 'Test', responses: {} } } },
        components: {
          securitySchemes: {
            oauth: {
              type: 'oauth2',
              flows: {
                password: {
                  tokenUrl: 'https://auth.example.com/token',
                  scopes: {},
                },
              },
            },
          },
        },
        security: [{ oauth: [] }],
      };
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      expect(request.auth.type).toBe('oauth2');
      expect(request.auth.oauth2.grantType).toBe('password');
      expect(request.auth.oauth2.tokenUrl).toBe('https://auth.example.com/token');
    });

    it('should return none for OAuth2 with no flows (line 485)', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Auth API', version: '1.0' },
        paths: { '/test': { get: { summary: 'Test', responses: {} } } },
        components: {
          securitySchemes: {
            oauth: { type: 'oauth2', flows: {} },
          },
        },
        security: [{ oauth: [] }],
      };
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      expect(request.auth.type).toBe('none');
    });

    it('should return none for unsupported security scheme type (lines 488-489)', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Auth API', version: '1.0' },
        paths: { '/test': { get: { summary: 'Test', responses: {} } } },
        components: {
          securitySchemes: {
            oidc: { type: 'openIdConnect', openIdConnectUrl: 'https://example.com/.well-known/openid-configuration' },
          },
        },
        security: [{ oidc: [] }],
      };
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      expect(request.auth.type).toBe('none');
    });

    it('should return none when security scheme name not found in components', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Auth API', version: '1.0' },
        paths: { '/test': { get: { summary: 'Test', responses: {} } } },
        components: { securitySchemes: {} },
        security: [{ nonexistent: [] }],
      };
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      expect(request.auth.type).toBe('none');
    });

    it('should return none when security array first item has no keys', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Auth API', version: '1.0' },
        paths: { '/test': { get: { summary: 'Test', responses: {} } } },
        security: [{}],
      };
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      expect(request.auth.type).toBe('none');
    });

    it('should convert apiKey with in: query', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Auth API', version: '1.0' },
        paths: { '/test': { get: { summary: 'Test', responses: {} } } },
        components: { securitySchemes: { key: { type: 'apiKey', name: 'api_key', in: 'query' } } },
        security: [{ key: [] }],
      };
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      expect(request.auth.type).toBe('apikey');
      expect(request.auth.apiKeyIn).toBe('query');
    });
  });

  describe('$ref resolution (lines 555-560)', () => {
    it('should resolve $ref in request body', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Ref API', version: '1.0' },
        paths: {
          '/test': {
            post: {
              summary: 'Test',
              requestBody: { $ref: '#/components/requestBodies/CreateUser' },
              responses: {},
            },
          },
        },
        components: {
          requestBodies: {
            CreateUser: {
              content: {
                'application/json': {
                  example: { name: 'resolved-user' },
                },
              },
            },
          },
        },
      };
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      expect(request.body.type).toBe('json');
      const parsed = JSON.parse(request.body.content);
      expect(parsed.name).toBe('resolved-user');
    });

    it('should return original object when $ref cannot be resolved', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Bad Ref API', version: '1.0' },
        paths: {
          '/test': {
            post: {
              summary: 'Test',
              requestBody: { $ref: '#/components/requestBodies/NonExistent' },
              responses: {},
            },
          },
        },
        components: {},
      };
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      // The $ref couldn't be resolved, so body defaults to none
      expect(request.body.type).toBe('none');
    });

    it('should resolve $ref in parameters', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Ref Param API', version: '1.0' },
        paths: {
          '/test': {
            get: {
              summary: 'Test',
              parameters: [
                { $ref: '#/components/parameters/LimitParam' },
              ],
              responses: {},
            },
          },
        },
        components: {
          parameters: {
            LimitParam: { name: 'limit', in: 'query', schema: { type: 'integer', default: 25 } },
          },
        },
      };
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      expect(request.params.length).toBe(1);
      expect(request.params[0].key).toBe('limit');
      expect(request.params[0].value).toBe('25');
    });
  });

  describe('grouping edge cases', () => {
    it('should put all requests at root level when only untagged operations exist', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Untagged API', version: '1.0' },
        paths: {
          '/a': { get: { summary: 'A', responses: {} } },
          '/b': { post: { summary: 'B', responses: {} } },
        },
      };
      const result = service.importFromString(JSON.stringify(spec));
      // All items at root, no folders
      expect(result.collection.items.every((i: any) => i.type === 'request')).toBe(true);
      expect(result.collection.items.length).toBe(2);
    });

    // Behavior change: unlike the old vscode importer, `trace` is now recognized
    // as a valid OpenAPI operation method and is imported (only `x-` extension
    // keys and unrecognized method keys are skipped).
    it('should skip x- extension methods but include trace as a recognized method', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Extension API', version: '1.0' },
        paths: {
          '/test': {
            get: { summary: 'Valid', responses: {} },
            'x-custom': { summary: 'Extension' },
            trace: { summary: 'Trace not supported' },
          },
        },
      };
      const result = service.importFromString(JSON.stringify(spec));
      // The GET and TRACE methods should both be imported; x-custom is skipped
      expect(result.collection.items.length).toBe(2);
      expect((result.collection.items[0] as any).name).toBe('Valid');
      expect((result.collection.items[0] as any).method).toBe('GET');
      expect((result.collection.items[1] as any).name).toBe('Trace not supported');
      expect((result.collection.items[1] as any).method).toBe('TRACE');
    });

    it('should use method + path as name when no summary or operationId', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'No Name API', version: '1.0' },
        paths: {
          '/data': { delete: { responses: {} } },
        },
      };
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      expect(request.name).toBe('DELETE /data');
    });

    it('should use operationId as name when no summary is provided', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'OpId API', version: '1.0' },
        paths: {
          '/data': { get: { operationId: 'getData', responses: {} } },
        },
      };
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      expect(request.name).toBe('getData');
    });
  });

  describe('server and base URL edge cases', () => {
    it('should handle spec with no servers', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'No Server API', version: '1.0' },
        paths: {
          '/test': { get: { summary: 'Test', responses: {} } },
        },
      };
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      expect(request.url).toBe('/test');
      expect(result.variables).toBeUndefined();
    });

    it('should remove trailing slash from server URL', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Trailing Slash API', version: '1.0' },
        paths: {
          '/test': { get: { summary: 'Test', responses: {} } },
        },
        servers: [{ url: 'https://api.example.com/' }],
      };
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      expect(request.url).toBe('https://api.example.com/test');
    });

    it('should extract path parameters as variables when servers exist', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Path Vars API', version: '1.0' },
        paths: {
          '/users/{userId}/posts/{postId}': {
            get: { summary: 'Get Post', responses: {} },
          },
        },
        servers: [{ url: 'https://api.example.com' }],
      };
      const result = service.importFromString(JSON.stringify(spec));
      expect(result.variables).toBeDefined();
      expect(result.variables!.variables.some((v: any) => v.key === 'userId')).toBe(true);
      expect(result.variables!.variables.some((v: any) => v.key === 'postId')).toBe(true);
    });

    it('should not create duplicate variables for same path param in multiple paths', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Dup Vars API', version: '1.0' },
        paths: {
          '/users/{id}': { get: { summary: 'Get User', responses: {} } },
          '/posts/{id}': { get: { summary: 'Get Post', responses: {} } },
        },
        servers: [{ url: 'https://api.example.com' }],
      };
      const result = service.importFromString(JSON.stringify(spec));
      expect(result.variables).toBeDefined();
      const idVars = result.variables!.variables.filter((v: any) => v.key === 'id');
      expect(idVars.length).toBe(1);
    });
  });

  describe('schemaToFormData edge cases', () => {
    it('should return empty array when schema has no properties', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Form API', version: '1.0' },
        paths: {
          '/test': {
            post: {
              summary: 'Test',
              requestBody: {
                content: {
                  'multipart/form-data': {
                    schema: { type: 'object' },
                  },
                },
              },
              responses: {},
            },
          },
        },
      };
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      expect(request.body.type).toBe('form-data');
      const formItems = JSON.parse(request.body.content);
      expect(formItems).toEqual([]);
    });

    it('should return empty array when schema is null/undefined', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Form API', version: '1.0' },
        paths: {
          '/test': {
            post: {
              summary: 'Test',
              requestBody: {
                content: {
                  'multipart/form-data': {},
                },
              },
              responses: {},
            },
          },
        },
      };
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      expect(request.body.type).toBe('form-data');
      const formItems = JSON.parse(request.body.content);
      expect(formItems).toEqual([]);
    });
  });

  describe('parameter value extraction edge cases', () => {
    it('should use param example over schema default', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Param API', version: '1.0' },
        paths: {
          '/test': {
            get: {
              summary: 'Test',
              parameters: [
                { name: 'q', in: 'query', example: 'search-term', schema: { type: 'string', default: 'fallback' } },
              ],
              responses: {},
            },
          },
        },
      };
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      expect(request.params[0].value).toBe('search-term');
    });

    it('should use empty string when no example or default', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Param API', version: '1.0' },
        paths: {
          '/test': {
            get: {
              summary: 'Test',
              parameters: [
                { name: 'q', in: 'query' },
              ],
              responses: {},
            },
          },
        },
      };
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      expect(request.params[0].value).toBe('');
    });
  });

  describe('path-level parameters', () => {
    it('should merge path-level parameters with operation-level parameters', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Path Params API', version: '1.0' },
        paths: {
          '/users/{id}': {
            parameters: [
              { name: 'id', in: 'path', required: true, example: '123' },
            ],
            get: {
              summary: 'Get User',
              parameters: [
                { name: 'fields', in: 'query', example: 'name,email' },
              ],
              responses: {},
            },
          },
        },
      };
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      expect(request.params.length).toBe(1);
      expect(request.params[0].key).toBe('fields');
    });
  });

  describe('operation-level security override', () => {
    it('should use operation-level security instead of global security', () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Auth API', version: '1.0' },
        paths: {
          '/test': {
            get: {
              summary: 'Test',
              security: [{ basicAuth: [] }],
              responses: {},
            },
          },
        },
        components: {
          securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer' },
            basicAuth: { type: 'http', scheme: 'basic' },
          },
        },
        security: [{ bearerAuth: [] }],
      };
      const result = service.importFromString(JSON.stringify(spec));
      const request = result.collection.items[0] as any;
      // Operation-level security should override global
      expect(request.auth.type).toBe('basic');
    });
  });

  describe('webhooks', () => {
    const withWebhooks = (webhooks: unknown) => ({
      openapi: '3.1.0',
      info: { title: 'Hooks API', version: '1.0.0' },
      paths: { '/pets': { get: { summary: 'List', responses: {} } } },
      webhooks,
    });

    it('reports skipped webhook operations rather than dropping them silently', () => {
      const result = service.importFromString(
        JSON.stringify(
          withWebhooks({
            petAdded: { post: { summary: 'Added', responses: {} } },
            petRemoved: {
              post: { summary: 'Removed', responses: {} },
              additionalOperations: { NOTIFY: { summary: 'Notify', responses: {} } },
            },
          })
        )
      );

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('3 webhook operations skipped');
      // The webhooks themselves never become collection items.
      expect(result.collection.items).toHaveLength(1);
    });

    it('uses the singular form for a lone webhook operation', () => {
      const result = service.importFromString(
        JSON.stringify(withWebhooks({ petAdded: { post: { responses: {} } } }))
      );
      expect(result.warnings[0]).toContain('1 webhook operation skipped');
    });

    it('warns about nothing when the document declares no webhooks', () => {
      const result = service.importFromString(JSON.stringify(minimalSpec));
      expect(result.warnings).toEqual([]);
    });

    it('ignores a malformed webhooks value', () => {
      expect(service.importFromString(JSON.stringify(withWebhooks(['nope']))).warnings).toEqual([]);
      expect(service.importFromString(JSON.stringify(withWebhooks(null))).warnings).toEqual([]);
    });
  });
});
