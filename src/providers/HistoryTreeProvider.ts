import * as vscode from 'vscode';
import { StorageService } from '../services/StorageService';
import type { HistoryEntry, HttpMethod } from '../services/types';

export class HistoryTreeItem extends vscode.TreeItem {
  constructor(public readonly entry: HistoryEntry) {
    super(entry.url, vscode.TreeItemCollapsibleState.None);

    // Format: "GET api.example.com/users"
    const displayUrl = this.getDisplayUrl(entry.url);
    this.label = `${entry.method} ${displayUrl}`;
    this.description = `${entry.status} · ${entry.duration}ms`;

    this.tooltip = new vscode.MarkdownString(
      `**${entry.method}** ${entry.url}\n\n` +
        `**Status:** ${entry.status} ${entry.statusText}\n` +
        `**Duration:** ${entry.duration}ms\n` +
        `**Size:** ${this.formatSize(entry.size)}\n` +
        `**Time:** ${new Date(entry.timestamp).toLocaleString()}`
    );

    // Color-coded icon based on method
    this.iconPath = this.getMethodIcon(entry.method);
    this.contextValue = 'historyEntry';

    // Double-click opens in editor
    this.command = {
      command: 'hivefetch.openHistoryEntry',
      title: 'Open Request',
      arguments: [entry],
    };
  }

  private getDisplayUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname + urlObj.pathname;
    } catch {
      return url;
    }
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private getMethodIcon(method: HttpMethod): vscode.ThemeIcon {
    // Use different colors for different methods
    const colorMap: Record<HttpMethod, string> = {
      GET: 'testing.iconPassed',
      POST: 'charts.green',
      PUT: 'charts.orange',
      PATCH: 'charts.purple',
      DELETE: 'testing.iconFailed',
      HEAD: 'charts.yellow',
      OPTIONS: 'charts.gray',
    };

    // Use circle-filled icon with method-appropriate color
    return new vscode.ThemeIcon(
      'circle-filled',
      new vscode.ThemeColor(colorMap[method] || 'foreground')
    );
  }
}

export class HistoryTreeProvider
  implements vscode.TreeDataProvider<HistoryTreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    HistoryTreeItem | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private history: HistoryEntry[] = [];

  constructor(private storageService: StorageService) {
    this.refresh();
  }

  async refresh(): Promise<void> {
    this.history = await this.storageService.loadHistory();
    this._onDidChangeTreeData.fire();
  }

  async addEntry(entry: HistoryEntry): Promise<void> {
    // Add to beginning (most recent first)
    this.history.unshift(entry);

    // Limit to 100 entries
    if (this.history.length > 100) {
      this.history = this.history.slice(0, 100);
    }

    await this.storageService.saveHistory(this.history);
    this._onDidChangeTreeData.fire();
  }

  async deleteEntry(id: string): Promise<void> {
    this.history = this.history.filter((e) => e.id !== id);
    await this.storageService.saveHistory(this.history);
    this._onDidChangeTreeData.fire();
  }

  async clear(): Promise<void> {
    this.history = [];
    await this.storageService.saveHistory([]);
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: HistoryTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): HistoryTreeItem[] {
    return this.history.map((entry) => new HistoryTreeItem(entry));
  }

  getParent(): vscode.ProviderResult<HistoryTreeItem> {
    return null;
  }
}
