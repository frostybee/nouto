import * as vscode from 'vscode';
import { registerNewRequestCommand, registerOpenRequestCommand, registerCreateRequestFromUrlCommand } from './request';

jest.mock('../services/types', () => ({
  isFolder: jest.fn((item: any) => item.type === 'folder'),
  REQUEST_KIND: { HTTP: 'http', GRAPHQL: 'graphql', WEBSOCKET: 'websocket', SSE: 'sse' },
}));

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
      uiService: null,
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

    it('should register hivefetch.newRequest command', () => {
      registerNewRequestCommand(mockPanelManager, mockSidebarProvider);
      expect(mockRegisterCommand).toHaveBeenCalledWith(
        'hivefetch.newRequest',
        expect.any(Function)
      );
    });

    it('should fallback to openNewRequest when no uiService', async () => {
      mockSidebarProvider.uiService = null;
      registerNewRequestCommand(mockPanelManager, mockSidebarProvider);
      await commandCallback();
      expect(mockPanelManager.openNewRequest).toHaveBeenCalled();
    });

    it('should do nothing when user cancels type selection', async () => {
      const mockUiService = {
        showQuickPick: jest.fn().mockResolvedValue(null),
        showCreateItemDialog: jest.fn(),
      };
      mockSidebarProvider.uiService = mockUiService;

      registerNewRequestCommand(mockPanelManager, mockSidebarProvider);
      await commandCallback();

      expect(mockPanelManager.openNewRequest).not.toHaveBeenCalled();
      expect(mockPanelManager.openSavedRequest).not.toHaveBeenCalled();
    });

    it('should skip type selection when preselectedKind is provided', async () => {
      const mockUiService = {
        showQuickPick: jest.fn()
          .mockResolvedValueOnce('no-collection'),
        showCreateItemDialog: jest.fn(),
      };
      mockSidebarProvider.uiService = mockUiService;
      mockSidebarProvider.getCollections.mockReturnValue([]);

      registerNewRequestCommand(mockPanelManager, mockSidebarProvider);
      await commandCallback('http');

      // Only called once (for collection, not type)
      expect(mockUiService.showQuickPick).toHaveBeenCalledTimes(1);
    });

    it('should open no-collection request when selected', async () => {
      const mockUiService = {
        showQuickPick: jest.fn()
          .mockResolvedValueOnce('http')
          .mockResolvedValueOnce('no-collection'),
        showCreateItemDialog: jest.fn(),
      };
      mockSidebarProvider.uiService = mockUiService;
      mockSidebarProvider.getCollections.mockReturnValue([]);

      registerNewRequestCommand(mockPanelManager, mockSidebarProvider);
      await commandCallback();

      expect(mockPanelManager.openNewRequest).toHaveBeenCalledWith({ requestKind: 'http' });
    });
  });

  describe('registerOpenRequestCommand', () => {
    const mockPanelManager: any = {
      openSavedRequest: jest.fn(),
    };

    it('should register hivefetch.openRequest command', () => {
      registerOpenRequestCommand(mockPanelManager);
      expect(mockRegisterCommand).toHaveBeenCalledWith(
        'hivefetch.openRequest',
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
    const mockSidebarProvider: any = {
      createRequestFromUrl: jest.fn().mockResolvedValue(undefined),
    };

    it('should register hivefetch.createRequestFromUrl command', () => {
      registerCreateRequestFromUrlCommand(mockSidebarProvider);
      expect(mockRegisterCommand).toHaveBeenCalledWith(
        'hivefetch.createRequestFromUrl',
        expect.any(Function)
      );
    });

    it('should call createRequestFromUrl with the URL', async () => {
      registerCreateRequestFromUrlCommand(mockSidebarProvider);
      await commandCallback('https://api.example.com');
      expect(mockSidebarProvider.createRequestFromUrl).toHaveBeenCalledWith('https://api.example.com');
    });
  });
});
