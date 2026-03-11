import * as vscode from 'vscode';

// Mock service modules before importing
const mockImportPostmanCollection = jest.fn();
const mockExportToFile = jest.fn();
const mockExportToPostman = jest.fn();
const mockImportFromFile = jest.fn();
const mockImportFromUrl = jest.fn();

jest.mock('../services/ImportExportService', () => ({
  ImportExportService: jest.fn().mockImplementation(() => ({
    importPostmanCollection: mockImportPostmanCollection,
    exportToFile: mockExportToFile,
    exportToPostman: mockExportToPostman,
  })),
}));

jest.mock('../services/OpenApiImportService', () => ({
  OpenApiImportService: jest.fn().mockImplementation(() => ({
    importFromFile: mockImportFromFile,
    importFromUrl: mockImportFromUrl,
  })),
}));

jest.mock('@hivefetch/core/services', () => ({
  InsomniaImportService: jest.fn().mockImplementation(() => ({
    importFromFile: jest.fn().mockResolvedValue({ collections: [{ id: 'ins-1', name: 'Insomnia', items: [] }] }),
    importFromString: jest.fn().mockReturnValue({ collections: [{ id: 'ins-1', name: 'Insomnia', items: [] }] }),
  })),
  HoppscotchImportService: jest.fn().mockImplementation(() => ({
    importFromFile: jest.fn().mockResolvedValue({ collections: [{ id: 'hop-1', name: 'Hoppscotch', items: [] }] }),
    importFromString: jest.fn().mockReturnValue({ collections: [{ id: 'hop-1', name: 'Hoppscotch', items: [] }] }),
  })),
  CurlParserService: jest.fn().mockImplementation(() => ({
    importFromString: jest.fn().mockReturnValue({ type: 'request', id: 'curl-1', name: 'cURL Request', method: 'GET', url: 'https://example.com' }),
  })),
  ThunderClientImportService: jest.fn().mockImplementation(() => ({
    importFromFile: jest.fn().mockResolvedValue({ collections: [{ id: 'tc-1', name: 'Thunder', items: [] }] }),
    importFromFolder: jest.fn().mockResolvedValue({ collections: [{ id: 'tc-1', name: 'Thunder', items: [] }] }),
  })),
  NativeExportService: jest.fn().mockImplementation(() => ({
    exportCollection: jest.fn().mockReturnValue({ _format: 'hivefetch', collections: [] }),
    importCollections: jest.fn().mockReturnValue([{ id: 'native-1', name: 'Native', items: [] }]),
  })),
}));

import {
  registerImportPostmanCommand,
  registerExportPostmanCommand,
  registerImportOpenApiCommand,
  registerImportCurlCommand,
  registerImportAutoCommand,
  registerBulkExportCommand,
  registerBulkExportNativeCommand,
  registerExportNativeCommand,
  registerImportNativeCommand,
  registerImportInsomniaCommand,
  registerImportHoppscotchCommand,
  registerImportThunderClientCommand,
  registerImportFromUrlCommand,
} from './import-export';

