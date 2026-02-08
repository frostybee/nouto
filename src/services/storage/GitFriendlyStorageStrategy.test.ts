import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GitFriendlyStorageStrategy } from './GitFriendlyStorageStrategy';
import type { Collection, HistoryEntry, EnvironmentsData } from '../types';

describe('GitFriendlyStorageStrategy', () => {
  let tempDir: string;
  let strategy: GitFriendlyStorageStrategy;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `hivefetch-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tempDir, { recursive: true });
    strategy = new GitFriendlyStorageStrategy(tempDir);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {}
  });

  const makeCollection = (id: string, name: string): Collection => ({
    id,
    name,
    items: [],
    expanded: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  });

  describe('loadCollections', () => {
    it('should return empty array when collections dir does not exist', async () => {
      const result = await strategy.loadCollections();
      expect(result).toEqual([]);
    });

    it('should load collections from individual JSON files', async () => {
      const collectionsDir = path.join(tempDir, 'collections');
      await fs.mkdir(collectionsDir, { recursive: true });

      const col1 = makeCollection('col-1', 'Alpha');
      const col2 = makeCollection('col-2', 'Beta');

      await fs.writeFile(path.join(collectionsDir, 'col-1.json'), JSON.stringify(col1), 'utf8');
      await fs.writeFile(path.join(collectionsDir, 'col-2.json'), JSON.stringify(col2), 'utf8');

      const result = await strategy.loadCollections();
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Alpha');
      expect(result[1].name).toBe('Beta');
    });

    it('should skip non-JSON files', async () => {
      const collectionsDir = path.join(tempDir, 'collections');
      await fs.mkdir(collectionsDir, { recursive: true });

      await fs.writeFile(path.join(collectionsDir, 'col-1.json'), JSON.stringify(makeCollection('col-1', 'Test')), 'utf8');
      await fs.writeFile(path.join(collectionsDir, 'readme.txt'), 'ignore me', 'utf8');

      const result = await strategy.loadCollections();
      expect(result).toHaveLength(1);
    });

    it('should handle corrupted JSON files gracefully', async () => {
      const collectionsDir = path.join(tempDir, 'collections');
      await fs.mkdir(collectionsDir, { recursive: true });

      await fs.writeFile(path.join(collectionsDir, 'good.json'), JSON.stringify(makeCollection('good', 'Good')), 'utf8');
      await fs.writeFile(path.join(collectionsDir, 'bad.json'), '{ invalid json', 'utf8');

      const result = await strategy.loadCollections();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Good');
    });
  });

  describe('saveCollections', () => {
    it('should save each collection to a separate file', async () => {
      const collections = [
        makeCollection('col-1', 'First'),
        makeCollection('col-2', 'Second'),
      ];

      const result = await strategy.saveCollections(collections);
      expect(result).toBe(true);

      const collectionsDir = path.join(tempDir, 'collections');
      expect(existsSync(path.join(collectionsDir, 'col-1.json'))).toBe(true);
      expect(existsSync(path.join(collectionsDir, 'col-2.json'))).toBe(true);

      const loaded = JSON.parse(await fs.readFile(path.join(collectionsDir, 'col-1.json'), 'utf8'));
      expect(loaded.name).toBe('First');
    });

    it('should delete orphaned collection files', async () => {
      const collectionsDir = path.join(tempDir, 'collections');
      await fs.mkdir(collectionsDir, { recursive: true });

      // Pre-existing file that should be deleted
      await fs.writeFile(path.join(collectionsDir, 'old-col.json'), '{}', 'utf8');

      await strategy.saveCollections([makeCollection('new-col', 'New')]);

      expect(existsSync(path.join(collectionsDir, 'old-col.json'))).toBe(false);
      expect(existsSync(path.join(collectionsDir, 'new-col.json'))).toBe(true);
    });
  });

  describe('history', () => {
    it('should save and load history', async () => {
      const history: HistoryEntry[] = [{
        id: 'h1',
        method: 'GET',
        url: 'https://example.com',
        params: [],
        headers: [],
        auth: { type: 'none' },
        body: { type: 'none', content: '' },
        status: 200,
        statusText: 'OK',
        duration: 100,
        size: 50,
        timestamp: '2024-01-01T00:00:00.000Z',
      }];

      await strategy.saveHistory(history);
      const loaded = await strategy.loadHistory();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].url).toBe('https://example.com');
    });

    it('should return empty array when no history file', async () => {
      const result = await strategy.loadHistory();
      expect(result).toEqual([]);
    });
  });

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

  describe('ensureGitignore', () => {
    it('should create .gitignore with history.json entry', async () => {
      await strategy.ensureGitignore();
      const gitignorePath = path.join(tempDir, '.gitignore');
      expect(existsSync(gitignorePath)).toBe(true);
      const content = await fs.readFile(gitignorePath, 'utf8');
      expect(content).toContain('history.json');
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

  describe('getStorageDir', () => {
    it('should return the storage directory', () => {
      expect(strategy.getStorageDir()).toBe(tempDir);
    });
  });
});
