import * as vscode from 'vscode';
import { registerExportHistoryCommand, registerImportHistoryCommand } from './history';

jest.mock('../services/HistoryExportService', () => ({
  HistoryExportService: jest.fn().mockImplementation(() => ({
    exportJSON: jest.fn().mockResolvedValue('{"entries":[]}'),
    exportCSV: jest.fn().mockResolvedValue('timestamp,method,url\n'),
    importJSON: jest.fn().mockResolvedValue(5),
  })),
}));

describe('history commands', () => {
  const mockRegisterCommand = vscode.commands.registerCommand as jest.Mock;
  let commandCallback: (...args: any[]) => Promise<void>;
  const mockHistoryService: any = {};
  const getHistoryService = () => mockHistoryService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRegisterCommand.mockImplementation((_cmd: string, cb: any) => {
      commandCallback = cb;
      return { dispose: jest.fn() };
    });
  });

  describe('registerExportHistoryCommand', () => {
    beforeEach(() => {
      registerExportHistoryCommand(getHistoryService);
    });

    it('should register nouto.exportHistory command', () => {
      expect(mockRegisterCommand).toHaveBeenCalledWith(
        'nouto.exportHistory',
        expect.any(Function)
      );
    });

    it('should do nothing when user cancels format selection', async () => {
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(undefined);
      await commandCallback();
      expect(vscode.window.showSaveDialog).not.toHaveBeenCalled();
    });

    it('should export JSON when selected', async () => {
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({ label: 'JSON', id: 'json' });
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue({ fsPath: '/export/history.json' });
      (vscode.workspace.fs.writeFile as jest.Mock).mockResolvedValue(undefined);

      await commandCallback();

      expect(vscode.window.showSaveDialog).toHaveBeenCalled();
      expect(vscode.workspace.fs.writeFile).toHaveBeenCalled();
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('History exported')
      );
    });

    it('should do nothing when user cancels save dialog', async () => {
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({ label: 'CSV', id: 'csv' });
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(undefined);

      await commandCallback();
      expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('registerImportHistoryCommand', () => {
    const mockOnHistoryUpdated = jest.fn().mockResolvedValue(undefined);

    beforeEach(() => {
      registerImportHistoryCommand(getHistoryService, mockOnHistoryUpdated);
    });

    it('should register nouto.importHistory command', () => {
      expect(mockRegisterCommand).toHaveBeenCalledWith(
        'nouto.importHistory',
        expect.any(Function)
      );
    });

    it('should do nothing when user cancels file selection', async () => {
      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue(undefined);
      await commandCallback();
      expect(mockOnHistoryUpdated).not.toHaveBeenCalled();
    });

    it('should import history from selected file', async () => {
      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([{ fsPath: '/import/history.json' }]);
      (vscode.workspace.fs.readFile as jest.Mock).mockResolvedValue(
        new TextEncoder().encode('{"entries":[]}')
      );

      await commandCallback();

      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('Imported 5 history entries')
      );
      expect(mockOnHistoryUpdated).toHaveBeenCalled();
    });

    it('should show error on import failure', async () => {
      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([{ fsPath: '/import/bad.json' }]);
      (vscode.workspace.fs.readFile as jest.Mock).mockResolvedValue(
        new TextEncoder().encode('invalid')
      );

      // Make the mock importJSON throw
      const { HistoryExportService } = require('../services/HistoryExportService');
      HistoryExportService.mockImplementationOnce(() => ({
        importJSON: jest.fn().mockRejectedValue(new Error('Bad format')),
      }));

      await commandCallback();

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Import failed')
      );
    });
  });
});
