import * as vscode from 'vscode';
import type { RequestPanelManager } from '../providers/RequestPanelManager';
import type { SidebarViewProvider } from '../providers/SidebarViewProvider';
import type { SavedRequest, Collection, Folder, RequestKind } from '../services/types';
import { isFolder, REQUEST_KIND } from '../services/types';

interface CollectionQuickPickItem extends vscode.QuickPickItem {
  action: 'no-collection' | 'new-collection' | 'select-collection' | 'select-folder';
  collectionId?: string;
  folderId?: string;
}

interface RequestTypeQuickPickItem extends vscode.QuickPickItem {
  requestKind: RequestKind;
}

const requestTypeItems: RequestTypeQuickPickItem[] = [
  { label: '$(globe) HTTP Request', description: 'REST API call', requestKind: REQUEST_KIND.HTTP },
  { label: '$(symbol-structure) GraphQL Request', description: 'GraphQL query', requestKind: REQUEST_KIND.GRAPHQL },
  { label: '$(plug) WebSocket', description: 'Real-time bidirectional connection', requestKind: REQUEST_KIND.WEBSOCKET },
  { label: '$(broadcast) SSE', description: 'Server-Sent Events stream', requestKind: REQUEST_KIND.SSE },
];

/**
 * Build flat QuickPick items from the collection/folder tree
 */
function buildQuickPickItems(collections: Collection[]): CollectionQuickPickItem[] {
  const items: CollectionQuickPickItem[] = [
    {
      label: '$(file) No Collection (Quick Request)',
      description: 'Saved to History after sending',
      action: 'no-collection',
    },
    {
      label: '$(new-folder) Create New Collection...',
      action: 'new-collection',
    },
  ];

  if (collections.length > 0) {
    items.push({ label: '', kind: vscode.QuickPickItemKind.Separator, action: 'no-collection' });
  }

  for (const collection of collections) {
    const itemCount = countAllItems(collection.items);
    items.push({
      label: `$(folder) ${collection.name}`,
      description: `${itemCount} item${itemCount !== 1 ? 's' : ''}`,
      action: 'select-collection',
      collectionId: collection.id,
    });

    // Add folders nested under collection
    addFolderItems(items, collection.items, collection.id, collection.name, 1);
  }

  return items;
}

function addFolderItems(
  items: CollectionQuickPickItem[],
  children: (SavedRequest | Folder)[],
  collectionId: string,
  parentPath: string,
  depth: number
): void {
  for (const child of children) {
    if (isFolder(child)) {
      const indent = '  '.repeat(depth);
      items.push({
        label: `${indent}$(folder) ${child.name}`,
        description: `in ${parentPath}`,
        action: 'select-folder',
        collectionId,
        folderId: child.id,
      });
      addFolderItems(items, child.children, collectionId, child.name, depth + 1);
    }
  }
}

function countAllItems(items: (SavedRequest | Folder)[]): number {
  let count = 0;
  for (const item of items) {
    if (isFolder(item)) {
      count += countAllItems(item.children);
    } else {
      count++;
    }
  }
  return count;
}

/**
 * Register the newRequest command - shows QuickPick for type + collection selection
 */
export function registerNewRequestCommand(
  panelManager: RequestPanelManager,
  sidebarProvider: SidebarViewProvider
): vscode.Disposable {
  return vscode.commands.registerCommand('hivefetch.newRequest', async () => {
    // Step 1: Select request type
    const typeSelection = await vscode.window.showQuickPick(requestTypeItems, {
      placeHolder: 'Select request type',
      title: 'New Request',
    });
    if (!typeSelection) return;
    const requestKind = typeSelection.requestKind;

    // Step 2: Select where to save
    await sidebarProvider.whenReady();
    const collections = sidebarProvider.getCollections();

    const quickPickItems = buildQuickPickItems(collections);

    const selected = await vscode.window.showQuickPick(quickPickItems, {
      placeHolder: 'Where should this request be saved?',
      title: 'New Request',
    });

    if (!selected) return; // User cancelled

    switch (selected.action) {
      case 'no-collection':
        panelManager.openNewRequest({ requestKind });
        break;

      case 'new-collection': {
        const name = await vscode.window.showInputBox({
          prompt: 'Collection name',
          placeHolder: 'My Collection',
        });
        if (!name) return;

        const { collectionId, request, connectionMode } = await sidebarProvider.createCollectionAndAddRequest(name, requestKind);
        panelManager.openSavedRequest(request, collectionId, { connectionMode });
        break;
      }

      case 'select-collection':
      case 'select-folder': {
        const { request, collectionId, connectionMode } = await sidebarProvider.createRequestInCollection(
          selected.collectionId!,
          selected.folderId,
          requestKind
        );
        panelManager.openSavedRequest(request, collectionId, { connectionMode });
        break;
      }
    }
  });
}

/**
 * Register the openRequest command - opens a saved request from collections
 */
export function registerOpenRequestCommand(panelManager: RequestPanelManager): vscode.Disposable {
  return vscode.commands.registerCommand(
    'hivefetch.openRequest',
    async (request: SavedRequest, collectionId: string, connectionMode?: string) => {
      panelManager.openSavedRequest(request, collectionId, { connectionMode });
    }
  );
}
