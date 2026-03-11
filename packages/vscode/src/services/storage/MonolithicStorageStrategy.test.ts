import { MonolithicStorageStrategy } from './MonolithicStorageStrategy';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';

jest.mock('fs/promises');
jest.mock('fs', () => ({
  existsSync: jest.fn(),
}));

const mockFs = fs as jest.Mocked<typeof fs>;
const mockExistsSync = existsSync as jest.Mock;

describe('MonolithicStorageStrategy', () => {
  let strategy: MonolithicStorageStrategy;
  const storageDir = '/mock/storage';

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new MonolithicStorageStrategy(storageDir);
  });

  describe('getStorageDir', () => {
    it('should return the storage directory', () => {
      expect(strategy.getStorageDir()).toBe(storageDir);
    });
  });

  describe('loadCollections', () => {
    it('should return empty array when file does not exist', async () => {
      mockExistsSync.mockReturnValue(false);
      const result = await strategy.loadCollections();
      expect(result).toEqual([]);
    });

    it('should load and return collections from file', async () => {
      const collections = [{ id: 'col-1', name: 'Test', items: [], expanded: true }];
      mockExistsSync.mockReturnValue(true);
      mockFs.readFile.mockResolvedValue(JSON.stringify(collections));

      const result = await strategy.loadCollections();
      expect(result).toEqual(collections);
      expect(mockFs.readFile).toHaveBeenCalledWith(
        path.join(storageDir, 'collections.json'),
        'utf8'
      );
    });

    it('should migrate old format (requests -> items)', async () => {
      const oldFormat = [{
        id: 'col-1',
        name: 'Old',
        requests: [
          { id: 'req-1', name: 'GET Users', method: 'GET', url: '/users' },
        ],
      }];
      mockExistsSync.mockReturnValue(true);
      mockFs.readFile.mockResolvedValue(JSON.stringify(oldFormat));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const result = await strategy.loadCollections();
      expect(result[0].items).toBeDefined();
      expect(result[0].items[0].type).toBe('request');
      expect(result[0].items[0].id).toBe('req-1');
      // Should auto-save migrated data
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should handle collections with neither requests nor items', async () => {
      const weirdFormat = [{ id: 'col-1', name: 'Empty' }];
      mockExistsSync.mockReturnValue(true);
      mockFs.readFile.mockResolvedValue(JSON.stringify(weirdFormat));

      const result = await strategy.loadCollections();
      expect(result[0].items).toEqual([]);
      expect(result[0].name).toBe('Empty');
    });

    it('should return empty array on read error', async () => {
      mockExistsSync.mockReturnValue(true);
      mockFs.readFile.mockRejectedValue(new Error('Read error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const result = await strategy.loadCollections();
      expect(result).toEqual([]);
      consoleSpy.mockRestore();
    });

    it('should not save when no migration is needed', async () => {
      const collections = [{ id: 'col-1', name: 'Modern', items: [] }];
      mockExistsSync.mockReturnValue(true);
      mockFs.readFile.mockResolvedValue(JSON.stringify(collections));

      await strategy.loadCollections();
      expect(mockFs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('saveCollections', () => {
    it('should save collections to file', async () => {
      const collections = [{ id: 'col-1', name: 'Test', items: [] }] as any;
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const result = await strategy.saveCollections(collections);
      expect(result).toBe(true);
      expect(mockFs.mkdir).toHaveBeenCalledWith(storageDir, { recursive: true });
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join(storageDir, 'collections.json'),
        JSON.stringify(collections, null, 2),
        'utf8'
      );
    });

    it('should return false on write error', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockRejectedValue(new Error('Write error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const result = await strategy.saveCollections([]);
      expect(result).toBe(false);
      consoleSpy.mockRestore();
    });
  });

  describe('loadEnvironments', () => {
    it('should return default when file does not exist', async () => {
      mockExistsSync.mockReturnValue(false);
      const result = await strategy.loadEnvironments();
      expect(result).toEqual({ environments: [], activeId: null });
    });

    it('should load environments from file', async () => {
      const envData = { environments: [{ id: 'env-1', name: 'Dev', variables: [] }], activeId: 'env-1' };
      mockExistsSync.mockReturnValue(true);
      mockFs.readFile.mockResolvedValue(JSON.stringify(envData));

      const result = await strategy.loadEnvironments();
      expect(result).toEqual(envData);
    });

    it('should return default on read error', async () => {
      mockExistsSync.mockReturnValue(true);
      mockFs.readFile.mockRejectedValue(new Error('Read error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const result = await strategy.loadEnvironments();
      expect(result).toEqual({ environments: [], activeId: null });
      consoleSpy.mockRestore();
    });
  });

  describe('saveEnvironments', () => {
    it('should save environments to file', async () => {
      const envData = { environments: [], activeId: null } as any;
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const result = await strategy.saveEnvironments(envData);
      expect(result).toBe(true);
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join(storageDir, 'environments.json'),
        JSON.stringify(envData, null, 2),
        'utf8'
      );
    });

    it('should return false on write error', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockRejectedValue(new Error('Write error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const result = await strategy.saveEnvironments({ environments: [], activeId: null } as any);
      expect(result).toBe(false);
      consoleSpy.mockRestore();
    });
  });
});
