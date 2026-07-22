import * as vscode from 'vscode';
import { debounce, type Debounced } from './debounce';
import { getOpenApiAnalysis } from './analysisCache';
import { buildSpecJs } from './standaloneDocs';

const UPDATE_DEBOUNCE_MS = 400;

interface SnapshotEntry {
  folder: vscode.Uri;
}

/**
 * Keeps "open documentation in browser" snapshots in sync with their source
 * documents. After the command exports a snapshot folder, edits to the
 * document rewrite ONLY the small spec.js payload (the megabyte renderer
 * shell is written once by the command), so a browser reload — or the
 * shell's own poll loop — shows the current schema.
 *
 * Mirrors OpenApiDiagnosticsManager's lifecycle shape: per-URI trailing-edge
 * debounce on change, cleanup on document close, disposed via subscriptions.
 */
export class OpenApiDocsSnapshotManager implements vscode.Disposable {
  private readonly entries = new Map<string, SnapshotEntry>();
  private readonly debouncers = new Map<string, Debounced<[vscode.TextDocument]>>();
  private readonly disposables: vscode.Disposable[] = [];

  start(): void {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        const key = event.document.uri.toString();
        if (!this.entries.has(key)) return;
        let debounced = this.debouncers.get(key);
        if (!debounced) {
          debounced = debounce((document: vscode.TextDocument) => {
            void this.updateSpec(document);
          }, UPDATE_DEBOUNCE_MS);
          this.debouncers.set(key, debounced);
        }
        debounced(event.document);
      }),
      vscode.workspace.onDidCloseTextDocument((document) => {
        this.unregister(document.uri);
      })
    );
  }

  /** Called by the command after writing a snapshot folder for a document. */
  register(document: vscode.TextDocument, folder: vscode.Uri): void {
    this.entries.set(document.uri.toString(), { folder });
  }

  unregister(uri: vscode.Uri): void {
    const key = uri.toString();
    this.entries.delete(key);
    this.debouncers.get(key)?.cancel();
    this.debouncers.delete(key);
  }

  private async updateSpec(document: vscode.TextDocument): Promise<void> {
    const entry = this.entries.get(document.uri.toString());
    if (!entry) return;
    const analysis = getOpenApiAnalysis(document);
    // Parse failure keeps the last valid payload on disk — same stale
    // philosophy as the webview preview.
    if (!analysis.parsedSpec) return;
    try {
      await vscode.workspace.fs.writeFile(
        vscode.Uri.joinPath(entry.folder, 'spec.js'),
        new TextEncoder().encode(buildSpecJs(analysis.parsedSpec))
      );
    } catch {
      // Snapshot folder removed out from under us — stop updating silently;
      // re-running the command recreates it.
      this.unregister(document.uri);
    }
  }

  dispose(): void {
    for (const disposable of this.disposables) disposable.dispose();
    this.disposables.length = 0;
    for (const debounced of this.debouncers.values()) debounced.cancel();
    this.debouncers.clear();
    this.entries.clear();
  }
}
