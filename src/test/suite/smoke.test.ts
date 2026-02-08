import * as assert from 'assert';

suite('Build Smoke Tests', () => {
  const modules = [
    'extension',
    'services/StorageService',
    'services/DraftService',
    'services/HttpClient',
    'services/OAuthService',
    'services/EnvFileService',
    'services/FileService',
    'services/ImportExportService',
    'services/TimingInterceptor',
    'services/types',
    'providers/RequestPanelManager',
    'providers/SidebarViewProvider',
    'commands/index',
  ];

  for (const mod of modules) {
    test(`require("out/${mod}") does not throw`, () => {
      assert.doesNotThrow(() => {
        require(`../../../out/${mod}`);
      }, `Failed to require out/${mod}`);
    });
  }

  test('types exports isFolder and isRequest', () => {
    const types = require('../../../out/services/types');
    assert.strictEqual(typeof types.isFolder, 'function');
    assert.strictEqual(typeof types.isRequest, 'function');
  });
});
