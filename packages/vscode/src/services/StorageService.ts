import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import type { Collection, EnvironmentsData, StorageMode, SavedRequest } from './types';
import type { IStorageStrategy } from './storage/IStorageStrategy';
import { MonolithicStorageStrategy } from './storage/MonolithicStorageStrategy';
import { GitFriendlyStorageStrategy } from './storage/GitFriendlyStorageStrategy';
import { RecentCollectionService } from '@hivefetch/core/services';

export class StorageService {
  private strategy: IStorageStrategy;
  private readonly baseDir: string;

  constructor(workspaceFolder?: vscode.WorkspaceFolder) {
    if (workspaceFolder) {
      this.baseDir = path.join(workspaceFolder.uri.fsPath, '.vscode', 'hivefetch');
    } else {
      const folders = vscode.workspace.workspaceFolders;
      if (folders && folders.length > 0) {
        this.baseDir = path.join(folders[0].uri.fsPath, '.vscode', 'hivefetch');
      } else {
        this.baseDir = path.join(process.env.HOME || process.env.USERPROFILE || os.homedir(), '.hivefetch');
      }
    }

    const mode = this.readStorageMode();
    this.strategy = this.createStrategy(mode);
  }

  private readStorageMode(): StorageMode {
    const config = vscode.workspace.getConfiguration('hivefetch');
    return config.get<StorageMode>('storage.mode', 'monolithic');
  }

  private createStrategy(mode: StorageMode): IStorageStrategy {
    if (mode === 'git-friendly') {
      const gitDir = path.join(path.dirname(this.baseDir), '..', '.hivefetch');
      return new GitFriendlyStorageStrategy(gitDir);
    }
    return new MonolithicStorageStrategy(this.baseDir);
  }

  async loadCollections(): Promise<Collection[]> {
    let collections = await this.strategy.loadCollections();

    // One-time migration: convert history.json to Recent collection entries
    collections = await this.migrateHistoryToRecent(collections);

    // Ensure Recent collection always exists and is at index 0
    collections = RecentCollectionService.ensureRecentCollection(collections);

    return collections;
  }

  async saveCollections(collections: Collection[]): Promise<boolean> {
    return this.strategy.saveCollections(collections);
  }

  async loadAll(): Promise<{ collections: Collection[] }> {
    const collections = await this.loadCollections();
    return { collections };
  }

  async loadEnvironments(): Promise<EnvironmentsData> {
    return this.strategy.loadEnvironments();
  }

  async saveEnvironments(data: EnvironmentsData): Promise<boolean> {
    return this.strategy.saveEnvironments(data);
  }

  getStoragePath(): string {
    return this.strategy.getStorageDir();
  }

  getStorageDir(): string {
    return this.strategy.getStorageDir();
  }

  getStorageMode(): StorageMode {
    return this.readStorageMode();
  }

  async switchStorageMode(newMode: StorageMode): Promise<boolean> {
    const currentMode = this.readStorageMode();
    if (currentMode === newMode) {
      return true;
    }

    try {
      // Load all data from current strategy
      const [collections, environments] = await Promise.all([
        this.strategy.loadCollections(),
        this.strategy.loadEnvironments(),
      ]);

      // Create new strategy
      const newStrategy = this.createStrategy(newMode);

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
      this.strategy = newStrategy;

      // Update VS Code config
      const config = vscode.workspace.getConfiguration('hivefetch');
      await config.update('storage.mode', newMode, vscode.ConfigurationTarget.Workspace);

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
    const historyPath = path.join(this.strategy.getStorageDir(), 'history.json');

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

      // Save updated collections
      await this.strategy.saveCollections(result);

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
