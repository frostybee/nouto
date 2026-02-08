import * as assert from 'assert';
import * as path from 'path';
import { existsSync } from 'fs';
import * as fs from 'fs/promises';
import { createTestWorkspace, cleanupTestWorkspace } from './helpers/workspace';

suite('DraftService Tests', () => {
  let tmpDir: string;
  let DraftService: any;

  suiteSetup(async () => {
    tmpDir = await createTestWorkspace();
    const mod = require('../../../out/services/DraftService');
    DraftService = mod.DraftService;
  });

  suiteTeardown(async () => {
    await cleanupTestWorkspace(tmpDir);
  });

  function makeMockRequest(url = 'https://example.com/api') {
    return {
      type: 'request' as const,
      id: `req-${Date.now()}`,
      name: 'Test Request',
      method: 'GET' as const,
      url,
      params: [],
      headers: [],
      auth: { type: 'none' as const },
      body: { type: 'none' as const, content: '' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  test('upsert() + flush() creates drafts.json', async () => {
    const storageDir = path.join(tmpDir, 'draft-test-1');
    await fs.mkdir(storageDir, { recursive: true });

    const service = new DraftService(storageDir);
    await service.load();

    service.upsert('panel-1', null, null, makeMockRequest());
    await service.flush();

    const filePath = path.join(storageDir, 'drafts.json');
    assert.ok(existsSync(filePath), 'drafts.json should exist after flush');

    const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
    assert.strictEqual(data.length, 1);
    assert.strictEqual(data[0].id, 'panel-1');
  });

  test('round-trip: write -> new instance -> load() -> verify', async () => {
    const storageDir = path.join(tmpDir, 'draft-test-2');
    await fs.mkdir(storageDir, { recursive: true });

    // Write
    const service1 = new DraftService(storageDir);
    await service1.load();
    service1.upsert('panel-a', 'req-1', 'col-1', makeMockRequest('https://example.com/a'));
    service1.upsert('panel-b', null, null, makeMockRequest('https://example.com/b'));
    await service1.flush();

    // Read with new instance
    const service2 = new DraftService(storageDir);
    await service2.load();
    const drafts = service2.getAll();

    assert.strictEqual(drafts.length, 2);
    assert.ok(service2.has('panel-a'));
    assert.ok(service2.has('panel-b'));
  });

  test('remove() + flush() removes entry from disk', async () => {
    const storageDir = path.join(tmpDir, 'draft-test-3');
    await fs.mkdir(storageDir, { recursive: true });

    const service = new DraftService(storageDir);
    await service.load();
    service.upsert('panel-x', null, null, makeMockRequest());
    service.upsert('panel-y', null, null, makeMockRequest('https://example.com/y'));
    await service.flush();

    service.remove('panel-x');
    await service.flush();

    // Re-read
    const service2 = new DraftService(storageDir);
    await service2.load();
    assert.strictEqual(service2.has('panel-x'), false);
    assert.strictEqual(service2.has('panel-y'), true);
    assert.strictEqual(service2.getAll().length, 1);
  });

  test('empty URL is skipped (not persisted)', async () => {
    const storageDir = path.join(tmpDir, 'draft-test-4');
    await fs.mkdir(storageDir, { recursive: true });

    const service = new DraftService(storageDir);
    await service.load();
    service.upsert('panel-empty', null, null, makeMockRequest(''));
    await service.flush();

    assert.strictEqual(service.has('panel-empty'), false, 'Draft with empty URL should not be stored');
  });
});
