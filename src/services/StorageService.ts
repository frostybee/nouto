import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import type { Collection, HistoryEntry, EnvironmentsData } from './types';

export class StorageService {
  private readonly storageDir: string;
  private readonly collectionsPath: string;
  private readonly historyPath: string;
  private readonly environmentsPath: string;

  constructor(workspaceFolder?: vscode.WorkspaceFolder) {
    // Use workspace .vscode/hivefetch folder if available, otherwise use global storage
    if (workspaceFolder) {
      this.storageDir = path.join(workspaceFolder.uri.fsPath, '.vscode', 'hivefetch');
    } else {
      // Fallback to first workspace folder or user home directory
      const folders = vscode.workspace.workspaceFolders;
      if (folders && folders.length > 0) {
        this.storageDir = path.join(folders[0].uri.fsPath, '.vscode', 'hivefetch');
      } else {
        // No workspace - use a temp location (collections will be lost on reload)
        this.storageDir = path.join(process.env.HOME || process.env.USERPROFILE || '', '.hivefetch');
      }
    }

    this.collectionsPath = path.join(this.storageDir, 'collections.json');
    this.historyPath = path.join(this.storageDir, 'history.json');
    this.environmentsPath = path.join(this.storageDir, 'environments.json');
  }

  /**
   * Ensure storage directory exists
   */
  private async ensureStorageDir(): Promise<void> {
    if (!existsSync(this.storageDir)) {
      await fs.mkdir(this.storageDir, { recursive: true });
    }
  }

  /**
   * Load collections from file
   */
  async loadCollections(): Promise<Collection[]> {
    try {
      if (existsSync(this.collectionsPath)) {
        const data = await fs.readFile(this.collectionsPath, 'utf8');
        return JSON.parse(data) as Collection[];
      }
    } catch (error) {
      console.error('Failed to load collections:', error);
    }
    return [];
  }

  /**
   * Save collections to file
   */
  async saveCollections(collections: Collection[]): Promise<boolean> {
    try {
      await this.ensureStorageDir();
      await fs.writeFile(this.collectionsPath, JSON.stringify(collections, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error('Failed to save collections:', error);
      return false;
    }
  }

  /**
   * Load history from file
   */
  async loadHistory(): Promise<HistoryEntry[]> {
    try {
      if (existsSync(this.historyPath)) {
        const data = await fs.readFile(this.historyPath, 'utf8');
        return JSON.parse(data) as HistoryEntry[];
      }
    } catch (error) {
      console.error('Failed to load history:', error);
    }
    return [];
  }

  /**
   * Save history to file
   */
  async saveHistory(history: HistoryEntry[]): Promise<boolean> {
    try {
      await this.ensureStorageDir();
      await fs.writeFile(this.historyPath, JSON.stringify(history, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error('Failed to save history:', error);
      return false;
    }
  }

  /**
   * Load all data (collections and history)
   */
  async loadAll(): Promise<{ collections: Collection[]; history: HistoryEntry[] }> {
    const [collections, history] = await Promise.all([
      this.loadCollections(),
      this.loadHistory(),
    ]);
    return { collections, history };
  }

  /**
   * Clear all history
   */
  async clearHistory(): Promise<boolean> {
    return this.saveHistory([]);
  }

  /**
   * Load environments from file
   */
  async loadEnvironments(): Promise<EnvironmentsData> {
    try {
      if (existsSync(this.environmentsPath)) {
        const data = await fs.readFile(this.environmentsPath, 'utf8');
        return JSON.parse(data) as EnvironmentsData;
      }
    } catch (error) {
      console.error('Failed to load environments:', error);
    }
    return { environments: [], activeId: null };
  }

  /**
   * Save environments to file
   */
  async saveEnvironments(data: EnvironmentsData): Promise<boolean> {
    try {
      await this.ensureStorageDir();
      await fs.writeFile(this.environmentsPath, JSON.stringify(data, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error('Failed to save environments:', error);
      return false;
    }
  }

  /**
   * Get storage directory path (for debugging)
   */
  getStoragePath(): string {
    return this.storageDir;
  }
}
