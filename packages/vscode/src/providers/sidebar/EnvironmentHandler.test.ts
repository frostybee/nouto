jest.mock('fs/promises');
jest.mock('../confirmAction');

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { EnvironmentHandler, type IEnvironmentContext } from './EnvironmentHandler';
import { confirmAction } from '../confirmAction';
import type { EnvironmentsData, EnvironmentVariable } from '../../services/types';

// --- Helpers ---

function createVariable(overrides: Partial<EnvironmentVariable> = {}): EnvironmentVariable {
  return {
    key: 'VAR_KEY',
    value: 'VAR_VALUE',
    enabled: true,
    ...overrides,
  };
}

function createEnvironmentsData(overrides: Partial<EnvironmentsData> = {}): EnvironmentsData {
  return {
    environments: [],
    activeId: null,
    globalVariables: [],
    envFilePath: null,
    ...overrides,
  };
}

function createMockContext(overrides: Partial<IEnvironmentContext> = {}): IEnvironmentContext {
  return {
    environments: createEnvironmentsData(),
    storageService: {
      saveEnvironments: jest.fn().mockResolvedValue(undefined),
    },
    envFileService: {
      setFilePath: jest.fn().mockResolvedValue(undefined),
      getVariables: jest.fn().mockReturnValue([]),
    } as any,
    postToWebview: jest.fn(),
    notifyEnvironmentsUpdated: jest.fn(),
    setEnvironments: jest.fn(),
    uiService: {
      showInputBox: jest.fn(),
      showError: jest.fn(),
      showInfo: jest.fn(),
    } as any,
    ...overrides,
  };
}

function createHandler(ctxOverrides: Partial<IEnvironmentContext> = {}) {
  const ctx = createMockContext(ctxOverrides);
  const handler = new EnvironmentHandler(ctx);
  return { handler, ctx };
}

// --- Tests ---

