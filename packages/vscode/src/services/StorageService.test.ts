import * as path from 'path';
import { StorageService } from './StorageService';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import type { Collection, EnvironmentsData } from './types';

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

      expect(service.getStoragePath()).toBe(
        path.join('/my/project', '.vscode', 'hivefetch')
      );
    });
  });

  describe('loadCollections', () => {
    it('should return only Recent collection when file does not exist', async () => {
      mockExistsSync.mockReturnValue(false);

      const collections = await storageService.loadCollections();

      expect(collections).toHaveLength(1);
      expect(collections[0].builtin).toBe('recent');
    });

    it('should load and parse collections from file', async () => {
      const mockCollections: Collection[] = [
        createMockCollection('col-1', 'API Tests'),
        createMockCollection('col-2', 'User Tests'),
      ];
      mockExistsSync.mockReturnValue(true);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockCollections));

      const collections = await storageService.loadCollections();

      // Recent collection is auto-added at index 0
      expect(collections).toHaveLength(3);
      expect(collections[0].builtin).toBe('recent');
      expect(collections[1].name).toBe('API Tests');
    });

    it('should handle parse errors gracefully', async () => {
      mockExistsSync.mockReturnValue(true);
      mockFs.readFile.mockResolvedValue('invalid json');

      const collections = await storageService.loadCollections();

      // Only Recent collection from ensureRecentCollection
      expect(collections).toHaveLength(1);
      expect(collections[0].builtin).toBe('recent');
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

      // Index 0 is Recent, index 1 is the migrated collection
      expect(collections[1].items).toHaveLength(1);
      expect(collections[1].items[0]).toHaveProperty('type', 'request');
      expect((collections[1] as any).requests).toBeUndefined();
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

      // Index 0 is Recent, index 1 is the unknown format collection
      const unknownCol = collections.find(c => c.name === 'Unknown Format')!;
      expect(unknownCol.items).toEqual([]);
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

  describe('getStorageDir', () => {
    it('should return the storage directory path', () => {
      const dir = storageService.getStorageDir();

      expect(dir).toContain('hivefetch');
    });

    it('should return the same value as getStoragePath', () => {
      expect(storageService.getStorageDir()).toBe(storageService.getStoragePath());
    });
  });

  describe('constructor fallback paths', () => {
    it('should fall back to vscode.workspace.workspaceFolders when no folder argument provided', () => {
      // The vscode mock has workspaceFolders set to [{ uri: { fsPath: '/mock/workspace' } }]
      const vscode = require('vscode');
      vscode.workspace.workspaceFolders = [
        { uri: { fsPath: '/fallback/workspace' }, name: 'fallback', index: 0 },
      ];

      const service = new StorageService();

      expect(service.getStoragePath()).toBe(
        path.join('/fallback/workspace', '.vscode', 'hivefetch')
      );

      // Restore default mock
      vscode.workspace.workspaceFolders = [
        { uri: { fsPath: '/mock/workspace' }, name: 'mock-workspace', index: 0 },
      ];
    });

    it('should use globalStorageDir when no workspace folders exist', () => {
      const vscode = require('vscode');
      const originalFolders = vscode.workspace.workspaceFolders;
      vscode.workspace.workspaceFolders = undefined;

      const service = new StorageService(undefined, '/portable/data/globalStorage');

      expect(service.getStoragePath()).toBe('/portable/data/globalStorage');

      // Restore
      vscode.workspace.workspaceFolders = originalFolders;
    });

    it('should use globalStorageDir when workspaceFolders is empty array', () => {
      const vscode = require('vscode');
      const originalFolders = vscode.workspace.workspaceFolders;
      vscode.workspace.workspaceFolders = [];

      const service = new StorageService(undefined, '/portable/data/globalStorage');

      expect(service.getStoragePath()).toBe('/portable/data/globalStorage');

      // Restore
      vscode.workspace.workspaceFolders = originalFolders;
    });

    it('should fall back to home directory when no workspace and no globalStorageDir', () => {
      const vscode = require('vscode');
      const originalFolders = vscode.workspace.workspaceFolders;
      vscode.workspace.workspaceFolders = undefined;

      const service = new StorageService();

      expect(service.getStoragePath()).toContain('.hivefetch');
      expect(service.getStoragePath()).not.toContain('.vscode');

      // Restore
      vscode.workspace.workspaceFolders = originalFolders;
    });
  });

  describe('getStorageMode', () => {
    it('should return the current storage mode from configuration', () => {
      const vscode = require('vscode');
      const mockGet = jest.fn().mockReturnValue('monolithic');
      vscode.workspace.getConfiguration.mockReturnValue({
        get: mockGet,
        update: jest.fn(),
      });

      const mode = storageService.getStorageMode();

      expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('hivefetch');
      expect(mockGet).toHaveBeenCalledWith('storage.mode', 'monolithic');
      expect(mode).toBe('monolithic');
    });

    it('should return git-friendly when configured as such', () => {
      const vscode = require('vscode');
      const mockGet = jest.fn().mockReturnValue('git-friendly');
      vscode.workspace.getConfiguration.mockReturnValue({
        get: mockGet,
        update: jest.fn(),
      });

      const mode = storageService.getStorageMode();

      expect(mode).toBe('git-friendly');
    });
  });

  describe('switchStorageMode', () => {
    beforeEach(() => {
      // Default: config returns 'monolithic' so the service starts in monolithic mode
      const vscode = require('vscode');
      vscode.workspace.getConfiguration.mockReturnValue({
        get: jest.fn().mockReturnValue('monolithic'),
        update: jest.fn().mockResolvedValue(undefined),
      });
    });

    it('should return true when switching to the same mode (no-op)', async () => {
      // Config says 'monolithic', switch to 'monolithic' => no-op
      const result = await storageService.switchStorageMode('monolithic');

      expect(result).toBe(true);
    });

    it('should migrate data when switching from monolithic to git-friendly', async () => {
      const vscode = require('vscode');
      const mockUpdate = jest.fn().mockResolvedValue(undefined);

      // First call to readStorageMode (in switchStorageMode) returns 'monolithic'
      // so switching to 'git-friendly' is a real switch
      vscode.workspace.getConfiguration.mockReturnValue({
        get: jest.fn().mockReturnValue('monolithic'),
        update: mockUpdate,
      });

      // Mock the current strategy's load methods (MonolithicStorageStrategy uses fs)
      mockExistsSync.mockReturnValue(true);
      const mockCollections = [createMockCollection('col-1', 'Test')];
      const mockEnvData: EnvironmentsData = { environments: [], activeId: null };
      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(mockCollections))
        .mockResolvedValueOnce(JSON.stringify(mockEnvData));
      // For git-friendly strategy writes and ensureGitignore
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([] as any);

      const result = await storageService.switchStorageMode('git-friendly');

      expect(result).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith(
        'storage.mode',
        'git-friendly',
        expect.anything()
      );
    });

    it('should migrate data when switching from monolithic to git-friendly and call ensureGitignore', async () => {
      const vscode = require('vscode');
      const mockUpdate = jest.fn().mockResolvedValue(undefined);
      vscode.workspace.getConfiguration.mockReturnValue({
        get: jest.fn().mockReturnValue('monolithic'),
        update: mockUpdate,
      });

      mockExistsSync.mockReturnValue(false);
      mockFs.readFile.mockResolvedValue(JSON.stringify([]));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([] as any);

      const result = await storageService.switchStorageMode('git-friendly');

      expect(result).toBe(true);
      // ensureGitignore should have been called which writes a .gitignore file
      const writeFileCalls = (mockFs.writeFile as jest.Mock).mock.calls;
      const gitignoreWrite = writeFileCalls.find(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('.gitignore')
      );
      expect(gitignoreWrite).toBeDefined();
    });

    it('should return false when an error occurs during switch', async () => {
      const vscode = require('vscode');
      // Make config.update() reject to trigger the catch block in switchStorageMode
      vscode.workspace.getConfiguration.mockReturnValue({
        get: jest.fn().mockReturnValue('monolithic'),
        update: jest.fn().mockRejectedValue(new Error('Config update failed')),
      });

      mockExistsSync.mockReturnValue(false);
      mockFs.readFile.mockResolvedValue(JSON.stringify([]));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([] as any);

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const result = await storageService.switchStorageMode('git-friendly');

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to switch storage mode:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should switch from git-friendly back to monolithic', async () => {
      const vscode = require('vscode');
      const mockUpdate = jest.fn().mockResolvedValue(undefined);

      // Simulate the service being in git-friendly mode
      vscode.workspace.getConfiguration.mockReturnValue({
        get: jest.fn().mockReturnValue('git-friendly'),
        update: mockUpdate,
      });

      // First, switch to git-friendly to put the service in that state
      mockExistsSync.mockReturnValue(false);
      mockFs.readFile.mockResolvedValue(JSON.stringify([]));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([] as any);

      // Now create a new service instance that starts in git-friendly mode
      const gitFriendlyService = new StorageService({
        uri: { fsPath: '/test/workspace' },
        name: 'test',
        index: 0,
      } as any);

      // Now switch config to return 'git-friendly' so switchStorageMode sees it as current
      vscode.workspace.getConfiguration.mockReturnValue({
        get: jest.fn().mockReturnValue('git-friendly'),
        update: mockUpdate,
      });

      const result = await gitFriendlyService.switchStorageMode('monolithic');

      expect(result).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith(
        'storage.mode',
        'monolithic',
        expect.anything()
      );
    });
  });
});
