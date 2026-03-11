import * as vscode from 'vscode';
import type { RequestPanelManager } from '../providers/RequestPanelManager';
import type { SidebarViewProvider } from '../providers/SidebarViewProvider';
import type { SavedRequest, Collection, Folder, RequestKind } from '../services/types';
import { isFolder, REQUEST_KIND } from '../services/types';
import type { QuickPickItem } from '../services/UIService';

const requestTypeItems: (QuickPickItem & { requestKind: RequestKind })[] = [
  { label: 'HTTP Request', value: REQUEST_KIND.HTTP, description: 'REST API call', requestKind: REQUEST_KIND.HTTP },
  { label: 'GraphQL Request', value: REQUEST_KIND.GRAPHQL, description: 'GraphQL query', requestKind: REQUEST_KIND.GRAPHQL },
  { label: 'WebSocket', value: REQUEST_KIND.WEBSOCKET, description: 'Real-time bidirectional connection', requestKind: REQUEST_KIND.WEBSOCKET },
  { label: 'SSE', value: REQUEST_KIND.SSE, description: 'Server-Sent Events stream', requestKind: REQUEST_KIND.SSE },
];

interface CollectionPickItem extends QuickPickItem {
  action: 'no-collection' | 'new-collection' | 'select-collection' | 'select-folder';
  kind?: 'separator';
  icon?: string;
  accent?: boolean;
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
      value: '_sep_quick',
      kind: 'separator',
      action: 'no-collection',
    },
    {
      label: 'No Collection (Quick Request)',
      value: 'no-collection',
      description: 'Saved to History after sending',
      action: 'no-collection',
    },
    {
      label: 'Collections',
      value: '_sep_collections',
      kind: 'separator',
      action: 'no-collection',
    },
    {
      label: 'Create New Collection...',
      value: 'new-collection',
      icon: 'codicon-new-folder',
      accent: true,
      action: 'new-collection',
    },
    {
      label: '',
      value: '_sep_existing',
      kind: 'separator',
      action: 'no-collection',
    },
  ];

  for (const collection of collections) {
    const itemCount = countAllItems(collection.items);
    items.push({
      label: collection.name,
      value: `collection:${collection.id}`,
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
        value: `folder:${child.id}`,
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
  return vscode.commands.registerCommand('hivefetch.newRequest', async (preselectedKind?: RequestKind) => {
    const uiService = sidebarProvider.uiService;
    if (!uiService) {
      // Fallback: open a plain request if sidebar isn't ready
      panelManager.openNewRequest();
      return;
    }

    // Step 1: Select request type (skip if already provided via dropdown)
    let requestKind: RequestKind;
    if (preselectedKind) {
      requestKind = preselectedKind;
    } else {
      const typeValue = await uiService.showQuickPick({
        title: 'New Request',
        items: requestTypeItems.map(i => ({ label: i.label, value: i.value, description: i.description })),
      });
      if (!typeValue || typeof typeValue !== 'string') return;
      requestKind = typeValue as RequestKind;
    }

    // Step 2: Select where to save
    await sidebarProvider.whenReady();
    const collections = sidebarProvider.getCollections();
    const quickPickItems = buildQuickPickItems(collections);

    const selectedValue = await uiService.showQuickPick({
      title: 'New Request',
      items: quickPickItems.map(i => ({ label: i.label, value: i.value, description: i.description, kind: i.kind, icon: i.icon, accent: i.accent })),
    });

    if (!selectedValue || typeof selectedValue !== 'string') return;

    // Find the selected item by its value
    const selected = quickPickItems.find(i => i.value === selectedValue);
    if (!selected) return;

    switch (selected.action) {
      case 'no-collection':
        panelManager.openNewRequest({ requestKind });
        break;

      case 'new-collection': {
        const result = await uiService.showCreateItemDialog('collection');
        if (!result) return;

        const { collectionId, request, connectionMode } = await sidebarProvider.createCollectionAndAddRequest(result.name, requestKind, result.color, result.icon);
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
 */
export function registerCreateRequestFromUrlCommand(sidebarProvider: SidebarViewProvider): vscode.Disposable {
  return vscode.commands.registerCommand(
    'hivefetch.createRequestFromUrl',
    async (url: string) => {
      await sidebarProvider.createRequestFromUrl(url);
    }
  );
}
