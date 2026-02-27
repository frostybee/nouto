import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline';
import { createReadStream } from 'fs';
import type { HistoryEntry, HistoryIndexEntry, HistorySearchParams } from '@hivefetch/core/services';

const HISTORY_FILE = 'hivefetch-history.jsonl';
const INDEX_FILE = 'hivefetch-history-index.json';
const MAX_ENTRIES = 10000;
const MAX_AGE_DAYS = 90;
const MAX_BODY_SIZE = 256 * 1024; // 256 KB
const DEFAULT_LIMIT = 50;

export class HistoryStorageService {
  private _index: HistoryIndexEntry[] = [];
  private _historyPath: string;
  private _indexPath: string;

  constructor(private readonly storageDir: string) {
    this._historyPath = path.join(storageDir, HISTORY_FILE);
    this._indexPath = path.join(storageDir, INDEX_FILE);
  }

  async load(): Promise<void> {
    await fs.mkdir(this.storageDir, { recursive: true });

    try {
      const raw = await fs.readFile(this._indexPath, 'utf-8');
      this._index = JSON.parse(raw);
      if (!Array.isArray(this._index)) {
        this._index = [];
        await this._rebuildIndex();
      }
    } catch {
      // Index missing or corrupt — try to rebuild from JSONL
      await this._rebuildIndex();
    }
  }

  async append(entry: HistoryEntry): Promise<HistoryIndexEntry> {
    const line = JSON.stringify(entry) + '\n';
    await fs.appendFile(this._historyPath, line, 'utf-8');

    const indexEntry: HistoryIndexEntry = {
      id: entry.id,
      timestamp: entry.timestamp,
      method: entry.method,
      url: entry.url,
      responseStatus: entry.responseStatus,
      responseDuration: entry.responseDuration,
      responseSize: entry.responseSize,
      workspaceName: entry.workspaceName,
      collectionId: entry.collectionId,
      requestName: entry.requestName,
    };

    this._index.unshift(indexEntry);
    await this._saveIndex();

    return indexEntry;
  }

  async search(params?: HistorySearchParams): Promise<{ entries: HistoryIndexEntry[]; total: number; hasMore: boolean }> {
    let filtered = [...this._index];

    if (params?.query) {
      const q = params.query.toLowerCase();
      filtered = filtered.filter(e =>
        e.url.toLowerCase().includes(q) ||
        (e.requestName && e.requestName.toLowerCase().includes(q)) ||
        e.method.toLowerCase().includes(q)
      );
    }

    if (params?.methods && params.methods.length > 0) {
      const methods = params.methods.map(m => m.toUpperCase());
      filtered = filtered.filter(e => methods.includes(e.method.toUpperCase()));
    }

    if (params?.statusRange) {
      filtered = filtered.filter(e => {
        if (e.responseStatus === undefined) return false;
        switch (params.statusRange) {
          case 'success': return e.responseStatus >= 200 && e.responseStatus < 300;
          case 'redirect': return e.responseStatus >= 300 && e.responseStatus < 400;
          case 'clientError': return e.responseStatus >= 400 && e.responseStatus < 500;
          case 'serverError': return e.responseStatus >= 500;
          default: return true;
        }
      });
    }

    if (params?.before) {
      const before = new Date(params.before).getTime();
      filtered = filtered.filter(e => new Date(e.timestamp).getTime() < before);
    }

    if (params?.after) {
      const after = new Date(params.after).getTime();
      filtered = filtered.filter(e => new Date(e.timestamp).getTime() > after);
    }

    const total = filtered.length;
    const offset = params?.offset || 0;
    const limit = params?.limit || DEFAULT_LIMIT;
    const page = filtered.slice(offset, offset + limit);

    return {
      entries: page,
      total,
      hasMore: offset + limit < total,
    };
  }

  async getEntry(id: string): Promise<HistoryEntry | null> {
    try {
      await fs.access(this._historyPath);
    } catch {
      return null;
    }

    return new Promise<HistoryEntry | null>((resolve, reject) => {
      const stream = createReadStream(this._historyPath, { encoding: 'utf-8' });
      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
      let found = false;

      rl.on('line', (line) => {
        if (found) return;
        try {
          const entry: HistoryEntry = JSON.parse(line);
          if (entry.id === id) {
            found = true;
            rl.close();
            stream.destroy();
            resolve(entry);
          }
        } catch {
          // Skip corrupt lines
        }
      });

      rl.on('close', () => {
        if (!found) resolve(null);
      });

      rl.on('error', reject);
      stream.on('error', reject);
    });
  }

  async deleteEntry(id: string): Promise<boolean> {
    const idx = this._index.findIndex(e => e.id === id);
    if (idx === -1) return false;

    this._index.splice(idx, 1);

    // Rewrite JSONL without the deleted entry
    await this._rewriteJSONLWithout(id);
    await this._saveIndex();

    return true;
  }

