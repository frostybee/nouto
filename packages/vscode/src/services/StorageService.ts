import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import type { Collection, EnvironmentsData, StorageMode, SavedRequest } from './types';
import { MonolithicStorageStrategy } from './storage/MonolithicStorageStrategy';
import { PerRequestStorageStrategy } from './storage/PerRequestStorageStrategy';
import { DraftsCollectionService } from '@hivefetch/core/services';
import { extractPathname, generateId } from '@hivefetch/core';

/**
 * Two-mode storage service:
 *   - "global" (default): single collections.json in VS Code global storage
 *   - "workspace": per-request files in .hivefetch/collections/ (git-friendly)
 *
 * In both modes, environments and the Recent collection live in global storage.
 */
export class StorageService {
  private globalStrategy: MonolithicStorageStrategy;
  private workspaceStrategy: PerRequestStorageStrategy | null = null;
  private readonly baseDir: string;
  private readonly workspaceRoot: string | null;

  constructor(workspaceFolder?: vscode.WorkspaceFolder, globalStorageDir?: string) {
    if (globalStorageDir) {
      this.baseDir = globalStorageDir;
    } else {
      this.baseDir = path.join(process.env.HOME || process.env.USERPROFILE || os.homedir(), '.hivefetch');
    }

    this.workspaceRoot = workspaceFolder?.uri.fsPath ?? null;
    this.globalStrategy = new MonolithicStorageStrategy(this.baseDir);

    if (this.workspaceRoot) {
      const hivefetchDir = path.join(this.workspaceRoot, '.hivefetch');
      const configMode = this.readStorageMode();

      if (configMode === 'workspace') {
        this.workspaceStrategy = new PerRequestStorageStrategy(hivefetchDir);
      } else if (existsSync(path.join(hivefetchDir, 'collections'))) {
        // Auto-detect: workspace has .hivefetch/collections/ (e.g. cloned repo)
        this.workspaceStrategy = new PerRequestStorageStrategy(hivefetchDir);
        // Update config to match the detected workspace storage
        const config = vscode.workspace.getConfiguration('hivefetch');
        config.update('storage.mode', 'workspace', vscode.ConfigurationTarget.Global);
      }
    }
  }

  private readStorageMode(): StorageMode {
    const config = vscode.workspace.getConfiguration('hivefetch');
    return config.get<StorageMode>('storage.mode', 'global') ?? 'global';
  }

  private stripSource(collections: Collection[]): Collection[] {
    return collections.map(c => {
      const { source, ...rest } = c;
      return rest as Collection;
    });
  }

  // ── Load / Save ──────────────────────────────────────────────────

  async loadCollections(): Promise<Collection[]> {
    let collections: Collection[] = [];

    if (this.workspaceStrategy) {
      // Ensure .gitignore exists on every load (handles new workspaces)
      await this.workspaceStrategy.ensureGitignore();

      // Workspace mode: regular collections from workspace, Recent from global
      const workspace = await this.workspaceStrategy.loadCollections();
      workspace.forEach(c => c.source = 'workspace');
      collections.push(...workspace);

      const global = await this.globalStrategy.loadCollections();
      const drafts = global.find(c => c.builtin === 'drafts');
      if (drafts) {
        drafts.source = 'global';
        collections.unshift(drafts);
      }
    } else {
      // Global mode: everything from global storage
      const global = await this.globalStrategy.loadCollections();
      global.forEach(c => c.source = 'global');
      collections.push(...global);
    }

    // Migrate legacy 'recent' → 'drafts'
    collections = DraftsCollectionService.migrateFromRecent(collections);

    // One-time migration: convert history.json to Drafts collection entries
    collections = await this.migrateHistoryToDrafts(collections);

    // Ensure Drafts collection always exists and is at index 0
    collections = DraftsCollectionService.ensureDraftsCollection(collections);
    if (collections.length > 0 && collections[0].builtin === 'drafts') {
      collections[0].source = 'global';
    }

    // Deduplicate collections by ID (e.g. duplicated files in workspace)
    collections = this.deduplicateCollections(collections);

    return collections;
  }

  async saveCollections(collections: Collection[]): Promise<boolean> {
    if (this.workspaceStrategy) {
      // Workspace mode: builtin (Recent) to global, rest to workspace
      const builtinCols = collections.filter(c => c.builtin);
      const workspaceCols = collections.filter(c => !c.builtin);

      const [g, w] = await Promise.all([
        this.globalStrategy.saveCollections(this.stripSource(builtinCols)),
        this.workspaceStrategy.saveCollections(this.stripSource(workspaceCols)),
      ]);
      return g && w;
    }

    // Global mode: everything to global storage
    return this.globalStrategy.saveCollections(this.stripSource(collections));
  }

  async loadAll(): Promise<{ collections: Collection[] }> {
    const collections = await this.loadCollections();
    return { collections };
  }

  async loadEnvironments(): Promise<EnvironmentsData> {
    return this.globalStrategy.loadEnvironments();
  }

  async saveEnvironments(data: EnvironmentsData): Promise<boolean> {
    return this.globalStrategy.saveEnvironments(data);
  }

  // ── Accessors ────────────────────────────────────────────────────

  getStoragePath(): string {
    return this.globalStrategy.getStorageDir();
  }

