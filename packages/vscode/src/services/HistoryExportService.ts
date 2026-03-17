import type { HistoryEntry, HistorySearchParams } from '@nouto/core/services';
import { HistoryStorageService } from './HistoryStorageService';

const FORMAT_HEADER = 'nouto-history';
const FORMAT_VERSION = 1;

export class HistoryExportService {
  constructor(private historyService: HistoryStorageService) {}

  async exportJSON(filter?: HistorySearchParams): Promise<string> {
    const entries = await this._getFilteredEntries(filter);
    return JSON.stringify(
      { _format: FORMAT_HEADER, _version: FORMAT_VERSION, entries },
      null,
      2
    );
  }

  async exportCSV(filter?: HistorySearchParams): Promise<string> {
    const entries = await this._getFilteredEntries(filter);
    const header = 'timestamp,method,url,status,duration,size,requestName';
    const rows = entries.map(e => {
      const fields = [
        e.timestamp,
        e.method,
        this._csvEscape(e.url),
        e.responseStatus ?? '',
        e.responseDuration ?? '',
        e.responseSize ?? '',
        this._csvEscape(e.requestName || ''),
      ];
      return fields.join(',');
    });
    return [header, ...rows].join('\n');
  }

  async importJSON(content: string): Promise<number> {
    let data: any;
    try {
      data = JSON.parse(content);
    } catch {
      throw new Error('Invalid JSON format');
    }

    if (data._format !== FORMAT_HEADER) {
      throw new Error('Not a Nouto history export file');
    }

    if (!Array.isArray(data.entries)) {
      throw new Error('Invalid history export: missing entries array');
    }

    // Deduplicate by ID
    const existingEntries = await this.historyService.getAllEntries();
    const existingIds = new Set(existingEntries.map(e => e.id));

    let imported = 0;
    for (const entry of data.entries) {
      if (!entry.id || !entry.timestamp || !entry.method || !entry.url) {
        continue; // Skip invalid entries
      }
      if (existingIds.has(entry.id)) {
        continue; // Skip duplicates
      }

      await this.historyService.append(entry as HistoryEntry);
      imported++;
    }

    return imported;
  }

  private async _getFilteredEntries(filter?: HistorySearchParams): Promise<HistoryEntry[]> {
    if (!filter) {
      return this.historyService.getAllEntries();
    }

    // Use search to get matching IDs, then fetch full entries
    const result = await this.historyService.search({ ...filter, limit: 10000 });
    const matchedIds = new Set(result.entries.map(e => e.id));
    const allEntries = await this.historyService.getAllEntries();
    return allEntries.filter(e => matchedIds.has(e.id));
  }

  private _csvEscape(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
