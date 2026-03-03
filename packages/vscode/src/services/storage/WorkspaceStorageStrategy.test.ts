import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { WorkspaceStorageStrategy } from './WorkspaceStorageStrategy';
import type { Collection, SavedRequest, Folder, EnvironmentsData } from '../types';

describe('WorkspaceStorageStrategy', () => {
  let tempDir: string;
  let strategy: WorkspaceStorageStrategy;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `hivefetch-ws-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tempDir, { recursive: true });
    strategy = new WorkspaceStorageStrategy(tempDir);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {}
  });

  const makeRequest = (id: string, name: string, method = 'GET', url = 'https://example.com'): SavedRequest => ({
    type: 'request',
    id,
    name,
    method: method as any,
    url,
    params: [],
    headers: [],
    auth: { type: 'none' } as any,
    body: { type: 'none', content: '' } as any,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  });

  const makeFolder = (id: string, name: string, children: any[] = []): Folder => ({
    type: 'folder',
    id,
    name,
    children,
    expanded: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  });

  const makeCollection = (id: string, name: string, items: any[] = []): Collection => ({
    id,
    name,
    items,
    expanded: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  });

  // ── Load ────────────────────────────────────────────────────────────

  describe('loadCollections', () => {
    it('should return empty array when .hivefetch/collections does not exist', async () => {
      const result = await strategy.loadCollections();
      expect(result).toEqual([]);
    });

    it('should return empty array when collections dir exists but is empty', async () => {
      await fs.mkdir(path.join(tempDir, '.hivefetch', 'collections'), { recursive: true });
      const result = await strategy.loadCollections();
      expect(result).toEqual([]);
    });

    it('should load a collection with requests', async () => {
      const colDir = path.join(tempDir, '.hivefetch', 'collections', 'my-api');
      await fs.mkdir(colDir, { recursive: true });

      // Write _meta.json
      await fs.writeFile(path.join(colDir, '_meta.json'), JSON.stringify({
        id: 'col-1',
        name: 'My API',
        expanded: true,
        sortOrder: ['login', 'register'],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      }), 'utf8');

      // Write request files
      await fs.writeFile(path.join(colDir, 'login.json'), JSON.stringify(
        makeRequest('req-1', 'Login', 'POST', 'https://api.example.com/login')
      ), 'utf8');

      await fs.writeFile(path.join(colDir, 'register.json'), JSON.stringify(
        makeRequest('req-2', 'Register', 'POST', 'https://api.example.com/register')
      ), 'utf8');

      const result = await strategy.loadCollections();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('col-1');
      expect(result[0].name).toBe('My API');
      expect(result[0].items).toHaveLength(2);
      expect((result[0].items[0] as SavedRequest).name).toBe('Login');
      expect((result[0].items[1] as SavedRequest).name).toBe('Register');
    });

    it('should load a collection with nested folders', async () => {
      const colDir = path.join(tempDir, '.hivefetch', 'collections', 'my-api');
      const authDir = path.join(colDir, 'auth');
      await fs.mkdir(authDir, { recursive: true });

      // Collection meta
      await fs.writeFile(path.join(colDir, '_meta.json'), JSON.stringify({
        id: 'col-1', name: 'My API', expanded: true,
        sortOrder: ['health', 'auth'],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      }), 'utf8');

      // Root request
      await fs.writeFile(path.join(colDir, 'health.json'), JSON.stringify(
        makeRequest('req-0', 'Health', 'GET', 'https://api.example.com/health')
      ), 'utf8');

      // Folder meta
      await fs.writeFile(path.join(authDir, '_meta.json'), JSON.stringify({
        id: 'folder-1', name: 'Auth', expanded: true,
        sortOrder: ['login'],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      }), 'utf8');

      // Folder request
      await fs.writeFile(path.join(authDir, 'login.json'), JSON.stringify(
        makeRequest('req-1', 'Login', 'POST', 'https://api.example.com/login')
      ), 'utf8');

      const result = await strategy.loadCollections();
      expect(result).toHaveLength(1);
      expect(result[0].items).toHaveLength(2);

      // First item is Health request (per sortOrder)
      expect((result[0].items[0] as SavedRequest).name).toBe('Health');

      // Second item is Auth folder
      const folder = result[0].items[1] as Folder;
      expect(folder.type).toBe('folder');
      expect(folder.name).toBe('Auth');
      expect(folder.children).toHaveLength(1);
      expect((folder.children[0] as SavedRequest).name).toBe('Login');
    });

    it('should skip directories without _meta.json', async () => {
      const colDir = path.join(tempDir, '.hivefetch', 'collections');
      await fs.mkdir(path.join(colDir, 'no-meta'), { recursive: true });
      await fs.writeFile(path.join(colDir, 'no-meta', 'something.json'), '{}', 'utf8');

      const result = await strategy.loadCollections();
      expect(result).toEqual([]);
    });

    it('should handle corrupted _meta.json gracefully', async () => {
      const colDir = path.join(tempDir, '.hivefetch', 'collections');
      const goodDir = path.join(colDir, 'good');
      const badDir = path.join(colDir, 'bad');
      await fs.mkdir(goodDir, { recursive: true });
      await fs.mkdir(badDir, { recursive: true });

      // Good collection
      await fs.writeFile(path.join(goodDir, '_meta.json'), JSON.stringify({
        id: 'col-good', name: 'Good', expanded: true, sortOrder: [],
        createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      }), 'utf8');

      // Bad collection
      await fs.writeFile(path.join(badDir, '_meta.json'), '{ invalid json', 'utf8');

      const result = await strategy.loadCollections();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Good');
    });

    it('should handle corrupted request files gracefully', async () => {
      const colDir = path.join(tempDir, '.hivefetch', 'collections', 'test');
      await fs.mkdir(colDir, { recursive: true });

      await fs.writeFile(path.join(colDir, '_meta.json'), JSON.stringify({
        id: 'col-1', name: 'Test', expanded: true, sortOrder: ['good', 'bad'],
        createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      }), 'utf8');

      await fs.writeFile(path.join(colDir, 'good.json'), JSON.stringify(
        makeRequest('req-1', 'Good')
      ), 'utf8');
      await fs.writeFile(path.join(colDir, 'bad.json'), '{ broken', 'utf8');

      const result = await strategy.loadCollections();
      expect(result).toHaveLength(1);
      expect(result[0].items).toHaveLength(1);
      expect((result[0].items[0] as SavedRequest).name).toBe('Good');
    });

    it('should respect sortOrder for deterministic ordering', async () => {
      const colDir = path.join(tempDir, '.hivefetch', 'collections', 'test');
      await fs.mkdir(colDir, { recursive: true });

      await fs.writeFile(path.join(colDir, '_meta.json'), JSON.stringify({
        id: 'col-1', name: 'Test', expanded: true,
        sortOrder: ['beta', 'alpha'], // Reverse of alphabetical
        createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      }), 'utf8');

      await fs.writeFile(path.join(colDir, 'alpha.json'), JSON.stringify(
        makeRequest('req-a', 'Alpha')
      ), 'utf8');
      await fs.writeFile(path.join(colDir, 'beta.json'), JSON.stringify(
        makeRequest('req-b', 'Beta')
      ), 'utf8');

      const result = await strategy.loadCollections();
      expect(result[0].items).toHaveLength(2);
      expect((result[0].items[0] as SavedRequest).name).toBe('Beta');
      expect((result[0].items[1] as SavedRequest).name).toBe('Alpha');
    });

    it('should append items not in sortOrder at the end', async () => {
      const colDir = path.join(tempDir, '.hivefetch', 'collections', 'test');
      await fs.mkdir(colDir, { recursive: true });

      await fs.writeFile(path.join(colDir, '_meta.json'), JSON.stringify({
        id: 'col-1', name: 'Test', expanded: true,
        sortOrder: ['first'], // Only knows about 'first'
        createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      }), 'utf8');

      await fs.writeFile(path.join(colDir, 'first.json'), JSON.stringify(
        makeRequest('req-1', 'First')
      ), 'utf8');
      await fs.writeFile(path.join(colDir, 'unknown.json'), JSON.stringify(
        makeRequest('req-2', 'Unknown')
      ), 'utf8');

      const result = await strategy.loadCollections();
      expect(result[0].items).toHaveLength(2);
      expect((result[0].items[0] as SavedRequest).name).toBe('First');
      expect((result[0].items[1] as SavedRequest).name).toBe('Unknown');
    });

    it('should load multiple collections sorted by name', async () => {
      const colsDir = path.join(tempDir, '.hivefetch', 'collections');
      const dirZ = path.join(colsDir, 'z-api');
      const dirA = path.join(colsDir, 'a-api');
      await fs.mkdir(dirZ, { recursive: true });
      await fs.mkdir(dirA, { recursive: true });

      await fs.writeFile(path.join(dirZ, '_meta.json'), JSON.stringify({
        id: 'col-z', name: 'Zulu API', expanded: true, sortOrder: [],
        createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      }), 'utf8');

      await fs.writeFile(path.join(dirA, '_meta.json'), JSON.stringify({
        id: 'col-a', name: 'Alpha API', expanded: true, sortOrder: [],
        createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      }), 'utf8');

      const result = await strategy.loadCollections();
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Alpha API');
      expect(result[1].name).toBe('Zulu API');
    });
  });

  // ── Save ────────────────────────────────────────────────────────────

  describe('saveCollections', () => {
    it('should create directory tree for a collection with requests', async () => {
      const col = makeCollection('col-1', 'My API', [
        makeRequest('req-1', 'Login', 'POST', 'https://api.example.com/login'),
        makeRequest('req-2', 'Register', 'POST', 'https://api.example.com/register'),
      ]);

      const result = await strategy.saveCollections([col]);
      expect(result).toBe(true);

      const colDir = path.join(tempDir, '.hivefetch', 'collections', 'my-api');
      expect(existsSync(colDir)).toBe(true);
      expect(existsSync(path.join(colDir, '_meta.json'))).toBe(true);
      expect(existsSync(path.join(colDir, 'login.json'))).toBe(true);
      expect(existsSync(path.join(colDir, 'register.json'))).toBe(true);

      // Verify meta content
      const meta = JSON.parse(await fs.readFile(path.join(colDir, '_meta.json'), 'utf8'));
      expect(meta.id).toBe('col-1');
      expect(meta.name).toBe('My API');
      expect(meta.sortOrder).toEqual(['login', 'register']);
    });

    it('should create nested directories for folders', async () => {
      const col = makeCollection('col-1', 'My API', [
        makeFolder('folder-1', 'Auth', [
          makeRequest('req-1', 'Login', 'POST'),
        ]),
      ]);

      await strategy.saveCollections([col]);

      const authDir = path.join(tempDir, '.hivefetch', 'collections', 'my-api', 'auth');
      expect(existsSync(authDir)).toBe(true);
      expect(existsSync(path.join(authDir, '_meta.json'))).toBe(true);
      expect(existsSync(path.join(authDir, 'login.json'))).toBe(true);

      const folderMeta = JSON.parse(await fs.readFile(path.join(authDir, '_meta.json'), 'utf8'));
      expect(folderMeta.id).toBe('folder-1');
      expect(folderMeta.name).toBe('Auth');
    });

    it('should delete orphaned request files on save', async () => {
      // First save with two requests
      const col = makeCollection('col-1', 'Test', [
        makeRequest('req-1', 'Alpha'),
        makeRequest('req-2', 'Beta'),
      ]);
      await strategy.saveCollections([col]);

      const colDir = path.join(tempDir, '.hivefetch', 'collections', 'test');
      expect(existsSync(path.join(colDir, 'alpha.json'))).toBe(true);
      expect(existsSync(path.join(colDir, 'beta.json'))).toBe(true);

      // Second save with only one request (Beta removed)
      col.items = [makeRequest('req-1', 'Alpha')];
      await strategy.saveCollections([col]);

      expect(existsSync(path.join(colDir, 'alpha.json'))).toBe(true);
      expect(existsSync(path.join(colDir, 'beta.json'))).toBe(false);
    });

    it('should delete orphaned collection directories', async () => {
      // Save two collections
      await strategy.saveCollections([
        makeCollection('col-1', 'First'),
        makeCollection('col-2', 'Second'),
      ]);

      const colsDir = path.join(tempDir, '.hivefetch', 'collections');
      expect(existsSync(path.join(colsDir, 'first'))).toBe(true);
      expect(existsSync(path.join(colsDir, 'second'))).toBe(true);

      // Save only one collection
      await strategy.saveCollections([
        makeCollection('col-1', 'First'),
      ]);

      expect(existsSync(path.join(colsDir, 'first'))).toBe(true);
      expect(existsSync(path.join(colsDir, 'second'))).toBe(false);
    });

    it('should delete orphaned folder directories', async () => {
      // Save with a folder
      const col = makeCollection('col-1', 'Test', [
        makeFolder('folder-1', 'Old Folder', [makeRequest('req-1', 'Request')]),
      ]);
      await strategy.saveCollections([col]);

      const colDir = path.join(tempDir, '.hivefetch', 'collections', 'test');
      expect(existsSync(path.join(colDir, 'old-folder'))).toBe(true);

      // Save without the folder
      col.items = [makeRequest('req-2', 'Direct')];
      await strategy.saveCollections([col]);

      expect(existsSync(path.join(colDir, 'old-folder'))).toBe(false);
      expect(existsSync(path.join(colDir, 'direct.json'))).toBe(true);
    });

    it('should skip builtin collections', async () => {
      const recent: Collection = {
        ...makeCollection('__recent__', 'Recent'),
        builtin: 'recent',
      };
      const normal = makeCollection('col-1', 'My API');

      await strategy.saveCollections([recent, normal]);

      const colsDir = path.join(tempDir, '.hivefetch', 'collections');
      expect(existsSync(path.join(colsDir, 'my-api'))).toBe(true);
      expect(existsSync(path.join(colsDir, 'recent'))).toBe(false);
    });
  });

  // ── Round-trip ──────────────────────────────────────────────────────

  describe('save + load roundtrip', () => {
    it('should preserve data through save and load', async () => {
      const original = makeCollection('col-1', 'My API', [
        makeRequest('req-1', 'Get Users', 'GET', 'https://api.example.com/users'),
        makeFolder('folder-1', 'Auth', [
          makeRequest('req-2', 'Login', 'POST', 'https://api.example.com/login'),
          makeRequest('req-3', 'Logout', 'DELETE', 'https://api.example.com/logout'),
        ]),
        makeRequest('req-4', 'Health Check', 'GET', 'https://api.example.com/health'),
      ]);
      original.auth = { type: 'bearer' } as any;
      original.variables = [{ key: 'baseUrl', value: 'https://api.example.com', enabled: true }];

      await strategy.saveCollections([original]);
      const loaded = await strategy.loadCollections();

      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe('col-1');
      expect(loaded[0].name).toBe('My API');
      expect(loaded[0].auth).toEqual({ type: 'bearer' });
      expect(loaded[0].variables).toEqual([{ key: 'baseUrl', value: 'https://api.example.com', enabled: true }]);
      expect(loaded[0].items).toHaveLength(3);

      // Verify order matches
      expect((loaded[0].items[0] as SavedRequest).name).toBe('Get Users');
      expect((loaded[0].items[1] as Folder).name).toBe('Auth');
      expect((loaded[0].items[2] as SavedRequest).name).toBe('Health Check');

      // Verify nested folder
      const folder = loaded[0].items[1] as Folder;
      expect(folder.children).toHaveLength(2);
      expect((folder.children[0] as SavedRequest).name).toBe('Login');
      expect((folder.children[1] as SavedRequest).name).toBe('Logout');
    });
  });

  // ── Slug collision ──────────────────────────────────────────────────

  describe('slug collision resolution', () => {
    it('should handle requests with the same name', async () => {
      const col = makeCollection('col-1', 'Test', [
        makeRequest('req-1', 'Get Users'),
        makeRequest('req-2', 'Get Users'),
      ]);

      await strategy.saveCollections([col]);

      const colDir = path.join(tempDir, '.hivefetch', 'collections', 'test');
      expect(existsSync(path.join(colDir, 'get-users.json'))).toBe(true);
      expect(existsSync(path.join(colDir, 'get-users-2.json'))).toBe(true);

      // Verify roundtrip preserves both
      const loaded = await strategy.loadCollections();
      expect(loaded[0].items).toHaveLength(2);
    });

    it('should handle collections with the same name', async () => {
      const col1 = makeCollection('col-1', 'My API');
      const col2 = makeCollection('col-2', 'My API');

      await strategy.saveCollections([col1, col2]);

      const colsDir = path.join(tempDir, '.hivefetch', 'collections');
      expect(existsSync(path.join(colsDir, 'my-api'))).toBe(true);
      expect(existsSync(path.join(colsDir, 'my-api-2'))).toBe(true);
    });
  });

  // ── Environments ────────────────────────────────────────────────────

  describe('environments', () => {
    it('should save and load environments', async () => {
      const envData: EnvironmentsData = {
        environments: [{
          id: 'env-1', name: 'Dev',
          variables: [{ key: 'url', value: 'http://localhost', enabled: true }],
        }],
        activeId: 'env-1',
      };

      await strategy.saveEnvironments(envData);
      const loaded = await strategy.loadEnvironments();
      expect(loaded.environments).toHaveLength(1);
      expect(loaded.activeId).toBe('env-1');
    });

    it('should return defaults when no environments file exists', async () => {
      const result = await strategy.loadEnvironments();
      expect(result).toEqual({ environments: [], activeId: null });
    });
  });

  // ── Gitignore ───────────────────────────────────────────────────────

  describe('ensureGitignore', () => {
    it('should create .gitignore with secrets exclusion', async () => {
      await strategy.ensureGitignore();
      const gitignorePath = path.join(tempDir, '.hivefetch', '.gitignore');
      expect(existsSync(gitignorePath)).toBe(true);
      const content = await fs.readFile(gitignorePath, 'utf8');
      expect(content).toContain('environments/secrets.json');
    });

    it('should not overwrite existing .gitignore', async () => {
      const hivefetchDir = path.join(tempDir, '.hivefetch');
      await fs.mkdir(hivefetchDir, { recursive: true });
      const gitignorePath = path.join(hivefetchDir, '.gitignore');
      await fs.writeFile(gitignorePath, 'custom content\n', 'utf8');

      await strategy.ensureGitignore();
      const content = await fs.readFile(gitignorePath, 'utf8');
      expect(content).toBe('custom content\n');
    });
  });

  // ── Slugify ─────────────────────────────────────────────────────────

  describe('slugify', () => {
    it('should convert names to lowercase slugs', () => {
      expect(strategy.slugify('My API')).toBe('my-api');
      expect(strategy.slugify('GET Users')).toBe('get-users');
      expect(strategy.slugify('  Hello World  ')).toBe('hello-world');
    });

    it('should replace special characters with dashes', () => {
      expect(strategy.slugify('foo@bar#baz')).toBe('foo-bar-baz');
      expect(strategy.slugify('request (1)')).toBe('request-1');
    });

    it('should collapse consecutive dashes', () => {
      expect(strategy.slugify('foo---bar')).toBe('foo-bar');
      expect(strategy.slugify('a & b & c')).toBe('a-b-c');
    });

    it('should return "unnamed" for empty strings', () => {
      expect(strategy.slugify('')).toBe('unnamed');
      expect(strategy.slugify('   ')).toBe('unnamed');
      expect(strategy.slugify('!!!')).toBe('unnamed');
    });

    it('should resolve collisions when usedSlugs is provided', () => {
      const used = new Set(['my-api', 'my-api-2']);
      expect(strategy.slugify('My API', used)).toBe('my-api-3');
    });
  });

  // ── getStorageDir ───────────────────────────────────────────────────

  describe('getStorageDir', () => {
    it('should return .hivefetch path under workspace root', () => {
      expect(strategy.getStorageDir()).toBe(path.join(tempDir, '.hivefetch'));
    });
  });

  // ── YAML format ───────────────────────────────────────────────────

  describe('YAML format', () => {
    let yamlStrategy: WorkspaceStorageStrategy;

    beforeEach(() => {
      yamlStrategy = new WorkspaceStorageStrategy(tempDir, 'yaml');
    });

    it('should save request files as .yaml', async () => {
      const col = makeCollection('col-1', 'My API', [
        makeRequest('req-1', 'Get Users', 'GET', 'https://api.example.com/users'),
      ]);

      await yamlStrategy.saveCollections([col]);

      const colDir = path.join(tempDir, '.hivefetch', 'collections', 'my-api');
      expect(existsSync(path.join(colDir, 'get-users.yaml'))).toBe(true);
      expect(existsSync(path.join(colDir, 'get-users.json'))).toBe(false);

      // _meta.json should still be JSON
      expect(existsSync(path.join(colDir, '_meta.json'))).toBe(true);
    });

    it('should write valid YAML content', async () => {
      const col = makeCollection('col-1', 'Test', [
        makeRequest('req-1', 'Login', 'POST', 'https://api.example.com/login'),
      ]);

      await yamlStrategy.saveCollections([col]);

      const yamlPath = path.join(tempDir, '.hivefetch', 'collections', 'test', 'login.yaml');
      const content = await fs.readFile(yamlPath, 'utf8');

      // YAML should not start with { (not JSON)
      expect(content.startsWith('{')).toBe(false);
      // Should contain key: value pairs
      expect(content).toContain('id: req-1');
      expect(content).toContain('method: POST');
      expect(content).toContain('url: https://api.example.com/login');
    });

    it('should roundtrip through YAML save and load', async () => {
      const original = makeCollection('col-1', 'My API', [
        makeRequest('req-1', 'Get Users', 'GET', 'https://api.example.com/users'),
        makeFolder('folder-1', 'Auth', [
          makeRequest('req-2', 'Login', 'POST', 'https://api.example.com/login'),
        ]),
      ]);

      await yamlStrategy.saveCollections([original]);
      const loaded = await yamlStrategy.loadCollections();

      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe('col-1');
      expect(loaded[0].items).toHaveLength(2);

      const req = loaded[0].items[0] as SavedRequest;
      expect(req.name).toBe('Get Users');
      expect(req.method).toBe('GET');
      expect(req.url).toBe('https://api.example.com/users');

      const folder = loaded[0].items[1] as Folder;
      expect(folder.name).toBe('Auth');
      expect(folder.children).toHaveLength(1);
      expect((folder.children[0] as SavedRequest).name).toBe('Login');
    });

    it('should load .yaml files even when strategy is set to json', async () => {
      // Save as YAML
      const col = makeCollection('col-1', 'Test', [
        makeRequest('req-1', 'Hello'),
      ]);
      await yamlStrategy.saveCollections([col]);

      // Load with JSON strategy - should still read .yaml files
      const jsonStrategy = new WorkspaceStorageStrategy(tempDir, 'json');
      const loaded = await jsonStrategy.loadCollections();

      expect(loaded).toHaveLength(1);
      expect((loaded[0].items[0] as SavedRequest).name).toBe('Hello');
    });

    it('should load .yml files as well', async () => {
      // Manually create a .yml file
      const colDir = path.join(tempDir, '.hivefetch', 'collections', 'test');
      await fs.mkdir(colDir, { recursive: true });
      await fs.writeFile(path.join(colDir, '_meta.json'), JSON.stringify({
        id: 'col-1', name: 'Test', expanded: true, sortOrder: ['my-req'],
        createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      }));
      await fs.writeFile(path.join(colDir, 'my-req.yml'),
        'id: req-1\nname: My Req\nmethod: GET\nurl: https://example.com\nparams: []\nheaders: []\n'
      );

      const loaded = await strategy.loadCollections();
      expect(loaded).toHaveLength(1);
      expect((loaded[0].items[0] as SavedRequest).name).toBe('My Req');
    });

    it('should prefer first file found when both .json and .yaml exist for same slug', async () => {
      const colDir = path.join(tempDir, '.hivefetch', 'collections', 'test');
      await fs.mkdir(colDir, { recursive: true });
      await fs.writeFile(path.join(colDir, '_meta.json'), JSON.stringify({
        id: 'col-1', name: 'Test', expanded: true, sortOrder: ['dup'],
        createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
      }));
      // Write both formats
      await fs.writeFile(path.join(colDir, 'dup.json'), JSON.stringify({
        id: 'req-json', name: 'From JSON', method: 'GET', url: 'https://json.com',
        params: [], headers: [],
      }));
      await fs.writeFile(path.join(colDir, 'dup.yaml'),
        'id: req-yaml\nname: From YAML\nmethod: POST\nurl: https://yaml.com\nparams: []\nheaders: []\n'
      );

      const loaded = await strategy.loadCollections();
      expect(loaded).toHaveLength(1);
      // Should load one, not both - no duplicates
      expect(loaded[0].items).toHaveLength(1);
    });
  });
});
