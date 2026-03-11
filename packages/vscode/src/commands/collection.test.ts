import * as vscode from 'vscode';
import { registerNewCollectionCommand, registerDuplicateSelectedRequestCommand } from './collection';

describe('collection commands', () => {
  const mockRegisterCommand = vscode.commands.registerCommand as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRegisterCommand.mockImplementation((_cmd: string, cb: any) => {
      (mockRegisterCommand as any).__lastCallback = cb;
      return { dispose: jest.fn() };
    });
  });

  describe('registerNewCollectionCommand', () => {
    const mockSidebarProvider: any = {
      uiService: null,
      createEmptyCollection: jest.fn(),
    };

    it('should register hivefetch.newCollection command', () => {
      registerNewCollectionCommand(mockSidebarProvider);
      expect(mockRegisterCommand).toHaveBeenCalledWith(
        'hivefetch.newCollection',
        expect.any(Function)
      );
    });

    it('should use UIService when available', async () => {
      const mockUiService = {
        showInputBox: jest.fn().mockResolvedValue('My API'),
      };
      mockSidebarProvider.uiService = mockUiService;

      registerNewCollectionCommand(mockSidebarProvider);
      const cb = (mockRegisterCommand as any).__lastCallback;
      await cb();

      expect(mockUiService.showInputBox).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: 'Collection name' })
      );
      expect(mockSidebarProvider.createEmptyCollection).toHaveBeenCalledWith('My API');
    });

    it('should fall back to vscode.window.showInputBox when no UIService', async () => {
      mockSidebarProvider.uiService = null;
      (vscode.window.showInputBox as jest.Mock).mockResolvedValue('Fallback Collection');

      registerNewCollectionCommand(mockSidebarProvider);
      const cb = (mockRegisterCommand as any).__lastCallback;
      await cb();

      expect(vscode.window.showInputBox).toHaveBeenCalled();
      expect(mockSidebarProvider.createEmptyCollection).toHaveBeenCalledWith('Fallback Collection');
    });

    it('should not create collection when user cancels', async () => {
      mockSidebarProvider.uiService = null;
      (vscode.window.showInputBox as jest.Mock).mockResolvedValue(undefined);

      registerNewCollectionCommand(mockSidebarProvider);
      const cb = (mockRegisterCommand as any).__lastCallback;
      await cb();

      expect(mockSidebarProvider.createEmptyCollection).not.toHaveBeenCalled();
    });
  });

  describe('registerDuplicateSelectedRequestCommand', () => {
    const mockSidebarProvider: any = {
      triggerDuplicateSelected: jest.fn(),
    };

    it('should register hivefetch.duplicateSelectedRequest command', () => {
      registerDuplicateSelectedRequestCommand(mockSidebarProvider);
      expect(mockRegisterCommand).toHaveBeenCalledWith(
        'hivefetch.duplicateSelectedRequest',
        expect.any(Function)
      );
    });

    it('should call triggerDuplicateSelected', () => {
      registerDuplicateSelectedRequestCommand(mockSidebarProvider);
      const cb = (mockRegisterCommand as any).__lastCallback;
      cb();
      expect(mockSidebarProvider.triggerDuplicateSelected).toHaveBeenCalled();
    });
  });
});