describe('EnvironmentHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==================== createEnvironment ====================

  describe('createEnvironment()', () => {
    it('creates an environment with the given name', async () => {
      const { handler, ctx } = createHandler();

      await handler.createEnvironment('Production');

      expect(ctx.environments.environments).toHaveLength(1);
      expect(ctx.environments.environments[0].name).toBe('Production');
      expect(ctx.environments.environments[0].variables).toEqual([]);
      expect(ctx.environments.environments[0].id).toBeDefined();
      expect(ctx.storageService.saveEnvironments).toHaveBeenCalledWith(ctx.environments);
      expect(ctx.notifyEnvironmentsUpdated).toHaveBeenCalled();
    });

    it('prompts for name via uiService when no name is provided', async () => {
      const { handler, ctx } = createHandler();
      (ctx.uiService!.showInputBox as jest.Mock).mockResolvedValue('Staging');

      await handler.createEnvironment();

      expect(ctx.uiService!.showInputBox).toHaveBeenCalledWith({
        prompt: 'Environment name',
        placeholder: 'Development',
        validateNotEmpty: true,
      });
      expect(ctx.environments.environments).toHaveLength(1);
      expect(ctx.environments.environments[0].name).toBe('Staging');
    });

    it('falls back to vscode.window.showInputBox when uiService is not available', async () => {
      const { handler, ctx } = createHandler({ uiService: undefined });
      (vscode.window.showInputBox as jest.Mock).mockResolvedValue('Fallback');

      await handler.createEnvironment();

      expect(vscode.window.showInputBox).toHaveBeenCalledWith({
        prompt: 'Environment name',
        placeHolder: 'Development',
      });
      expect(ctx.environments.environments).toHaveLength(1);
      expect(ctx.environments.environments[0].name).toBe('Fallback');
    });

    it('does nothing when user cancels the input', async () => {
      const { handler, ctx } = createHandler();
      (ctx.uiService!.showInputBox as jest.Mock).mockResolvedValue(undefined);

      await handler.createEnvironment();

      expect(ctx.environments.environments).toHaveLength(0);
      expect(ctx.storageService.saveEnvironments).not.toHaveBeenCalled();
      expect(ctx.notifyEnvironmentsUpdated).not.toHaveBeenCalled();
    });

    it('does nothing when user cancels vscode input box', async () => {
      const { handler, ctx } = createHandler({ uiService: undefined });
      (vscode.window.showInputBox as jest.Mock).mockResolvedValue(undefined);

      await handler.createEnvironment();

      expect(ctx.environments.environments).toHaveLength(0);
      expect(ctx.storageService.saveEnvironments).not.toHaveBeenCalled();
    });

    it('generates unique IDs for each environment', async () => {
      const { handler, ctx } = createHandler();

      await handler.createEnvironment('Env1');
      await handler.createEnvironment('Env2');

      expect(ctx.environments.environments).toHaveLength(2);
      expect(ctx.environments.environments[0].id).not.toBe(ctx.environments.environments[1].id);
    });
  });

  // ==================== renameEnvironment ====================

  describe('renameEnvironment()', () => {
    it('renames an existing environment', async () => {
      const { handler, ctx } = createHandler({
        environments: createEnvironmentsData({
          environments: [{ id: 'env-1', name: 'Old Name', variables: [] }],
        }),
      });

      await handler.renameEnvironment('env-1', 'New Name');

      expect(ctx.environments.environments[0].name).toBe('New Name');
      expect(ctx.storageService.saveEnvironments).toHaveBeenCalledWith(ctx.environments);
      expect(ctx.notifyEnvironmentsUpdated).toHaveBeenCalled();
    });

    it('does nothing when environment is not found', async () => {
      const { handler, ctx } = createHandler();

      await handler.renameEnvironment('nonexistent', 'New Name');

      expect(ctx.storageService.saveEnvironments).not.toHaveBeenCalled();
      expect(ctx.notifyEnvironmentsUpdated).not.toHaveBeenCalled();
    });
  });

  // ==================== deleteEnvironment ====================

  describe('deleteEnvironment()', () => {
    it('deletes an environment after confirmation', async () => {
      (confirmAction as jest.Mock).mockResolvedValue(true);
      const { handler, ctx } = createHandler({
        environments: createEnvironmentsData({
          environments: [
            { id: 'env-1', name: 'Dev', variables: [] },
            { id: 'env-2', name: 'Prod', variables: [] },
          ],
        }),
      });

      await handler.deleteEnvironment('env-1');

      expect(confirmAction).toHaveBeenCalledWith('Delete environment "Dev"?', 'Delete');
      expect(ctx.environments.environments).toHaveLength(1);
      expect(ctx.environments.environments[0].id).toBe('env-2');
      expect(ctx.storageService.saveEnvironments).toHaveBeenCalled();
      expect(ctx.notifyEnvironmentsUpdated).toHaveBeenCalled();
    });

    it('clears activeId when deleting the active environment', async () => {
      (confirmAction as jest.Mock).mockResolvedValue(true);
      const { handler, ctx } = createHandler({
        environments: createEnvironmentsData({
          environments: [{ id: 'env-1', name: 'Active', variables: [] }],
          activeId: 'env-1',
        }),
      });

      await handler.deleteEnvironment('env-1');

      expect(ctx.environments.activeId).toBeNull();
    });

    it('does not clear activeId when deleting a non-active environment', async () => {
      (confirmAction as jest.Mock).mockResolvedValue(true);
      const { handler, ctx } = createHandler({
        environments: createEnvironmentsData({
          environments: [
            { id: 'env-1', name: 'Inactive', variables: [] },
            { id: 'env-2', name: 'Active', variables: [] },
          ],
          activeId: 'env-2',
        }),
      });

      await handler.deleteEnvironment('env-1');

      expect(ctx.environments.activeId).toBe('env-2');
    });

    it('does nothing when user cancels confirmation', async () => {
      (confirmAction as jest.Mock).mockResolvedValue(false);
      const { handler, ctx } = createHandler({
        environments: createEnvironmentsData({
          environments: [{ id: 'env-1', name: 'Dev', variables: [] }],
        }),
      });

      await handler.deleteEnvironment('env-1');

      expect(ctx.environments.environments).toHaveLength(1);
      expect(ctx.storageService.saveEnvironments).not.toHaveBeenCalled();
      expect(ctx.notifyEnvironmentsUpdated).not.toHaveBeenCalled();
    });

    it('does nothing when environment is not found', async () => {
      const { handler, ctx } = createHandler();

      await handler.deleteEnvironment('nonexistent');

      expect(confirmAction).not.toHaveBeenCalled();
      expect(ctx.storageService.saveEnvironments).not.toHaveBeenCalled();
    });
  });

  // ==================== duplicateEnvironment ====================

  describe('duplicateEnvironment()', () => {
    it('duplicates an environment with deep-copied variables', async () => {
      const vars: EnvironmentVariable[] = [
        createVariable({ key: 'API_KEY', value: 'secret123' }),
      ];
      const { handler, ctx } = createHandler({
        environments: createEnvironmentsData({
          environments: [{ id: 'env-1', name: 'Production', variables: vars }],
        }),
      });

      await handler.duplicateEnvironment('env-1');

      expect(ctx.environments.environments).toHaveLength(2);
      const duplicate = ctx.environments.environments[1];
      expect(duplicate.name).toBe('Production (copy)');
      expect(duplicate.id).not.toBe('env-1');
      expect(duplicate.variables).toHaveLength(1);
      expect(duplicate.variables[0].key).toBe('API_KEY');
      expect(duplicate.variables[0].value).toBe('secret123');
      // Verify deep copy (not same reference)
      expect(duplicate.variables[0]).not.toBe(vars[0]);
      expect(ctx.storageService.saveEnvironments).toHaveBeenCalled();
      expect(ctx.notifyEnvironmentsUpdated).toHaveBeenCalled();
    });

    it('does nothing when environment is not found', async () => {
      const { handler, ctx } = createHandler();

      await handler.duplicateEnvironment('nonexistent');

      expect(ctx.storageService.saveEnvironments).not.toHaveBeenCalled();
      expect(ctx.notifyEnvironmentsUpdated).not.toHaveBeenCalled();
    });

    it('duplicates an environment with empty variables', async () => {
      const { handler, ctx } = createHandler({
        environments: createEnvironmentsData({
          environments: [{ id: 'env-1', name: 'Empty', variables: [] }],
        }),
      });

      await handler.duplicateEnvironment('env-1');

      const duplicate = ctx.environments.environments[1];
      expect(duplicate.name).toBe('Empty (copy)');
      expect(duplicate.variables).toEqual([]);
    });
  });

  // ==================== setActiveEnvironment ====================

  describe('setActiveEnvironment()', () => {
    it('sets the active environment ID', async () => {
      const { handler, ctx } = createHandler();

      await handler.setActiveEnvironment('env-1');

      expect(ctx.environments.activeId).toBe('env-1');
      expect(ctx.storageService.saveEnvironments).toHaveBeenCalledWith(ctx.environments);
      expect(ctx.notifyEnvironmentsUpdated).toHaveBeenCalled();
    });

    it('clears the active environment when null is passed', async () => {
      const { handler, ctx } = createHandler({
        environments: createEnvironmentsData({ activeId: 'env-1' }),
      });

      await handler.setActiveEnvironment(null);

      expect(ctx.environments.activeId).toBeNull();
      expect(ctx.storageService.saveEnvironments).toHaveBeenCalled();
    });
  });

  // ==================== saveEnvironments ====================

  describe('saveEnvironments()', () => {
    it('sets environments data and saves', async () => {
      const { handler, ctx } = createHandler();
      const newData = createEnvironmentsData({
        environments: [{ id: 'new-1', name: 'New', variables: [] }],
        activeId: 'new-1',
      });

      await handler.saveEnvironments(newData);

      expect(ctx.setEnvironments).toHaveBeenCalledWith(newData);
      expect(ctx.storageService.saveEnvironments).toHaveBeenCalledWith(ctx.environments);
      expect(ctx.notifyEnvironmentsUpdated).toHaveBeenCalled();
    });
  });

  // ==================== linkEnvFile ====================

  describe('linkEnvFile()', () => {
    it('links a .env file after user selects one', async () => {
      const mockUri = { fsPath: '/path/to/.env' };
      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([mockUri]);
      const envVars = [createVariable({ key: 'DB_HOST', value: 'localhost' })];
      const mockEnvFileService = {
        setFilePath: jest.fn().mockResolvedValue(undefined),
        getVariables: jest.fn().mockReturnValue(envVars),
      };
      const { handler, ctx } = createHandler({
        envFileService: mockEnvFileService as any,
      });

      await handler.linkEnvFile();

      expect(vscode.window.showOpenDialog).toHaveBeenCalledWith({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: {
          'Environment Files': ['env'],
          'All Files': ['*'],
        },
        title: 'Select .env File',
      });
      expect(mockEnvFileService.setFilePath).toHaveBeenCalledWith('/path/to/.env');
      expect(ctx.environments.envFilePath).toBe('/path/to/.env');
      expect(ctx.storageService.saveEnvironments).toHaveBeenCalledWith(ctx.environments);
      expect(ctx.postToWebview).toHaveBeenCalledWith({
        type: 'envFileVariablesUpdated',
        data: {
          variables: envVars,
          filePath: '/path/to/.env',
        },
      });
    });

    it('does nothing when user cancels the dialog', async () => {
      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue(undefined);
      const { handler, ctx } = createHandler();

      await handler.linkEnvFile();

      expect(ctx.envFileService.setFilePath).not.toHaveBeenCalled();
      expect(ctx.storageService.saveEnvironments).not.toHaveBeenCalled();
    });

    it('does nothing when user selects empty result', async () => {
      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([]);
      const { handler, ctx } = createHandler();

      await handler.linkEnvFile();

      expect(ctx.envFileService.setFilePath).not.toHaveBeenCalled();
      expect(ctx.storageService.saveEnvironments).not.toHaveBeenCalled();
    });
  });

  // ==================== unlinkEnvFile ====================

  describe('unlinkEnvFile()', () => {
    it('unlinks the .env file and notifies webview', async () => {
      const { handler, ctx } = createHandler({
        environments: createEnvironmentsData({ envFilePath: '/old/.env' }),
      });

      await handler.unlinkEnvFile();

      expect(ctx.envFileService.setFilePath).toHaveBeenCalledWith(null);
      expect(ctx.environments.envFilePath).toBeNull();
      expect(ctx.storageService.saveEnvironments).toHaveBeenCalledWith(ctx.environments);
      expect(ctx.postToWebview).toHaveBeenCalledWith({
        type: 'envFileVariablesUpdated',
        data: {
          variables: [],
          filePath: null,
        },
      });
    });
  });

  // ==================== exportEnvironment ====================

  describe('exportEnvironment()', () => {
    it('exports a regular environment to a JSON file', async () => {
      const vars = [createVariable({ key: 'TOKEN', value: 'abc', description: 'Auth token' })];
      const mockUri = { fsPath: '/export/Production.env.json' };
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(mockUri);
      jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2026-03-11T00:00:00.000Z');

      const { handler } = createHandler({
        environments: createEnvironmentsData({
          environments: [{ id: 'env-1', name: 'Production', variables: vars }],
        }),
      });

      await handler.exportEnvironment('env-1');

      expect(vscode.window.showSaveDialog).toHaveBeenCalledWith({
        defaultUri: vscode.Uri.file('Production.env.json'),
        filters: { 'JSON Files': ['json'] },
        title: 'Export Environment: Production',
      });
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/export/Production.env.json',
        JSON.stringify(
          {
            name: 'Production',
            variables: [{ key: 'TOKEN', value: 'abc', enabled: true, description: 'Auth token' }],
            exportedAt: '2026-03-11T00:00:00.000Z',
            _type: 'hivefetch-environment',
          },
          null,
          2,
        ),
        'utf8',
      );

      jest.restoreAllMocks();
    });

    it('exports global variables when id is __global__', async () => {
      const globalVars = [createVariable({ key: 'GLOBAL_KEY', value: 'global_val' })];
      const mockUri = { fsPath: '/export/Global_Variables.env.json' };
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(mockUri);
      jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2026-03-11T00:00:00.000Z');

      const { handler } = createHandler({
        environments: createEnvironmentsData({ globalVariables: globalVars }),
      });

      await handler.exportEnvironment('__global__');

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/export/Global_Variables.env.json',
        expect.stringContaining('"name": "Global Variables"'),
        'utf8',
      );

      jest.restoreAllMocks();
    });

    it('shows error when environment is not found', async () => {
      const { handler, ctx } = createHandler();

      await handler.exportEnvironment('nonexistent');

      expect(ctx.uiService!.showError).toHaveBeenCalledWith('Environment not found');
      expect(vscode.window.showSaveDialog).not.toHaveBeenCalled();
    });

    it('does nothing when user cancels save dialog', async () => {
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(undefined);
      const { handler } = createHandler({
        environments: createEnvironmentsData({
          environments: [{ id: 'env-1', name: 'Dev', variables: [] }],
        }),
      });

      await handler.exportEnvironment('env-1');

      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('sanitizes the filename by replacing non-alphanumeric characters', async () => {
      const mockUri = { fsPath: '/export/file.json' };
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(mockUri);
      jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2026-03-11T00:00:00.000Z');

      const { handler } = createHandler({
        environments: createEnvironmentsData({
          environments: [{ id: 'env-1', name: 'My Env (dev)', variables: [] }],
        }),
      });

      await handler.exportEnvironment('env-1');

      expect(vscode.window.showSaveDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultUri: vscode.Uri.file('My_Env__dev_.env.json'),
        }),
      );

      jest.restoreAllMocks();
    });

    it('strips description from mapVariables when not present', async () => {
      const vars = [createVariable({ key: 'K', value: 'V' })];
      // Remove description explicitly
      delete (vars[0] as any).description;

      const mockUri = { fsPath: '/export/file.json' };
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(mockUri);
      jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2026-03-11T00:00:00.000Z');

      const { handler } = createHandler({
        environments: createEnvironmentsData({
          environments: [{ id: 'env-1', name: 'Test', variables: vars }],
        }),
      });

      await handler.exportEnvironment('env-1');

      const writtenData = JSON.parse((fs.writeFile as jest.Mock).mock.calls[0][1]);
      expect(writtenData.variables[0]).toEqual({ key: 'K', value: 'V', enabled: true });
      expect(writtenData.variables[0]).not.toHaveProperty('description');

      jest.restoreAllMocks();
    });

    it('shows success message after export', async () => {
      const mockUri = { fsPath: '/export/file.json' };
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(mockUri);
      jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2026-03-11T00:00:00.000Z');

      const { handler, ctx } = createHandler({
        environments: createEnvironmentsData({
          environments: [{ id: 'env-1', name: 'Dev', variables: [] }],
        }),
      });

      await handler.exportEnvironment('env-1');

      expect(ctx.uiService!.showInfo).toHaveBeenCalledWith('Environment "Dev" exported successfully.');

      jest.restoreAllMocks();
    });

    it('handles global variables being undefined', async () => {
      const mockUri = { fsPath: '/export/file.json' };
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(mockUri);
      jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2026-03-11T00:00:00.000Z');

      const { handler } = createHandler({
        environments: createEnvironmentsData({ globalVariables: undefined }),
      });

      await handler.exportEnvironment('__global__');

      const writtenData = JSON.parse((fs.writeFile as jest.Mock).mock.calls[0][1]);
      expect(writtenData.variables).toEqual([]);

      jest.restoreAllMocks();
    });
  });

  // ==================== exportAllEnvironments ====================

  describe('exportAllEnvironments()', () => {
    it('exports all environments and global variables to a JSON file', async () => {
      const globalVars = [createVariable({ key: 'GLOBAL', value: 'gval' })];
      const envVars = [createVariable({ key: 'ENV_VAR', value: 'eval', description: 'desc' })];
      const mockUri = { fsPath: '/export/environments.json' };
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(mockUri);
      jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2026-03-11T00:00:00.000Z');

      const { handler } = createHandler({
        environments: createEnvironmentsData({
          globalVariables: globalVars,
          environments: [{ id: 'env-1', name: 'Dev', variables: envVars }],
        }),
      });

      await handler.exportAllEnvironments();

      expect(vscode.window.showSaveDialog).toHaveBeenCalledWith({
        defaultUri: vscode.Uri.file('environments.json'),
        filters: { 'JSON Files': ['json'] },
        title: 'Export All Environments',
      });

      const writtenData = JSON.parse((fs.writeFile as jest.Mock).mock.calls[0][1]);
      expect(writtenData._type).toBe('hivefetch-environments');
      expect(writtenData.exportedAt).toBe('2026-03-11T00:00:00.000Z');
      expect(writtenData.globalVariables).toEqual([
        { key: 'GLOBAL', value: 'gval', enabled: true },
      ]);
      expect(writtenData.environments).toEqual([
        {
          id: 'env-1',
          name: 'Dev',
          variables: [{ key: 'ENV_VAR', value: 'eval', enabled: true, description: 'desc' }],
        },
      ]);

      jest.restoreAllMocks();
    });

    it('does nothing when user cancels save dialog', async () => {
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(undefined);
      const { handler } = createHandler();

      await handler.exportAllEnvironments();

      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('shows success message after exporting all', async () => {
      const mockUri = { fsPath: '/export/environments.json' };
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(mockUri);
      jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2026-03-11T00:00:00.000Z');

      const { handler, ctx } = createHandler();

      await handler.exportAllEnvironments();

      expect(ctx.uiService!.showInfo).toHaveBeenCalledWith('All environments exported successfully.');

      jest.restoreAllMocks();
    });

    it('handles undefined global variables', async () => {
      const mockUri = { fsPath: '/export/environments.json' };
      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(mockUri);
      jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2026-03-11T00:00:00.000Z');

      const { handler } = createHandler({
        environments: createEnvironmentsData({ globalVariables: undefined }),
      });

      await handler.exportAllEnvironments();

      const writtenData = JSON.parse((fs.writeFile as jest.Mock).mock.calls[0][1]);
      expect(writtenData.globalVariables).toEqual([]);

      jest.restoreAllMocks();
    });
  });
});
