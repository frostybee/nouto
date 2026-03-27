import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { BackupService, type BackupOptions, type NoutoBackupFile } from './BackupService';

let tmpDir: string;
let mockGlobalState: { store: Record<string, any>; get: jest.Mock; update: jest.Mock };

const ALL_OPTIONS: BackupOptions = {
  includeCollections: true,
  includeEnvironments: true,
  includeCookies: true,
  includeHistory: true,
  includeDrafts: true,
  includeTrash: true,
  includeRunnerHistory: true,
  includeMocks: true,
  includeSettings: true,
};

function makeService(): BackupService {
  return new BackupService(tmpDir, mockGlobalState as any);
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nouto-backup-test-'));
  mockGlobalState = {
    store: {},
    get: jest.fn((key: string) => mockGlobalState.store[key]),
    update: jest.fn(async (key: string, value: any) => { mockGlobalState.store[key] = value; }),
  };
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ── Seed helpers ─────────────────────────────────────────────────────

async function seedCollections(collections: any[] = [{ id: 'c1', name: 'Test', items: [] }]) {
  await fs.writeFile(path.join(tmpDir, 'collections.json'), JSON.stringify(collections), 'utf-8');
}

async function seedEnvironments(data: any = { activeId: null, environments: [{ id: 'e1', name: 'Dev', variables: [] }] }) {
  await fs.writeFile(path.join(tmpDir, 'environments.json'), JSON.stringify(data), 'utf-8');
}

async function seedCookies(data: any = { jars: [{ id: 'j1', name: 'Default', cookies: [{ name: 'sid', value: 'abc' }] }], activeJarId: 'j1' }) {
  await fs.writeFile(path.join(tmpDir, 'cookies.json'), JSON.stringify(data), 'utf-8');
}

async function seedHistory(entries: any[] = [{ id: 'h1', method: 'GET', url: 'https://example.com' }]) {
  const lines = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
  await fs.writeFile(path.join(tmpDir, 'nouto-history.jsonl'), lines, 'utf-8');
}

async function seedDrafts(data: any[] = [{ id: 'd1', request: { method: 'GET', url: '' } }]) {
  await fs.writeFile(path.join(tmpDir, 'drafts.json'), JSON.stringify(data), 'utf-8');
}

async function seedTrash(data: any[] = [{ id: 't1', type: 'request', deletedAt: '2026-01-01' }]) {
  await fs.writeFile(path.join(tmpDir, 'trash.json'), JSON.stringify(data), 'utf-8');
}

async function seedRunnerHistory(entries: any[] = [{ id: 'r1', collectionName: 'Test', totalRequests: 5 }]) {
  const lines = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
  await fs.writeFile(path.join(tmpDir, 'runner-history.jsonl'), lines, 'utf-8');
}

async function seedMocks(data: any = { port: 3000, routes: [{ id: 'm1', method: 'GET', path: '/api' }] }) {
  await fs.writeFile(path.join(tmpDir, 'mocks.json'), JSON.stringify(data), 'utf-8');
}

async function seedAll() {
  await seedCollections();
  await seedEnvironments();
  await seedCookies();
  await seedHistory();
  await seedDrafts();
  await seedTrash();
  await seedRunnerHistory();
  await seedMocks();
  mockGlobalState.store['nouto.settings'] = { rejectUnauthorized: false };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('BackupService', () => {
  describe('exportBackup', () => {
    it('should produce valid JSON with correct format sentinel', async () => {
      await seedAll();
      const service = makeService();
      const content = await service.exportBackup(ALL_OPTIONS);
      const backup: NoutoBackupFile = JSON.parse(content);

      expect(backup._format).toBe('nouto-backup');
      expect(backup._version).toBe('1.0');
      expect(backup._platform).toBe('vscode');
      expect(backup._exportedAt).toBeDefined();
      expect(backup._appVersion).toBeDefined();
    });

    it('should include all sections when all options enabled', async () => {
      await seedAll();
      const service = makeService();
      const content = await service.exportBackup(ALL_OPTIONS);
      const backup: NoutoBackupFile = JSON.parse(content);

      expect(backup.manifest.collections).toEqual({ included: true, count: 1 });
      expect(backup.manifest.environments).toEqual({ included: true, count: 1 });
      expect(backup.manifest.cookies).toEqual({ included: true, jarCount: 1, cookieCount: 1 });
      expect(backup.manifest.history).toEqual({ included: true, count: 1 });
      expect(backup.manifest.drafts).toEqual({ included: true, count: 1 });
      expect(backup.manifest.trash).toEqual({ included: true, count: 1 });
      expect(backup.manifest.runnerHistory).toEqual({ included: true, count: 1 });
      expect(backup.manifest.mocks).toEqual({ included: true, routeCount: 1 });
      expect(backup.manifest.settings).toEqual({ included: true });

      expect(backup.collections).toHaveLength(1);
      expect(backup.history).toHaveLength(1);
      expect(backup.settings).toEqual({ rejectUnauthorized: false });
    });

    it('should respect selective options', async () => {
      await seedAll();
      const service = makeService();
      const content = await service.exportBackup({
        ...ALL_OPTIONS,
        includeHistory: false,
        includeMocks: false,
        includeSettings: false,
      });
      const backup: NoutoBackupFile = JSON.parse(content);

      expect(backup.manifest.history).toEqual({ included: false, count: 0 });
      expect(backup.manifest.mocks).toEqual({ included: false, routeCount: 0 });
      expect(backup.manifest.settings).toEqual({ included: false });
      expect(backup.history).toBeUndefined();
      expect(backup.mocks).toBeUndefined();
      expect(backup.settings).toBeUndefined();

      // Selected sections should still be present
      expect(backup.manifest.collections.included).toBe(true);
      expect(backup.collections).toHaveLength(1);
    });

    it('should skip missing files gracefully', async () => {
      // No files seeded -- empty directory
      const service = makeService();
      const content = await service.exportBackup(ALL_OPTIONS);
      const backup: NoutoBackupFile = JSON.parse(content);

      // JSON files that don't exist: not included
      expect(backup.manifest.collections).toEqual({ included: false, count: 0 });
      expect(backup.collections).toBeUndefined();

      // JSONL files that don't exist: included with 0 count
      expect(backup.manifest.history).toEqual({ included: true, count: 0 });
      expect(backup.history).toEqual([]);
    });

    it('should include secrets warning', async () => {
      const service = makeService();
      const content = await service.exportBackup(ALL_OPTIONS);
      const backup: NoutoBackupFile = JSON.parse(content);

      expect(backup._warnings).toHaveLength(1);
      expect(backup._warnings[0]).toContain('Secrets');
    });
  });

  describe('importBackup', () => {
    it('should write all sections to disk', async () => {
      await seedAll();
      const service = makeService();
      const content = await service.exportBackup(ALL_OPTIONS);

      // Clear the directory to simulate fresh import
      const files = await fs.readdir(tmpDir);
      for (const f of files) await fs.unlink(path.join(tmpDir, f));

      const result = await service.importBackup(content);

      expect(result.sectionsRestored).toContain('Collections');
      expect(result.sectionsRestored).toContain('Environments');
      expect(result.sectionsRestored).toContain('History');
      expect(result.sectionsRestored).toContain('Settings');
      expect(result.collectionsCount).toBe(1);
      expect(result.historyCount).toBe(1);

      // Verify files exist on disk
      const collectionsRaw = await fs.readFile(path.join(tmpDir, 'collections.json'), 'utf-8');
      expect(JSON.parse(collectionsRaw)).toHaveLength(1);

      const envsRaw = await fs.readFile(path.join(tmpDir, 'environments.json'), 'utf-8');
      expect(JSON.parse(envsRaw).environments).toHaveLength(1);
    });

    it('should delete JSONL index files to force rebuild', async () => {
      // Create index files
      await fs.writeFile(path.join(tmpDir, 'nouto-history-index.json'), '[]', 'utf-8');
      await fs.writeFile(path.join(tmpDir, 'runner-history-index.json'), '[]', 'utf-8');

      await seedAll();
      const service = makeService();
      const content = await service.exportBackup(ALL_OPTIONS);
      await service.importBackup(content);

      // Index files should be deleted
      await expect(fs.access(path.join(tmpDir, 'nouto-history-index.json'))).rejects.toThrow();
      await expect(fs.access(path.join(tmpDir, 'runner-history-index.json'))).rejects.toThrow();
    });

    it('should create pre-restore snapshot', async () => {
      await seedCollections([{ id: 'original', name: 'Original', items: [] }]);
      const service = makeService();

      // Create a backup with different data
      await seedCollections([{ id: 'new', name: 'New', items: [] }]);
      const content = await service.exportBackup({ ...ALL_OPTIONS });

      // Restore original first, then import new
      await seedCollections([{ id: 'original', name: 'Original', items: [] }]);
      await service.importBackup(content);

      // Pre-restore snapshot should exist and contain original data
      const snapshotRaw = await fs.readFile(path.join(tmpDir, 'pre-restore-snapshot.nouto-backup'), 'utf-8');
      const snapshot: NoutoBackupFile = JSON.parse(snapshotRaw);
      expect(snapshot._format).toBe('nouto-backup');
      expect(snapshot.collections?.[0]?.id).toBe('original');
    });

    it('should update globalState settings', async () => {
      const backup: NoutoBackupFile = {
        _format: 'nouto-backup',
        _version: '1.0',
        _exportedAt: new Date().toISOString(),
        _appVersion: '1.1.0',
        _platform: 'vscode',
        manifest: {
          collections: { included: false, count: 0 },
          environments: { included: false, count: 0 },
          cookies: { included: false, jarCount: 0, cookieCount: 0 },
          history: { included: false, count: 0 },
          drafts: { included: false, count: 0 },
          trash: { included: false, count: 0 },
          runnerHistory: { included: false, count: 0 },
          mocks: { included: false, routeCount: 0 },
          settings: { included: true },
        },
        settings: { proxyEnabled: true, proxyHost: 'localhost' },
        _warnings: [],
      };

      const service = makeService();
      await service.importBackup(JSON.stringify(backup));

      expect(mockGlobalState.update).toHaveBeenCalledWith('nouto.settings', { proxyEnabled: true, proxyHost: 'localhost' });
    });
  });

  describe('_parseAndValidate', () => {
    it('should reject non-JSON content', () => {
      const service = makeService();
      expect(() => service._parseAndValidate('not json')).toThrow('not valid JSON');
    });

    it('should reject missing format sentinel', () => {
      const service = makeService();
      expect(() => service._parseAndValidate(JSON.stringify({ data: 'test' }))).toThrow('format identifier');
    });

    it('should reject wrong format sentinel', () => {
      const service = makeService();
      expect(() => service._parseAndValidate(JSON.stringify({ _format: 'postman' }))).toThrow('format identifier');
    });

    it('should reject unsupported version', () => {
      const service = makeService();
      expect(() => service._parseAndValidate(JSON.stringify({ _format: 'nouto-backup', _version: '2.0' }))).toThrow('Unsupported backup version');
    });

    it('should accept valid backup', () => {
      const service = makeService();
      const backup = { _format: 'nouto-backup', _version: '1.0', manifest: {}, _warnings: [] };
      expect(() => service._parseAndValidate(JSON.stringify(backup))).not.toThrow();
    });
  });
});
