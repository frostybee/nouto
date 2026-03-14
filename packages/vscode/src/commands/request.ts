import * as vscode from 'vscode';
import type { RequestPanelManager } from '../providers/RequestPanelManager';
import type { SidebarViewProvider } from '../providers/SidebarViewProvider';
import type { SavedRequest, Collection, Folder, RequestKind } from '../services/types';
import { isFolder, REQUEST_KIND } from '../services/types';

interface RequestTypeItem extends vscode.QuickPickItem {
  requestKind: RequestKind;
}

const requestTypeItems: RequestTypeItem[] = [
  { label: 'HTTP Request', description: 'REST API call', requestKind: REQUEST_KIND.HTTP },
  { label: 'GraphQL Request', description: 'GraphQL query', requestKind: REQUEST_KIND.GRAPHQL },
  { label: 'WebSocket', description: 'Real-time bidirectional connection', requestKind: REQUEST_KIND.WEBSOCKET },
  { label: 'SSE', description: 'Server-Sent Events stream', requestKind: REQUEST_KIND.SSE },
  { label: 'gRPC Call', description: 'Protocol Buffers RPC', requestKind: REQUEST_KIND.GRPC },
];

interface CollectionPickItem extends vscode.QuickPickItem {
  action: 'no-collection' | 'new-collection' | 'select-collection' | 'select-folder';
  collectionId?: string;
  folderId?: string;
}

/**
 * Build flat QuickPick items from the collection/folder tree
 */
function buildQuickPickItems(collections: Collection[]): CollectionPickItem[] {
  const items: CollectionPickItem[] = [
    {
      label: 'Quick Start',
      kind: vscode.QuickPickItemKind.Separator,
      action: 'no-collection',
    },
    {
      label: 'No Collection (Quick Request)',
      description: 'Saved to Drafts and History after sending',
      action: 'no-collection',
    },
    {
      label: 'Collections',
      kind: vscode.QuickPickItemKind.Separator,
      action: 'no-collection',
    },
    {
      label: '$(new-folder) Create New Collection...',
      action: 'new-collection',
    },
    {
      label: '',
      kind: vscode.QuickPickItemKind.Separator,
      action: 'no-collection',
    },
  ];

  for (const collection of collections) {
    const itemCount = countAllItems(collection.items);
    items.push({
      label: collection.name,
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
  items: CollectionPickItem[],
  children: (SavedRequest | Folder)[],
  collectionId: string,
  parentPath: string,
  depth: number
): void {
  for (const child of children) {
    if (isFolder(child)) {
      const indent = '\u00A0\u00A0'.repeat(depth);
      items.push({
        label: `${indent}${child.name}`,
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
 * Show a native VS Code QuickPick for collection/folder selection
 */
async function showCollectionPicker(
  title: string,
  collections: Collection[]
): Promise<CollectionPickItem | undefined> {
  const items = buildQuickPickItems(collections);
  return vscode.window.showQuickPick(items, {
    title,
    placeHolder: 'Select where to save the request',
  });
}

/**
 * Handle the "Create New Collection" action using native InputBox
 */
async function handleNewCollectionAction(
  sidebarProvider: SidebarViewProvider,
  panelManager: RequestPanelManager,
  requestKind: RequestKind,
  opts?: { initialUrl?: string }
): Promise<void> {
  const name = await vscode.window.showInputBox({
    prompt: 'Collection name',
    placeHolder: 'My Collection',
    validateInput: (value) => value.trim() ? null : 'Collection name is required',
  });
  if (!name) return;

  const { collectionId, request, connectionMode } = await sidebarProvider.createCollectionAndAddRequest(
    name, requestKind, undefined, undefined, opts
  );
  panelManager.openSavedRequest(request, collectionId, { connectionMode });
}

/**
 * Register the newRequest command - shows QuickPick for type + collection selection
 */
export function registerNewRequestCommand(
  panelManager: RequestPanelManager,
  sidebarProvider: SidebarViewProvider
): vscode.Disposable {
  return vscode.commands.registerCommand('hivefetch.newRequest', async (preselectedKind?: RequestKind) => {
    // Step 1: Select request type (skip if already provided via dropdown)
    let requestKind: RequestKind;
    if (preselectedKind) {
      requestKind = preselectedKind;
    } else {
      const picked = await vscode.window.showQuickPick(requestTypeItems, {
        title: 'New Request',
        placeHolder: 'Select request type',
      });
      if (!picked) return;
      requestKind = picked.requestKind;
    }

    // Step 2: Select where to save
    await sidebarProvider.whenReady();
    const collections = sidebarProvider.getCollections();
    const selected = await showCollectionPicker('New Request', collections);
    if (!selected) return;

    switch (selected.action) {
      case 'no-collection':
        panelManager.openNewRequest({ requestKind });
        break;

      case 'new-collection':
        await handleNewCollectionAction(sidebarProvider, panelManager, requestKind);
        break;

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
    async (request: SavedRequest, collectionId: string, connectionMode?: string, newTab?: boolean) => {
      panelManager.openSavedRequest(request, collectionId, {
        connectionMode,
        newTab,
      });
    }
  );
}

/**
 * Register the createRequestFromUrl command - creates a new request from a URL
 * Uses the same dialog flow as the newRequest command for consistency.
 */
export function registerCreateRequestFromUrlCommand(
  panelManager: RequestPanelManager,
  sidebarProvider: SidebarViewProvider
): vscode.Disposable {
  return vscode.commands.registerCommand(
    'hivefetch.createRequestFromUrl',
    async (url: string) => {
      // Auto-detect request kind from URL
      let requestKind: RequestKind = REQUEST_KIND.HTTP;
      if (url.startsWith('ws://') || url.startsWith('wss://')) {
        requestKind = REQUEST_KIND.WEBSOCKET;
      }

      // Show collection/folder picker
      await sidebarProvider.whenReady();
      const collections = sidebarProvider.getCollections();
      const selected = await showCollectionPicker('Save Request From URL', collections);
      if (!selected) return;

      switch (selected.action) {
        case 'no-collection':
          panelManager.openNewRequest({ requestKind, initialUrl: url });
          break;

        case 'new-collection':
          await handleNewCollectionAction(sidebarProvider, panelManager, requestKind, { initialUrl: url });
          break;

        case 'select-collection':
        case 'select-folder': {
          const { request, collectionId, connectionMode } = await sidebarProvider.createRequestInCollection(
            selected.collectionId!,
            selected.folderId,
            requestKind,
            { initialUrl: url }
          );
          panelManager.openSavedRequest(request, collectionId, { connectionMode });
          break;
        }
      }
    }
  );
}
