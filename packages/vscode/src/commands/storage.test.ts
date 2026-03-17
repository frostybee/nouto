import * as vscode from 'vscode';
import { registerSwitchToGlobalStorageCommand, registerSwitchToWorkspaceStorageCommand } from './storage';

describe('storage commands', () => {
  const mockRegisterCommand = vscode.commands.registerCommand as jest.Mock;
  let commandCallback: (...args: any[]) => Promise<void>;
  const mockStorageService: any = {
    switchStorageMode: jest.fn(),
  };
  const mockOnSwitch = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
    mockRegisterCommand.mockImplementation((_cmd: string, cb: any) => {
      commandCallback = cb;
      return { dispose: jest.fn() };
    });
  });

  describe('registerSwitchToGlobalStorageCommand', () => {
    beforeEach(() => {
      registerSwitchToGlobalStorageCommand(mockStorageService, mockOnSwitch);
    });

    it('should register nouto.switchToGlobalStorage command', () => {
      expect(mockRegisterCommand).toHaveBeenCalledWith(
        'nouto.switchToGlobalStorage',
        expect.any(Function)
      );
    });

    it('should do nothing when user cancels confirmation', async () => {
      (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);
      await commandCallback();
      expect(mockStorageService.switchStorageMode).not.toHaveBeenCalled();
    });

    it('should switch to global storage on confirmation', async () => {
      (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Switch');
      mockStorageService.switchStorageMode.mockResolvedValue(true);

      await commandCallback();

      expect(mockStorageService.switchStorageMode).toHaveBeenCalledWith('global');
      expect(mockOnSwitch).toHaveBeenCalled();
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'Switched to global storage mode.'
      );
    });

    it('should show error when switch fails', async () => {
      (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Switch');
      mockStorageService.switchStorageMode.mockResolvedValue(false);

      await commandCallback();

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        'Failed to switch storage mode.'
      );
      expect(mockOnSwitch).not.toHaveBeenCalled();
    });
  });

  describe('registerSwitchToWorkspaceStorageCommand', () => {
    beforeEach(() => {
      registerSwitchToWorkspaceStorageCommand(mockStorageService, mockOnSwitch);
    });

    it('should register nouto.switchToWorkspaceStorage command', () => {
      expect(mockRegisterCommand).toHaveBeenCalledWith(
        'nouto.switchToWorkspaceStorage',
        expect.any(Function)
      );
    });

    it('should do nothing when user cancels confirmation', async () => {
      (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);
      await commandCallback();
      expect(mockStorageService.switchStorageMode).not.toHaveBeenCalled();
    });

    it('should switch to workspace storage on confirmation', async () => {
      (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Switch');
      mockStorageService.switchStorageMode.mockResolvedValue(true);

      await commandCallback();

      expect(mockStorageService.switchStorageMode).toHaveBeenCalledWith('workspace');
      expect(mockOnSwitch).toHaveBeenCalled();
    });

    it('should show error when switch fails', async () => {
      (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Switch');
      mockStorageService.switchStorageMode.mockResolvedValue(false);

      await commandCallback();

      expect(vscode.window.showErrorMessage).toHaveBeenCalled();
      expect(mockOnSwitch).not.toHaveBeenCalled();
    });
  });
});
