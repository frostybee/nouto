import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { StorageService } from './StorageService';

let tmpDir: string;

function createService(): StorageService {
  const mockFolder = {
    uri: { fsPath: tmpDir },
    name: 'test',
    index: 0,
  } as any;
  return new StorageService(mockFolder);
}

beforeEach(async () => {
  tmpDir = path.join(os.tmpdir(), `hivefetch-storage-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(tmpDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

describe('StorageService (real filesystem)', () => {
  it('creates .vscode/hivefetch/ directory when missing', async () => {
    const service = createService();
    await service.saveCollections([]);
    expect(existsSync(path.join(tmpDir, '.vscode', 'hivefetch'))).toBe(true);
  });

  it('round-trips collections', async () => {
    const service = createService();
    const collections = [
      {
        id: 'col-1',
        name: 'Test Collection',
        items: [
          {
            type: 'request' as const,
            id: 'req-1',
            name: 'Get Users',
            method: 'GET' as const,
            url: 'https://api.example.com/users',
            params: [],
            headers: [],
            auth: { type: 'none' as const },
            body: { type: 'none' as const, content: '' },
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
    // Recent collection is auto-added at index 0
    expect(loaded).toHaveLength(2);
    expect(loaded[0].builtin).toBe('recent');
    const testCol = loaded.find(c => c.name === 'Test Collection')!;
    expect(testCol.items).toHaveLength(1);
    expect(testCol.items[0].name).toBe('Get Users');
  });

  it('round-trips environments', async () => {
    const service = createService();
    const envData = {
      environments: [
        {
          id: 'env-1',
          name: 'Development',
          variables: [{ key: 'baseUrl', value: 'http://localhost:3000', enabled: true }],
        },
      ],
      activeId: 'env-1',
      globalVariables: [{ key: 'apiVersion', value: 'v2', enabled: true }],
    };

    await service.saveEnvironments(envData);
    const loaded = await service.loadEnvironments();
    expect(loaded.environments).toHaveLength(1);
    expect(loaded.environments[0].name).toBe('Development');
    expect(loaded.activeId).toBe('env-1');
    expect(loaded.globalVariables).toHaveLength(1);
  });

  it('migrates legacy requests[] to items[]', async () => {
    const service = createService();
    const storageDir = path.join(tmpDir, '.vscode', 'hivefetch');
    await fs.mkdir(storageDir, { recursive: true });

    // Write legacy format directly to disk
    const legacy = [{
      id: 'legacy-col',
      name: 'Legacy Collection',
      requests: [{
        id: 'req-legacy', name: 'Legacy Request', method: 'GET',
        url: 'https://example.com', params: [], headers: [],
        auth: { type: 'none' }, body: { type: 'none', content: '' },
      }],
      expanded: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }];
    await fs.writeFile(path.join(storageDir, 'collections.json'), JSON.stringify(legacy), 'utf8');

    const loaded = await service.loadCollections();
    // Recent collection is auto-added at index 0
    expect(loaded).toHaveLength(2);
    expect(loaded[0].builtin).toBe('recent');
    const legacyCol = loaded.find(c => c.name === 'Legacy Collection')!;
    expect(legacyCol.items).toHaveLength(1);
    expect(legacyCol.items[0].name).toBe('Legacy Request');
    expect((legacyCol as any).requests).toBeUndefined();
  });
});
