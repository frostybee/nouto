import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import type { Collection, EnvironmentsData, StorageMode, CollectionMode, SavedRequest } from './types';
import type { IStorageStrategy } from './storage/IStorageStrategy';
import { MonolithicStorageStrategy } from './storage/MonolithicStorageStrategy';
import { GitFriendlyStorageStrategy } from './storage/GitFriendlyStorageStrategy';
import { WorkspaceStorageStrategy } from './storage/WorkspaceStorageStrategy';
import { RecentCollectionService } from '@hivefetch/core/services';

export class StorageService {
  private globalStrategy: IStorageStrategy;
  private workspaceStrategy: WorkspaceStorageStrategy | null = null;
  private readonly baseDir: string;
  private readonly workspaceRoot: string | null;

  constructor(workspaceFolder?: vscode.WorkspaceFolder, globalStorageDir?: string) {
    // Collections are stored globally so they're always visible regardless of open workspace.
    // globalStorageDir comes from context.globalStorageUri — correct in both normal and portable VS Code.
    if (globalStorageDir) {
      this.baseDir = globalStorageDir;
    } else {
      this.baseDir = path.join(process.env.HOME || process.env.USERPROFILE || os.homedir(), '.hivefetch');
    }

    this.workspaceRoot = workspaceFolder?.uri.fsPath ?? null;

    const mode = this.readStorageMode();
    this.globalStrategy = this.createGlobalStrategy(mode);

    // Initialize workspace strategy if collection mode requires it
    const collectionMode = this.readCollectionMode();
    if (collectionMode !== 'global' && this.workspaceRoot) {
      this.workspaceStrategy = new WorkspaceStorageStrategy(this.workspaceRoot);
    }
  }

  private readStorageMode(): StorageMode {
    const config = vscode.workspace.getConfiguration('hivefetch');
    return config.get<StorageMode>('storage.mode', 'monolithic') ?? 'monolithic';
  }

  private readCollectionMode(): CollectionMode {
    const config = vscode.workspace.getConfiguration('hivefetch');
    return config.get<CollectionMode>('storage.collectionMode', 'global') ?? 'global';
  }

  private createGlobalStrategy(mode: StorageMode): IStorageStrategy {
    if (mode === 'git-friendly') {
      const gitDir = path.join(this.baseDir, 'git-friendly');
      return new GitFriendlyStorageStrategy(gitDir);
    }
    return new MonolithicStorageStrategy(this.baseDir);
  }

  /**
   * Strip the transient `source` field before writing to disk.
   */
  private stripSource(collections: Collection[]): Collection[] {
    return collections.map(c => {
      const { source, ...rest } = c;
      return rest as Collection;
    });
  }

  async loadCollections(): Promise<Collection[]> {
    const collectionMode = this.readCollectionMode();
    let collections: Collection[] = [];

    if (collectionMode === 'global' || collectionMode === 'both') {
      const global = await this.globalStrategy.loadCollections();
      global.forEach(c => c.source = 'global');
      collections.push(...global);
    }

    if ((collectionMode === 'workspace' || collectionMode === 'both') && this.workspaceStrategy) {
      const workspace = await this.workspaceStrategy.loadCollections();
      workspace.forEach(c => c.source = 'workspace');
      collections.push(...workspace);
    }

    // In workspace-only mode, still need Recent from global
    if (collectionMode === 'workspace') {
      const global = await this.globalStrategy.loadCollections();
      const recent = global.find(c => c.builtin === 'recent');
      if (recent) {
        recent.source = 'global';
        collections.unshift(recent);
      }
    }

    // One-time migration: convert history.json to Recent collection entries
    collections = await this.migrateHistoryToRecent(collections);

    // Ensure Recent collection always exists and is at index 0
    collections = RecentCollectionService.ensureRecentCollection(collections);
    // Recent is always global
    if (collections.length > 0 && collections[0].builtin === 'recent') {
      collections[0].source = 'global';
    }

    return collections;
  }

