import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { EnvironmentsPanelHandler, type IEnvironmentsPanelContext } from './EnvironmentsPanelHandler';
import type { EnvironmentsData, EnvironmentVariable } from '../../services/types';

jest.mock('fs/promises');
const fsMock = fs as jest.Mocked<typeof fs>;

// ── Helpers ─────────────────────────────────────────────────────────

type MessageHandler = (message: any) => Promise<void>;

function createMockWebview() {
  return {
    html: '',
    postMessage: jest.fn().mockResolvedValue(true),
    onDidReceiveMessage: jest.fn().mockReturnValue({ dispose: jest.fn() }),
    asWebviewUri: jest.fn((uri: any) => uri),
    cspSource: 'https://mock.csp',
  };
}

function createMockPanel(webview = createMockWebview()) {
  const disposeCallbacks: Function[] = [];
  return {
    webview,
    reveal: jest.fn(),
    onDidDispose: jest.fn((cb: Function) => {
      disposeCallbacks.push(cb);
      return { dispose: jest.fn() };
    }),
    dispose: () => disposeCallbacks.forEach(cb => cb()),
    _disposeCallbacks: disposeCallbacks,
  };
}

function makeVar(key: string, value: string, enabled = true, description?: string): EnvironmentVariable {
  return { key, value, enabled, ...(description ? { description } : {}) };
}

function createMockContext(overrides?: Partial<IEnvironmentsPanelContext>): IEnvironmentsPanelContext {
  return {
    environments: {
      environments: [],
      activeId: null,
      globalVariables: [],
    },
    storageService: { saveEnvironments: jest.fn().mockResolvedValue(undefined) },
    envFileService: {
      getVariables: jest.fn().mockReturnValue([]),
      getFilePath: jest.fn().mockReturnValue(null),
      setFilePath: jest.fn().mockResolvedValue(undefined),
      onDidChange: jest.fn().mockReturnValue({ dispose: jest.fn() }),
    } as any,
    extensionUri: vscode.Uri.file('/mock/extension'),
    getNonce: () => 'test-nonce',
    notifyEnvironmentsUpdated: jest.fn(),
    setEnvironments: jest.fn(),
    ...overrides,
  };
}

/**
 * Opens the panel and returns the captured message handler so tests can
 * simulate incoming webview messages.
 */
