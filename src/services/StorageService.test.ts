import { StorageService } from './StorageService';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import type { Collection, HistoryEntry, EnvironmentsData } from './types';

// Mock fs modules
jest.mock('fs/promises');
jest.mock('fs', () => ({
  existsSync: jest.fn(),
}));

const mockFs = fs as jest.Mocked<typeof fs>;
const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;

// Helper to create mock data
const createMockCollection = (id: string, name: string): Collection => ({
  id,
  name,
  items: [],
  expanded: true,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
});

const createMockHistoryEntry = (id: string): HistoryEntry => ({
  id,
  method: 'GET',
  url: 'https://api.example.com',
  params: [],
  headers: [],
  auth: { type: 'none' },
  body: { type: 'none', content: '' },
  status: 200,
  statusText: 'OK',
  duration: 100,
  size: 256,
  timestamp: '2024-01-01T00:00:00.000Z',
});

describe('StorageService', () => {
  let storageService: StorageService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);

    // Create storage service with mock workspace
    storageService = new StorageService({
      uri: { fsPath: '/test/workspace' },
      name: 'test',
      index: 0,
    } as any);
  });

  describe('constructor', () => {
    it('should use workspace folder path', () => {
      const service = new StorageService({
        uri: { fsPath: '/my/project' },
        name: 'project',
        index: 0,
      } as any);

      expect(service.getStoragePath()).toContain('/my/project');
      expect(service.getStoragePath()).toContain('.vscode');
      expect(service.getStoragePath()).toContain('hivefetch');
    });
  });

  describe('loadCollections', () => {
    it('should return empty array when file does not exist', async () => {
      mockExistsSync.mockReturnValue(false);

      const collections = await storageService.loadCollections();

      expect(collections).toEqual([]);
    });

    it('should load and parse collections from file', async () => {
      const mockCollections: Collection[] = [
        createMockCollection('col-1', 'API Tests'),
        createMockCollection('col-2', 'User Tests'),
      ];
      mockExistsSync.mockReturnValue(true);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockCollections));

      const collections = await storageService.loadCollections();

      expect(collections).toHaveLength(2);
      expect(collections[0].name).toBe('API Tests');
    });

    it('should handle parse errors gracefully', async () => {
      mockExistsSync.mockReturnValue(true);
      mockFs.readFile.mockResolvedValue('invalid json');

      const collections = await storageService.loadCollections();

      expect(collections).toEqual([]);
    });

    it('should migrate legacy format (requests[] to items[])', async () => {
      const legacyCollection = {
        id: 'col-1',
        name: 'Legacy Collection',
        requests: [
          {
            id: 'req-1',
            name: 'Test Request',
            method: 'GET',
            url: 'https://api.test.com',
          },
        ],
        expanded: true,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };
      mockExistsSync.mockReturnValue(true);
      mockFs.readFile.mockResolvedValue(JSON.stringify([legacyCollection]));

      const collections = await storageService.loadCollections();

      expect(collections[0].items).toHaveLength(1);
      expect(collections[0].items[0]).toHaveProperty('type', 'request');
      expect((collections[0] as any).requests).toBeUndefined();
    });

    it('should auto-save after migration', async () => {
      const legacyCollection = {
        id: 'col-1',
        name: 'Legacy',
        requests: [{ id: 'req-1', name: 'Test', method: 'GET', url: '' }],
      };
      mockExistsSync.mockReturnValue(true);
      mockFs.readFile.mockResolvedValue(JSON.stringify([legacyCollection]));

      await storageService.loadCollections();

      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should handle collections without items or requests', async () => {
      const unknownFormat = {
        id: 'col-1',
        name: 'Unknown Format',
      };
      mockExistsSync.mockReturnValue(true);
      mockFs.readFile.mockResolvedValue(JSON.stringify([unknownFormat]));

      const collections = await storageService.loadCollections();

      expect(collections[0].items).toEqual([]);
    });
  });

  describe('saveCollections', () => {
    it('should create storage directory if needed', async () => {
      mockExistsSync.mockReturnValue(false);

      await storageService.saveCollections([]);

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('hivefetch'),
        { recursive: true }
      );
    });

    it('should write collections to file', async () => {
      const collections: Collection[] = [createMockCollection('col-1', 'Test')];

      const result = await storageService.saveCollections(collections);

      expect(result).toBe(true);
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('collections.json'),
        expect.any(String),
        'utf8'
      );
    });

    it('should format JSON with 2-space indentation', async () => {
      const collections: Collection[] = [createMockCollection('col-1', 'Test')];

      await storageService.saveCollections(collections);

      const writtenContent = (mockFs.writeFile as jest.Mock).mock.calls[0][1];
      expect(writtenContent).toContain('\n');
      expect(writtenContent).toContain('  ');
    });

    it('should return false on write error', async () => {
      mockFs.writeFile.mockRejectedValue(new Error('Write failed'));

      const result = await storageService.saveCollections([]);

      expect(result).toBe(false);
    });
  });

  describe('loadHistory', () => {
    it('should return empty array when file does not exist', async () => {
      mockExistsSync.mockReturnValue(false);

      const history = await storageService.loadHistory();

      expect(history).toEqual([]);
    });

    it('should load and parse history from file', async () => {
      const mockHistory: HistoryEntry[] = [
        createMockHistoryEntry('hist-1'),
        createMockHistoryEntry('hist-2'),
      ];
      mockExistsSync.mockReturnValue(true);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockHistory));

      const history = await storageService.loadHistory();

      expect(history).toHaveLength(2);
    });

    it('should handle parse errors gracefully', async () => {
      mockExistsSync.mockReturnValue(true);
      mockFs.readFile.mockResolvedValue('not json');

      const history = await storageService.loadHistory();

      expect(history).toEqual([]);
    });
  });

  describe('saveHistory', () => {
    it('should write history to file', async () => {
      const history: HistoryEntry[] = [createMockHistoryEntry('hist-1')];

      const result = await storageService.saveHistory(history);

      expect(result).toBe(true);
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('history.json'),
        expect.any(String),
        'utf8'
      );
    });

    it('should return false on write error', async () => {
      mockFs.writeFile.mockRejectedValue(new Error('Write failed'));

      const result = await storageService.saveHistory([]);

      expect(result).toBe(false);
    });
  });

  describe('loadAll', () => {
    it('should load both collections and history', async () => {
      const mockCollections: Collection[] = [createMockCollection('col-1', 'Test')];
      const mockHistory: HistoryEntry[] = [createMockHistoryEntry('hist-1')];

      mockExistsSync.mockReturnValue(true);
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(mockCollections))
        .mockResolvedValueOnce(JSON.stringify(mockHistory));

      const result = await storageService.loadAll();

      expect(result.collections).toHaveLength(1);
      expect(result.history).toHaveLength(1);
    });

    it('should load in parallel', async () => {
      mockExistsSync.mockReturnValue(true);
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify([]))
        .mockResolvedValueOnce(JSON.stringify([]));

      await storageService.loadAll();

      // Both reads should happen
      expect(mockFs.readFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('clearHistory', () => {
    it('should save empty history array', async () => {
      const result = await storageService.clearHistory();

      expect(result).toBe(true);
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('history.json'),
        '[]',
        'utf8'
      );
    });
  });

  describe('loadEnvironments', () => {
    it('should return default when file does not exist', async () => {
      mockExistsSync.mockReturnValue(false);

      const envData = await storageService.loadEnvironments();

      expect(envData).toEqual({ environments: [], activeId: null });
    });

    it('should load environments from file', async () => {
      const mockEnvData: EnvironmentsData = {
        environments: [
          { id: 'env-1', name: 'Development', variables: [] },
        ],
        activeId: 'env-1',
      };
      mockExistsSync.mockReturnValue(true);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockEnvData));

      const envData = await storageService.loadEnvironments();

      expect(envData.environments).toHaveLength(1);
      expect(envData.activeId).toBe('env-1');
    });

    it('should handle parse errors', async () => {
      mockExistsSync.mockReturnValue(true);
      mockFs.readFile.mockResolvedValue('invalid');

      const envData = await storageService.loadEnvironments();

      expect(envData).toEqual({ environments: [], activeId: null });
    });
  });

  describe('saveEnvironments', () => {
    it('should write environments to file', async () => {
      const envData: EnvironmentsData = {
        environments: [{ id: 'env-1', name: 'Dev', variables: [] }],
        activeId: 'env-1',
      };

      const result = await storageService.saveEnvironments(envData);

      expect(result).toBe(true);
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('environments.json'),
        expect.any(String),
        'utf8'
      );
    });

    it('should return false on error', async () => {
      mockFs.writeFile.mockRejectedValue(new Error('Failed'));

      const result = await storageService.saveEnvironments({
        environments: [],
        activeId: null,
      });

      expect(result).toBe(false);
    });
  });

  describe('getStoragePath', () => {
    it('should return the storage directory path', () => {
      const path = storageService.getStoragePath();

      expect(path).toContain('hivefetch');
    });
  });
});
