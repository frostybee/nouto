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
    it('should use globalStorageDir when provided', () => {
      const service = new StorageService(undefined, '/custom/global/storage');

      expect(service.getStoragePath()).toBe('/custom/global/storage');
    });

    it('should fall back to HOME/.nouto when no globalStorageDir', () => {
      const service = new StorageService({
        uri: { fsPath: '/my/project' },
        name: 'project',
        index: 0,
      } as any);

      expect(service.getStoragePath()).toContain('.nouto');
    });
  });

  describe('loadCollections', () => {
    it('should return only Drafts collection when file does not exist', async () => {
      mockExistsSync.mockReturnValue(false);

      const collections = await storageService.loadCollections();

      expect(collections).toHaveLength(1);
      expect(collections[0].builtin).toBe('drafts');
    });

    it('should load and parse collections from file', async () => {
      const mockCollections: Collection[] = [
        createMockCollection('col-1', 'API Tests'),
        createMockCollection('col-2', 'User Tests'),
      ];
      mockExistsSync.mockReturnValue(true);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockCollections));

      const collections = await storageService.loadCollections();

      // Drafts collection is auto-added at index 0
      expect(collections).toHaveLength(3);
      expect(collections[0].builtin).toBe('drafts');
      expect(collections[1].name).toBe('API Tests');
    });

    it('should handle parse errors gracefully', async () => {
      mockExistsSync.mockReturnValue(true);
      mockFs.readFile.mockResolvedValue('invalid json');

      const collections = await storageService.loadCollections();

      // Only Drafts collection from ensureDraftsCollection
      expect(collections).toHaveLength(1);
      expect(collections[0].builtin).toBe('drafts');
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
        expect.stringContaining('nouto'),
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

      expect(path).toContain('nouto');
    });
  });

  describe('getStorageDir', () => {
    it('should return the storage directory path', () => {
      const dir = storageService.getStorageDir();

      expect(dir).toContain('nouto');
    });

    it('should return the same value as getStoragePath', () => {
      expect(storageService.getStorageDir()).toBe(storageService.getStoragePath());
    });
  });

  describe('constructor fallback paths', () => {
    it('should use HOME/.nouto when no folder or globalStorageDir provided', () => {
      const vscode = require('vscode');
      vscode.workspace.workspaceFolders = [
        { uri: { fsPath: '/fallback/workspace' }, name: 'fallback', index: 0 },
      ];

      const service = new StorageService();

      // Without globalStorageDir, falls back to HOME/.nouto
      expect(service.getStoragePath()).toContain('.nouto');
      expect(service.getStoragePath()).not.toContain('.vscode');

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

      expect(service.getStoragePath()).toContain('.nouto');
      expect(service.getStoragePath()).not.toContain('.vscode');

      // Restore
      vscode.workspace.workspaceFolders = originalFolders;
    });
  });

  describe('getStorageMode', () => {
    it('should return the current storage mode from configuration', () => {
      const vscode = require('vscode');
      const mockGet = jest.fn().mockReturnValue('global');
      vscode.workspace.getConfiguration.mockReturnValue({
        get: mockGet,
        update: jest.fn(),
      });

      const mode = storageService.getStorageMode();

      expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('nouto');
      expect(mockGet).toHaveBeenCalledWith('storage.mode', 'global');
      expect(mode).toBe('global');
    });

    it('should return workspace when configured as such', () => {
      const vscode = require('vscode');
      const mockGet = jest.fn().mockReturnValue('workspace');
      vscode.workspace.getConfiguration.mockReturnValue({
        get: mockGet,
        update: jest.fn(),
      });

      const mode = storageService.getStorageMode();

      expect(mode).toBe('workspace');
    });
  });

  describe('switchStorageMode', () => {
    beforeEach(() => {
      const vscode = require('vscode');
      vscode.workspace.getConfiguration.mockReturnValue({
        get: jest.fn().mockReturnValue('global'),
        update: jest.fn().mockResolvedValue(undefined),
      });
    });

    it('should return true when switching to the same mode (no-op)', async () => {
      const result = await storageService.switchStorageMode('global');

      expect(result).toBe(true);
    });

    it('should migrate data when switching from global to workspace', async () => {
      const vscode = require('vscode');
      const mockUpdate = jest.fn().mockResolvedValue(undefined);
      vscode.workspace.getConfiguration.mockReturnValue({
        get: jest.fn().mockReturnValue('global'),
        update: mockUpdate,
      });

      mockExistsSync.mockReturnValue(true);
      const mockCollections = [createMockCollection('col-1', 'Test')];
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockCollections));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([] as any);

      const result = await storageService.switchStorageMode('workspace');

      expect(result).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith(
        'storage.mode',
        'workspace',
        expect.anything()
      );
    });

    it('should call ensureGitignore when switching to workspace mode', async () => {
      const vscode = require('vscode');
      const mockUpdate = jest.fn().mockResolvedValue(undefined);
      vscode.workspace.getConfiguration.mockReturnValue({
        get: jest.fn().mockReturnValue('global'),
        update: mockUpdate,
      });

      mockExistsSync.mockReturnValue(false);
      mockFs.readFile.mockResolvedValue(JSON.stringify([]));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([] as any);

      const result = await storageService.switchStorageMode('workspace');

      expect(result).toBe(true);
      const writeFileCalls = (mockFs.writeFile as jest.Mock).mock.calls;
      const gitignoreWrite = writeFileCalls.find(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('.gitignore')
      );
      expect(gitignoreWrite).toBeDefined();
    });

    it('should return false when an error occurs during switch', async () => {
      const vscode = require('vscode');
      vscode.workspace.getConfiguration.mockReturnValue({
        get: jest.fn().mockReturnValue('global'),
        update: jest.fn().mockRejectedValue(new Error('Config update failed')),
      });

      mockExistsSync.mockReturnValue(false);
      mockFs.readFile.mockResolvedValue(JSON.stringify([]));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([] as any);

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const result = await storageService.switchStorageMode('workspace');

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to switch storage mode:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should switch from workspace back to global', async () => {
      const vscode = require('vscode');
      const mockUpdate = jest.fn().mockResolvedValue(undefined);

      vscode.workspace.getConfiguration.mockReturnValue({
        get: jest.fn().mockReturnValue('workspace'),
        update: mockUpdate,
      });

      mockExistsSync.mockReturnValue(false);
      mockFs.readFile.mockResolvedValue(JSON.stringify([]));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([] as any);

      const workspaceService = new StorageService({
        uri: { fsPath: '/test/workspace' },
        name: 'test',
        index: 0,
      } as any);

      const result = await workspaceService.switchStorageMode('global');

      expect(result).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith(
        'storage.mode',
        'global',
        expect.anything()
      );
    });
  });
});
