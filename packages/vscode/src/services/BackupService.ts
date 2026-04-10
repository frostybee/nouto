import * as path from 'path';
import * as fs from 'fs/promises';
import { createReadStream } from 'fs';
import * as readline from 'readline';
import type * as vscode from 'vscode';

// ── Types ───────────────────────────────────────────────────────────

export interface BackupOptions {
  includeCollections: boolean;
  includeEnvironments: boolean;
  includeCookies: boolean;
  includeHistory: boolean;
  includeDrafts: boolean;
  includeTrash: boolean;
  includeRunnerHistory: boolean;
  includeMocks: boolean;
  includeSettings: boolean;
}

export interface BackupManifest {
  collections: { included: boolean; count: number };
  environments: { included: boolean; count: number };
  cookies: { included: boolean; jarCount: number; cookieCount: number };
  history: { included: boolean; count: number };
  drafts: { included: boolean; count: number };
  trash: { included: boolean; count: number };
  runnerHistory: { included: boolean; count: number };
  mocks: { included: boolean; routeCount: number };
  settings: { included: boolean };
}

export interface NoutoBackupFile {
  _format: 'nouto-backup';
  _version: '1.0';
  _exportedAt: string;
  _appVersion: string;
  _platform: 'vscode';
  manifest: BackupManifest;
  collections?: any[];
  environments?: any;
  cookies?: any;
  history?: any[];
  drafts?: any[];
  trash?: any[];
  runnerHistory?: any[];
  mocks?: any;
  settings?: Record<string, any>;
  _warnings: string[];
}

export interface RestoreResult {
  sectionsRestored: string[];
  warnings: string[];
  collectionsCount: number;
  environmentsCount: number;
  historyCount: number;
}

// ── File name constants ─────────────────────────────────────────────

const FILE_COLLECTIONS = 'collections.json';
const FILE_ENVIRONMENTS = 'environments.json';
const FILE_COOKIES = 'cookies.json';
const FILE_HISTORY = 'nouto-history.jsonl';
const FILE_HISTORY_INDEX = 'nouto-history-index.json';
const FILE_DRAFTS = 'drafts.json';
const FILE_TRASH = 'trash.json';
const FILE_RUNNER_HISTORY = 'runner-history.jsonl';
const FILE_RUNNER_INDEX = 'runner-history-index.json';
const FILE_MOCKS = 'mocks.json';
const FILE_PRE_RESTORE = 'pre-restore-snapshot.nouto-backup';

const APP_VERSION = '1.1.0';

// ── Service ─────────────────────────────────────────────────────────

export class BackupService {
  constructor(
    private readonly storageDir: string,
    private readonly globalState: vscode.Memento,
  ) {}

  async exportBackup(options: BackupOptions): Promise<string> {
    const warnings: string[] = [
      'Secrets (passwords, API keys, tokens) stored in your OS keychain are NOT included. You will need to re-enter them after restoring.',
    ];

    const manifest: BackupManifest = {
      collections: { included: false, count: 0 },
      environments: { included: false, count: 0 },
      cookies: { included: false, jarCount: 0, cookieCount: 0 },
      history: { included: false, count: 0 },
      drafts: { included: false, count: 0 },
      trash: { included: false, count: 0 },
      runnerHistory: { included: false, count: 0 },
      mocks: { included: false, routeCount: 0 },
      settings: { included: false },
    };

    const backup: NoutoBackupFile = {
      _format: 'nouto-backup',
      _version: '1.0',
      _exportedAt: new Date().toISOString(),
      _appVersion: APP_VERSION,
      _platform: 'vscode',
      manifest,
      _warnings: warnings,
    };

    // Collections
    if (options.includeCollections) {
      const data = await this._readJsonFile(FILE_COLLECTIONS);
      if (data !== null) {
        const arr = Array.isArray(data) ? data : [];
        backup.collections = arr;
        manifest.collections = { included: true, count: arr.length };
      }
    }

    // Environments
    if (options.includeEnvironments) {
      const data = await this._readJsonFile(FILE_ENVIRONMENTS);
      if (data !== null) {
        backup.environments = data;
        const envCount = Array.isArray(data?.environments) ? data.environments.length : 0;
        manifest.environments = { included: true, count: envCount };
      }
    }

    // Cookies
    if (options.includeCookies) {
      const data = await this._readJsonFile(FILE_COOKIES);
      if (data !== null) {
        backup.cookies = data;
        const jars = Array.isArray(data?.jars) ? data.jars : [];
        const cookieCount = jars.reduce((sum: number, jar: any) =>
          sum + (Array.isArray(jar?.cookies) ? jar.cookies.length : 0), 0);
        manifest.cookies = { included: true, jarCount: jars.length, cookieCount };
      }
    }

    // History (JSONL)
    if (options.includeHistory) {
      const entries = await this._readJsonlFile(FILE_HISTORY);
      if (entries.length > 0) {
        backup.history = entries;
        manifest.history = { included: true, count: entries.length };
      }
    }

    // Drafts
    if (options.includeDrafts) {
      const data = await this._readJsonFile(FILE_DRAFTS);
      if (data !== null) {
        const arr = Array.isArray(data) ? data : [];
        backup.drafts = arr;
        manifest.drafts = { included: true, count: arr.length };
      }
    }

    // Trash
    if (options.includeTrash) {
      const data = await this._readJsonFile(FILE_TRASH);
      if (data !== null) {
        const arr = Array.isArray(data) ? data : [];
        backup.trash = arr;
        manifest.trash = { included: true, count: arr.length };
      }
    }

    // Runner history (JSONL)
    if (options.includeRunnerHistory) {
      const entries = await this._readJsonlFile(FILE_RUNNER_HISTORY);
      if (entries.length > 0) {
        backup.runnerHistory = entries;
        manifest.runnerHistory = { included: true, count: entries.length };
      }
    }

    // Mocks
    if (options.includeMocks) {
      const data = await this._readJsonFile(FILE_MOCKS);
      if (data !== null) {
        backup.mocks = data;
        const routeCount = Array.isArray(data?.routes) ? data.routes.length : 0;
        manifest.mocks = { included: true, routeCount };
      }
    }

    // Settings
    if (options.includeSettings) {
      const settings = this.globalState.get<Record<string, any>>('nouto.settings');
      if (settings) {
        backup.settings = settings;
        manifest.settings = { included: true };
      }
    }

    return JSON.stringify(backup, null, 2);
  }

