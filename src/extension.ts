import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { StorageService } from './services/StorageService';
import { HistoryTreeProvider, HistoryTreeItem } from './providers/HistoryTreeProvider';
import { CollectionsTreeProvider, CollectionItem, RequestItem } from './providers/CollectionsTreeProvider';
import { RequestEditorProvider } from './providers/RequestEditorProvider';
import type { SavedRequest, HistoryEntry } from './services/types';

export function activate(context: vscode.ExtensionContext) {
  console.log('HiveFetch extension is now active!');

  // Initialize storage service
  const storageService = new StorageService();

  // Initialize tree providers
  const historyProvider = new HistoryTreeProvider(storageService);
  const collectionsProvider = new CollectionsTreeProvider(storageService);

  // Register tree views
  const historyView = vscode.window.createTreeView('hivefetch.history', {
    treeDataProvider: historyProvider,
    showCollapseAll: true,
  });

  const collectionsView = vscode.window.createTreeView('hivefetch.collections', {
    treeDataProvider: collectionsProvider,
    showCollapseAll: true,
    canSelectMany: false,
  });

  // Register custom editor
  const editorProvider = RequestEditorProvider.register(
    context,
    historyProvider,
    collectionsProvider
  );

  // ============================================
  // Register Commands
  // ============================================

  // New Request - creates a new untitled .hfetch file
  const newRequestCommand = vscode.commands.registerCommand(
    'hivefetch.newRequest',
    async () => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      let uri: vscode.Uri;

      if (workspaceFolders && workspaceFolders.length > 0) {
        // Create in .vscode/hivefetch/temp directory
        const tempDir = path.join(
          workspaceFolders[0].uri.fsPath,
          '.vscode',
          'hivefetch',
          'temp'
        );

        // Ensure directory exists
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        const fileName = `request-${Date.now()}.hfetch`;
        uri = vscode.Uri.file(path.join(tempDir, fileName));

        // Create empty file with default request
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
        // Fallback to untitled document
        uri = vscode.Uri.parse('untitled:New Request.hfetch');
      }

      await vscode.commands.executeCommand(
        'vscode.openWith',
        uri,
        RequestEditorProvider.viewType
      );
    }
  );

  // Open Request from Collections
  const openRequestCommand = vscode.commands.registerCommand(
    'hivefetch.openRequest',
    async (request: SavedRequest, collectionId: string) => {
      const workspaceFolders = vscode.workspace.workspaceFolders;

      if (workspaceFolders && workspaceFolders.length > 0) {
        const tempDir = path.join(
          workspaceFolders[0].uri.fsPath,
          '.vscode',
          'hivefetch',
          'temp'
        );

        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        const fileName = `${request.id}.hfetch`;
        const uri = vscode.Uri.file(path.join(tempDir, fileName));

        // Write request data to file
        fs.writeFileSync(uri.fsPath, JSON.stringify(request, null, 2));

        await vscode.commands.executeCommand(
          'vscode.openWith',
          uri,
          RequestEditorProvider.viewType
        );
      }
    }
  );

  // Open History Entry
  const openHistoryEntryCommand = vscode.commands.registerCommand(
    'hivefetch.openHistoryEntry',
    async (entry: HistoryEntry) => {
      const workspaceFolders = vscode.workspace.workspaceFolders;

      if (workspaceFolders && workspaceFolders.length > 0) {
        const tempDir = path.join(
          workspaceFolders[0].uri.fsPath,
          '.vscode',
          'hivefetch',
          'temp'
        );

        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        // Convert history entry to request format
        const request: SavedRequest = {
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

        const fileName = `history-${entry.id}.hfetch`;
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

  // Refresh History
  const refreshHistoryCommand = vscode.commands.registerCommand(
    'hivefetch.refreshHistory',
    () => {
      historyProvider.refresh();
    }
  );

  // Clear History
  const clearHistoryCommand = vscode.commands.registerCommand(
    'hivefetch.clearHistory',
    async () => {
      const confirm = await vscode.window.showWarningMessage(
        'Clear all history entries?',
        { modal: true },
        'Clear'
      );
      if (confirm === 'Clear') {
        await historyProvider.clear();
      }
    }
  );

  // Delete History Entry
  const deleteHistoryEntryCommand = vscode.commands.registerCommand(
    'hivefetch.deleteHistoryEntry',
    async (item: HistoryTreeItem) => {
      await historyProvider.deleteEntry(item.entry.id);
    }
  );

  // Refresh Collections
  const refreshCollectionsCommand = vscode.commands.registerCommand(
    'hivefetch.refreshCollections',
    () => {
      collectionsProvider.refresh();
    }
  );

  // New Collection
  const newCollectionCommand = vscode.commands.registerCommand(
    'hivefetch.newCollection',
    async () => {
      const name = await vscode.window.showInputBox({
        prompt: 'Collection name',
        placeHolder: 'My Collection',
      });
      if (name) {
        await collectionsProvider.addCollection(name);
      }
    }
  );

  // Delete Collection
  const deleteCollectionCommand = vscode.commands.registerCommand(
    'hivefetch.deleteCollection',
    async (item: CollectionItem) => {
      const confirm = await vscode.window.showWarningMessage(
        `Delete collection "${item.collection.name}"?`,
        { modal: true },
        'Delete'
      );
      if (confirm === 'Delete') {
        await collectionsProvider.deleteCollection(item.collection.id);
      }
    }
  );

  // Rename Collection
  const renameCollectionCommand = vscode.commands.registerCommand(
    'hivefetch.renameCollection',
    async (item: CollectionItem) => {
      const name = await vscode.window.showInputBox({
        prompt: 'New name',
        value: item.collection.name,
      });
      if (name) {
        await collectionsProvider.renameCollection(item.collection.id, name);
      }
    }
  );

  // Delete Request
  const deleteRequestCommand = vscode.commands.registerCommand(
    'hivefetch.deleteRequest',
    async (item: RequestItem) => {
      const confirm = await vscode.window.showWarningMessage(
        `Delete request "${item.request.name}"?`,
        { modal: true },
        'Delete'
      );
      if (confirm === 'Delete') {
        await collectionsProvider.deleteRequest(item.request.id);
      }
    }
  );

  // Duplicate Request
  const duplicateRequestCommand = vscode.commands.registerCommand(
    'hivefetch.duplicateRequest',
    async (item: RequestItem) => {
      await collectionsProvider.duplicateRequest(item.request.id);
    }
  );

  // Save Request to Collection
  const saveRequestCommand = vscode.commands.registerCommand(
    'hivefetch.saveRequest',
    async () => {
      const collections = collectionsProvider.getCollections();
      if (collections.length === 0) {
        const create = await vscode.window.showInformationMessage(
          'No collections found. Create one first?',
          'Create Collection'
        );
        if (create === 'Create Collection') {
          await vscode.commands.executeCommand('hivefetch.newCollection');
        }
        return;
      }

      const selected = await vscode.window.showQuickPick(
        collections.map((c) => ({
          label: c.name,
          description: `${c.requests.length} requests`,
          id: c.id,
        })),
        { placeHolder: 'Select a collection' }
      );

      if (selected) {
        vscode.window.showInformationMessage(
          `Request will be saved to "${selected.label}" when you save the file.`
        );
      }
    }
  );

  // Add all disposables to subscriptions
  context.subscriptions.push(
    historyView,
    collectionsView,
    editorProvider,
    newRequestCommand,
    openRequestCommand,
    openHistoryEntryCommand,
    refreshHistoryCommand,
    clearHistoryCommand,
    deleteHistoryEntryCommand,
    refreshCollectionsCommand,
    newCollectionCommand,
    deleteCollectionCommand,
    renameCollectionCommand,
    deleteRequestCommand,
    duplicateRequestCommand,
    saveRequestCommand
  );
}

export function deactivate() {
  console.log('HiveFetch extension is now deactivated!');
}
