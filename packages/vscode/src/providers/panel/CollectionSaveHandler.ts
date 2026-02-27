import * as vscode from 'vscode';
import type { SavedRequest } from '../../services/types';
import { isRequest, isFolder } from '../../services/types';
import type { DraftService } from '../../services/DraftService';
import type { StorageService } from '../../services/StorageService';
import type { PanelInfo, IPanelContext } from './PanelTypes';

export class CollectionSaveHandler {
  constructor(
    private readonly ctx: IPanelContext,
    private readonly draftService: DraftService,
    private readonly storageService: StorageService,
    private readonly getCollectionName: (id: string) => string
  ) {}

  async handleSaveToCollection(data: {
    collectionId: string;
    request: Omit<SavedRequest, 'id' | 'createdAt' | 'updatedAt'>;
  }): Promise<void> {
    try {
      await this.ctx.sidebarProvider.addRequest(data.collectionId, data.request);
      vscode.window.showInformationMessage('Request saved to collection');
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to save request: ${(error as Error).message}`);
    }
  }

  async handleSaveToCollectionWithLink(webview: vscode.Webview, panelId: string, data: {
    collectionId: string;
    folderId?: string;
    request?: Partial<SavedRequest>;
  }): Promise<void> {
    const panelInfo = this.ctx.panels.get(panelId);
    if (!panelInfo) return;

    try {
      const req = data.request || {};
      const method = (req.method as SavedRequest['method']) || (panelInfo.method as SavedRequest['method']) || 'GET';
      const url = req.url || panelInfo.url || '';
      const requestData: Omit<SavedRequest, 'id' | 'createdAt' | 'updatedAt'> = {
        type: 'request',
        name: this.deriveRequestName(method, url),
        method, url,
        params: req.params || [],
        headers: req.headers || [],
        auth: req.auth || { type: 'none' },
        body: req.body || { type: 'none', content: '' },
        assertions: req.assertions,
        authInheritance: req.authInheritance,
        scripts: req.scripts,
      };

      const newRequest = await this.ctx.sidebarProvider.addRequest(data.collectionId, requestData, data.folderId);

      await this.ctx.sidebarProvider.removeFromRecentCollection(url, method);

      panelInfo.requestId = newRequest.id;
      panelInfo.collectionId = data.collectionId;
      const collectionName = this.getCollectionName(data.collectionId);
      panelInfo.collectionName = collectionName;
      panelInfo.requestName = newRequest.name;
      panelInfo.isDirty = false;
      panelInfo.panel.title = collectionName ? `${collectionName} / ${newRequest.name}` : newRequest.name;

      this.draftService.remove(panelId);

      webview.postMessage({
        type: 'requestLinkedToCollection',
        data: { requestId: newRequest.id, collectionId: data.collectionId, collectionName },
      });
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to save: ${(error as Error).message}`);
    }
  }

  async handleSaveToNewCollectionWithLink(webview: vscode.Webview, panelId: string, data: {
    name: string;
    request?: Partial<SavedRequest>;
  }): Promise<void> {
    const panelInfo = this.ctx.panels.get(panelId);
    if (!panelInfo) return;

    try {
      const { collectionId, request: newRequest } = await this.ctx.sidebarProvider.createCollectionAndAddRequest(data.name);

      if (data.request) {
        const collections = this.ctx.sidebarProvider.getCollections();
        const collection = collections.find((c: any) => c.id === collectionId);
        if (collection) {
          const fullRequest: SavedRequest = {
            ...newRequest,
            method: (data.request.method as SavedRequest['method']) || newRequest.method,
            url: data.request.url || newRequest.url,
            params: data.request.params || newRequest.params,
            headers: data.request.headers || newRequest.headers,
            auth: data.request.auth || newRequest.auth,
            body: data.request.body || newRequest.body,
            assertions: data.request.assertions,
            authInheritance: data.request.authInheritance,
            scripts: data.request.scripts,
          };
          this.updateRequestInItems(collection.items, newRequest.id, fullRequest);
          await this.storageService.saveCollections(collections);
          this.ctx.sidebarProvider.notifyCollectionsUpdated();
        }
      }

      await this.ctx.sidebarProvider.removeFromRecentCollection(
        data.request?.url || '', data.request?.method || 'GET'
      );

      panelInfo.requestId = newRequest.id;
      panelInfo.collectionId = collectionId;
      panelInfo.collectionName = data.name;
      const derivedName = data.request?.url
        ? this.deriveRequestName(data.request.method || newRequest.method, data.request.url)
        : newRequest.name;
      panelInfo.requestName = derivedName;
      panelInfo.isDirty = false;
      panelInfo.panel.title = `${data.name} / ${derivedName}`;

      this.draftService.remove(panelId);

      webview.postMessage({
        type: 'requestLinkedToCollection',
        data: { requestId: newRequest.id, collectionId, collectionName: data.name },
      });
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to save: ${(error as Error).message}`);
    }
  }

  async handleDraftUpdated(panelId: string, data: {
    panelId: string;
    requestId: string | null;
    collectionId: string | null;
    request: SavedRequest;
  }): Promise<void> {
    const { requestId, collectionId, request } = data;
    const panelInfo = this.ctx.panels.get(panelId);

    if (requestId && collectionId) {
      if (panelInfo && request.url) {
        panelInfo.requestName = this.deriveRequestName(request.method, request.url);
      }
      if (panelInfo && !panelInfo.isDirty) {
        panelInfo.isDirty = true;
      }
      if (panelInfo) {
        const baseName = panelInfo.collectionName
          ? `${panelInfo.collectionName} / ${panelInfo.requestName || 'Request'}`
          : (panelInfo.requestName || 'Request');
        panelInfo.panel.title = `${baseName} *`;
      }
      this.autoSaveCollectionRequest(requestId, collectionId, request, panelId);
    } else {
      if (panelInfo && request.url) {
        const pathname = this.extractPathname(request.url);
        panelInfo.panel.title = `* ${request.method} ${pathname}`;
      }
      this.draftService.upsert(panelId, requestId, collectionId, request);
    }
  }

  private autoSaveCollectionRequest(requestId: string, collectionId: string, requestData: SavedRequest, panelId?: string): void {
    const panelInfo = panelId ? this.ctx.panels.get(panelId) : undefined;
    if (panelInfo?.saveTimer) clearTimeout(panelInfo.saveTimer);
    const timer = setTimeout(async () => {
      if (panelId && !this.ctx.panels.has(panelId)) return;
      try {
        const collections = this.ctx.sidebarProvider.getCollections();
        const collection = collections.find((c: any) => c.id === collectionId);
        if (!collection) {
          console.warn(`[HiveFetch] Auto-save failed: collection ${collectionId} not found`);
          return;
        }

        const updated = this.updateRequestInItems(collection.items, requestId, requestData);
        if (updated) {
          collection.updatedAt = new Date().toISOString();
          await this.storageService.saveCollections(collections);
          this.ctx.sidebarProvider.notifyCollectionsUpdated();

          if (panelId) {
            const panelInfo = this.ctx.panels.get(panelId);
            if (panelInfo && panelInfo.isDirty) {
              panelInfo.isDirty = false;
              const collName = panelInfo.collectionName || this.getCollectionName(collectionId);
              const reqName = panelInfo.requestName || 'Request';
              panelInfo.panel.title = collName ? `${collName} / ${reqName}` : reqName;
            }
          }
        } else {
          console.warn(`[HiveFetch] Auto-save failed: request ${requestId} not found in collection "${collection.name}". The request may have been moved or deleted.`);
          if (panelId) {
            const pi = this.ctx.panels.get(panelId);
            if (pi) {
              pi.requestId = null;
              pi.collectionId = null;
              pi.isDirty = false;
              pi.panel.title = `* ${requestData.method} ${this.extractPathname(requestData.url)}`;
              pi.panel.webview.postMessage({
                type: 'requestUnlinked',
                data: { message: 'Request was moved or deleted from its collection. Changes are no longer auto-saved.' },
              });
            }
          }
        }
      } catch (error) {
        console.error('[HiveFetch] Auto-save collection request failed:', error);
      }
    }, 2000);
    if (panelInfo) panelInfo.saveTimer = timer;
  }

  updateRequestInItems(items: any[], requestId: string, requestData: SavedRequest): boolean {
    for (const item of items) {
      if (isRequest(item) && item.id === requestId) {
        if (requestData.url) {
          item.name = this.deriveRequestName(requestData.method, requestData.url);
        }
        item.method = requestData.method;
        item.url = requestData.url;
        item.params = requestData.params;
        item.headers = requestData.headers;
        item.auth = requestData.auth;
        item.body = requestData.body;
        item.scripts = requestData.scripts;
        item.assertions = requestData.assertions;
        item.authInheritance = requestData.authInheritance;
        item.updatedAt = new Date().toISOString();
        return true;
      }
      if (isFolder(item)) {
        if (this.updateRequestInItems(item.children, requestId, requestData)) {
          return true;
        }
      }
    }
    return false;
  }

  deriveRequestName(method: string, url: string): string {
    if (!url) return 'New Request';
    const pathname = this.extractPathname(url);
    return `${method} ${pathname}`;
  }

  extractPathname(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname || '/';
    } catch {
      const match = url.match(/\/[^\s?#]*/);
      return match ? match[0] : url;
    }
  }
}
