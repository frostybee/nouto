import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PerRequestStorageStrategy } from './PerRequestStorageStrategy';
import type { Collection, SavedRequest, Folder, EnvironmentsData } from '../types';

describe('PerRequestStorageStrategy', () => {
  let tempDir: string;
  let strategy: PerRequestStorageStrategy;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `hivefetch-per-req-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tempDir, { recursive: true });
    strategy = new PerRequestStorageStrategy(tempDir);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {}
  });

  // ── Helpers ─────────────────────────────────────────────────────

  const makeRequest = (id: string, name: string, method = 'GET', url = 'https://example.com'): SavedRequest => ({
    type: 'request',
    id,
    name,
    method,
    url,
    params: [],
    headers: [],
    auth: { type: 'none' },
    body: { type: 'none', content: '' },
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  });

  const makeFolder = (id: string, name: string, children: (SavedRequest | Folder)[] = []): Folder => ({
    type: 'folder',
    id,
    name,
    children,
    expanded: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  });

  const makeCollection = (id: string, name: string, items: (SavedRequest | Folder)[] = []): Collection => ({
    id,
    name,
    items,
    expanded: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  });

  const makeRecentCollection = (items: SavedRequest[] = []): Collection => ({
    id: 'recent',
    name: 'Recent',
    items,
    expanded: true,
    builtin: 'recent' as any,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  });

  // ── loadCollections ─────────────────────────────────────────────

  describe('loadCollections', () => {
    it('should return empty array when collections dir does not exist', async () => {
      const result = await strategy.loadCollections();
      expect(result).toEqual([]);
    });

    it('should load a collection with requests at root level', async () => {
      const col = makeCollection('col-1', 'My API', [
        makeRequest('req-1', 'Login', 'POST', 'https://api.example.com/login'),
        makeRequest('req-2', 'Get Users', 'GET', 'https://api.example.com/users'),
      ]);

      await strategy.saveCollections([col]);
      const result = await strategy.loadCollections();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('My API');
      expect(result[0].items).toHaveLength(2);
      expect((result[0].items[0] as SavedRequest).name).toBe('Login');
      expect((result[0].items[1] as SavedRequest).name).toBe('Get Users');
    });

    it('should load nested folders with requests', async () => {
      const col = makeCollection('col-1', 'API', [
        makeRequest('req-1', 'Root Request'),
        makeFolder('fld-1', 'auth', [
          makeRequest('req-2', 'Login'),
          makeRequest('req-3', 'Register'),
        ]),
      ]);

      await strategy.saveCollections([col]);
      const result = await strategy.loadCollections();

      expect(result).toHaveLength(1);
      expect(result[0].items).toHaveLength(2);

      const rootReq = result[0].items[0] as SavedRequest;
      expect(rootReq.name).toBe('Root Request');

      const folder = result[0].items[1] as Folder;
      expect(folder.type).toBe('folder');
      expect(folder.name).toBe('auth');
      expect(folder.children).toHaveLength(2);
      expect((folder.children[0] as SavedRequest).name).toBe('Login');
      expect((folder.children[1] as SavedRequest).name).toBe('Register');
    });

    it('should preserve order via _order.json', async () => {
      const col = makeCollection('col-1', 'API', [
        makeRequest('req-3', 'Zulu'),
        makeRequest('req-1', 'Alpha'),
        makeRequest('req-2', 'Mike'),
      ]);

      await strategy.saveCollections([col]);
      const result = await strategy.loadCollections();

      const names = result[0].items.map(i => (i as SavedRequest).name);
      expect(names).toEqual(['Zulu', 'Alpha', 'Mike']);
    });

    it('should append items not in _order.json at end', async () => {
      const col = makeCollection('col-1', 'API', [
        makeRequest('req-1', 'First'),
      ]);

      await strategy.saveCollections([col]);

      // Manually add a request file that is not in _order.json
      const colDir = path.join(tempDir, 'collections', 'API');
      const extraReq = makeRequest('req-extra', 'Extra');
      const { type, ...data } = extraReq;
      await fs.writeFile(path.join(colDir, 'Extra.json'), JSON.stringify(data, null, 2), 'utf8');

      const result = await strategy.loadCollections();
      expect(result[0].items).toHaveLength(2);
      expect((result[0].items[0] as SavedRequest).name).toBe('First');
      expect((result[0].items[1] as SavedRequest).name).toBe('Extra');
    });

    it('should handle corrupted _collection.json gracefully', async () => {
      const collectionsDir = path.join(tempDir, 'collections');
      const colDir = path.join(collectionsDir, 'bad-col');
      await fs.mkdir(colDir, { recursive: true });
      await fs.writeFile(path.join(colDir, '_collection.json'), '{ invalid json', 'utf8');

      // Also save a good collection
      const good = makeCollection('good', 'Good', [makeRequest('r1', 'Test')]);
      await strategy.saveCollections([good]);

      // Re-create the bad one (saveCollections would have cleaned it up)
      await fs.mkdir(colDir, { recursive: true });
      await fs.writeFile(path.join(colDir, '_collection.json'), '{ invalid', 'utf8');

      const result = await strategy.loadCollections();
      // Should still load the good collection
      expect(result.some(c => c.name === 'Good')).toBe(true);
    });

    it('should skip corrupted request files gracefully', async () => {
      const col = makeCollection('col-1', 'API', [
        makeRequest('req-1', 'Good Request'),
      ]);
      await strategy.saveCollections([col]);

      // Add a corrupted request file
      const colDir = path.join(tempDir, 'collections', 'API');
      await fs.writeFile(path.join(colDir, 'Bad.json'), '{ not valid', 'utf8');

      const result = await strategy.loadCollections();
      expect(result[0].items).toHaveLength(1);
      expect((result[0].items[0] as SavedRequest).name).toBe('Good Request');
    });

    it('should skip directories without _collection.json', async () => {
      const collectionsDir = path.join(tempDir, 'collections');
      const emptyDir = path.join(collectionsDir, 'no-meta');
      await fs.mkdir(emptyDir, { recursive: true });

      const col = makeCollection('col-1', 'Valid', [makeRequest('r1', 'Test')]);
      await strategy.saveCollections([col]);

      // Re-create the dir without _collection.json (saveCollections cleaned it)
      await fs.mkdir(emptyDir, { recursive: true });

      const result = await strategy.loadCollections();
      expect(result.some(c => c.name === 'Valid')).toBe(true);
      expect(result.some(c => c.name === 'no-meta')).toBe(false);
    });
  });

  // ── saveCollections ─────────────────────────────────────────────

  describe('saveCollections', () => {
    it('should create directory structure for collections', async () => {
      const col = makeCollection('col-1', 'My API', [
        makeRequest('req-1', 'Login'),
      ]);

      const result = await strategy.saveCollections([col]);
      expect(result).toBe(true);

      const colDir = path.join(tempDir, 'collections', 'My API');
      expect(existsSync(path.join(colDir, '_collection.json'))).toBe(true);
      expect(existsSync(path.join(colDir, '_order.json'))).toBe(true);
      expect(existsSync(path.join(colDir, 'Login.json'))).toBe(true);
    });

    it('should store collection metadata without items', async () => {
      const col = makeCollection('col-1', 'My API', [
        makeRequest('req-1', 'Login'),
      ]);
      col.auth = { type: 'bearer', token: 'abc' } as any;

      await strategy.saveCollections([col]);

      const metaPath = path.join(tempDir, 'collections', 'My API', '_collection.json');
      const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
      expect(meta.id).toBe('col-1');
      expect(meta.name).toBe('My API');
      expect(meta.auth).toEqual({ type: 'bearer', token: 'abc' });
      expect(meta.items).toBeUndefined();
    });

    it('should strip type field from request files', async () => {
      const col = makeCollection('col-1', 'API', [
        makeRequest('req-1', 'Test'),
      ]);

      await strategy.saveCollections([col]);

      const reqPath = path.join(tempDir, 'collections', 'API', 'Test.json');
      const data = JSON.parse(await fs.readFile(reqPath, 'utf8'));
      expect(data.type).toBeUndefined();
      expect(data.id).toBe('req-1');
      expect(data.name).toBe('Test');
    });

    it('should create subdirectories for folders', async () => {
      const col = makeCollection('col-1', 'API', [
        makeFolder('fld-1', 'auth', [
          makeRequest('req-1', 'Login'),
        ]),
      ]);

      await strategy.saveCollections([col]);

      const folderDir = path.join(tempDir, 'collections', 'API', 'auth');
      expect(existsSync(path.join(folderDir, '_folder.json'))).toBe(true);
      expect(existsSync(path.join(folderDir, '_order.json'))).toBe(true);
      expect(existsSync(path.join(folderDir, 'Login.json'))).toBe(true);
    });

    it('should handle filename sanitization', async () => {
      const col = makeCollection('col-1', 'API', [
        makeRequest('req-1', 'GET /api/users?id=1'),
      ]);

      await strategy.saveCollections([col]);

      const colDir = path.join(tempDir, 'collections', 'API');
      const files = await fs.readdir(colDir);
      // The sanitized name should exist as a .json file
      const requestFiles = files.filter(f => f !== '_collection.json' && f !== '_order.json');
      expect(requestFiles).toHaveLength(1);
      expect(requestFiles[0]).toMatch(/\.json$/);
    });

    it('should resolve filename collisions for duplicate names', async () => {
      const col = makeCollection('col-1', 'API', [
        makeRequest('req-1', 'Login'),
        makeRequest('req-2', 'Login'),
      ]);

      await strategy.saveCollections([col]);

      const colDir = path.join(tempDir, 'collections', 'API');
      expect(existsSync(path.join(colDir, 'Login.json'))).toBe(true);
      expect(existsSync(path.join(colDir, 'Login_2.json'))).toBe(true);
    });

    it('should delete orphaned request files', async () => {
      // Save with two requests
      const col = makeCollection('col-1', 'API', [
        makeRequest('req-1', 'Keep'),
        makeRequest('req-2', 'Delete'),
      ]);
      await strategy.saveCollections([col]);

      // Save again with only one request
      col.items = [makeRequest('req-1', 'Keep')];
      await strategy.saveCollections([col]);

      const colDir = path.join(tempDir, 'collections', 'API');
      expect(existsSync(path.join(colDir, 'Keep.json'))).toBe(true);
      expect(existsSync(path.join(colDir, 'Delete.json'))).toBe(false);
    });

    it('should delete orphaned folder directories', async () => {
      const col = makeCollection('col-1', 'API', [
        makeFolder('fld-1', 'old-folder', [makeRequest('r1', 'Test')]),
      ]);
      await strategy.saveCollections([col]);

      // Save again without the folder
      col.items = [makeRequest('req-1', 'Root')];
      await strategy.saveCollections([col]);

      const colDir = path.join(tempDir, 'collections', 'API');
      expect(existsSync(path.join(colDir, 'old-folder'))).toBe(false);
      expect(existsSync(path.join(colDir, 'Root.json'))).toBe(true);
    });

    it('should delete orphaned collection directories', async () => {
      const col1 = makeCollection('col-1', 'Alpha', [makeRequest('r1', 'Test')]);
      const col2 = makeCollection('col-2', 'Beta', [makeRequest('r2', 'Test')]);
      await strategy.saveCollections([col1, col2]);

      // Save again with only one collection
      await strategy.saveCollections([col1]);

      expect(existsSync(path.join(tempDir, 'collections', 'Alpha'))).toBe(true);
      expect(existsSync(path.join(tempDir, 'collections', 'Beta'))).toBe(false);
    });
  });

  // ── Recent collection ───────────────────────────────────────────

  describe('Recent collection', () => {
    it('should store Recent as _recent.json single file', async () => {
      const recent = makeRecentCollection([makeRequest('r1', 'GET /test')]);
      await strategy.saveCollections([recent]);

      const recentPath = path.join(tempDir, 'collections', '_recent.json');
      expect(existsSync(recentPath)).toBe(true);

      const data = JSON.parse(await fs.readFile(recentPath, 'utf8'));
      expect(data.builtin).toBe('recent');
      expect(data.items).toHaveLength(1);
    });

    it('should load Recent from _recent.json', async () => {
      const recent = makeRecentCollection([makeRequest('r1', 'GET /test')]);
      await strategy.saveCollections([recent]);

      const result = await strategy.loadCollections();
      expect(result).toHaveLength(1);
      expect(result[0].builtin).toBe('recent');
      expect(result[0].items).toHaveLength(1);
    });

    it('should handle Recent alongside regular collections', async () => {
      const recent = makeRecentCollection([makeRequest('r1', 'Recent req')]);
      const col = makeCollection('col-1', 'API', [makeRequest('r2', 'Test')]);

      await strategy.saveCollections([recent, col]);
      const result = await strategy.loadCollections();

      expect(result).toHaveLength(2);
      // Recent should come first
      expect(result[0].builtin).toBe('recent');
      expect(result[1].name).toBe('API');
    });
  });

  // ── Round-trip ──────────────────────────────────────────────────

  describe('round-trip', () => {
    it('should preserve deeply nested structures', async () => {
      const col = makeCollection('col-1', 'Deep', [
        makeFolder('f1', 'Level 1', [
          makeFolder('f2', 'Level 2', [
            makeFolder('f3', 'Level 3', [
              makeRequest('r1', 'Deep Request', 'POST', 'https://deep.example.com'),
            ]),
          ]),
        ]),
      ]);

      await strategy.saveCollections([col]);
      const result = await strategy.loadCollections();

      const l1 = result[0].items[0] as Folder;
      expect(l1.name).toBe('Level 1');
      const l2 = l1.children[0] as Folder;
      expect(l2.name).toBe('Level 2');
      const l3 = l2.children[0] as Folder;
      expect(l3.name).toBe('Level 3');
      const req = l3.children[0] as SavedRequest;
      expect(req.name).toBe('Deep Request');
      expect(req.method).toBe('POST');
    });

    it('should preserve collection metadata through round-trip', async () => {
      const col = makeCollection('col-1', 'API');
      col.auth = { type: 'bearer', token: 'test' } as any;
      col.headers = [{ key: 'X-Custom', value: 'val', enabled: true }] as any;
      col.variables = [{ key: 'baseUrl', value: 'http://localhost', enabled: true }] as any;
      col.description = 'Test collection';
      col.items = [makeRequest('r1', 'Test')];

      await strategy.saveCollections([col]);
      const result = await strategy.loadCollections();

      expect(result[0].auth).toEqual({ type: 'bearer', token: 'test' });
      expect(result[0].headers).toEqual([{ key: 'X-Custom', value: 'val', enabled: true }]);
      expect(result[0].variables).toEqual([{ key: 'baseUrl', value: 'http://localhost', enabled: true }]);
      expect(result[0].description).toBe('Test collection');
    });

    it('should preserve folder metadata through round-trip', async () => {
      const folder = makeFolder('f1', 'Auth');
      folder.auth = { type: 'basic', username: 'user', password: 'pass' } as any;
      folder.description = 'Auth folder';
      folder.children = [makeRequest('r1', 'Login')];

      const col = makeCollection('col-1', 'API', [folder]);

      await strategy.saveCollections([col]);
      const result = await strategy.loadCollections();

      const loadedFolder = result[0].items[0] as Folder;
      expect(loadedFolder.auth).toEqual({ type: 'basic', username: 'user', password: 'pass' });
      expect(loadedFolder.description).toBe('Auth folder');
    });
  });

  // ── Environments ────────────────────────────────────────────────

  describe('environments', () => {
    it('should save and load environments', async () => {
      const envData: EnvironmentsData = {
        environments: [{ id: 'env-1', name: 'Dev', variables: [{ key: 'url', value: 'http://localhost', enabled: true }] }],
        activeId: 'env-1',
      };

      await strategy.saveEnvironments(envData);
      const loaded = await strategy.loadEnvironments();
      expect(loaded.environments).toHaveLength(1);
      expect(loaded.activeId).toBe('env-1');
    });

    it('should return defaults when no environments file', async () => {
      const result = await strategy.loadEnvironments();
      expect(result).toEqual({ environments: [], activeId: null });
    });
  });

  // ── .gitignore ──────────────────────────────────────────────────

  describe('ensureGitignore', () => {
    it('should create .gitignore with _recent.json entry', async () => {
      await strategy.ensureGitignore();
      const gitignorePath = path.join(tempDir, '.gitignore');
      expect(existsSync(gitignorePath)).toBe(true);
      const content = await fs.readFile(gitignorePath, 'utf8');
      expect(content).toContain('_recent.json');
      expect(content).toContain('Auto-generated by HiveFetch');
    });

    it('should not overwrite existing .gitignore', async () => {
      await fs.mkdir(tempDir, { recursive: true });
      const gitignorePath = path.join(tempDir, '.gitignore');
      await fs.writeFile(gitignorePath, 'custom content\n', 'utf8');

      await strategy.ensureGitignore();
      const content = await fs.readFile(gitignorePath, 'utf8');
      expect(content).toBe('custom content\n');
    });
  });

  // ── getStorageDir ───────────────────────────────────────────────

  describe('getStorageDir', () => {
    it('should return the storage directory', () => {
      expect(strategy.getStorageDir()).toBe(tempDir);
    });
  });
});
