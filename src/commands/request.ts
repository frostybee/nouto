import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { RequestEditorProvider } from '../providers/RequestEditorProvider';
import type { SavedRequest } from '../services/types';

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
 * Register the newRequest command - creates a new untitled .hfetch file
 */
export function registerNewRequestCommand(): vscode.Disposable {
  return vscode.commands.registerCommand('hivefetch.newRequest', async () => {
    const tempDir = getTempDir();
    let uri: vscode.Uri;

    if (tempDir) {
      const fileName = `request-${Date.now()}.hfetch`;
      uri = vscode.Uri.file(path.join(tempDir, fileName));

      const defaultRequest = {
        id: `${Date.now()}`,
        name: 'New Request',
        method: 'GET',
        url: '',
        params: [],
        headers: [],
        auth: { type: 'none' },
        body: { type: 'none', content: '' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(uri.fsPath, JSON.stringify(defaultRequest, null, 2));
    } else {
      uri = vscode.Uri.parse('untitled:New Request.hfetch');
    }

    await vscode.commands.executeCommand(
      'vscode.openWith',
      uri,
      RequestEditorProvider.viewType
    );
  });
}

/**
 * Register the openRequest command - opens a saved request from collections
 */
export function registerOpenRequestCommand(): vscode.Disposable {
  return vscode.commands.registerCommand(
    'hivefetch.openRequest',
    async (request: SavedRequest, _collectionId: string) => {
      const tempDir = getTempDir();

      if (tempDir) {
        const fileName = `${request.id}.hfetch`;
        const uri = vscode.Uri.file(path.join(tempDir, fileName));

        fs.writeFileSync(uri.fsPath, JSON.stringify(request, null, 2));

        await vscode.commands.executeCommand(
          'vscode.openWith',
          uri,
          RequestEditorProvider.viewType
        );
      }
    }
  );
}
