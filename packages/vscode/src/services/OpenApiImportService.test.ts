import { OpenApiImportService } from './OpenApiImportService';

// The conversion logic lives in @nouto/core (see
// packages/core/src/services/openapi/OpenApiImportService.test.ts for the
// full conversion suite). These tests cover only the VS Code platform
// adapter: file loading, URL fetching, format-from-extension detection, and
// SSRF protection.

// Mock vscode
jest.mock('vscode', () => ({
  Uri: { file: (f: string) => ({ fsPath: f }) },
  workspace: { workspaceFolders: undefined },
}), { virtual: true });

// Mock fs
jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
}));

// Mock https for importFromUrl
jest.mock('https', () => ({
  get: jest.fn(),
}));

const fsPromises = require('fs/promises');
const mockHttps = require('https');

function mockHttpsGet(body: string | object) {
  const content = typeof body === 'string' ? body : JSON.stringify(body);
  const { PassThrough } = require('stream');
  mockHttps.get.mockImplementation((_url: string, _opts: any, cb: Function) => {
    const res = new PassThrough();
    (res as any).statusCode = 200;
    (res as any).headers = {};
    cb(res);
    res.end(Buffer.from(content, 'utf8'));
    return { on: jest.fn(), destroy: jest.fn() };
  });
}

describe('OpenApiImportService (VS Code adapter)', () => {
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
          responses: { '200': { description: 'OK' } },
        },
      },
    },
  };

  describe('importFromFile', () => {
    it('should import a JSON OpenAPI spec', async () => {
      fsPromises.readFile.mockResolvedValue(JSON.stringify(minimalSpec));

      const result = await service.importFromFile({ fsPath: '/test/spec.json' } as any);

      expect(result.collection).toBeDefined();
      expect(result.collection.name).toBe('Test API v1.0.0');
      expect(result.collection.items.length).toBeGreaterThan(0);
    });

    it('should import a YAML OpenAPI spec (format from extension)', async () => {
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

    it('should treat .yml as YAML', async () => {
      const yamlContent = 'openapi: "3.0.0"\ninfo:\n  title: Yml API\n  version: "1.0"\npaths: {}\n';
      fsPromises.readFile.mockResolvedValue(yamlContent);

      const result = await service.importFromFile({ fsPath: '/test/spec.yml' } as any);

      expect(result.collection.name).toBe('Yml API v1.0');
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
      mockHttpsGet(JSON.stringify(minimalSpec));

      const result = await service.importFromUrl('https://example.com/spec.json');

      expect(result.collection).toBeDefined();
      expect(result.collection.name).toBe('Test API v1.0.0');
    });

    it('should detect YAML from URL ending in .yml', async () => {
      const yamlContent = `
openapi: "3.0.0"
info:
  title: YML API
  version: "1.0.0"
paths:
  /hello:
    get:
      summary: Hello
      responses:
        "200":
          description: OK
`;
      mockHttpsGet(yamlContent);
      const result = await service.importFromUrl('https://example.com/spec.yml');
      expect(result.collection.name).toBe('YML API v1.0.0');
    });

    it('should detect YAML when URL does not end in yaml/yml and content is not JSON-like', async () => {
      const yamlContent = `
openapi: "3.0.0"
info:
  title: Auto YAML
  version: "1.0.0"
paths:
  /test:
    get:
      summary: Test
      responses:
        "200":
          description: OK
`;
      mockHttpsGet(yamlContent);
      const result = await service.importFromUrl('https://example.com/api-spec');
      expect(result.collection.name).toBe('Auto YAML v1.0.0');
    });
  });

  describe('SSRF protection', () => {
    it.each([
      'http://localhost/spec.json',
      'http://127.0.0.1/spec.json',
      'http://[::1]/spec.json',
      'http://10.0.0.5/spec.json',
      'http://172.16.0.1/spec.json',
      'http://192.168.1.1/spec.json',
      'http://169.254.1.1/spec.json',
      'http://0.0.0.0/spec.json',
    ])('blocks private/internal address %s', async (url) => {
      await expect(service.importFromUrl(url)).rejects.toThrow(
        'Blocked: URL points to a private/internal network address'
      );
      expect(mockHttps.get).not.toHaveBeenCalled();
    });

    it('blocks non-http(s) protocols', async () => {
      await expect(service.importFromUrl('ftp://example.com/spec.json')).rejects.toThrow('Blocked');
    });

    it('blocks unparseable URLs', async () => {
      await expect(service.importFromUrl('not a url')).rejects.toThrow('Blocked');
    });
  });

  describe('fetch behavior', () => {
    it('rejects on non-2xx status', async () => {
      const { PassThrough } = require('stream');
      mockHttps.get.mockImplementation((_url: string, _opts: any, cb: Function) => {
        const res = new PassThrough();
        (res as any).statusCode = 404;
        (res as any).headers = {};
        cb(res);
        res.end();
        return { on: jest.fn(), destroy: jest.fn() };
      });

      await expect(service.importFromUrl('https://example.com/missing.json')).rejects.toThrow('HTTP 404');
    });

    it('follows redirects up to the cap', async () => {
      const { PassThrough } = require('stream');
      let calls = 0;
      mockHttps.get.mockImplementation((_url: string, _opts: any, cb: Function) => {
        calls++;
        const res = new PassThrough();
        (res as any).statusCode = 301;
        (res as any).headers = { location: 'https://example.com/next' };
        cb(res);
        res.end();
        return { on: jest.fn(), destroy: jest.fn() };
      });

      await expect(service.importFromUrl('https://example.com/spec.json')).rejects.toThrow('Too many redirects');
      expect(calls).toBe(6); // initial request + 5 redirects
    });
  });
});
