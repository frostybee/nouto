import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Activation Tests', () => {
  const extensionId = 'undefined_publisher.hivefetch';

  let extension: vscode.Extension<any> | undefined;

  suiteSetup(async () => {
    // Try multiple possible extension IDs
    extension =
      vscode.extensions.getExtension(extensionId) ||
      vscode.extensions.getExtension('undefined.hivefetch') ||
      vscode.extensions.getExtension('hivefetch');

    // If not found by ID, find by display name
    if (!extension) {
      extension = vscode.extensions.all.find(
        (ext) => ext.packageJSON?.name === 'hivefetch'
      );
    }
  });

  test('extension is found', () => {
    assert.ok(extension, `Extension not found. Available extensions: ${vscode.extensions.all.map(e => e.id).filter(id => id.includes('hive')).join(', ') || '(none matching "hive")'}`);
  });

  test('extension activates without throwing', async () => {
    assert.ok(extension, 'Extension not found');
    if (!extension.isActive) {
      await extension.activate();
    }
    assert.strictEqual(extension.isActive, true);
  });

  test('all expected commands are registered', async () => {
    const allCommands = await vscode.commands.getCommands(true);
    const expectedCommands = [
      'hivefetch.newRequest',
      'hivefetch.newCollection',
      'hivefetch.openRequest',
      'hivefetch.openHistoryEntry',
      'hivefetch.importPostman',
      'hivefetch.exportPostman',
      'hivefetch.runHistoryEntry',
    ];

    for (const cmd of expectedCommands) {
      assert.ok(
        allCommands.includes(cmd),
        `Command "${cmd}" not registered`
      );
    }
  });
});
