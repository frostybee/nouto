import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MockStorageService } from './MockStorageService';
import type { MockServerConfig } from '../types';

describe('MockStorageService', () => {
  let tempDir: string;
  let service: MockStorageService;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `hivefetch-mock-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tempDir, { recursive: true });
    service = new MockStorageService(tempDir);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {}
  });

  describe('load', () => {
    it('should return default config when file does not exist', async () => {
      const config = await service.load();
      expect(config.port).toBe(3000);
      expect(config.routes).toEqual([]);
    });

    it('should load existing config from file', async () => {
      const mockConfig: MockServerConfig = {
        port: 8080,
        routes: [{
          id: 'r1',
          enabled: true,
          method: 'GET',
          path: '/api',
          statusCode: 200,
          responseBody: '{"ok":true}',
          responseHeaders: [],
          latencyMin: 0,
          latencyMax: 0,
        }],
      };
      await fs.writeFile(path.join(tempDir, 'mocks.json'), JSON.stringify(mockConfig), 'utf8');

      const loaded = await service.load();
      expect(loaded.port).toBe(8080);
      expect(loaded.routes).toHaveLength(1);
      expect(loaded.routes[0].path).toBe('/api');
    });
  });

  describe('save', () => {
    it('should save config to file', async () => {
      const config: MockServerConfig = {
        port: 5000,
        routes: [{
          id: 'r1',
          enabled: true,
          method: 'POST',
          path: '/data',
          statusCode: 201,
          responseBody: '{"created":true}',
          responseHeaders: [],
          latencyMin: 100,
          latencyMax: 200,
        }],
      };

      const result = await service.save(config);
      expect(result).toBe(true);

      const filePath = path.join(tempDir, 'mocks.json');
      expect(existsSync(filePath)).toBe(true);

      const loaded = JSON.parse(await fs.readFile(filePath, 'utf8'));
      expect(loaded.port).toBe(5000);
      expect(loaded.routes[0].path).toBe('/data');
    });

    it('should create directory if it does not exist', async () => {
      const nestedDir = path.join(tempDir, 'nested', 'dir');
      const nestedService = new MockStorageService(nestedDir);

      const config: MockServerConfig = { port: 3000, routes: [] };
      const result = await nestedService.save(config);
      expect(result).toBe(true);
      expect(existsSync(path.join(nestedDir, 'mocks.json'))).toBe(true);
    });
  });

  describe('collectionToRoutes', () => {
    it('should convert collection requests to mock routes', () => {
      const collection = {
        items: [
          { type: 'request', url: 'https://api.example.com/users', method: 'GET', name: 'Get Users' },
          { type: 'request', url: 'https://api.example.com/users', method: 'POST', name: 'Create User' },
        ],
      };

      const routes = MockStorageService.collectionToRoutes(collection);
      expect(routes).toHaveLength(2);
      expect(routes[0].path).toBe('/users');
      expect(routes[0].method).toBe('GET');
      expect(routes[1].method).toBe('POST');
    });

    it('should handle nested folders', () => {
      const collection = {
        items: [
          {
            type: 'folder',
            children: [
              { type: 'request', url: 'https://api.example.com/posts', method: 'GET', name: 'Get Posts' },
            ],
          },
          { type: 'request', url: 'https://api.example.com/users', method: 'GET', name: 'Get Users' },
        ],
      };

      const routes = MockStorageService.collectionToRoutes(collection);
      expect(routes).toHaveLength(2);
    });

    it('should skip invalid URLs', () => {
      const collection = {
        items: [
          { type: 'request', url: '', method: 'GET', name: 'Empty URL' },
          { type: 'request', url: 'https://api.example.com/valid', method: 'GET', name: 'Valid' },
        ],
      };

      const routes = MockStorageService.collectionToRoutes(collection);
      expect(routes).toHaveLength(1);
    });
  });
});
