import * as vscode from 'vscode';
import type { Collection, SavedRequest, Folder, CollectionItem, RequestKind } from '../../services/types';
import { isFolder, isRequest, getDefaultsForRequestKind, REQUEST_KIND } from '../../services/types';
import { RecentCollectionService } from '@hivefetch/core/services';
import { confirmAction } from '../confirmAction';
import {
  generateId, findRequestInCollection, findRequestAcrossCollections,
  addItemToContainer, insertAfterItem, removeItemFromTree, duplicateItemsRecursive,
  getAllRequestsFromItems, findFolderRecursive, countAllItems, deriveNameFromUrl,
} from './CollectionTreeOps';

const DEFAULT_HEADERS = [{ id: generateId(), key: 'User-Agent', value: 'HiveFetch', enabled: true }];

export interface ISidebarContext {
  collections: Collection[];
  storageService: {
    saveCollections(collections: Collection[]): Promise<any>;
  };
  panelManager?: {
    closePanelsByRequestIds(ids: Set<string>): void;
    openNewRequest(options: any): void;
  };
  extensionUri: vscode.Uri;
  notifyCollectionsUpdated(): void;
}

export class CollectionCrudHandler {
  constructor(private readonly ctx: ISidebarContext) {}

  async createCollection(name?: string): Promise<void> {
    const collectionName = name || await vscode.window.showInputBox({
      prompt: 'Collection name',
      placeHolder: 'My Collection',
    });

    if (!collectionName) return;

    const collection: Collection = {
      id: generateId(),
      name: collectionName,
      items: [],
      expanded: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.ctx.collections.push(collection);
    await this.ctx.storageService.saveCollections(this.ctx.collections);
    this.ctx.notifyCollectionsUpdated();
  }

  async renameCollection(id: string, name: string): Promise<void> {
    const collection = this.ctx.collections.find(c => c.id === id);
    if (!collection) return;

    collection.name = name;
    collection.updatedAt = new Date().toISOString();
    await this.ctx.storageService.saveCollections(this.ctx.collections);
    this.ctx.notifyCollectionsUpdated();
  }

  async deleteCollection(id: string): Promise<void> {
    const collection = this.ctx.collections.find(c => c.id === id);
    if (!collection) return;

    if (RecentCollectionService.isRecentCollection(collection)) {
      vscode.window.showWarningMessage('Cannot delete the Recent collection. Use "Clear All" instead.');
      return;
    }

    const confirmed = await confirmAction(`Delete collection "${collection.name}"?`, 'Delete');
    if (!confirmed) return;

    const requestIds = new Set(
      getAllRequestsFromItems(collection.items).map(r => r.id)
    );

    const idx = this.ctx.collections.findIndex(c => c.id === id);
    if (idx !== -1) this.ctx.collections.splice(idx, 1);
    await this.ctx.storageService.saveCollections(this.ctx.collections);
    this.ctx.notifyCollectionsUpdated();

    if (requestIds.size > 0) {
      this.ctx.panelManager?.closePanelsByRequestIds(requestIds);
    }
  }

  async duplicateCollection(id: string): Promise<void> {
    const collection = this.ctx.collections.find(c => c.id === id);
    if (!collection) return;

    const duplicate: Collection = {
      ...collection,
      id: generateId(),
      name: `${collection.name} (copy)`,
      builtin: undefined,
      items: duplicateItemsRecursive(collection.items),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.ctx.collections.push(duplicate);
    await this.ctx.storageService.saveCollections(this.ctx.collections);
    this.ctx.notifyCollectionsUpdated();
  }

  async createRequest(collectionId: string, parentFolderId?: string, openInPanel: boolean = true, requestKind: RequestKind = REQUEST_KIND.HTTP): Promise<void> {
    const collection = this.ctx.collections.find(c => c.id === collectionId);
    if (!collection) {
      vscode.window.showErrorMessage('Collection not found');
      return;
    }

    const defaults = getDefaultsForRequestKind(requestKind);
    const request: SavedRequest = {
      type: 'request',
      id: generateId(),
      name: defaults.name,
      method: defaults.method,
      url: defaults.url,
      params: [],
      headers: [...DEFAULT_HEADERS],
      auth: { type: 'none' },
      body: defaults.body,
      connectionMode: defaults.connectionMode,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    collection.items = addItemToContainer(collection.items, request, parentFolderId);
    collection.updatedAt = new Date().toISOString();
    await this.ctx.storageService.saveCollections(this.ctx.collections);
    this.ctx.notifyCollectionsUpdated();

    if (openInPanel) {
      await vscode.commands.executeCommand('hivefetch.openRequest', request, collectionId, request.connectionMode);
    }
  }

  async createRequestFromUrl(url: string): Promise<void> {
    const targetCollection = await this.getTargetCollection();
    if (!targetCollection) return;

    let requestKind: RequestKind = REQUEST_KIND.HTTP;
    if (url.startsWith('ws://') || url.startsWith('wss://')) {
      requestKind = REQUEST_KIND.WEBSOCKET;
    }

    if (targetCollection === 'no-collection') {
      if (!this.ctx.panelManager) {
        vscode.window.showErrorMessage('Panel manager not initialized');
        return;
      }
      this.ctx.panelManager.openNewRequest({ requestKind, initialUrl: url });
      return;
    }

    const defaults = getDefaultsForRequestKind(requestKind);
    const request: SavedRequest = {
      type: 'request',
      id: generateId(),
      name: deriveNameFromUrl(url),
      method: defaults.method,
      url,
      params: [],
      headers: [...DEFAULT_HEADERS],
      auth: { type: 'none' },
      body: defaults.body,
      connectionMode: defaults.connectionMode,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    targetCollection.items.push(request);
    targetCollection.updatedAt = new Date().toISOString();
    await this.ctx.storageService.saveCollections(this.ctx.collections);
    this.ctx.notifyCollectionsUpdated();

    await vscode.commands.executeCommand('hivefetch.openRequest', request, targetCollection.id, request.connectionMode);
    vscode.window.showInformationMessage(`Request created in "${targetCollection.name}" collection`);
  }

  async deleteRequest(requestId: string): Promise<void> {
    const found = findRequestAcrossCollections(this.ctx.collections, requestId);
    if (!found) return;

    const { collection, request } = found;
    const confirmed = await confirmAction(`Delete request "${request.name}"?`, 'Delete');
    if (!confirmed) return;

    collection.items = removeItemFromTree(collection.items, requestId);
    collection.updatedAt = new Date().toISOString();
    await this.ctx.storageService.saveCollections(this.ctx.collections);
    this.ctx.notifyCollectionsUpdated();

    this.ctx.panelManager?.closePanelsByRequestIds(new Set([requestId]));
  }

  async duplicateRequest(requestId: string): Promise<void> {
    const found = findRequestAcrossCollections(this.ctx.collections, requestId);
    if (!found) return;

    const { collection, request } = found;
    const duplicate: SavedRequest = {
      ...request,
      id: generateId(),
      name: `${request.name} (copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    collection.items = insertAfterItem(collection.items, requestId, duplicate);
    collection.updatedAt = new Date().toISOString();
    await this.ctx.storageService.saveCollections(this.ctx.collections);
    this.ctx.notifyCollectionsUpdated();
  }

  async duplicateFolder(folderId: string, collectionId: string): Promise<void> {
    const collection = this.ctx.collections.find(c => c.id === collectionId);
    if (!collection) return;

    const folder = findFolderRecursive(collection.items, folderId);
    if (!folder) return;

    const duplicate: Folder = {
      ...folder,
      id: generateId(),
      name: `${folder.name} (copy)`,
      children: duplicateItemsRecursive(folder.children),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    collection.items.push(duplicate);
    collection.updatedAt = new Date().toISOString();
    await this.ctx.storageService.saveCollections(this.ctx.collections);
    this.ctx.notifyCollectionsUpdated();
  }

  async exportFolder(folderId: string, collectionId: string): Promise<void> {
    const collection = this.ctx.collections.find(c => c.id === collectionId);
    if (!collection) return;

    const folder = findFolderRecursive(collection.items, folderId);
    if (!folder) return;

    const tempCollection: Collection = {
      id: generateId(),
      name: folder.name,
      items: folder.children,
      expanded: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.ctx.collections.push(tempCollection);
    try {
      await vscode.commands.executeCommand('hivefetch.exportPostman', tempCollection.id);
    } finally {
      const idx = this.ctx.collections.findIndex(c => c.id === tempCollection.id);
      if (idx !== -1) this.ctx.collections.splice(idx, 1);
      this.ctx.notifyCollectionsUpdated();
    }
  }

  async deleteFolder(folderId: string, collectionId: string): Promise<void> {
    const collection = this.ctx.collections.find(c => c.id === collectionId);
    if (!collection) return;

    const folder = findFolderRecursive(collection.items, folderId);
    if (!folder) return;

    const confirmed = await confirmAction(`Delete folder "${folder.name}"?`, 'Delete');
    if (!confirmed) return;

    const requestIds = new Set(
      getAllRequestsFromItems(folder.children).map(r => r.id)
    );

    collection.items = removeItemFromTree(collection.items, folderId);
    collection.updatedAt = new Date().toISOString();
    await this.ctx.storageService.saveCollections(this.ctx.collections);
    this.ctx.notifyCollectionsUpdated();

    if (requestIds.size > 0) {
      this.ctx.panelManager?.closePanelsByRequestIds(requestIds);
    }
  }

  async bulkDelete(itemIds: string[], collectionId: string): Promise<void> {
    const collection = this.ctx.collections.find(c => c.id === collectionId);
    if (!collection || itemIds.length === 0) return;

    const confirmed = await confirmAction(
      `Delete ${itemIds.length} item${itemIds.length > 1 ? 's' : ''}?`,
      'Delete'
    );
    if (!confirmed) return;

    // Collect all affected request IDs (including children of selected folders)
    const affectedRequestIds = new Set<string>();
    for (const id of itemIds) {
      const folder = findFolderRecursive(collection.items, id);
      if (folder) {
        for (const r of getAllRequestsFromItems(folder.children)) {
          affectedRequestIds.add(r.id);
        }
      }
      // Also check if item itself is a request
      const found = findRequestInCollection(collection, id);
      if (found) {
        affectedRequestIds.add(id);
      }
    }

    // Remove each item from the tree
    for (const id of itemIds) {
      collection.items = removeItemFromTree(collection.items, id);
    }

    collection.updatedAt = new Date().toISOString();
    await this.ctx.storageService.saveCollections(this.ctx.collections);
    this.ctx.notifyCollectionsUpdated();

    if (affectedRequestIds.size > 0) {
      this.ctx.panelManager?.closePanelsByRequestIds(affectedRequestIds);
    }
  }

  async bulkMovePickTarget(itemIds: string[], sourceCollectionId: string): Promise<void> {
    const sourceCollection = this.ctx.collections.find(c => c.id === sourceCollectionId);
    if (!sourceCollection || itemIds.length === 0) return;

    // Build QuickPick items for target locations
    interface MoveTargetItem extends vscode.QuickPickItem {
      targetCollectionId: string;
      targetFolderId?: string;
    }

    const targets: MoveTargetItem[] = [];

    for (const col of this.ctx.collections) {
      if (col.builtin) continue;

      // Collection root
      targets.push({
        label: `$(folder) ${col.name}`,
        description: col.id === sourceCollectionId ? '(current)' : undefined,
        targetCollectionId: col.id,
      });

      // Add folders recursively
      const addFolders = (items: CollectionItem[], depth: number) => {
        for (const item of items) {
          if (isFolder(item)) {
            // Don't offer selected items as targets
            if (itemIds.includes(item.id)) continue;
            const indent = '  '.repeat(depth);
            targets.push({
              label: `${indent}$(folder) ${item.name}`,
              targetCollectionId: col.id,
              targetFolderId: item.id,
            });
            addFolders(item.children, depth + 1);
          }
        }
      };
      addFolders(col.items, 1);
    }

    const selected = await vscode.window.showQuickPick(targets, {
      placeHolder: `Move ${itemIds.length} item${itemIds.length > 1 ? 's' : ''} to...`,
    });

    if (!selected) return;

    // Remove items from source and add to target
    const removedItems: CollectionItem[] = [];
    for (const id of itemIds) {
      // Find the item before removing
      const folder = findFolderRecursive(sourceCollection.items, id);
      const request = findRequestInCollection(sourceCollection, id);
      const item = folder || request;
      if (item) {
        removedItems.push(item as CollectionItem);
        sourceCollection.items = removeItemFromTree(sourceCollection.items, id);
      }
    }

    // Add to target
    const targetCollection = this.ctx.collections.find(c => c.id === selected.targetCollectionId);
    if (!targetCollection) return;

    if (selected.targetFolderId) {
      const targetFolder = findFolderRecursive(targetCollection.items, selected.targetFolderId);
      if (targetFolder) {
        targetFolder.children.push(...removedItems);
      }
    } else {
      targetCollection.items.push(...removedItems);
    }

    sourceCollection.updatedAt = new Date().toISOString();
    targetCollection.updatedAt = new Date().toISOString();
    await this.ctx.storageService.saveCollections(this.ctx.collections);
    this.ctx.notifyCollectionsUpdated();
  }

  // --- Public API methods used by external code ---

  async addRequest(
    collectionId: string,
    request: Omit<SavedRequest, 'id' | 'createdAt' | 'updatedAt'>,
    parentFolderId?: string
  ): Promise<SavedRequest> {
    const collection = this.ctx.collections.find(c => c.id === collectionId);
    if (!collection) {
      throw new Error('Collection not found');
    }

    const newRequest: SavedRequest = {
      ...request,
      type: 'request',
      id: generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    collection.items = addItemToContainer(collection.items, newRequest, parentFolderId);
    collection.updatedAt = new Date().toISOString();
    await this.ctx.storageService.saveCollections(this.ctx.collections);
    this.ctx.notifyCollectionsUpdated();
    return newRequest;
  }

  async createRequestInCollection(
    collectionId: string,
    folderId?: string,
    requestKind: RequestKind = REQUEST_KIND.HTTP
  ): Promise<{ request: SavedRequest; collectionId: string; connectionMode: string }> {
    const collection = this.ctx.collections.find(c => c.id === collectionId);
    if (!collection) throw new Error('Collection not found');

    const defaults = getDefaultsForRequestKind(requestKind);
    const request: SavedRequest = {
      type: 'request',
      id: generateId(),
      name: defaults.name,
      method: defaults.method,
      url: defaults.url,
      params: [],
      headers: [...DEFAULT_HEADERS],
      auth: { type: 'none' },
      body: defaults.body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    collection.items = addItemToContainer(collection.items, request, folderId);
    collection.updatedAt = new Date().toISOString();
    await this.ctx.storageService.saveCollections(this.ctx.collections);
    this.ctx.notifyCollectionsUpdated();
    return { request, collectionId, connectionMode: defaults.connectionMode };
  }

  async createCollectionAndAddRequest(
    name: string,
    requestKind: RequestKind = REQUEST_KIND.HTTP
  ): Promise<{ collectionId: string; request: SavedRequest; connectionMode: string }> {
    const defaults = getDefaultsForRequestKind(requestKind);
    const request: SavedRequest = {
      type: 'request',
      id: generateId(),
      name: defaults.name,
      method: defaults.method,
      url: defaults.url,
      params: [],
      headers: [...DEFAULT_HEADERS],
      auth: { type: 'none' },
      body: defaults.body,
      connectionMode: defaults.connectionMode,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const collection: Collection = {
      id: generateId(),
      name,
      items: [request],
      expanded: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.ctx.collections.push(collection);
    await this.ctx.storageService.saveCollections(this.ctx.collections);
    this.ctx.notifyCollectionsUpdated();
    return { collectionId: collection.id, request, connectionMode: defaults.connectionMode };
  }

  async createEmptyCollection(name: string): Promise<void> {
    const duplicate = this.ctx.collections.some(c => c.name.toLowerCase() === name.toLowerCase() && !c.builtin);
    if (duplicate) {
      vscode.window.showWarningMessage(`A collection named "${name}" already exists.`);
      return;
    }
    const collection: Collection = {
      id: generateId(),
      name,
      items: [],
      expanded: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.ctx.collections.push(collection);
    await this.ctx.storageService.saveCollections(this.ctx.collections);
    this.ctx.notifyCollectionsUpdated();
  }

  // --- Private helpers ---

  private async getTargetCollection(): Promise<Collection | null | 'no-collection'> {
    interface CollectionQuickPickItem extends vscode.QuickPickItem {
      action: 'no-collection' | 'new-collection' | 'select-collection';
      collection?: Collection;
    }

    const userCollections = this.ctx.collections.filter(c => !c.builtin);

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

    if (userCollections.length > 0) {
      items.push({ label: '', kind: vscode.QuickPickItemKind.Separator, action: 'no-collection' } as any);

      for (const collection of userCollections) {
        const itemCount = countAllItems(collection.items);
        items.push({
          label: `$(folder) ${collection.name}`,
          description: `${itemCount} item${itemCount !== 1 ? 's' : ''}`,
          action: 'select-collection',
          collection,
        });
      }
    }

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Where should this request be saved?',
    });

    if (!selected) return null;

    switch (selected.action) {
      case 'no-collection':
        return 'no-collection';

      case 'new-collection': {
        const name = await vscode.window.showInputBox({
          prompt: 'Collection name',
          placeHolder: 'My Collection',
        });

        if (!name) return null;

        const collection: Collection = {
          id: generateId(),
          name,
          items: [],
          expanded: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        this.ctx.collections.push(collection);
        await this.ctx.storageService.saveCollections(this.ctx.collections);
        this.ctx.notifyCollectionsUpdated();
        return collection;
      }

      case 'select-collection':
        return selected.collection!;

      default:
        return null;
    }
  }
}
