import * as vscode from 'vscode';
import { StorageService } from '../services/StorageService';
import type { Collection, SavedRequest, HttpMethod } from '../services/types';

type CollectionTreeNode = CollectionItem | RequestItem;

export class CollectionItem extends vscode.TreeItem {
  constructor(public readonly collection: Collection) {
    super(
      collection.name,
      collection.expanded
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed
    );

    this.iconPath = new vscode.ThemeIcon('folder');
    this.contextValue = 'collection';
    this.description = `${collection.requests.length} requests`;
    this.tooltip = new vscode.MarkdownString(
      `**${collection.name}**\n\n` +
        `${collection.requests.length} requests\n` +
        `Created: ${new Date(collection.createdAt).toLocaleDateString()}`
    );
  }
}

export class RequestItem extends vscode.TreeItem {
  constructor(
    public readonly request: SavedRequest,
    public readonly collectionId: string
  ) {
    super(request.name, vscode.TreeItemCollapsibleState.None);

    this.description = this.getDisplayUrl(request.url);
    this.tooltip = new vscode.MarkdownString(
      `**${request.method}** ${request.name}\n\n${request.url}`
    );
    this.iconPath = this.getMethodIcon(request.method);
    this.contextValue = 'request';

    // Open in custom editor on click
    this.command = {
      command: 'hivefetch.openRequest',
      title: 'Open Request',
      arguments: [request, collectionId],
    };
  }

  private getDisplayUrl(url: string): string {
    if (!url) return 'No URL';
    try {
      const urlObj = new URL(url);
      return urlObj.hostname + urlObj.pathname;
    } catch {
      return url;
    }
  }

  private getMethodIcon(method: HttpMethod): vscode.ThemeIcon {
    const colorMap: Record<HttpMethod, string> = {
      GET: 'testing.iconPassed',
      POST: 'charts.green',
      PUT: 'charts.orange',
      PATCH: 'charts.purple',
      DELETE: 'testing.iconFailed',
      HEAD: 'charts.yellow',
      OPTIONS: 'charts.gray',
    };

    return new vscode.ThemeIcon(
      'circle-filled',
      new vscode.ThemeColor(colorMap[method] || 'foreground')
    );
  }
}

export class CollectionsTreeProvider
  implements vscode.TreeDataProvider<CollectionTreeNode>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    CollectionTreeNode | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private collections: Collection[] = [];

  constructor(private storageService: StorageService) {
    this.refresh();
  }

  async refresh(): Promise<void> {
    this.collections = await this.storageService.loadCollections();
    this._onDidChangeTreeData.fire();
  }

  async addCollection(name: string): Promise<Collection> {
    const newCollection: Collection = {
      id: this.generateId(),
      name,
      requests: [],
      expanded: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.collections.push(newCollection);
    await this.storageService.saveCollections(this.collections);
    this._onDidChangeTreeData.fire();
    return newCollection;
  }

  async deleteCollection(id: string): Promise<void> {
    this.collections = this.collections.filter((c) => c.id !== id);
    await this.storageService.saveCollections(this.collections);
    this._onDidChangeTreeData.fire();
  }

  async renameCollection(id: string, name: string): Promise<void> {
    const col = this.collections.find((c) => c.id === id);
    if (col) {
      col.name = name;
      col.updatedAt = new Date().toISOString();
      await this.storageService.saveCollections(this.collections);
      this._onDidChangeTreeData.fire();
    }
  }

  async addRequest(
    collectionId: string,
    request: Omit<SavedRequest, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<SavedRequest> {
    const collection = this.collections.find((c) => c.id === collectionId);
    if (!collection) {
      throw new Error('Collection not found');
    }

    const newRequest: SavedRequest = {
      ...request,
      id: this.generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    collection.requests.push(newRequest);
    collection.updatedAt = new Date().toISOString();
    await this.storageService.saveCollections(this.collections);
    this._onDidChangeTreeData.fire();
    return newRequest;
  }

  async updateRequest(
    requestId: string,
    updates: Partial<SavedRequest>
  ): Promise<void> {
    for (const col of this.collections) {
      const req = col.requests.find((r) => r.id === requestId);
      if (req) {
        Object.assign(req, updates, { updatedAt: new Date().toISOString() });
        col.updatedAt = new Date().toISOString();
        await this.storageService.saveCollections(this.collections);
        this._onDidChangeTreeData.fire();
        return;
      }
    }
  }

  async deleteRequest(requestId: string): Promise<void> {
    for (const col of this.collections) {
      const idx = col.requests.findIndex((r) => r.id === requestId);
      if (idx !== -1) {
        col.requests.splice(idx, 1);
        col.updatedAt = new Date().toISOString();
        await this.storageService.saveCollections(this.collections);
        this._onDidChangeTreeData.fire();
        return;
      }
    }
  }

  async duplicateRequest(requestId: string): Promise<SavedRequest | null> {
    for (const col of this.collections) {
      const req = col.requests.find((r) => r.id === requestId);
      if (req) {
        const duplicate: SavedRequest = {
          ...req,
          id: this.generateId(),
          name: `${req.name} (copy)`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        col.requests.push(duplicate);
        col.updatedAt = new Date().toISOString();
        await this.storageService.saveCollections(this.collections);
        this._onDidChangeTreeData.fire();
        return duplicate;
      }
    }
    return null;
  }

  getCollections(): Collection[] {
    return this.collections;
  }

  getRequest(requestId: string): { request: SavedRequest; collectionId: string } | null {
    for (const col of this.collections) {
      const req = col.requests.find((r) => r.id === requestId);
      if (req) {
        return { request: req, collectionId: col.id };
      }
    }
    return null;
  }

  getTreeItem(element: CollectionTreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: CollectionTreeNode): CollectionTreeNode[] {
    if (!element) {
      // Root level - return collections
      return this.collections.map((c) => new CollectionItem(c));
    }

    if (element instanceof CollectionItem) {
      // Collection level - return requests
      return element.collection.requests.map(
        (r) => new RequestItem(r, element.collection.id)
      );
    }

    return [];
  }

  getParent(element: CollectionTreeNode): vscode.ProviderResult<CollectionTreeNode> {
    if (element instanceof RequestItem) {
      const col = this.collections.find((c) => c.id === element.collectionId);
      if (col) {
        return new CollectionItem(col);
      }
    }
    return null;
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