  async saveCollections(collections: Collection[]): Promise<boolean> {
    const collectionMode = this.readCollectionMode();

    if (collectionMode === 'global') {
      return this.globalStrategy.saveCollections(this.stripSource(collections));
    }

    if (collectionMode === 'workspace' && this.workspaceStrategy) {
      // Builtin (Recent) always goes to global, rest to workspace
      const builtinCols = collections.filter(c => c.builtin);
      const workspaceCols = collections.filter(c => !c.builtin);

      const [g, w] = await Promise.all([
        this.globalStrategy.saveCollections(this.stripSource(builtinCols)),
        this.workspaceStrategy.saveCollections(this.stripSource(workspaceCols)),
      ]);
      return g && w;
    }

    if (collectionMode === 'both' && this.workspaceStrategy) {
      const globalCols = collections.filter(c => c.source !== 'workspace');
      const workspaceCols = collections.filter(c => c.source === 'workspace');

      const [g, w] = await Promise.all([
        this.globalStrategy.saveCollections(this.stripSource(globalCols)),
        this.workspaceStrategy.saveCollections(this.stripSource(workspaceCols)),
      ]);
      return g && w;
    }

    // Fallback
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

  getStoragePath(): string {
    return this.globalStrategy.getStorageDir();
  }

  getStorageDir(): string {
    return this.globalStrategy.getStorageDir();
  }

  getStorageMode(): StorageMode {
    return this.readStorageMode();
  }

  getCollectionMode(): CollectionMode {
    return this.readCollectionMode();
  }

  getWorkspaceRoot(): string | null {
    return this.workspaceRoot;
  }

  /**
   * Reinitialize the workspace strategy (e.g., after changing collectionMode setting).
   */
  reinitializeWorkspaceStrategy(): void {
    const collectionMode = this.readCollectionMode();
    if (collectionMode !== 'global' && this.workspaceRoot) {
      this.workspaceStrategy = new WorkspaceStorageStrategy(this.workspaceRoot);
    } else {
      this.workspaceStrategy = null;
    }
  }

  async switchStorageMode(newMode: StorageMode): Promise<boolean> {
    const currentMode = this.readStorageMode();
    if (currentMode === newMode) {
      return true;
    }

    try {
      // Load all data from current global strategy
      const [collections, environments] = await Promise.all([
        this.globalStrategy.loadCollections(),
        this.globalStrategy.loadEnvironments(),
      ]);

      // Create new strategy
      const newStrategy = this.createGlobalStrategy(newMode);

      // Save all data to new strategy
      await Promise.all([
        newStrategy.saveCollections(collections),
        newStrategy.saveEnvironments(environments),
      ]);

      // If switching to git-friendly, create .gitignore
      if (newMode === 'git-friendly' && newStrategy instanceof GitFriendlyStorageStrategy) {
        await newStrategy.ensureGitignore();
      }

      // Switch to new strategy
      this.globalStrategy = newStrategy;

      // Update VS Code config
      const config = vscode.workspace.getConfiguration('hivefetch');
      await config.update('storage.mode', newMode, vscode.ConfigurationTarget.Global);

      return true;
    } catch (error) {
      console.error('Failed to switch storage mode:', error);
      return false;
    }
  }

  /**
   * One-time migration: reads history.json, converts entries to SavedRequests
   * in the Recent collection, then deletes history.json.
   */
  private async migrateHistoryToRecent(collections: Collection[]): Promise<Collection[]> {
    const historyPath = path.join(this.globalStrategy.getStorageDir(), 'history.json');

    if (!existsSync(historyPath)) {
      return collections;
    }

    try {
      const raw = await fs.readFile(historyPath, 'utf8');
      const historyEntries = JSON.parse(raw) as any[];

      if (!Array.isArray(historyEntries) || historyEntries.length === 0) {
        // Empty history — just delete the file
        await fs.unlink(historyPath).catch(() => {});
        return collections;
      }

      // Ensure Recent collection exists
      let result = RecentCollectionService.ensureRecentCollection(collections);
      const recent = result[0];

      // Convert each history entry to SavedRequest with response metadata
      const convertedItems: SavedRequest[] = historyEntries.slice(0, 50).map((entry: any) => {
        let name = `${entry.method} ${entry.url}`;
        try {
          const urlObj = new URL(entry.url);
          name = `${entry.method} ${urlObj.pathname}`;
        } catch { /* keep derived name */ }

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

      // Merge into Recent (prepend migrated, keeping any existing items)
      recent.items = [...convertedItems, ...recent.items].slice(0, 50);
      recent.updatedAt = new Date().toISOString();

      // Save updated collections to global strategy
      await this.globalStrategy.saveCollections(result);

      // Delete the old history.json
      await fs.unlink(historyPath).catch(() => {});

      console.log(`[HiveFetch] Migrated ${convertedItems.length} history entries to Recent collection`);
      return result;
    } catch (error) {
      console.error('[HiveFetch] Failed to migrate history.json:', error);
      return collections;
    }
  }
}
