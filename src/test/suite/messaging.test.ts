import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Messaging / Panel Lifecycle Tests', () => {
  suiteSetup(async () => {
    // Ensure extension is activated
    const ext = vscode.extensions.all.find(
      (e) => e.packageJSON?.name === 'hivefetch'
    );
    if (ext && !ext.isActive) {
      await ext.activate();
    }
  });

  test('hivefetch.newRequest creates a new tab', async () => {
    const tabsBefore = vscode.window.tabGroups.all.flatMap((g) => g.tabs).length;
    await vscode.commands.executeCommand('hivefetch.newRequest');
    // Small delay for panel creation
    await new Promise((r) => setTimeout(r, 500));
    const tabsAfter = vscode.window.tabGroups.all.flatMap((g) => g.tabs).length;
    assert.ok(tabsAfter > tabsBefore, 'A new tab should have been created');
  });

  test('multiple requests create separate tabs', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await new Promise((r) => setTimeout(r, 300));

    await vscode.commands.executeCommand('hivefetch.newRequest');
    await new Promise((r) => setTimeout(r, 300));

    await vscode.commands.executeCommand('hivefetch.newRequest');
    await new Promise((r) => setTimeout(r, 300));

    const tabs = vscode.window.tabGroups.all.flatMap((g) => g.tabs);
    assert.ok(tabs.length >= 2, `Expected at least 2 tabs, got ${tabs.length}`);
  });

  test('opening same saved request twice reuses the panel', async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await new Promise((r) => setTimeout(r, 300));

    const mockRequest = {
      type: 'request' as const,
      id: 'dedup-test-req',
      name: 'Dedup Test',
      method: 'GET',
      url: 'https://example.com/dedup',
      params: [],
      headers: [],
      auth: { type: 'none' as const },
      body: { type: 'none' as const, content: '' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await vscode.commands.executeCommand('hivefetch.openRequest', mockRequest);
    await new Promise((r) => setTimeout(r, 500));
    const tabsAfterFirst = vscode.window.tabGroups.all.flatMap((g) => g.tabs).length;

    await vscode.commands.executeCommand('hivefetch.openRequest', mockRequest);
    await new Promise((r) => setTimeout(r, 500));
    const tabsAfterSecond = vscode.window.tabGroups.all.flatMap((g) => g.tabs).length;

    assert.strictEqual(tabsAfterSecond, tabsAfterFirst, 'Opening same request twice should reuse the panel');
  });

  test('panels can be closed without crash', async () => {
    await vscode.commands.executeCommand('hivefetch.newRequest');
    await new Promise((r) => setTimeout(r, 300));
    await assert.doesNotReject(async () => {
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
  });

  suiteTeardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });
});