  getStorageDir(): string {
    return this.globalStrategy.getStorageDir();
  }

  getStorageMode(): StorageMode {
    return this.readStorageMode();
  }

  getWorkspaceRoot(): string | null {
    return this.workspaceRoot;
  }

  // ── Mode switching ───────────────────────────────────────────────

  async switchStorageMode(newMode: StorageMode): Promise<boolean> {
    const currentMode = this.readStorageMode();
    if (currentMode === newMode) {
      return true;
    }

    if (newMode === 'workspace' && !this.workspaceRoot) {
      vscode.window.showErrorMessage('Workspace storage requires an open workspace folder.');
      return false;
    }

    try {
      // Load all current data
      const collections = await this.loadCollections();
      const environments = await this.globalStrategy.loadEnvironments();

      if (newMode === 'workspace') {
        // Switching TO workspace: regular collections go to workspace, Recent stays global
        const hivefetchDir = path.join(this.workspaceRoot!, '.hivefetch');
        const newWorkspaceStrategy = new PerRequestStorageStrategy(hivefetchDir);

        const builtinCols = collections.filter(c => c.builtin);
        const regularCols = collections.filter(c => !c.builtin);

        await Promise.all([
          this.globalStrategy.saveCollections(this.stripSource(builtinCols)),
          newWorkspaceStrategy.saveCollections(this.stripSource(regularCols)),
        ]);
        await newWorkspaceStrategy.ensureGitignore();

        this.workspaceStrategy = newWorkspaceStrategy;
      } else {
        // Switching TO global: merge everything into global storage
        await Promise.all([
          this.globalStrategy.saveCollections(this.stripSource(collections)),
          this.globalStrategy.saveEnvironments(environments),
        ]);

        this.workspaceStrategy = null;
      }

      const config = vscode.workspace.getConfiguration('hivefetch');
      await config.update('storage.mode', newMode, vscode.ConfigurationTarget.Global);

      return true;
    } catch (error) {
      console.error('Failed to switch storage mode:', error);
      return false;
    }
  }

  /**
   * Ensure the workspace .hivefetch/.gitignore exists.
   */
  async ensureWorkspaceGitignore(): Promise<void> {
    if (this.workspaceStrategy) {
      await this.workspaceStrategy.ensureGitignore();
    }
  }

  // ── Deduplication ───────────────────────────────────────────────

  private deduplicateCollections(collections: Collection[]): Collection[] {
    const seenIds = new Set<string>();
    const duplicateNames: string[] = [];

    for (const col of collections) {
      if (seenIds.has(col.id)) {
        const oldId = col.id;
        col.id = generateId();
        duplicateNames.push(col.name);
        console.warn(`[HiveFetch] Duplicate collection ID "${oldId}" found for "${col.name}", assigned new ID "${col.id}"`);
      }
      seenIds.add(col.id);
    }

    if (duplicateNames.length > 0) {
      vscode.window.showWarningMessage(
        `HiveFetch: ${duplicateNames.length} collection(s) had duplicate IDs and were reassigned: ${duplicateNames.join(', ')}`
      );
    }

    return collections;
  }

  // ── History migration ────────────────────────────────────────────

  private async migrateHistoryToDrafts(collections: Collection[]): Promise<Collection[]> {
    const historyPath = path.join(this.globalStrategy.getStorageDir(), 'history.json');

    if (!existsSync(historyPath)) {
      return collections;
    }

    try {
      const raw = await fs.readFile(historyPath, 'utf8');
      const historyEntries = JSON.parse(raw) as any[];

      if (!Array.isArray(historyEntries) || historyEntries.length === 0) {
        await fs.unlink(historyPath).catch(() => {});
        return collections;
      }

      let result = DraftsCollectionService.ensureDraftsCollection(collections);
      const drafts = result[0];

      const convertedItems: SavedRequest[] = historyEntries.slice(0, 50).map((entry: any) => {
        const name = `${entry.method} ${extractPathname(entry.url)}`;

        return {
          type: 'request' as const,
          id: `migrated-${entry.id || Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          name,
          method: entry.method,
          url: entry.url,
          params: entry.params || [],
          headers: entry.headers || [],
          auth: entry.auth || { type: 'none' },
          body: entry.body || { type: 'none', content: '' },
          connectionMode: entry.connectionMode,
          lastResponseStatus: entry.status,
          lastResponseDuration: entry.duration,
          lastResponseSize: entry.size,
          lastResponseTime: entry.timestamp,
          createdAt: entry.timestamp || new Date().toISOString(),
          updatedAt: entry.timestamp || new Date().toISOString(),
        };
      });

      drafts.items = [...convertedItems, ...drafts.items].slice(0, 50);
      drafts.updatedAt = new Date().toISOString();

      // Only save builtin collections (Drafts) back to global storage
      const globalCols = result.filter(c => c.builtin);
      await this.globalStrategy.saveCollections(this.stripSource(globalCols));
      await fs.unlink(historyPath).catch(() => {});

      console.log(`[HiveFetch] Migrated ${convertedItems.length} history entries to Drafts collection`);
      return result;
    } catch (error) {
      console.error('[HiveFetch] Failed to migrate history.json:', error);
      return collections;
    }
  }
}
