import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { RequestEditorProvider } from '../providers/RequestEditorProvider';
import type { SavedRequest, HistoryEntry } from '../services/types';

/**
 * Ensures the temp directory exists and returns its path
 */
function getTempDir(): string | undefined {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return undefined;
  }

  const tempDir = path.join(
    workspaceFolders[0].uri.fsPath,
    '.vscode',
    'hivefetch',
    'temp'
  );

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  return tempDir;
}

/**
 * Creates a temp file for a history entry and returns the URI
 * @param entry - The history entry to create a temp file for
 * @param options - Optional settings: autoRun triggers immediate execution, newTab creates a unique file
 */
function createHistoryTempFile(
  entry: HistoryEntry,
  options?: { autoRun?: boolean; newTab?: boolean }
): vscode.Uri | undefined {
  const tempDir = getTempDir();
  if (!tempDir) return undefined;

  const request: SavedRequest & { autoRun?: boolean } = {
    id: `history-${entry.id}`,
    name: `${entry.method} ${new URL(entry.url).pathname}`,
    method: entry.method,
    url: entry.url,
    params: entry.params,
    headers: entry.headers,
    auth: entry.auth,
    body: entry.body,
    createdAt: entry.timestamp,
    updatedAt: new Date().toISOString(),
  };

  // Add autoRun flag if specified
  if (options?.autoRun) {
    request.autoRun = true;
  }

  // Use unique filename for new tab to prevent VS Code from reusing existing editor
  const suffix = options?.newTab ? `-${Date.now()}` : '';
  const fileName = `history-${entry.id}${suffix}.hfetch`;
  const uri = vscode.Uri.file(path.join(tempDir, fileName));
  fs.writeFileSync(uri.fsPath, JSON.stringify(request, null, 2));

  return uri;
}

/**
 * Register the openHistoryEntry command - opens a history entry in the editor
 */
export function registerOpenHistoryEntryCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    'hivefetch.openHistoryEntry',
    async (entry: HistoryEntry, newTab?: boolean) => {
      const uri = createHistoryTempFile(entry, { newTab });
      if (!uri) return;

      if (newTab) {
        // Open in a new editor tab (beside the current one)
        await vscode.commands.executeCommand(
          'vscode.openWith',
          uri,
          RequestEditorProvider.viewType,
          vscode.ViewColumn.Beside
        );
      } else {
        // Open in the current/active editor
        await vscode.commands.executeCommand(
          'vscode.openWith',
          uri,
          RequestEditorProvider.viewType
        );
      }
    }
  );
}

/**
 * Register the runHistoryEntry command - opens and immediately runs a history entry
 */
export function registerRunHistoryEntryCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    'hivefetch.runHistoryEntry',
    async (entry: HistoryEntry) => {
      // Create temp file with autoRun flag
      const uri = createHistoryTempFile(entry, { autoRun: true });
      if (!uri) return;

      // Open the entry - the webview will auto-send due to autoRun flag
      await vscode.commands.executeCommand(
        'vscode.openWith',
        uri,
        RequestEditorProvider.viewType
      );
    }
  );
}
