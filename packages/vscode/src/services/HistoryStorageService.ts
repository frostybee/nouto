import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline';
import * as crypto from 'crypto';
import { createReadStream } from 'fs';
import type { HistoryEntry, HistoryIndexEntry, HistorySearchParams } from '@nouto/core/services';

const HISTORY_FILE = 'nouto-history.jsonl';
const INDEX_FILE = 'nouto-history-index.json';
const MAX_ENTRIES = 10000;
const MAX_AGE_DAYS = 90;
const MAX_BODY_SIZE = 256 * 1024; // 256 KB
const DEFAULT_LIMIT = 50;

export class HistoryStorageService {
  private _index: HistoryIndexEntry[] = [];
  private _historyPath: string;
  private _indexPath: string;
  private _appendQueue: Promise<HistoryIndexEntry> = Promise.resolve(null as any);

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
      // Index missing or corrupt - try to rebuild from JSONL
      await this._rebuildIndex();
    }
  }

  append(entry: HistoryEntry): Promise<HistoryIndexEntry> {
    const result = this._appendQueue.then(() => this._doAppend(entry));
    this._appendQueue = result.catch(() => null as any);
    return result;
  }

  private async _doAppend(entry: HistoryEntry): Promise<HistoryIndexEntry> {
    const line = JSON.stringify(entry) + '\n';
    await fs.appendFile(this._historyPath, line, 'utf-8');

    const indexEntry: HistoryIndexEntry = {
      id: entry.id,
      timestamp: entry.timestamp,
      method: entry.method,
      url: entry.url,
      connectionMode: entry.connectionMode,
      responseStatus: entry.responseStatus,
      responseDuration: entry.responseDuration,
      responseSize: entry.responseSize,
      workspaceName: entry.workspaceName,
      collectionId: entry.collectionId,
      requestId: entry.requestId,
      requestName: entry.requestName,
      ...(entry.pinned ? { pinned: true } : {}),
    };

    this._index.unshift(indexEntry);
    await this._saveIndex();

    return indexEntry;
  }

  async search(params?: HistorySearchParams): Promise<{ entries: HistoryIndexEntry[]; total: number; hasMore: boolean }> {
    // Handle similarTo: find entries with same base URL
    if (params?.similarTo) {
      const sourceEntry = this._index.find(e => e.id === params.similarTo);
      if (sourceEntry) {
        const baseUrl = this._getBaseUrl(sourceEntry.url);
        const similar = this._index.filter(e => this._getBaseUrl(e.url) === baseUrl);
        const offset = params?.offset || 0;
        const limit = params?.limit || DEFAULT_LIMIT;
        return {
          entries: similar.slice(offset, offset + limit),
          total: similar.length,
          hasMore: offset + limit < similar.length,
        };
      }
      return { entries: [], total: 0, hasMore: false };
    }

    // Handle deep search (requires scanning JSONL for full entry data)
    if (params?.query && params.searchFields && params.searchFields.some(f => f !== 'url')) {
      return this._deepSearch(params);
    }

    let filtered = [...this._index];

    if (params?.query) {
      if (params.isRegex) {
        try {
          const regex = new RegExp(params.query, 'i');
          filtered = filtered.filter(e =>
            regex.test(e.url) ||
            (e.requestName && regex.test(e.requestName)) ||
            regex.test(e.method)
          );
        } catch {
          // Invalid regex - fall back to no results
          filtered = [];
        }
      } else {
        const q = params.query.toLowerCase();
        filtered = filtered.filter(e =>
          e.url.toLowerCase().includes(q) ||
          (e.requestName && e.requestName.toLowerCase().includes(q)) ||
          e.method.toLowerCase().includes(q)
        );
      }
    }

    if (params?.collectionId) {
      filtered = filtered.filter(e => e.collectionId === params.collectionId);
    }

    if (params?.requestId) {
      filtered = filtered.filter(e => e.requestId === params.requestId);
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

    // Apply sorting (default: newest first, which is the index's natural order)
    if (params?.sortBy && params.sortBy !== 'newest') {
      switch (params.sortBy) {
        case 'oldest':
          filtered.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          break;
        case 'slowest':
          filtered.sort((a, b) => (b.responseDuration ?? 0) - (a.responseDuration ?? 0));
          break;
        case 'fastest':
          filtered.sort((a, b) => (a.responseDuration ?? Infinity) - (b.responseDuration ?? Infinity));
          break;
        case 'status':
          filtered.sort((a, b) => {
            const sa = a.responseStatus ?? 0;
            const sb = b.responseStatus ?? 0;
            // Errors first (5xx, 4xx, 3xx, 2xx), then by timestamp
            if (sa !== sb) return sb - sa;
            return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
          });
          break;
        case 'method':
          filtered.sort((a, b) => {
            const cmp = a.method.localeCompare(b.method);
            if (cmp !== 0) return cmp;
            return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
          });
          break;
      }
    }

    // Float pinned entries to the top (stable: preserves sort order within each group)
    const pinned = filtered.filter(e => e.pinned);
    const unpinned = filtered.filter(e => !e.pinned);
    filtered = [...pinned, ...unpinned];

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

  private _getBaseUrl(url: string): string {
    try {
      const u = new URL(url);
      return u.origin + u.pathname;
    } catch {
      return url;
    }
  }

  private async _deepSearch(params: HistorySearchParams): Promise<{ entries: HistoryIndexEntry[]; total: number; hasMore: boolean }> {
    const entries = await this._readAllEntries();
    const query = params.query!;
    const fields = params.searchFields || ['url'];
    const isRegex = params.isRegex;
    const matchFn = isRegex
      ? (() => { try { const r = new RegExp(query, 'i'); return (s: string) => r.test(s); } catch { return () => false; } })()
      : (s: string) => s.toLowerCase().includes(query.toLowerCase());

    // Limit deep scan for performance
    const scanLimit = Math.min(entries.length, 2000);
    const matchedIds = new Set<string>();

    for (let i = 0; i < scanLimit; i++) {
      const e = entries[i];
      let matched = false;

      if (fields.includes('url') && matchFn(e.url)) matched = true;
      if (!matched && fields.includes('headers') && e.headers) {
        matched = e.headers.some(h => matchFn(h.key) || matchFn(h.value));
      }
      if (!matched && fields.includes('responseBody') && e.responseBody) {
        matched = matchFn(e.responseBody);
      }

      if (matched) matchedIds.add(e.id);
    }

    // Return index entries for matched IDs (preserves index ordering)
    let filtered = this._index.filter(e => matchedIds.has(e.id));

    // Apply remaining filters
    if (params.collectionId) {
      filtered = filtered.filter(e => e.collectionId === params.collectionId);
    }
    if (params.methods && params.methods.length > 0) {
      const methods = params.methods.map(m => m.toUpperCase());
      filtered = filtered.filter(e => methods.includes(e.method.toUpperCase()));
    }

    const total = filtered.length;
    const offset = params.offset || 0;
    const limit = params.limit || DEFAULT_LIMIT;

    return {
      entries: filtered.slice(offset, offset + limit),
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

    // Never prune pinned entries; only prune unpinned entries older than cutoff
    this._index = this._index.filter(e => e.pinned || new Date(e.timestamp).getTime() >= cutoff);

    // Cap unpinned entries at MAX_ENTRIES (keep pinned + most recent unpinned)
    const pinnedEntries = this._index.filter(e => e.pinned);
    const unpinnedEntries = this._index.filter(e => !e.pinned);
    const maxUnpinned = MAX_ENTRIES - pinnedEntries.length;
    if (unpinnedEntries.length > maxUnpinned) {
      this._index = [...pinnedEntries, ...unpinnedEntries.slice(0, maxUnpinned)];
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
        id: `seed-${crypto.randomUUID()}`,
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

  async updateEntryCollectionId(id: string, collectionId: string, requestName?: string): Promise<boolean> {
    const indexEntry = this._index.find(e => e.id === id);
    if (!indexEntry) return false;

    indexEntry.collectionId = collectionId;
    if (requestName) indexEntry.requestName = requestName;

    // Update the full entry in JSONL
    const entries = await this.getAllEntries();
    const fullEntry = entries.find(e => e.id === id);
    if (fullEntry) {
      fullEntry.collectionId = collectionId;
      if (requestName) fullEntry.requestName = requestName;
      const lines = entries.map(e => JSON.stringify(e)).join('\n') + (entries.length > 0 ? '\n' : '');
      await fs.writeFile(this._historyPath, lines, 'utf-8');
    }

    await this._saveIndex();
    return true;
  }

  async getAllEntries(): Promise<HistoryEntry[]> {
    return this._readAllEntries();
  }

  getTotal(): number {
    return this._index.length;
  }

  getStats(days?: number): import('@nouto/core/services').HistoryStats {
    const cutoff = days ? Date.now() - (days * 24 * 60 * 60 * 1000) : 0;
    const entries = cutoff
      ? this._index.filter(e => new Date(e.timestamp).getTime() >= cutoff)
      : this._index;

    if (entries.length === 0) {
      return {
        totalRequests: 0,
        timeRange: { from: '', to: '' },
        topEndpoints: [],
        statusDistribution: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, error: 0 },
        avgResponseTime: 0,
        errorRate: 0,
        requestsPerDay: [],
      };
    }

    // Time range
    const timestamps = entries.map(e => new Date(e.timestamp).getTime());
    const from = new Date(Math.min(...timestamps)).toISOString();
    const to = new Date(Math.max(...timestamps)).toISOString();

    // Status distribution
    const statusDist = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, error: 0 };
    let totalDuration = 0;
    let durationCount = 0;

    for (const e of entries) {
      const s = e.responseStatus;
      if (!s || s === 0) statusDist.error++;
      else if (s < 200) { /* 1xx informational - skip */ }
      else if (s < 300) statusDist['2xx']++;
      else if (s < 400) statusDist['3xx']++;
      else if (s < 500) statusDist['4xx']++;
      else statusDist['5xx']++;

      if (e.responseDuration !== undefined) {
        totalDuration += e.responseDuration;
        durationCount++;
      }
    }

    // Top endpoints
    const endpointMap = new Map<string, { method: string; url: string; count: number; totalDuration: number; errors: number }>();
    for (const e of entries) {
      const baseUrl = this._getBaseUrl(e.url);
      const key = `${e.method}|${baseUrl}`;
      const existing = endpointMap.get(key);
      if (existing) {
        existing.count++;
        if (e.responseDuration) existing.totalDuration += e.responseDuration;
        if (!e.responseStatus || e.responseStatus >= 400) existing.errors++;
      } else {
        endpointMap.set(key, {
          method: e.method,
          url: baseUrl,
          count: 1,
          totalDuration: e.responseDuration || 0,
          errors: (!e.responseStatus || e.responseStatus >= 400) ? 1 : 0,
        });
      }
    }

    const topEndpoints = Array.from(endpointMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(ep => ({
        url: ep.url,
        method: ep.method,
        count: ep.count,
        avgDuration: ep.count > 0 ? Math.round(ep.totalDuration / ep.count) : 0,
        errorRate: ep.count > 0 ? Math.round((ep.errors / ep.count) * 100) : 0,
      }));

    // Requests per day
    const dayMap = new Map<string, number>();
    for (const e of entries) {
      const day = e.timestamp.substring(0, 10); // YYYY-MM-DD
      dayMap.set(day, (dayMap.get(day) || 0) + 1);
    }
    const requestsPerDay = Array.from(dayMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const errorCount = statusDist['4xx'] + statusDist['5xx'] + statusDist.error;

    return {
      totalRequests: entries.length,
      timeRange: { from, to },
      topEndpoints,
      statusDistribution: statusDist,
      avgResponseTime: durationCount > 0 ? Math.round(totalDuration / durationCount) : 0,
      errorRate: entries.length > 0 ? Math.round((errorCount / entries.length) * 100) : 0,
      requestsPerDay,
    };
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
            connectionMode: entry.connectionMode,
            responseStatus: entry.responseStatus,
            responseDuration: entry.responseDuration,
            responseSize: entry.responseSize,
            workspaceName: entry.workspaceName,
            collectionId: entry.collectionId,
            requestId: entry.requestId,
            requestName: entry.requestName,
            ...(entry.pinned ? { pinned: true } : {}),
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
