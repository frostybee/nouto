import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import type { Collection, HistoryEntry, EnvironmentsData, StorageMode } from './types';
import type { IStorageStrategy } from './storage/IStorageStrategy';
import { MonolithicStorageStrategy } from './storage/MonolithicStorageStrategy';
import { GitFriendlyStorageStrategy } from './storage/GitFriendlyStorageStrategy';

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
    return this.strategy.loadCollections();
  }

  async saveCollections(collections: Collection[]): Promise<boolean> {
    return this.strategy.saveCollections(collections);
  }

  async loadHistory(): Promise<HistoryEntry[]> {
    return this.strategy.loadHistory();
  }

  async saveHistory(history: HistoryEntry[]): Promise<boolean> {
    return this.strategy.saveHistory(history);
  }

  async loadAll(): Promise<{ collections: Collection[]; history: HistoryEntry[] }> {
    const [collections, history] = await Promise.all([
      this.loadCollections(),
      this.loadHistory(),
    ]);
    return { collections, history };
  }

  async clearHistory(): Promise<boolean> {
    return this.saveHistory([]);
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
      const [collections, history, environments] = await Promise.all([
        this.strategy.loadCollections(),
        this.strategy.loadHistory(),
        this.strategy.loadEnvironments(),
      ]);

      // Create new strategy
      const newStrategy = this.createStrategy(newMode);

      // Save all data to new strategy
      await Promise.all([
        newStrategy.saveCollections(collections),
        newStrategy.saveHistory(history),
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
}
