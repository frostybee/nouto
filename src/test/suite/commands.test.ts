import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Command Execution Tests', () => {
  suiteSetup(async () => {
    // Ensure extension is activated
    const ext = vscode.extensions.all.find(
      (e) => e.packageJSON?.name === 'hivefetch'
    );
    if (ext && !ext.isActive) {
      await ext.activate();
    }
  });

  test('hivefetch.newRequest opens a webview panel', async () => {
    await assert.doesNotReject(async () => {
      await vscode.commands.executeCommand('hivefetch.newRequest');
    });
  });

  test('hivefetch.newRequest can open multiple panels', async () => {
    await assert.doesNotReject(async () => {
      await vscode.commands.executeCommand('hivefetch.newRequest');
      await vscode.commands.executeCommand('hivefetch.newRequest');
    });
  });

  test('hivefetch.openRequest with mock SavedRequest', async () => {
    const mockRequest = {
      type: 'request' as const,
      id: 'test-req-1',
      name: 'Test Request',
      method: 'GET',
      url: 'https://example.com/api',
      params: [],
      headers: [],
      auth: { type: 'none' as const },
      body: { type: 'none' as const, content: '' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await assert.doesNotReject(async () => {
      await vscode.commands.executeCommand('hivefetch.openRequest', mockRequest);
    });
  });

  test('hivefetch.openHistoryEntry with mock HistoryEntry', async () => {
    const mockEntry = {
      id: 'hist-1',
      method: 'GET',
      url: 'https://example.com/api',
      params: [],
      headers: [],
      auth: { type: 'none' as const },
      body: { type: 'none' as const, content: '' },
      status: 200,
      statusText: 'OK',
      duration: 150,
      size: 1024,
      timestamp: new Date().toISOString(),
    };

    await assert.doesNotReject(async () => {
      await vscode.commands.executeCommand('hivefetch.openHistoryEntry', mockEntry);
    });
  });

  test('hivefetch.exportPostman with no collections handles gracefully', async () => {
    await assert.doesNotReject(async () => {
      await vscode.commands.executeCommand('hivefetch.exportPostman');
    });
  });

  suiteTeardown(async () => {
    // Close all opened editors
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });
});