  async importBackup(content: string): Promise<RestoreResult> {
    const backup = this._parseAndValidate(content);

    // Create pre-restore snapshot
    await this._createPreRestoreSnapshot();

    const result: RestoreResult = {
      sectionsRestored: [],
      warnings: [...(backup._warnings || [])],
      collectionsCount: 0,
      environmentsCount: 0,
      historyCount: 0,
    };

    // Ensure storage directory exists
    await fs.mkdir(this.storageDir, { recursive: true });

    // Collections
    if (backup.collections !== undefined) {
      await this._writeJsonFile(FILE_COLLECTIONS, backup.collections);
      result.sectionsRestored.push('Collections');
      result.collectionsCount = backup.collections.length;
    }

    // Environments
    if (backup.environments !== undefined) {
      await this._writeJsonFile(FILE_ENVIRONMENTS, backup.environments);
      result.sectionsRestored.push('Environments');
      result.environmentsCount = Array.isArray(backup.environments?.environments)
        ? backup.environments.environments.length : 0;
    }

    // Cookies
    if (backup.cookies !== undefined) {
      await this._writeJsonFile(FILE_COOKIES, backup.cookies);
      result.sectionsRestored.push('Cookies');
    }

    // History (JSONL + delete index to force rebuild)
    if (backup.history !== undefined) {
      await this._writeJsonlFile(FILE_HISTORY, backup.history);
      await this._deleteFile(FILE_HISTORY_INDEX);
      result.sectionsRestored.push('History');
      result.historyCount = backup.history.length;
    }

    // Drafts
    if (backup.drafts !== undefined) {
      await this._writeJsonFile(FILE_DRAFTS, backup.drafts);
      result.sectionsRestored.push('Drafts');
    }

    // Trash
    if (backup.trash !== undefined) {
      await this._writeJsonFile(FILE_TRASH, backup.trash);
      result.sectionsRestored.push('Trash');
    }

    // Runner history (JSONL + delete index)
    if (backup.runnerHistory !== undefined) {
      await this._writeJsonlFile(FILE_RUNNER_HISTORY, backup.runnerHistory);
      await this._deleteFile(FILE_RUNNER_INDEX);
      result.sectionsRestored.push('Runner history');
    }

    // Mocks
    if (backup.mocks !== undefined) {
      await this._writeJsonFile(FILE_MOCKS, backup.mocks);
      result.sectionsRestored.push('Mocks');
    }

    // Settings
    if (backup.settings !== undefined) {
      await this.globalState.update('nouto.settings', backup.settings);
      result.sectionsRestored.push('Settings');
    }

    return result;
  }

  /**
   * Parse and validate backup file content. Throws on invalid input.
   */
  _parseAndValidate(content: string): NoutoBackupFile {
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error('Invalid backup file: not valid JSON.');
    }

    if (parsed?._format !== 'nouto-backup') {
      throw new Error('Invalid backup file: missing or incorrect format identifier.');
    }

    if (parsed._version !== '1.0') {
      throw new Error(`Unsupported backup version "${parsed._version}". This version of Nouto supports version "1.0".`);
    }

    return parsed as NoutoBackupFile;
  }

  // ── File I/O helpers ──────────────────────────────────────────────

  private async _readJsonFile(fileName: string): Promise<any | null> {
    const filePath = path.join(this.storageDir, fileName);
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private async _readJsonlFile(fileName: string): Promise<any[]> {
    const filePath = path.join(this.storageDir, fileName);
    const entries: any[] = [];

    try {
      await fs.access(filePath);
    } catch {
      return entries;
    }

    return new Promise<any[]>((resolve, reject) => {
      const stream = createReadStream(filePath, { encoding: 'utf-8' });
      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

      rl.on('line', (line) => {
        try { entries.push(JSON.parse(line)); } catch { /* skip corrupt lines */ }
      });

      rl.on('close', () => resolve(entries));
      rl.on('error', reject);
      stream.on('error', reject);
    });
  }

  private async _writeJsonFile(fileName: string, data: any): Promise<void> {
    const filePath = path.join(this.storageDir, fileName);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  private async _writeJsonlFile(fileName: string, entries: any[]): Promise<void> {
    const filePath = path.join(this.storageDir, fileName);
    const lines = entries.map(e => JSON.stringify(e)).join('\n') + (entries.length > 0 ? '\n' : '');
    await fs.writeFile(filePath, lines, 'utf-8');
  }

  private async _deleteFile(fileName: string): Promise<void> {
    const filePath = path.join(this.storageDir, fileName);
    try {
      await fs.unlink(filePath);
    } catch {
      // File may not exist, that's fine
    }
  }

  private async _createPreRestoreSnapshot(): Promise<void> {
    const allOptions: BackupOptions = {
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

    try {
      const snapshot = await this.exportBackup(allOptions);
      const snapshotPath = path.join(this.storageDir, FILE_PRE_RESTORE);
      await fs.writeFile(snapshotPath, snapshot, 'utf-8');
    } catch {
      // Non-fatal: if snapshot fails, proceed with import anyway
    }
  }
}
