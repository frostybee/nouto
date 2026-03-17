import * as vscode from 'vscode';
import { registerNewRequestCommand, registerOpenRequestCommand, registerCreateRequestFromUrlCommand } from './request';

jest.mock('../services/types', () => ({
  isFolder: jest.fn((item: any) => item.type === 'folder'),
  REQUEST_KIND: { HTTP: 'http', GRAPHQL: 'graphql', WEBSOCKET: 'websocket', SSE: 'sse' },
}));

const mockShowQuickPick = vscode.window.showQuickPick as jest.Mock;
const mockShowInputBox = vscode.window.showInputBox as jest.Mock;

describe('request commands', () => {
  const mockRegisterCommand = vscode.commands.registerCommand as jest.Mock;
  let commandCallback: (...args: any[]) => Promise<void>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRegisterCommand.mockImplementation((_cmd: string, cb: any) => {
      commandCallback = cb;
      return { dispose: jest.fn() };
    });
  });

  describe('registerNewRequestCommand', () => {
    const mockPanelManager: any = {
      openNewRequest: jest.fn(),
      openSavedRequest: jest.fn(),
    };
    const mockSidebarProvider: any = {
      whenReady: jest.fn().mockResolvedValue(undefined),
      getCollections: jest.fn().mockReturnValue([]),
      createCollectionAndAddRequest: jest.fn().mockResolvedValue({
        collectionId: 'col-new',
        request: { id: 'req-new', name: 'New' },
        connectionMode: 'http',
      }),
      createRequestInCollection: jest.fn().mockResolvedValue({
        request: { id: 'req-1', name: 'Test' },
        collectionId: 'col-1',
        connectionMode: 'http',
      }),
    };

    it('should register nouto.newRequest command', () => {
      registerNewRequestCommand(mockPanelManager, mockSidebarProvider);
      expect(mockRegisterCommand).toHaveBeenCalledWith(
        'nouto.newRequest',
        expect.any(Function)
      );
    });

    it('should do nothing when user cancels type selection', async () => {
      mockShowQuickPick.mockResolvedValueOnce(null);

      registerNewRequestCommand(mockPanelManager, mockSidebarProvider);
      await commandCallback();

      expect(mockPanelManager.openNewRequest).not.toHaveBeenCalled();
      expect(mockPanelManager.openSavedRequest).not.toHaveBeenCalled();
    });

    it('should skip type selection when preselectedKind is provided', async () => {
      // Return a no-collection pick for the collection step
      mockShowQuickPick.mockResolvedValueOnce({ label: 'No Collection', action: 'no-collection' });
      mockSidebarProvider.getCollections.mockReturnValue([]);

      registerNewRequestCommand(mockPanelManager, mockSidebarProvider);
      await commandCallback('http');

      // Only called once (for collection, not type)
      expect(mockShowQuickPick).toHaveBeenCalledTimes(1);
    });

    it('should open no-collection request when selected', async () => {
      // Step 1: type selection
      mockShowQuickPick.mockResolvedValueOnce({ label: 'HTTP Request', requestKind: 'http' });
      // Step 2: collection selection
      mockShowQuickPick.mockResolvedValueOnce({ label: 'No Collection', action: 'no-collection' });
      mockSidebarProvider.getCollections.mockReturnValue([]);

      registerNewRequestCommand(mockPanelManager, mockSidebarProvider);
      await commandCallback();

      expect(mockPanelManager.openNewRequest).toHaveBeenCalledWith({ requestKind: 'http' });
    });

    it('should create new collection when selected', async () => {
      mockShowQuickPick.mockResolvedValueOnce({ label: 'HTTP Request', requestKind: 'http' });
      mockShowQuickPick.mockResolvedValueOnce({ label: 'Create New Collection...', action: 'new-collection' });
      mockShowInputBox.mockResolvedValueOnce('My API');
      mockSidebarProvider.getCollections.mockReturnValue([]);

      registerNewRequestCommand(mockPanelManager, mockSidebarProvider);
      await commandCallback();

      expect(mockSidebarProvider.createCollectionAndAddRequest).toHaveBeenCalledWith(
        'My API', 'http', undefined, undefined, undefined
      );
      expect(mockPanelManager.openSavedRequest).toHaveBeenCalled();
    });

    it('should do nothing when user cancels collection name input', async () => {
      mockShowQuickPick.mockResolvedValueOnce({ label: 'HTTP Request', requestKind: 'http' });
      mockShowQuickPick.mockResolvedValueOnce({ label: 'Create New Collection...', action: 'new-collection' });
      mockShowInputBox.mockResolvedValueOnce(undefined);
      mockSidebarProvider.getCollections.mockReturnValue([]);

      registerNewRequestCommand(mockPanelManager, mockSidebarProvider);
      await commandCallback();

      expect(mockSidebarProvider.createCollectionAndAddRequest).not.toHaveBeenCalled();
    });

    it('should create request in selected collection', async () => {
      mockShowQuickPick.mockResolvedValueOnce({ label: 'HTTP Request', requestKind: 'http' });
      mockShowQuickPick.mockResolvedValueOnce({
        label: 'My Collection',
        action: 'select-collection',
        collectionId: 'col-1',
      });
      mockSidebarProvider.getCollections.mockReturnValue([
        { id: 'col-1', name: 'My Collection', items: [] },
      ]);

      registerNewRequestCommand(mockPanelManager, mockSidebarProvider);
      await commandCallback();

      expect(mockSidebarProvider.createRequestInCollection).toHaveBeenCalledWith('col-1', undefined, 'http');
      expect(mockPanelManager.openSavedRequest).toHaveBeenCalled();
    });
  });

  describe('registerOpenRequestCommand', () => {
    const mockPanelManager: any = {
      openSavedRequest: jest.fn(),
    };

    it('should register nouto.openRequest command', () => {
      registerOpenRequestCommand(mockPanelManager);
      expect(mockRegisterCommand).toHaveBeenCalledWith(
        'nouto.openRequest',
        expect.any(Function)
      );
    });

    it('should call openSavedRequest with request data', async () => {
      registerOpenRequestCommand(mockPanelManager);
      const request = { id: 'req-1', name: 'Test' };
      await commandCallback(request, 'col-1', 'http', false);

      expect(mockPanelManager.openSavedRequest).toHaveBeenCalledWith(
        request,
        'col-1',
        { connectionMode: 'http', newTab: false }
      );
    });
  });

  describe('registerCreateRequestFromUrlCommand', () => {
    const mockPanelManager: any = {
      openNewRequest: jest.fn(),
      openSavedRequest: jest.fn(),
    };
    const mockSidebarProvider: any = {
      whenReady: jest.fn().mockResolvedValue(undefined),
      getCollections: jest.fn().mockReturnValue([]),
      createCollectionAndAddRequest: jest.fn().mockResolvedValue({ collectionId: 'c1', request: { id: 'r1' }, connectionMode: 'http' }),
      createRequestInCollection: jest.fn().mockResolvedValue({ request: { id: 'r1' }, collectionId: 'c1', connectionMode: 'http' }),
    };

    it('should register nouto.createRequestFromUrl command', () => {
      registerCreateRequestFromUrlCommand(mockPanelManager, mockSidebarProvider);
      expect(mockRegisterCommand).toHaveBeenCalledWith(
        'nouto.createRequestFromUrl',
        expect.any(Function)
      );
    });

    it('should show native quick pick for collection selection', async () => {
      mockShowQuickPick.mockResolvedValueOnce({ label: 'No Collection', action: 'no-collection' });
      registerCreateRequestFromUrlCommand(mockPanelManager, mockSidebarProvider);
      await commandCallback('https://api.example.com');
      expect(mockSidebarProvider.whenReady).toHaveBeenCalled();
      expect(mockPanelManager.openNewRequest).toHaveBeenCalledWith({ requestKind: 'http', initialUrl: 'https://api.example.com' });
    });

    it('should do nothing when user cancels collection selection', async () => {
      mockShowQuickPick.mockResolvedValueOnce(null);
      registerCreateRequestFromUrlCommand(mockPanelManager, mockSidebarProvider);
      await commandCallback('https://api.example.com');
      expect(mockPanelManager.openNewRequest).not.toHaveBeenCalled();
      expect(mockPanelManager.openSavedRequest).not.toHaveBeenCalled();
    });

    it('should detect websocket URLs', async () => {
      mockShowQuickPick.mockResolvedValueOnce({ label: 'No Collection', action: 'no-collection' });
      registerCreateRequestFromUrlCommand(mockPanelManager, mockSidebarProvider);
      await commandCallback('wss://ws.example.com');
      expect(mockPanelManager.openNewRequest).toHaveBeenCalledWith({ requestKind: 'websocket', initialUrl: 'wss://ws.example.com' });
    });
  });
});
