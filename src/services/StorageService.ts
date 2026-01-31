import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { Collection, HistoryEntry } from './types';

export class StorageService {
  private readonly storageDir: string;
  private readonly collectionsPath: string;
  private readonly historyPath: string;

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
  }

  /**
   * Ensure storage directory exists
   */
  private ensureStorageDir(): void {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  /**
   * Load collections from file
   */
  async loadCollections(): Promise<Collection[]> {
    try {
      if (fs.existsSync(this.collectionsPath)) {
        const data = fs.readFileSync(this.collectionsPath, 'utf8');
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
      this.ensureStorageDir();
      fs.writeFileSync(this.collectionsPath, JSON.stringify(collections, null, 2), 'utf8');
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
      if (fs.existsSync(this.historyPath)) {
        const data = fs.readFileSync(this.historyPath, 'utf8');
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
      this.ensureStorageDir();
      fs.writeFileSync(this.historyPath, JSON.stringify(history, null, 2), 'utf8');
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
   * Get storage directory path (for debugging)
   */
  getStoragePath(): string {
    return this.storageDir;
  }
}
