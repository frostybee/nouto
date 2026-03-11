import * as vscode from 'vscode';

const mockLoadCollections = jest.fn().mockResolvedValue([]);
const mockLoadEnvironments = jest.fn().mockResolvedValue({ environments: [], activeId: null });

jest.mock('../services/StorageService', () => ({
  StorageService: jest.fn().mockImplementation(() => ({
    loadCollections: mockLoadCollections,
    loadEnvironments: mockLoadEnvironments,
  })),
}));

jest.mock('./SidebarViewProvider', () => ({}));
jest.mock('./RequestPanelManager', () => ({}));

jest.mock('crypto', () => ({
  randomBytes: jest.fn().mockReturnValue({
    toString: jest.fn().mockReturnValue('test-nonce'),
  }),
}));

import { CommandPaletteManager } from './CommandPaletteManager';

function createMockContext(): any {
  return {
    extensionUri: { fsPath: '/mock/ext', path: '/mock/ext' },
    globalStorageUri: { fsPath: '/mock/global' },
    subscriptions: [],
  };
}

function createMockWebview(): any {
  return {
    html: '',
    postMessage: jest.fn().mockResolvedValue(true),
    onDidReceiveMessage: jest.fn().mockReturnValue({ dispose: jest.fn() }),
    asWebviewUri: jest.fn((uri: any) => ({ toString: () => uri?.fsPath || '' })),
    cspSource: 'https://csp.source',
  };
}

function createMockPanel(webview?: any): any {
  const wv = webview || createMockWebview();
  return {
    webview: wv,
    reveal: jest.fn(),
    dispose: jest.fn(),
    onDidDispose: jest.fn(),
  };
}

describe('CommandPaletteManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset singleton
    (CommandPaletteManager as any).instance = null;
  });

  describe('getInstance', () => {
    it('should return a singleton', () => {
      const ctx = createMockContext();
      const a = CommandPaletteManager.getInstance(ctx);
      const b = CommandPaletteManager.getInstance(ctx);
      expect(a).toBe(b);
    });
  });

  describe('show - with active request panel', () => {
    it('should post showCommandPalette to active panel webview', async () => {
      const mockWebview = createMockWebview();
      const mockPanel = createMockPanel(mockWebview);
      const rpm: any = { getActivePanel: jest.fn().mockReturnValue({ panel: mockPanel }) };
      const ctx = createMockContext();

      const mgr = CommandPaletteManager.getInstance(ctx, undefined, rpm);
      await mgr.show();

      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: 'showCommandPalette',
        data: { collections: [], environments: { environments: [], activeId: null } },
      });
    });

    it('should handle errors gracefully', async () => {
      mockLoadCollections.mockRejectedValueOnce(new Error('fail'));
      const mockWebview = createMockWebview();
      const mockPanel = createMockPanel(mockWebview);
      const rpm: any = { getActivePanel: jest.fn().mockReturnValue({ panel: mockPanel }) };
      const ctx = createMockContext();
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const mgr = CommandPaletteManager.getInstance(ctx, undefined, rpm);
      await mgr.show();

      expect(consoleSpy).toHaveBeenCalled();
      expect(mockWebview.postMessage).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('show - dedicated tab', () => {
    let mockWebview: any;
    let mockPanel: any;

    beforeEach(() => {
      mockWebview = createMockWebview();
      mockPanel = createMockPanel(mockWebview);
      (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockPanel);
    });

    it('should create a webview panel', async () => {
      const ctx = createMockContext();
      const mgr = CommandPaletteManager.getInstance(ctx);
      await mgr.show();

      expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
        'hivefetch.commandPalette',
        'Search Requests',
        expect.any(Object),
        expect.objectContaining({ enableScripts: true })
      );
    });

    it('should set HTML with nonce and scripts', async () => {
      const ctx = createMockContext();
      const mgr = CommandPaletteManager.getInstance(ctx);
      await mgr.show();

      expect(mockWebview.html).toContain('<!DOCTYPE html>');
      expect(mockWebview.html).toContain('test-nonce');
      expect(mockWebview.html).toContain('acquireVsCodeApi()');
    });

    it('should reveal existing panel instead of creating new one', async () => {
      const ctx = createMockContext();
      const mgr = CommandPaletteManager.getInstance(ctx);
      await mgr.show();
      await mgr.show();

      expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
      expect(mockPanel.reveal).toHaveBeenCalled();
    });

    it('should create new panel when reveal throws', async () => {
      const ctx = createMockContext();
      const mgr = CommandPaletteManager.getInstance(ctx);
      await mgr.show();

      mockPanel.reveal.mockImplementation(() => { throw new Error('disposed'); });
      const newPanel = createMockPanel(createMockWebview());
      (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(newPanel);

      await mgr.show();
      expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(2);
    });

    it('should null panel on dispose', async () => {
      const ctx = createMockContext();
      const mgr = CommandPaletteManager.getInstance(ctx);
      await mgr.show();

      const onDispose = mockPanel.onDidDispose.mock.calls[0][0];
      onDispose();

      const newPanel = createMockPanel(createMockWebview());
      (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(newPanel);

      await mgr.show();
      expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(2);
    });
  });

  describe('message handling', () => {
    let mockWebview: any;
    let mockPanel: any;
    let messageHandler: (msg: any) => Promise<void>;

    beforeEach(async () => {
      mockWebview = createMockWebview();
      mockPanel = createMockPanel(mockWebview);
      (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockPanel);

      const ctx = createMockContext();
      const mgr = CommandPaletteManager.getInstance(ctx);
      await mgr.show();

      messageHandler = mockWebview.onDidReceiveMessage.mock.calls[0][0];
    });

    it('should send initialData on ready', async () => {
      await messageHandler({ type: 'ready' });
      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: 'initialData',
        data: { collections: [], environments: { environments: [], activeId: null } },
      });
    });

    it('should execute openRequest on selectRequest', async () => {
      const collections = [{
        id: 'col-1',
        items: [{ type: 'request', id: 'req-1', name: 'Test' }],
      }];
      mockLoadCollections.mockResolvedValueOnce(collections);

      await messageHandler({ type: 'selectRequest', requestId: 'req-1', collectionId: 'col-1' });
      // handleSelectRequest is not awaited in the source, so wait for microtask
      await new Promise(r => setTimeout(r, 0));

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'hivefetch.openRequest',
        collections[0].items[0],
        'col-1'
      );
      expect(mockPanel.dispose).toHaveBeenCalled();
    });

    it('should find nested requests in folders', async () => {
      const collections = [{
        id: 'col-1',
        items: [{
          type: 'folder', id: 'f-1', children: [
            { type: 'request', id: 'req-nested', name: 'Nested' },
          ],
        }],
      }];
      mockLoadCollections.mockResolvedValueOnce(collections);

      await messageHandler({ type: 'selectRequest', requestId: 'req-nested', collectionId: 'col-1' });

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'hivefetch.openRequest',
        expect.objectContaining({ id: 'req-nested' }),
        'col-1'
      );
    });

    it('should dispose panel on close', async () => {
      await messageHandler({ type: 'close' });
      expect(mockPanel.dispose).toHaveBeenCalled();
    });
  });
});
