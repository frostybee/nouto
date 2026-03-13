import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline';
import * as crypto from 'crypto';
import { createReadStream } from 'fs';
import type { CollectionRunResult } from './types';

const RUNNER_HISTORY_FILE = 'runner-history.jsonl';
const RUNNER_INDEX_FILE = 'runner-history-index.json';
const MAX_RUNS = 100;
const MAX_AGE_DAYS = 30;

export interface RunnerHistoryIndexEntry {
  id: string;
  collectionId: string;
  collectionName: string;
  folderId?: string;
  startedAt: string;
  completedAt: string;
  totalRequests: number;
  passedRequests: number;
  failedRequests: number;
  skippedRequests: number;
  totalDuration: number;
  stoppedEarly: boolean;
}

export class RunnerHistoryService {
  private _index: RunnerHistoryIndexEntry[] = [];
  private _historyPath: string;
  private _indexPath: string;
  private _loaded = false;

  constructor(private readonly storageDir: string) {
    this._historyPath = path.join(storageDir, RUNNER_HISTORY_FILE);
    this._indexPath = path.join(storageDir, RUNNER_INDEX_FILE);
  }

  async load(): Promise<void> {
    await fs.mkdir(this.storageDir, { recursive: true });

    try {
      const raw = await fs.readFile(this._indexPath, 'utf-8');
      this._index = JSON.parse(raw);
      if (!Array.isArray(this._index)) {
        this._index = [];
      }
    } catch {
      this._index = [];
    }

    this._loaded = true;
  }

  private async ensureLoaded(): Promise<void> {
    if (!this._loaded) await this.load();
  }

  async saveRun(result: CollectionRunResult): Promise<RunnerHistoryIndexEntry> {
    await this.ensureLoaded();

    const id = crypto.randomUUID();
    const entry = { ...result, id };

    const line = JSON.stringify(entry) + '\n';
    await fs.appendFile(this._historyPath, line, 'utf-8');

    const indexEntry: RunnerHistoryIndexEntry = {
      id,
      collectionId: result.collectionId,
      collectionName: result.collectionName,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      totalRequests: result.totalRequests,
      passedRequests: result.passedRequests,
      failedRequests: result.failedRequests,
      skippedRequests: result.skippedRequests,
      totalDuration: result.totalDuration,
      stoppedEarly: result.stoppedEarly,
    };

    this._index.unshift(indexEntry);
    await this.prune();
    await this._saveIndex();

    return indexEntry;
  }

  async getRuns(collectionId?: string, limit = 50): Promise<RunnerHistoryIndexEntry[]> {
    await this.ensureLoaded();
    let entries = this._index;
    if (collectionId) {
      entries = entries.filter(e => e.collectionId === collectionId);
    }
    return entries.slice(0, limit);
  }

  async getRunById(id: string): Promise<(CollectionRunResult & { id: string }) | null> {
    await this.ensureLoaded();

    try {
      await fs.access(this._historyPath);
    } catch {
      return null;
    }

    return new Promise((resolve, reject) => {
      const stream = createReadStream(this._historyPath, { encoding: 'utf-8' });
      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
      let found = false;

      rl.on('line', (line) => {
        if (found) return;
        try {
          const entry = JSON.parse(line);
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

      rl.on('close', () => { if (!found) resolve(null); });
      rl.on('error', reject);
      stream.on('error', reject);
    });
  }

  async deleteRun(id: string): Promise<boolean> {
    await this.ensureLoaded();
    const idx = this._index.findIndex(e => e.id === id);
    if (idx === -1) return false;

    this._index.splice(idx, 1);
    await this._rewriteWithout(id);
    await this._saveIndex();

    return true;
  }

  async clearByCollection(collectionId: string): Promise<void> {
    await this.ensureLoaded();
    const removeIds = new Set(this._index.filter(e => e.collectionId === collectionId).map(e => e.id));
    if (removeIds.size === 0) return;

    this._index = this._index.filter(e => e.collectionId !== collectionId);
    const keepIds = new Set(this._index.map(e => e.id));
    await this._rewriteKeeping(keepIds);
    await this._saveIndex();
  }

  async clearAll(): Promise<void> {
    this._index = [];
    try { await fs.unlink(this._historyPath); } catch { /* ok */ }
    try { await fs.unlink(this._indexPath); } catch { /* ok */ }
  }

  private async prune(): Promise<void> {
    const cutoff = Date.now() - (MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
    const before = this._index.length;

    this._index = this._index.filter(e => new Date(e.startedAt).getTime() >= cutoff);

    if (this._index.length > MAX_RUNS) {
      this._index = this._index.slice(0, MAX_RUNS);
    }

    if (this._index.length < before) {
      const keepIds = new Set(this._index.map(e => e.id));
      await this._rewriteKeeping(keepIds);
    }
  }

  private async _saveIndex(): Promise<void> {
    await fs.writeFile(this._indexPath, JSON.stringify(this._index), 'utf-8');
  }

  private async _rewriteWithout(excludeId: string): Promise<void> {
    const entries = await this._readAllEntries();
    const filtered = entries.filter((e: any) => e.id !== excludeId);
    const lines = filtered.map((e: any) => JSON.stringify(e)).join('\n') + (filtered.length > 0 ? '\n' : '');
    await fs.writeFile(this._historyPath, lines, 'utf-8');
  }

  private async _rewriteKeeping(keepIds: Set<string>): Promise<void> {
    const entries = await this._readAllEntries();
    const filtered = entries.filter((e: any) => keepIds.has(e.id));
    const lines = filtered.map((e: any) => JSON.stringify(e)).join('\n') + (filtered.length > 0 ? '\n' : '');
    await fs.writeFile(this._historyPath, lines, 'utf-8');
  }

  private async _readAllEntries(): Promise<any[]> {
    const entries: any[] = [];

    try {
      await fs.access(this._historyPath);
    } catch {
      return entries;
    }

    return new Promise((resolve, reject) => {
      const stream = createReadStream(this._historyPath, { encoding: 'utf-8' });
      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

      rl.on('line', (line) => {
        try { entries.push(JSON.parse(line)); } catch { /* skip */ }
      });

      rl.on('close', () => resolve(entries));
      rl.on('error', reject);
      stream.on('error', reject);
    });
  }
}