async function openAndCaptureHandler(
  handler: EnvironmentsPanelHandler,
  panel = createMockPanel(),
): Promise<{ panel: ReturnType<typeof createMockPanel>; sendMessage: MessageHandler }> {
  (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(panel);
  await handler.open();
  const sendMessage = (panel.webview.onDidReceiveMessage as jest.Mock).mock.calls[0][0] as MessageHandler;
  return { panel, sendMessage };
}

// ── Import file helpers ─────────────────────────────────────────────

function globalsExportFile(vars: EnvironmentVariable[]) {
  return JSON.stringify({
    _type: 'hivefetch-globals',
    globalVariables: vars,
    exportedAt: new Date().toISOString(),
  });
}

function singleEnvExportFile(name: string, vars: EnvironmentVariable[], color?: string) {
  return JSON.stringify({
    _type: 'hivefetch-environment',
    name,
    variables: vars,
    ...(color ? { color } : {}),
    exportedAt: new Date().toISOString(),
  });
}

function bulkEnvExportFile(
  envs: { name: string; variables: EnvironmentVariable[]; color?: string }[],
  globalVariables?: EnvironmentVariable[],
) {
  return JSON.stringify({
    _type: 'hivefetch-environments',
    environments: envs.map((e, i) => ({ id: `exp-${i}`, ...e })),
    ...(globalVariables ? { globalVariables } : {}),
    exportedAt: new Date().toISOString(),
  });
}

function mockFileDialog(filePath: string) {
  (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([vscode.Uri.file(filePath)]);
}

function mockQuickPick(value: string) {
  (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({ value });
}

// =====================================================================
// Tests
// =====================================================================

describe('EnvironmentsPanelHandler', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  // ── Panel lifecycle ────────────────────────────────────────────

  describe('panel lifecycle', () => {
    it('should create a new webview panel on first open', async () => {
      const ctx = createMockContext();
      const handler = new EnvironmentsPanelHandler(ctx);
      const panel = createMockPanel();
      (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(panel);

      await handler.open();

      expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
        'hivefetch.environments',
        'Environments',
        vscode.ViewColumn.Active,
        expect.objectContaining({ enableScripts: true, retainContextWhenHidden: true }),
      );
    });

    it('should reveal existing panel on second open', async () => {
      const ctx = createMockContext();
      const handler = new EnvironmentsPanelHandler(ctx);
      const panel = createMockPanel();
      (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(panel);

      await handler.open();
      await handler.open();

      expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
      expect(panel.reveal).toHaveBeenCalledTimes(1);
    });

    it('should allow reopening after panel is disposed', async () => {
      const ctx = createMockContext();
      const handler = new EnvironmentsPanelHandler(ctx);
      const panel1 = createMockPanel();
      const panel2 = createMockPanel();
      (vscode.window.createWebviewPanel as jest.Mock)
        .mockReturnValueOnce(panel1)
        .mockReturnValueOnce(panel2);

      await handler.open();
      panel1.dispose();
      await handler.open();

      expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(2);
    });
  });

  // ── ready ──────────────────────────────────────────────────────

  describe('ready message', () => {
    it('should send initEnvironments with current data', async () => {
      const ctx = createMockContext({
        environments: {
          environments: [{ id: 'e1', name: 'Dev', variables: [makeVar('URL', 'http://dev')] }],
          activeId: 'e1',
          globalVariables: [makeVar('API_KEY', '123')],
          envFilePath: '/project/.env',
        },
      });
      (ctx.envFileService.getVariables as jest.Mock).mockReturnValue([makeVar('DB', 'postgres')]);

      const handler = new EnvironmentsPanelHandler(ctx);
      const { panel, sendMessage } = await openAndCaptureHandler(handler);

      await sendMessage({ type: 'ready' });

      expect(panel.webview.postMessage).toHaveBeenCalledWith({
        type: 'initEnvironments',
        data: expect.objectContaining({
          environments: expect.arrayContaining([expect.objectContaining({ name: 'Dev' })]),
          activeId: 'e1',
          globalVariables: [makeVar('API_KEY', '123')],
          envFilePath: '/project/.env',
          envFileVariables: [makeVar('DB', 'postgres')],
        }),
      });
    });
  });

  // ── Export global variables ────────────────────────────────────

  describe('exportGlobalVariables', () => {
    it('should write globals to the selected file', async () => {
      const ctx = createMockContext({
        environments: {
          environments: [],
          activeId: null,
          globalVariables: [makeVar('TOKEN', 'abc', true, 'auth token')],
        },
      });
      const handler = new EnvironmentsPanelHandler(ctx);
      const { sendMessage } = await openAndCaptureHandler(handler);

      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(vscode.Uri.file('/export/globals.json'));
      fsMock.writeFile.mockResolvedValue(undefined);

      await sendMessage({ type: 'exportGlobalVariables' });

      expect(fsMock.writeFile).toHaveBeenCalledTimes(1);
      const written = JSON.parse((fsMock.writeFile as jest.Mock).mock.calls[0][1]);
      expect(written._type).toBe('hivefetch-globals');
      expect(written.globalVariables).toEqual([
        { key: 'TOKEN', value: 'abc', enabled: true, description: 'auth token' },
      ]);
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Global variables exported successfully.');
    });

    it('should do nothing if user cancels save dialog', async () => {
      const ctx = createMockContext();
      const handler = new EnvironmentsPanelHandler(ctx);
      const { sendMessage } = await openAndCaptureHandler(handler);

      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(undefined);

      await sendMessage({ type: 'exportGlobalVariables' });

      expect(fsMock.writeFile).not.toHaveBeenCalled();
    });
  });

  // ── Import global variables ────────────────────────────────────

  describe('importGlobalVariables', () => {
    it('should overwrite globals when user picks Overwrite', async () => {
      const ctx = createMockContext({
        environments: {
          environments: [],
          activeId: null,
          globalVariables: [makeVar('OLD', 'old-val')],
        },
      });
      const handler = new EnvironmentsPanelHandler(ctx);
      const { panel, sendMessage } = await openAndCaptureHandler(handler);

      const importVars = [makeVar('NEW1', 'v1'), makeVar('NEW2', 'v2')];
      mockFileDialog('/import/globals.json');
      fsMock.readFile.mockResolvedValue(globalsExportFile(importVars) as any);
      mockQuickPick('overwrite');

      await sendMessage({ type: 'importGlobalVariables' });

      // Should have replaced all globals
      expect(ctx.environments.globalVariables).toEqual([
        { key: 'NEW1', value: 'v1', enabled: true },
        { key: 'NEW2', value: 'v2', enabled: true },
      ]);
      expect(ctx.storageService.saveEnvironments).toHaveBeenCalled();
      expect(ctx.notifyEnvironmentsUpdated).toHaveBeenCalled();
      expect(ctx.setEnvironments).toHaveBeenCalled();

      // Should send initEnvironments back to webview
      expect(panel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'initEnvironments',
          data: expect.objectContaining({
            globalVariables: expect.arrayContaining([
              expect.objectContaining({ key: 'NEW1' }),
              expect.objectContaining({ key: 'NEW2' }),
            ]),
          }),
        }),
      );
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Global variables imported successfully.');
    });

    it('should merge globals, skipping existing keys', async () => {
      const ctx = createMockContext({
        environments: {
          environments: [],
          activeId: null,
          globalVariables: [makeVar('SHARED', 'existing'), makeVar('ONLY_OLD', 'keep')],
        },
      });
      const handler = new EnvironmentsPanelHandler(ctx);
      const { sendMessage } = await openAndCaptureHandler(handler);

      const importVars = [makeVar('SHARED', 'imported'), makeVar('ONLY_NEW', 'added')];
      mockFileDialog('/import/globals.json');
      fsMock.readFile.mockResolvedValue(globalsExportFile(importVars) as any);
      mockQuickPick('merge');

      await sendMessage({ type: 'importGlobalVariables' });

      const keys = ctx.environments.globalVariables!.map(v => v.key);
      expect(keys).toEqual(['SHARED', 'ONLY_OLD', 'ONLY_NEW']);
      // SHARED should keep its original value (not overwritten)
      expect(ctx.environments.globalVariables![0].value).toBe('existing');
    });

    it('should skip globals when user picks Skip', async () => {
      const original = [makeVar('A', '1')];
      const ctx = createMockContext({
        environments: { environments: [], activeId: null, globalVariables: [...original] },
      });
      const handler = new EnvironmentsPanelHandler(ctx);
      const { sendMessage } = await openAndCaptureHandler(handler);

      mockFileDialog('/import/globals.json');
      fsMock.readFile.mockResolvedValue(globalsExportFile([makeVar('B', '2')]) as any);
      mockQuickPick('skip');

      await sendMessage({ type: 'importGlobalVariables' });

      // Globals unchanged (skip only saves/notifies without modifying)
      expect(ctx.environments.globalVariables).toEqual(original);
    });

    it('should abort if user cancels file dialog', async () => {
      const ctx = createMockContext();
      const handler = new EnvironmentsPanelHandler(ctx);
      const { sendMessage } = await openAndCaptureHandler(handler);

      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue(undefined);

      await sendMessage({ type: 'importGlobalVariables' });

      expect(ctx.storageService.saveEnvironments).not.toHaveBeenCalled();
    });

    it('should abort if user cancels quick pick', async () => {
      const ctx = createMockContext();
      const handler = new EnvironmentsPanelHandler(ctx);
      const { sendMessage } = await openAndCaptureHandler(handler);

      mockFileDialog('/import/globals.json');
      fsMock.readFile.mockResolvedValue(globalsExportFile([makeVar('A', '1')]) as any);
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

      await sendMessage({ type: 'importGlobalVariables' });

      expect(ctx.storageService.saveEnvironments).not.toHaveBeenCalled();
    });

    it('should show error for invalid JSON file', async () => {
      const ctx = createMockContext();
      const handler = new EnvironmentsPanelHandler(ctx);
      const { sendMessage } = await openAndCaptureHandler(handler);

      mockFileDialog('/import/bad.json');
      fsMock.readFile.mockResolvedValue('not valid json{{{' as any);

      await sendMessage({ type: 'importGlobalVariables' });

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Failed to read'),
      );
      expect(ctx.storageService.saveEnvironments).not.toHaveBeenCalled();
    });

    it('should show error for unrecognized file format', async () => {
      const ctx = createMockContext();
      const handler = new EnvironmentsPanelHandler(ctx);
      const { sendMessage } = await openAndCaptureHandler(handler);

      mockFileDialog('/import/wrong.json');
      fsMock.readFile.mockResolvedValue(JSON.stringify({ _type: 'unknown', data: [] }) as any);

      await sendMessage({ type: 'importGlobalVariables' });

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Unrecognized format'),
      );
    });

    it('should handle importing with missing fields gracefully', async () => {
      const ctx = createMockContext({
        environments: { environments: [], activeId: null, globalVariables: [] },
      });
      const handler = new EnvironmentsPanelHandler(ctx);
      const { sendMessage } = await openAndCaptureHandler(handler);

      // Vars with missing key/value/enabled fields
      const rawFile = JSON.stringify({
        _type: 'hivefetch-globals',
        globalVariables: [{ key: 'ONLY_KEY' }, { value: 'only-value' }, {}],
      });
      mockFileDialog('/import/partial.json');
      fsMock.readFile.mockResolvedValue(rawFile as any);
      mockQuickPick('overwrite');

      await sendMessage({ type: 'importGlobalVariables' });

      expect(ctx.environments.globalVariables).toEqual([
        { key: 'ONLY_KEY', value: '', enabled: true },
        { key: '', value: 'only-value', enabled: true },
        { key: '', value: '', enabled: true },
      ]);
    });
  });

  // ── Export single environment ───────────────────────────────────

  describe('exportEnvironment', () => {
    it('should export a single environment by id', async () => {
      const ctx = createMockContext({
        environments: {
          environments: [
            { id: 'e1', name: 'Production', variables: [makeVar('HOST', 'prod.example.com')], color: '#ff6b6b' },
          ],
          activeId: null,
        },
      });
      const handler = new EnvironmentsPanelHandler(ctx);
      const { sendMessage } = await openAndCaptureHandler(handler);

      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(vscode.Uri.file('/export/prod.json'));
      fsMock.writeFile.mockResolvedValue(undefined);

      await sendMessage({ type: 'exportEnvironment', data: { id: 'e1' } });

      const written = JSON.parse((fsMock.writeFile as jest.Mock).mock.calls[0][1]);
      expect(written._type).toBe('hivefetch-environment');
      expect(written.name).toBe('Production');
      expect(written.color).toBe('#ff6b6b');
      expect(written.variables).toEqual([{ key: 'HOST', value: 'prod.example.com', enabled: true }]);
    });

    it('should do nothing if environment id not found', async () => {
      const ctx = createMockContext();
      const handler = new EnvironmentsPanelHandler(ctx);
      const { sendMessage } = await openAndCaptureHandler(handler);

      await sendMessage({ type: 'exportEnvironment', data: { id: 'nonexistent' } });

      expect(vscode.window.showSaveDialog).not.toHaveBeenCalled();
    });
  });

  // ── Export all environments ────────────────────────────────────

  describe('exportAllEnvironments', () => {
    it('should export all environments', async () => {
      const ctx = createMockContext({
        environments: {
          environments: [
            { id: 'e1', name: 'Dev', variables: [makeVar('URL', 'http://dev')] },
            { id: 'e2', name: 'Prod', variables: [makeVar('URL', 'http://prod')], color: '#51cf66' },
          ],
          activeId: 'e1',
        },
      });
      const handler = new EnvironmentsPanelHandler(ctx);
      const { sendMessage } = await openAndCaptureHandler(handler);

      (vscode.window.showSaveDialog as jest.Mock).mockResolvedValue(vscode.Uri.file('/export/envs.json'));
      fsMock.writeFile.mockResolvedValue(undefined);

      await sendMessage({ type: 'exportAllEnvironments' });

      const written = JSON.parse((fsMock.writeFile as jest.Mock).mock.calls[0][1]);
      expect(written._type).toBe('hivefetch-environments');
      expect(written.environments).toHaveLength(2);
      expect(written.environments[1].color).toBe('#51cf66');
    });
  });

  // ── Import single environment ─────────────────────────────────

  describe('importEnvironments - single environment', () => {
    it('should import a single environment file', async () => {
      const ctx = createMockContext();
      const handler = new EnvironmentsPanelHandler(ctx);
      const { sendMessage } = await openAndCaptureHandler(handler);

      mockFileDialog('/import/staging.json');
      fsMock.readFile.mockResolvedValue(
        singleEnvExportFile('Staging', [makeVar('HOST', 'staging.example.com')], '#4dabf7') as any,
      );

      await sendMessage({ type: 'importEnvironments' });

      expect(ctx.environments.environments).toHaveLength(1);
      expect(ctx.environments.environments[0].name).toBe('Staging');
      expect(ctx.environments.environments[0].color).toBe('#4dabf7');
      expect(ctx.environments.environments[0].variables).toEqual([
        { key: 'HOST', value: 'staging.example.com', enabled: true },
      ]);
      expect(ctx.storageService.saveEnvironments).toHaveBeenCalled();
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'Environment "Staging" imported successfully.',
      );
    });

    it('should append (imported) suffix for duplicate names', async () => {
      const ctx = createMockContext({
        environments: {
          environments: [{ id: 'e1', name: 'Dev', variables: [] }],
          activeId: null,
        },
      });
      const handler = new EnvironmentsPanelHandler(ctx);
      const { sendMessage } = await openAndCaptureHandler(handler);

      mockFileDialog('/import/dev.json');
      fsMock.readFile.mockResolvedValue(singleEnvExportFile('Dev', []) as any);

      await sendMessage({ type: 'importEnvironments' });

      expect(ctx.environments.environments).toHaveLength(2);
      expect(ctx.environments.environments[1].name).toBe('Dev (imported)');
    });
  });

  // ── Import bulk environments ──────────────────────────────────

  describe('importEnvironments - bulk', () => {
    it('should import multiple environments', async () => {
      const ctx = createMockContext();
      const handler = new EnvironmentsPanelHandler(ctx);
      const { sendMessage } = await openAndCaptureHandler(handler);

      mockFileDialog('/import/all.json');
      fsMock.readFile.mockResolvedValue(
        bulkEnvExportFile([
          { name: 'Dev', variables: [makeVar('URL', 'http://dev')] },
          { name: 'Prod', variables: [makeVar('URL', 'http://prod')] },
        ]) as any,
      );

      await sendMessage({ type: 'importEnvironments' });

      expect(ctx.environments.environments).toHaveLength(2);
      expect(ctx.environments.environments.map(e => e.name)).toEqual(['Dev', 'Prod']);
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'Imported 2 environments successfully.',
      );
    });

    it('should import bulk environments with globals (overwrite)', async () => {
      const ctx = createMockContext({
        environments: {
          environments: [],
          activeId: null,
          globalVariables: [makeVar('OLD', 'old')],
        },
      });
      const handler = new EnvironmentsPanelHandler(ctx);
      const { sendMessage } = await openAndCaptureHandler(handler);

      mockFileDialog('/import/all.json');
      fsMock.readFile.mockResolvedValue(
        bulkEnvExportFile(
          [{ name: 'Dev', variables: [] }],
          [makeVar('NEW_GLOBAL', 'new')],
        ) as any,
      );
      mockQuickPick('overwrite');

      await sendMessage({ type: 'importEnvironments' });

      expect(ctx.environments.globalVariables).toEqual([
        { key: 'NEW_GLOBAL', value: 'new', enabled: true },
      ]);
      expect(ctx.environments.environments).toHaveLength(1);
    });

    it('should import bulk environments with globals (merge)', async () => {
      const ctx = createMockContext({
        environments: {
          environments: [],
          activeId: null,
          globalVariables: [makeVar('SHARED', 'keep-me')],
        },
      });
      const handler = new EnvironmentsPanelHandler(ctx);
      const { sendMessage } = await openAndCaptureHandler(handler);

      mockFileDialog('/import/all.json');
      fsMock.readFile.mockResolvedValue(
        bulkEnvExportFile(
          [{ name: 'Env1', variables: [] }],
          [makeVar('SHARED', 'imported'), makeVar('ADDED', 'new')],
        ) as any,
      );
      mockQuickPick('merge');

      await sendMessage({ type: 'importEnvironments' });

      const keys = ctx.environments.globalVariables!.map(v => v.key);
      expect(keys).toEqual(['SHARED', 'ADDED']);
      expect(ctx.environments.globalVariables![0].value).toBe('keep-me');
    });

    it('should import bulk environments with globals (skip)', async () => {
      const original = [makeVar('KEEP', 'me')];
      const ctx = createMockContext({
        environments: {
          environments: [],
          activeId: null,
          globalVariables: [...original],
        },
      });
      const handler = new EnvironmentsPanelHandler(ctx);
      const { sendMessage } = await openAndCaptureHandler(handler);

      mockFileDialog('/import/all.json');
      fsMock.readFile.mockResolvedValue(
        bulkEnvExportFile(
          [{ name: 'Env1', variables: [] }],
          [makeVar('IMPORTED', 'val')],
        ) as any,
      );
      mockQuickPick('skip');

      await sendMessage({ type: 'importEnvironments' });

      // Globals unchanged
      expect(ctx.environments.globalVariables).toEqual(original);
      // Environment still imported
      expect(ctx.environments.environments).toHaveLength(1);
    });

    it('should skip global variables prompt when file has no globals', async () => {
      const ctx = createMockContext();
      const handler = new EnvironmentsPanelHandler(ctx);
      const { sendMessage } = await openAndCaptureHandler(handler);

      mockFileDialog('/import/all.json');
      fsMock.readFile.mockResolvedValue(
        bulkEnvExportFile([{ name: 'Clean', variables: [] }]) as any,
      );

      await sendMessage({ type: 'importEnvironments' });

      // showQuickPick should NOT have been called (no globals in file)
      expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
      expect(ctx.environments.environments).toHaveLength(1);
    });

    it('should show error for unrecognized import format', async () => {
      const ctx = createMockContext();
      const handler = new EnvironmentsPanelHandler(ctx);
      const { sendMessage } = await openAndCaptureHandler(handler);

      mockFileDialog('/import/bad.json');
      fsMock.readFile.mockResolvedValue(JSON.stringify({ _type: 'postman', items: [] }) as any);

      await sendMessage({ type: 'importEnvironments' });

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Unrecognized format'),
      );
    });
  });

  // ── saveEnvironments ───────────────────────────────────────────

  describe('saveEnvironments', () => {
    it('should update environments and globals without overwriting activeId', async () => {
      const ctx = createMockContext({
        environments: {
          environments: [{ id: 'e1', name: 'Old', variables: [] }],
          activeId: 'e1',
          globalVariables: [makeVar('G', 'old')],
        },
      });
      const handler = new EnvironmentsPanelHandler(ctx);
      const { sendMessage } = await openAndCaptureHandler(handler);

      await sendMessage({
        type: 'saveEnvironments',
        data: {
          environments: [{ id: 'e1', name: 'Updated', variables: [makeVar('URL', 'new')] }],
          globalVariables: [makeVar('G', 'updated')],
        },
      });

      expect(ctx.environments.environments[0].name).toBe('Updated');
      expect(ctx.environments.globalVariables![0].value).toBe('updated');
      // activeId preserved
      expect(ctx.environments.activeId).toBe('e1');
      expect(ctx.storageService.saveEnvironments).toHaveBeenCalled();
      expect(ctx.notifyEnvironmentsUpdated).toHaveBeenCalled();
    });
  });

  // ── .env file ──────────────────────────────────────────────────

  describe('env file linking', () => {
    it('linkEnvFile should set path and send updated variables', async () => {
      const ctx = createMockContext();
      (ctx.envFileService.getVariables as jest.Mock).mockReturnValue([makeVar('DB', 'postgres')]);
      const handler = new EnvironmentsPanelHandler(ctx);
      const { panel, sendMessage } = await openAndCaptureHandler(handler);

      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([vscode.Uri.file('/project/.env')]);

      await sendMessage({ type: 'linkEnvFile' });

      expect(ctx.envFileService.setFilePath).toHaveBeenCalledWith('/project/.env');
      expect(ctx.environments.envFilePath).toBe('/project/.env');
      expect(ctx.storageService.saveEnvironments).toHaveBeenCalled();
      expect(panel.webview.postMessage).toHaveBeenCalledWith({
        type: 'envFileVariablesUpdated',
        data: { variables: [makeVar('DB', 'postgres')], filePath: '/project/.env' },
      });
    });

    it('unlinkEnvFile should clear path and send empty variables', async () => {
      const ctx = createMockContext({
        environments: { environments: [], activeId: null, envFilePath: '/old/.env' },
      });
      const handler = new EnvironmentsPanelHandler(ctx);
      const { panel, sendMessage } = await openAndCaptureHandler(handler);

      await sendMessage({ type: 'unlinkEnvFile' });

      expect(ctx.envFileService.setFilePath).toHaveBeenCalledWith(null);
      expect(ctx.environments.envFilePath).toBeNull();
      expect(panel.webview.postMessage).toHaveBeenCalledWith({
        type: 'envFileVariablesUpdated',
        data: { variables: [], filePath: null },
      });
    });
  });
});