describe('import-export commands', () => {
  const mockRegisterCommand = vscode.commands.registerCommand as jest.Mock;
  let commandCallbacks: Record<string, (...args: any[]) => Promise<void>>;
  const mockStorageService: any = {
    loadCollections: jest.fn().mockResolvedValue([]),
    saveCollections: jest.fn().mockResolvedValue(true),
    loadEnvironments: jest.fn().mockResolvedValue({ environments: [], activeId: null }),
    saveEnvironments: jest.fn().mockResolvedValue(true),
  };
  const mockOnCollectionsUpdated = jest.fn();
  const mockGetCollections = jest.fn().mockReturnValue([]);

  beforeEach(() => {
    jest.clearAllMocks();
    commandCallbacks = {};
    mockRegisterCommand.mockImplementation((cmd: string, cb: any) => {
      commandCallbacks[cmd] = cb;
      return { dispose: jest.fn() };
    });
    mockStorageService.loadCollections.mockResolvedValue([]);
    mockGetCollections.mockReturnValue([]);
  });

  describe('registerImportPostmanCommand', () => {
    beforeEach(() => {
      registerImportPostmanCommand(mockStorageService, mockOnCollectionsUpdated);
    });

    it('should register the command', () => {
      expect(mockRegisterCommand).toHaveBeenCalledWith('hivefetch.importPostman', expect.any(Function));
    });

    it('should do nothing when user cancels file dialog', async () => {
      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue(undefined);
      await commandCallbacks['hivefetch.importPostman']();
      expect(mockImportPostmanCollection).not.toHaveBeenCalled();
    });

    it('should import and save collection', async () => {
      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([{ fsPath: '/test.json' }]);
      mockImportPostmanCollection.mockResolvedValue({
        collection: { id: 'p-1', name: 'Postman Col', items: [] },
      });

      await commandCallbacks['hivefetch.importPostman']();

      expect(mockStorageService.saveCollections).toHaveBeenCalled();
      expect(mockOnCollectionsUpdated).toHaveBeenCalled();
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('Postman Col')
      );
    });

    it('should offer to save variables as environment', async () => {
      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([{ fsPath: '/test.json' }]);
      mockImportPostmanCollection.mockResolvedValue({
        collection: { id: 'p-1', name: 'API', items: [] },
        variables: { name: 'API Env', variables: [{ key: 'baseUrl', value: 'http://localhost' }] },
      });
      (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Yes');

      await commandCallbacks['hivefetch.importPostman']();

      expect(mockStorageService.saveEnvironments).toHaveBeenCalled();
    });

    it('should show error on import failure', async () => {
      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([{ fsPath: '/bad.json' }]);
      mockImportPostmanCollection.mockRejectedValue(new Error('Invalid format'));

      await commandCallbacks['hivefetch.importPostman']();

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Invalid format')
      );
    });
  });

  describe('registerExportPostmanCommand', () => {
    beforeEach(() => {
      registerExportPostmanCommand(mockGetCollections);
    });

    it('should register the command', () => {
      expect(mockRegisterCommand).toHaveBeenCalledWith('hivefetch.exportPostman', expect.any(Function));
    });

    it('should warn when no collections exist', async () => {
      mockGetCollections.mockReturnValue([]);
      await commandCallbacks['hivefetch.exportPostman']();
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('No collections to export.');
    });

    it('should export directly when collectionId is provided', async () => {
      mockGetCollections.mockReturnValue([{ id: 'col-1', name: 'My API', items: [] }]);
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue({ fsPath: '/export.json' });
      mockExportToFile.mockResolvedValue(undefined);

      await commandCallbacks['hivefetch.exportPostman']('col-1');

      expect(mockExportToFile).toHaveBeenCalled();
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('exported successfully')
      );
    });

    it('should show quick pick when no collectionId', async () => {
      mockGetCollections.mockReturnValue([
        { id: 'col-1', name: 'API 1', items: [] },
        { id: 'col-2', name: 'API 2', items: [] },
      ]);
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({ label: 'API 1', id: 'col-1' });
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue({ fsPath: '/export.json' });
      mockExportToFile.mockResolvedValue(undefined);

      await commandCallbacks['hivefetch.exportPostman']();

      expect(vscode.window.showQuickPick).toHaveBeenCalled();
      expect(mockExportToFile).toHaveBeenCalled();
    });

    it('should do nothing when user cancels save dialog', async () => {
      mockGetCollections.mockReturnValue([{ id: 'col-1', name: 'API', items: [] }]);
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(undefined);

      await commandCallbacks['hivefetch.exportPostman']('col-1');
      expect(mockExportToFile).not.toHaveBeenCalled();
    });
  });

  describe('registerImportOpenApiCommand', () => {
    beforeEach(() => {
      registerImportOpenApiCommand(mockStorageService, mockOnCollectionsUpdated);
    });

    it('should register the command', () => {
      expect(mockRegisterCommand).toHaveBeenCalledWith('hivefetch.importOpenApi', expect.any(Function));
    });

    it('should do nothing when user cancels source selection', async () => {
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(undefined);
      await commandCallbacks['hivefetch.importOpenApi']();
      expect(mockImportFromFile).not.toHaveBeenCalled();
    });

    it('should import from file', async () => {
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({ label: 'From File' });
      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([{ fsPath: '/spec.yaml' }]);
      mockImportFromFile.mockResolvedValue({
        collection: { id: 'oa-1', name: 'Petstore', items: [] },
      });

      await commandCallbacks['hivefetch.importOpenApi']();

      expect(mockImportFromFile).toHaveBeenCalled();
      expect(mockStorageService.saveCollections).toHaveBeenCalled();
      expect(mockOnCollectionsUpdated).toHaveBeenCalled();
    });

    it('should import from URL', async () => {
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({ label: 'From URL' });
      (vscode.window.showInputBox as jest.Mock).mockResolvedValue('https://example.com/spec.json');
      mockImportFromUrl.mockResolvedValue({
        collection: { id: 'oa-1', name: 'API', items: [] },
      });

      await commandCallbacks['hivefetch.importOpenApi']();

      expect(mockImportFromUrl).toHaveBeenCalledWith('https://example.com/spec.json');
    });
  });

  describe('registerImportCurlCommand', () => {
    beforeEach(() => {
      registerImportCurlCommand(mockStorageService, mockOnCollectionsUpdated);
    });

    it('should register the command', () => {
      expect(mockRegisterCommand).toHaveBeenCalledWith('hivefetch.importCurl', expect.any(Function));
    });

    it('should do nothing when user cancels input', async () => {
      (vscode.window.showInputBox as jest.Mock).mockResolvedValue(undefined);
      await commandCallbacks['hivefetch.importCurl']();
      expect(mockStorageService.saveCollections).not.toHaveBeenCalled();
    });
  });

  describe('registerBulkExportCommand', () => {
    beforeEach(() => {
      registerBulkExportCommand(mockGetCollections);
    });

    it('should register the command', () => {
      expect(mockRegisterCommand).toHaveBeenCalledWith('hivefetch.bulkExport', expect.any(Function));
    });

    it('should warn when no collections exist', async () => {
      await commandCallbacks['hivefetch.bulkExport']();
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('No collections to export.');
    });

    it('should export all collections when no IDs specified', async () => {
      mockGetCollections.mockReturnValue([
        { id: 'col-1', name: 'A', items: [] },
        { id: 'col-2', name: 'B', items: [] },
      ]);
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue({ fsPath: '/bulk.json' });
      mockExportToPostman.mockResolvedValue({});
      (vscode.workspace.fs.writeFile as jest.Mock).mockResolvedValue(undefined);

      await commandCallbacks['hivefetch.bulkExport']();

      expect(mockExportToPostman).toHaveBeenCalledTimes(2);
      expect(vscode.workspace.fs.writeFile).toHaveBeenCalled();
    });

    it('should filter by collectionIds when provided', async () => {
      mockGetCollections.mockReturnValue([
        { id: 'col-1', name: 'A', items: [] },
        { id: 'col-2', name: 'B', items: [] },
      ]);
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue({ fsPath: '/bulk.json' });
      mockExportToPostman.mockResolvedValue({});
      (vscode.workspace.fs.writeFile as jest.Mock).mockResolvedValue(undefined);

      await commandCallbacks['hivefetch.bulkExport'](['col-1']);

      expect(mockExportToPostman).toHaveBeenCalledTimes(1);
    });
  });

  describe('registerBulkExportNativeCommand', () => {
    beforeEach(() => {
      registerBulkExportNativeCommand(mockGetCollections);
    });

    it('should register the command', () => {
      expect(mockRegisterCommand).toHaveBeenCalledWith('hivefetch.bulkExportNative', expect.any(Function));
    });

    it('should warn when no collections', async () => {
      await commandCallbacks['hivefetch.bulkExportNative']();
      expect(vscode.window.showWarningMessage).toHaveBeenCalled();
    });
  });

  describe('registerExportNativeCommand', () => {
    beforeEach(() => {
      registerExportNativeCommand(mockGetCollections);
    });

    it('should register the command', () => {
      expect(mockRegisterCommand).toHaveBeenCalledWith('hivefetch.exportNative', expect.any(Function));
    });

    it('should warn when no collections', async () => {
      await commandCallbacks['hivefetch.exportNative']();
      expect(vscode.window.showWarningMessage).toHaveBeenCalled();
    });
  });

  describe('registerImportNativeCommand', () => {
    beforeEach(() => {
      registerImportNativeCommand(mockStorageService, mockOnCollectionsUpdated);
    });

    it('should register the command', () => {
      expect(mockRegisterCommand).toHaveBeenCalledWith('hivefetch.importNative', expect.any(Function));
    });

    it('should do nothing when user cancels', async () => {
      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue(undefined);
      await commandCallbacks['hivefetch.importNative']();
      expect(mockStorageService.saveCollections).not.toHaveBeenCalled();
    });
  });

  describe('registerImportInsomniaCommand', () => {
    beforeEach(() => {
      registerImportInsomniaCommand(mockStorageService, mockOnCollectionsUpdated);
    });

    it('should register the command', () => {
      expect(mockRegisterCommand).toHaveBeenCalledWith('hivefetch.importInsomnia', expect.any(Function));
    });
  });

  describe('registerImportHoppscotchCommand', () => {
    beforeEach(() => {
      registerImportHoppscotchCommand(mockStorageService, mockOnCollectionsUpdated);
    });

    it('should register the command', () => {
      expect(mockRegisterCommand).toHaveBeenCalledWith('hivefetch.importHoppscotch', expect.any(Function));
    });
  });

  describe('registerImportThunderClientCommand', () => {
    beforeEach(() => {
      registerImportThunderClientCommand(mockStorageService, mockOnCollectionsUpdated);
    });

    it('should register the command', () => {
      expect(mockRegisterCommand).toHaveBeenCalledWith('hivefetch.importThunderClient', expect.any(Function));
    });
  });

  describe('registerImportAutoCommand', () => {
    beforeEach(() => {
      registerImportAutoCommand(mockStorageService, mockOnCollectionsUpdated);
    });

    it('should register the command', () => {
      expect(mockRegisterCommand).toHaveBeenCalledWith('hivefetch.importAuto', expect.any(Function));
    });

    it('should do nothing when user cancels', async () => {
      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue(undefined);
      await commandCallbacks['hivefetch.importAuto']();
      expect(mockStorageService.saveCollections).not.toHaveBeenCalled();
    });
  });

  describe('registerImportFromUrlCommand', () => {
    beforeEach(() => {
      registerImportFromUrlCommand(mockStorageService, mockOnCollectionsUpdated);
    });

    it('should register the command', () => {
      expect(mockRegisterCommand).toHaveBeenCalledWith('hivefetch.importFromUrl', expect.any(Function));
    });

    it('should do nothing when user cancels URL input', async () => {
      (vscode.window.showInputBox as jest.Mock).mockResolvedValue(undefined);
      await commandCallbacks['hivefetch.importFromUrl']();
      expect(mockStorageService.saveCollections).not.toHaveBeenCalled();
    });

    it('should reject invalid URL format', async () => {
      (vscode.window.showInputBox as jest.Mock).mockResolvedValue('not-a-url');
      await commandCallbacks['hivefetch.importFromUrl']();
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Invalid URL format.');
    });

    it('should reject non-HTTP protocols', async () => {
      (vscode.window.showInputBox as jest.Mock).mockResolvedValue('ftp://example.com/file.json');
      await commandCallbacks['hivefetch.importFromUrl']();
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Only HTTP and HTTPS URLs are supported.');
    });
  });
});