  async clear(): Promise<void> {
    this._index = [];
    try { await fs.unlink(this._historyPath); } catch { /* ok */ }
    try { await fs.unlink(this._indexPath); } catch { /* ok */ }
  }

  async prune(): Promise<number> {
    const cutoff = Date.now() - (MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
    const before = this._index.length;

    // Remove entries older than 90 days
    this._index = this._index.filter(e => new Date(e.timestamp).getTime() >= cutoff);

    // Cap at MAX_ENTRIES (keep most recent)
    if (this._index.length > MAX_ENTRIES) {
      this._index = this._index.slice(0, MAX_ENTRIES);
    }

    const removed = before - this._index.length;

    if (removed > 0) {
      // Rewrite JSONL to only include remaining entries
      const remainingIds = new Set(this._index.map(e => e.id));
      await this._rewriteJSONLKeeping(remainingIds);
      await this._saveIndex();
    }

    return removed;
  }

  async seedFromRecent(items: any[]): Promise<number> {
    let count = 0;
    for (const item of items) {
      if (!item.url || !item.method) continue;

      const entry: HistoryEntry = {
        id: `seed-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        timestamp: item.updatedAt || item.createdAt || new Date().toISOString(),
        method: item.method,
        url: item.url,
        headers: item.headers || [],
        params: item.params || [],
        body: item.body,
        auth: item.auth,
        responseStatus: item.lastResponseStatus,
        responseDuration: item.lastResponseDuration,
        responseSize: item.lastResponseSize,
        requestName: item.name,
      };

      await this.append(entry);
      count++;
    }

    return count;
  }

  getTotal(): number {
    return this._index.length;
  }

  static capResponseBody(body: string | undefined): { body?: string; truncated: boolean } {
    if (!body) return { body: undefined, truncated: false };
    if (body.length <= MAX_BODY_SIZE) return { body, truncated: false };
    return { body: body.substring(0, MAX_BODY_SIZE), truncated: true };
  }

  // --- Private methods ---

  private async _saveIndex(): Promise<void> {
    await fs.writeFile(this._indexPath, JSON.stringify(this._index), 'utf-8');
  }

  private async _rebuildIndex(): Promise<void> {
    this._index = [];

    try {
      await fs.access(this._historyPath);
    } catch {
      return; // No JSONL file yet
    }

    return new Promise<void>((resolve, reject) => {
      const stream = createReadStream(this._historyPath, { encoding: 'utf-8' });
      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

      rl.on('line', (line) => {
        try {
          const entry: HistoryEntry = JSON.parse(line);
          this._index.push({
            id: entry.id,
            timestamp: entry.timestamp,
            method: entry.method,
            url: entry.url,
            responseStatus: entry.responseStatus,
            responseDuration: entry.responseDuration,
            responseSize: entry.responseSize,
            workspaceName: entry.workspaceName,
            collectionId: entry.collectionId,
            requestName: entry.requestName,
          });
        } catch {
          // Skip corrupt lines
        }
      });

      rl.on('close', () => {
        // Sort newest first
        this._index.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        this._saveIndex().then(resolve).catch(reject);
      });

      rl.on('error', reject);
      stream.on('error', reject);
    });
  }

  private async _rewriteJSONLWithout(excludeId: string): Promise<void> {
    const entries = await this._readAllEntries();
    const filtered = entries.filter(e => e.id !== excludeId);
    const lines = filtered.map(e => JSON.stringify(e)).join('\n') + (filtered.length > 0 ? '\n' : '');
    await fs.writeFile(this._historyPath, lines, 'utf-8');
  }

  private async _rewriteJSONLKeeping(keepIds: Set<string>): Promise<void> {
    const entries = await this._readAllEntries();
    const filtered = entries.filter(e => keepIds.has(e.id));
    const lines = filtered.map(e => JSON.stringify(e)).join('\n') + (filtered.length > 0 ? '\n' : '');
    await fs.writeFile(this._historyPath, lines, 'utf-8');
  }

  private async _readAllEntries(): Promise<HistoryEntry[]> {
    const entries: HistoryEntry[] = [];

    try {
      await fs.access(this._historyPath);
    } catch {
      return entries;
    }

    return new Promise<HistoryEntry[]>((resolve, reject) => {
      const stream = createReadStream(this._historyPath, { encoding: 'utf-8' });
      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

      rl.on('line', (line) => {
        try {
          entries.push(JSON.parse(line));
        } catch {
          // Skip corrupt lines
        }
      });

      rl.on('close', () => resolve(entries));
      rl.on('error', reject);
      stream.on('error', reject);
    });
  }
}
