import * as assert from 'assert';
import * as path from 'path';
import { existsSync } from 'fs';
import * as fs from 'fs/promises';
import { createTestWorkspace, cleanupTestWorkspace } from './helpers/workspace';

suite('StorageService Tests', () => {
  let tmpDir: string;
  let StorageService: any;

  suiteSetup(async () => {
    tmpDir = await createTestWorkspace();
    // Import the compiled module
    const mod = require('../../../out/services/StorageService');
    StorageService = mod.StorageService;
  });

  suiteTeardown(async () => {
    await cleanupTestWorkspace(tmpDir);
  });

  function createService() {
    // StorageService expects a WorkspaceFolder-like object
    const mockFolder = {
      uri: { fsPath: tmpDir },
      name: 'test',
      index: 0,
    };
    return new StorageService(mockFolder);
  }

  test('creates .vscode/hivefetch/ directory when missing', async () => {
    const service = createService();
    await service.saveCollections([]);
    const storageDir = path.join(tmpDir, '.vscode', 'hivefetch');
    assert.ok(existsSync(storageDir), 'Storage directory was not created');
  });

  test('round-trips collections (save -> load)', async () => {
    const service = createService();
    const collections = [
      {
        id: 'col-1',
        name: 'Test Collection',
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Get Users',
            method: 'GET',
            url: 'https://api.example.com/users',
            params: [],
            headers: [],
            auth: { type: 'none' },
            body: { type: 'none', content: '' },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        expanded: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    await service.saveCollections(collections);
    const loaded = await service.loadCollections();
    assert.strictEqual(loaded.length, 1);
    assert.strictEqual(loaded[0].name, 'Test Collection');
    assert.strictEqual(loaded[0].items.length, 1);
    assert.strictEqual(loaded[0].items[0].name, 'Get Users');
  });

  test('round-trips history (save -> load)', async () => {
    const service = createService();
    const history = [
      {
        id: 'hist-1',
        method: 'POST',
        url: 'https://api.example.com/data',
        params: [],
        headers: [],
        auth: { type: 'none' },
        body: { type: 'json', content: '{"key":"value"}' },
        status: 201,
        statusText: 'Created',
        duration: 250,
        size: 512,
        timestamp: new Date().toISOString(),
      },
    ];

    await service.saveHistory(history);
    const loaded = await service.loadHistory();
    assert.strictEqual(loaded.length, 1);
    assert.strictEqual(loaded[0].method, 'POST');
    assert.strictEqual(loaded[0].status, 201);
  });

  test('round-trips environments (save -> load)', async () => {
    const service = createService();
    const envData = {
      environments: [
        {
          id: 'env-1',
          name: 'Development',
          variables: [
            { key: 'baseUrl', value: 'http://localhost:3000', enabled: true },
          ],
        },
      ],
      activeId: 'env-1',
      globalVariables: [
        { key: 'apiVersion', value: 'v2', enabled: true },
      ],
    };

    await service.saveEnvironments(envData);
    const loaded = await service.loadEnvironments();
    assert.strictEqual(loaded.environments.length, 1);
    assert.strictEqual(loaded.environments[0].name, 'Development');
    assert.strictEqual(loaded.activeId, 'env-1');
    assert.strictEqual(loaded.globalVariables!.length, 1);
  });

  test('clearHistory() writes empty array', async () => {
    const service = createService();
    // Save some history first
    await service.saveHistory([
      {
        id: 'hist-2',
        method: 'GET',
        url: 'https://example.com',
        params: [],
        headers: [],
        auth: { type: 'none' },
        body: { type: 'none', content: '' },
        status: 200,
        statusText: 'OK',
        duration: 100,
        size: 256,
        timestamp: new Date().toISOString(),
      },
    ]);

    await service.clearHistory();
    const loaded = await service.loadHistory();
    assert.strictEqual(loaded.length, 0);
  });

  test('legacy requests[] format migrates to items[] on real fs', async () => {
    const service = createService();
    const storageDir = path.join(tmpDir, '.vscode', 'hivefetch');
    await fs.mkdir(storageDir, { recursive: true });

    // Write legacy format directly
    const legacyCollection = [
      {
        id: 'legacy-col',
        name: 'Legacy Collection',
        requests: [
          {
            id: 'req-legacy',
            name: 'Legacy Request',
            method: 'GET',
            url: 'https://example.com',
            params: [],
            headers: [],
            auth: { type: 'none' },
            body: { type: 'none', content: '' },
          },
        ],
        expanded: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    await fs.writeFile(
      path.join(storageDir, 'collections.json'),
      JSON.stringify(legacyCollection, null, 2),
      'utf8'
    );

    const loaded = await service.loadCollections();
    assert.strictEqual(loaded.length, 1);
    assert.ok(loaded[0].items, 'Migrated collection should have items[]');
    assert.strictEqual(loaded[0].items.length, 1);
    assert.strictEqual(loaded[0].items[0].name, 'Legacy Request');
    assert.strictEqual((loaded[0] as any).requests, undefined, 'Legacy requests[] should not exist after migration');
  });
});
