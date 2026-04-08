import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { HistoryStorageService } from './HistoryStorageService';
import { HistoryExportService } from './HistoryExportService';
import type { HistoryEntry } from '@nouto/core/services';

let tmpDir: string;
let historyService: HistoryStorageService;
let exportService: HistoryExportService;

function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    method: 'GET',
    url: 'https://api.example.com/users',
    headers: [{ id: '1', key: 'Content-Type', value: 'application/json', enabled: true }],
    params: [],
    responseStatus: 200,
    responseDuration: 150,
    responseSize: 1024,
    ...overrides,
  };
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hf-export-'));
  historyService = new HistoryStorageService(tmpDir);
  await historyService.load();
  exportService = new HistoryExportService(historyService);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('HistoryExportService', () => {
  describe('exportJSON', () => {
    it('should export entries as JSON with format header', async () => {
      await historyService.append(makeEntry({ id: 'e1', method: 'GET', url: 'https://example.com/a' }));
      await historyService.append(makeEntry({ id: 'e2', method: 'POST', url: 'https://example.com/b' }));

      const json = await exportService.exportJSON();
      const parsed = JSON.parse(json);

      expect(parsed._format).toBe('nouto-history');
      expect(parsed._version).toBe(1);
      expect(parsed.entries).toHaveLength(2);
      expect(parsed.entries.map((e: any) => e.id).sort()).toEqual(['e1', 'e2']);
    });

    it('should export filtered entries when filter provided', async () => {
      await historyService.append(makeEntry({ id: 'f1', method: 'GET' }));
      await historyService.append(makeEntry({ id: 'f2', method: 'POST' }));

      const json = await exportService.exportJSON({ methods: ['POST'] });
      const parsed = JSON.parse(json);

      expect(parsed.entries).toHaveLength(1);
      expect(parsed.entries[0].id).toBe('f2');
    });
  });

  describe('exportCSV', () => {
    it('should export entries as CSV with header row', async () => {
      await historyService.append(makeEntry({
        id: 'csv1', method: 'GET', url: 'https://example.com/test',
        responseStatus: 200, responseDuration: 150, responseSize: 512,
      }));

      const csv = await exportService.exportCSV();
      const lines = csv.split('\n');

      expect(lines[0]).toBe('timestamp,method,url,status,duration,size,requestName');
      expect(lines.length).toBe(2); // header + 1 entry
      expect(lines[1]).toContain('GET');
      expect(lines[1]).toContain('https://example.com/test');
    });

    it('should escape CSV values with commas', async () => {
      await historyService.append(makeEntry({
        id: 'csv2', url: 'https://example.com/test?a=1,b=2',
      }));

      const csv = await exportService.exportCSV();
      // URL with comma should be quoted
      expect(csv).toContain('"https://example.com/test?a=1,b=2"');
    });
  });

  describe('importJSON', () => {
    it('should import entries from valid JSON export', async () => {
      const exportData = JSON.stringify({
        _format: 'nouto-history',
        _version: 1,
        entries: [
          makeEntry({ id: 'imp1', method: 'GET', url: 'https://example.com/a' }),
          makeEntry({ id: 'imp2', method: 'POST', url: 'https://example.com/b' }),
        ],
      });

      const imported = await exportService.importJSON(exportData);
      expect(imported).toBe(2);
      expect(historyService.getTotal()).toBe(2);
    });

    it('should deduplicate by ID on import', async () => {
      await historyService.append(makeEntry({ id: 'dup1' }));

      const exportData = JSON.stringify({
        _format: 'nouto-history',
        _version: 1,
        entries: [
          makeEntry({ id: 'dup1' }), // duplicate
          makeEntry({ id: 'new1' }), // new
        ],
      });

      const imported = await exportService.importJSON(exportData);
      expect(imported).toBe(1); // only new1
      expect(historyService.getTotal()).toBe(2);
    });

    it('should skip entries missing required fields', async () => {
      const exportData = JSON.stringify({
        _format: 'nouto-history',
        _version: 1,
        entries: [
          { id: 'no-url', timestamp: new Date().toISOString(), method: 'GET' }, // missing url
          { id: 'no-method', timestamp: new Date().toISOString(), url: 'https://example.com' }, // missing method
          makeEntry({ id: 'valid' }), // valid
        ],
      });

      const imported = await exportService.importJSON(exportData);
      expect(imported).toBe(1);
    });

    it('should reject invalid JSON', async () => {
      await expect(exportService.importJSON('not json')).rejects.toThrow('Invalid JSON format');
    });

    it('should reject non-Nouto format', async () => {
      const data = JSON.stringify({ entries: [] });
      await expect(exportService.importJSON(data)).rejects.toThrow('Not a Nouto history export file');
    });

    it('should reject missing entries array', async () => {
      const data = JSON.stringify({ _format: 'nouto-history' });
      await expect(exportService.importJSON(data)).rejects.toThrow('missing entries array');
    });

    it('should roundtrip export/import correctly', async () => {
      await historyService.append(makeEntry({ id: 'rt1', method: 'GET', url: 'https://example.com/a', responseBody: '{"ok":true}' }));
      await historyService.append(makeEntry({ id: 'rt2', method: 'POST', url: 'https://example.com/b' }));

      const exported = await exportService.exportJSON();

      // Create a fresh service and import
      const tmpDir2 = await fs.mkdtemp(path.join(os.tmpdir(), 'hf-export-rt-'));
      const historyService2 = new HistoryStorageService(tmpDir2);
      await historyService2.load();
      const exportService2 = new HistoryExportService(historyService2);

      const imported = await exportService2.importJSON(exported);
      expect(imported).toBe(2);
      expect(historyService2.getTotal()).toBe(2);

      // Verify full entry data preserved
      const entry = await historyService2.getEntry('rt1');
      expect(entry!.responseBody).toBe('{"ok":true}');

      await fs.rm(tmpDir2, { recursive: true, force: true });
    });
  });
});
