import * as vscode from 'vscode';

/**
 * Watches `.fetchman/collections/` for external file changes (git pull, manual edits).
 * Debounces rapid changes (e.g., git checkout) into a single coalesced event.
 */
export class FetchmanWatcher implements vscode.Disposable {
  private watcher: vscode.FileSystemWatcher | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingChanges: vscode.Uri[] = [];
  private readonly DEBOUNCE_MS = 500;
  private ignoreNextChange = false;

  private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri[]>();
  public readonly onDidChange = this._onDidChange.event;

  constructor(private readonly workspaceRoot: string) {}

  start(): void {
    const pattern = new vscode.RelativePattern(
      this.workspaceRoot,
      '.fetchman/collections/**/*.json'
    );

    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);

    const handle = (uri: vscode.Uri) => {
      if (this.ignoreNextChange) {
        return;
      }
      this.pendingChanges.push(uri);
      this.scheduleFlush();
    };

    this.watcher.onDidChange(handle);
    this.watcher.onDidCreate(handle);
    this.watcher.onDidDelete(handle);
  }

  /**
   * Temporarily suppress change events (e.g., when we're writing files ourselves).
   */
  suppressChanges(fn: () => Promise<void>): Promise<void> {
    this.ignoreNextChange = true;
    return fn().finally(() => {
      // Delay re-enabling to account for file system event propagation
      setTimeout(() => {
        this.ignoreNextChange = false;
      }, 200);
    });
  }

  private scheduleFlush(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      const changes = [...this.pendingChanges];
      this.pendingChanges = [];
      this.debounceTimer = null;
      if (changes.length > 0) {
        this._onDidChange.fire(changes);
      }
    }, this.DEBOUNCE_MS);
  }

  dispose(): void {
    this.watcher?.dispose();
    this.watcher = null;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this._onDidChange.dispose();
  }
}
