import * as vscode from 'vscode';
import { registerExportBackupCommand, registerImportBackupCommand } from './backup';

jest.mock('vscode');
jest.mock('../services/BackupService');

import { BackupService } from '../services/BackupService';

const mockBackupService = {
  exportBackup: jest.fn(),
  importBackup: jest.fn(),
  _parseAndValidate: jest.fn(),
};

(BackupService as jest.MockedClass<typeof BackupService>).mockImplementation(() => mockBackupService as any);

const mockGlobalState = {
  get: jest.fn(),
  update: jest.fn().mockResolvedValue(undefined),
};

describe('backup commands', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('registerExportBackupCommand', () => {
    it('should register the nouto.exportBackup command', () => {
      registerExportBackupCommand('/mock/storage', mockGlobalState as any);
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith('nouto.exportBackup', expect.any(Function));
    });

    it('should abort if user cancels section picker', async () => {
      registerExportBackupCommand('/mock/storage', mockGlobalState as any);
      const handler = (vscode.commands.registerCommand as jest.Mock).mock.calls[0][1];

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(undefined);
      await handler();

      expect(mockBackupService.exportBackup).not.toHaveBeenCalled();
    });

    it('should abort if user cancels save dialog', async () => {
      registerExportBackupCommand('/mock/storage', mockGlobalState as any);
      const handler = (vscode.commands.registerCommand as jest.Mock).mock.calls[0][1];

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue([{ label: 'Collections', key: 'includeCollections' }]);
      mockBackupService.exportBackup.mockResolvedValue('{}');
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(undefined);
      await handler();

      expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();
    });

    it('should write backup file on success', async () => {
      registerExportBackupCommand('/mock/storage', mockGlobalState as any);
      const handler = (vscode.commands.registerCommand as jest.Mock).mock.calls[0][1];

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue([
        { label: 'Collections', key: 'includeCollections' },
      ]);
      mockBackupService.exportBackup.mockResolvedValue('{"_format":"nouto-backup"}');
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue({ fsPath: '/tmp/backup.nouto-backup' });

      await handler();

      expect(vscode.workspace.fs.writeFile).toHaveBeenCalled();
      expect(vscode.window.showInformationMessage).toHaveBeenCalled();
    });

    it('should show error on export failure', async () => {
      registerExportBackupCommand('/mock/storage', mockGlobalState as any);
      const handler = (vscode.commands.registerCommand as jest.Mock).mock.calls[0][1];

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue([
        { label: 'Collections', key: 'includeCollections' },
      ]);
      mockBackupService.exportBackup.mockRejectedValue(new Error('disk full'));

      await handler();

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('disk full'));
    });
  });

  describe('registerImportBackupCommand', () => {
    const onDataRestored = jest.fn().mockResolvedValue(undefined);

    it('should register the nouto.importBackup command', () => {
      registerImportBackupCommand('/mock/storage', mockGlobalState as any, onDataRestored);
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith('nouto.importBackup', expect.any(Function));
    });

    it('should abort if user cancels file picker', async () => {
      registerImportBackupCommand('/mock/storage', mockGlobalState as any, onDataRestored);
      const handler = (vscode.commands.registerCommand as jest.Mock).mock.calls[0][1];

      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue(undefined);
      await handler();

      expect(mockBackupService._parseAndValidate).not.toHaveBeenCalled();
    });

    it('should show error for invalid backup file', async () => {
      registerImportBackupCommand('/mock/storage', mockGlobalState as any, onDataRestored);
      const handler = (vscode.commands.registerCommand as jest.Mock).mock.calls[0][1];

      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([{ fsPath: '/tmp/bad.json' }]);
      (vscode.workspace.fs.readFile as jest.Mock).mockResolvedValue(new TextEncoder().encode('not json'));
      mockBackupService._parseAndValidate.mockImplementation(() => { throw new Error('not valid JSON'); });

      await handler();

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('not valid JSON');
    });

    it('should abort if user cancels confirmation', async () => {
      registerImportBackupCommand('/mock/storage', mockGlobalState as any, onDataRestored);
      const handler = (vscode.commands.registerCommand as jest.Mock).mock.calls[0][1];

      const backupData = {
        _format: 'nouto-backup',
        _version: '1.0',
        manifest: {
          collections: { included: true, count: 5 },
          environments: { included: false, count: 0 },
          cookies: { included: false, jarCount: 0, cookieCount: 0 },
          history: { included: false, count: 0 },
          drafts: { included: false, count: 0 },
          trash: { included: false, count: 0 },
          runnerHistory: { included: false, count: 0 },
          mocks: { included: false, routeCount: 0 },
          settings: { included: false },
        },
        _warnings: [],
      };

      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([{ fsPath: '/tmp/backup.nouto-backup' }]);
      (vscode.workspace.fs.readFile as jest.Mock).mockResolvedValue(new TextEncoder().encode(JSON.stringify(backupData)));
      mockBackupService._parseAndValidate.mockReturnValue(backupData);
      (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined); // User cancelled

      await handler();

      expect(mockBackupService.importBackup).not.toHaveBeenCalled();
    });

    it('should restore and reload on confirmation', async () => {
      registerImportBackupCommand('/mock/storage', mockGlobalState as any, onDataRestored);
      const handler = (vscode.commands.registerCommand as jest.Mock).mock.calls[0][1];

      const backupData = {
        _format: 'nouto-backup',
        _version: '1.0',
        manifest: {
          collections: { included: true, count: 3 },
          environments: { included: true, count: 2 },
          cookies: { included: false, jarCount: 0, cookieCount: 0 },
          history: { included: true, count: 100 },
          drafts: { included: false, count: 0 },
          trash: { included: false, count: 0 },
          runnerHistory: { included: false, count: 0 },
          mocks: { included: false, routeCount: 0 },
          settings: { included: false },
        },
        _warnings: [],
      };

      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([{ fsPath: '/tmp/backup.nouto-backup' }]);
      (vscode.workspace.fs.readFile as jest.Mock).mockResolvedValue(new TextEncoder().encode(JSON.stringify(backupData)));
      mockBackupService._parseAndValidate.mockReturnValue(backupData);
      (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Restore');
      mockBackupService.importBackup.mockResolvedValue({
        sectionsRestored: ['Collections', 'Environments', 'History'],
        warnings: [],
        collectionsCount: 3,
        environmentsCount: 2,
        historyCount: 100,
      });

      await handler();

      expect(mockBackupService.importBackup).toHaveBeenCalled();
      expect(onDataRestored).toHaveBeenCalled();
      expect(vscode.window.showInformationMessage).toHaveBeenCalled();
    });
  });
});
