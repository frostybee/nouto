import * as vscode from 'vscode';
import type { SavedRequest, ResponseExample } from '../../services/types';
import { isRequest, isFolder } from '../../services/types';
import type { DraftService } from '../../services/DraftService';
import type { StorageService } from '../../services/StorageService';
import type { PanelInfo, IPanelContext } from './PanelTypes';
import type { UIService } from '../../services/UIService';
import { extractPathname } from '@hivefetch/core';

export class CollectionSaveHandler {
  constructor(
    private readonly ctx: IPanelContext,
    private readonly draftService: DraftService,
    private readonly storageService: StorageService,
    private readonly getCollectionName: (id: string) => string
  ) {}

  private getUIService(panelId: string): UIService | undefined {
    return this.ctx.panels.get(panelId)?.uiService;
  }

  async handleSaveToCollection(panelId: string, data: {
    collectionId: string;
    request: Omit<SavedRequest, 'id' | 'createdAt' | 'updatedAt'>;
  }): Promise<void> {
    const ui = this.getUIService(panelId);
    try {
      await this.ctx.sidebarProvider.addRequest(data.collectionId, data.request);
      ui?.showInfo('Request saved to collection');
    } catch (error) {
      ui?.showError(`Failed to save request: ${(error as Error).message}`);
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
      const connectionMode = req.connectionMode || panelInfo.connectionMode;
      const requestData: Omit<SavedRequest, 'id' | 'createdAt' | 'updatedAt'> = {
        type: 'request',
        name: this.deriveRequestName(method, url, connectionMode),
        method, url,
        params: req.params || [],
        headers: req.headers || [],
        auth: req.auth || { type: 'none' },
        body: req.body || { type: 'none', content: '' },
        assertions: req.assertions,
        authInheritance: req.authInheritance,
        scripts: req.scripts,
        connectionMode: connectionMode as SavedRequest['connectionMode'],
      };

      const newRequest = await this.ctx.sidebarProvider.addRequest(data.collectionId, requestData, data.folderId);

      await this.ctx.sidebarProvider.removeFromDraftsCollection(url, method);

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
      this.getUIService(panelId)?.showError(`Failed to save: ${(error as Error).message}`);
    }
  }

  async handleSaveToNewCollectionWithLink(webview: vscode.Webview, panelId: string, data: {
    name: string;
    color?: string;
    icon?: string;
    request?: Partial<SavedRequest>;
  }): Promise<void> {
    const panelInfo = this.ctx.panels.get(panelId);
    if (!panelInfo) return;

    try {
      const { collectionId, request: newRequest } = await this.ctx.sidebarProvider.createCollectionAndAddRequest(data.name, undefined, data.color, data.icon);

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
            connectionMode: data.request.connectionMode || panelInfo.connectionMode as SavedRequest['connectionMode'] || newRequest.connectionMode,
          };
          this.updateRequestInItems(collection.items, newRequest.id, fullRequest);
          await this.ctx.sidebarProvider.suppressedSaveCollections(collections);
          this.ctx.sidebarProvider.notifyCollectionsUpdated();
        }
      }

      await this.ctx.sidebarProvider.removeFromDraftsCollection(
        data.request?.url || '', data.request?.method || 'GET'
      );

      panelInfo.requestId = newRequest.id;
      panelInfo.collectionId = collectionId;
      panelInfo.collectionName = data.name;
      const derivedName = data.request?.url
        ? this.deriveRequestName(data.request.method || newRequest.method, data.request.url, data.request.connectionMode || panelInfo.connectionMode)
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
      this.getUIService(panelId)?.showError(`Failed to save: ${(error as Error).message}`);
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
      // Collection request: persist to draft for crash recovery, but do NOT auto-save to collection.
      // The webview tracks dirty state and the user must explicitly save via Ctrl+S.
      if (panelInfo && request.url) {
        panelInfo.requestName = this.deriveRequestName(request.method, request.url, request.connectionMode || panelInfo.connectionMode);
      }
      this.draftService.upsert(panelId, requestId, collectionId, request);
    } else {
      // Unsaved request: update panel title and persist draft
      if (panelInfo && request.url) {
        const pathname = this.extractPathname(request.url);
        panelInfo.panel.title = `* ${request.method} ${pathname}`;
      }
      this.draftService.upsert(panelId, requestId, collectionId, request);
    }
  }

  async handleSaveCollectionRequest(webview: import('vscode').Webview, panelId: string, data: {
    panelId: string;
    requestId: string;
    collectionId: string;
    request: SavedRequest;
  }): Promise<void> {
    const panelInfo = this.ctx.panels.get(panelId);
    if (!panelInfo) return;

    try {
      const collections = this.ctx.sidebarProvider.getCollections();
      const ui = this.getUIService(panelId);
      const collection = collections.find((c: any) => c.id === data.collectionId);
      if (!collection) {
        ui?.showError('Collection not found. The request has been unlinked.');
        this.unlinkPanel(panelInfo, data.request);
        webview.postMessage({
          type: 'requestUnlinked',
          data: { message: 'Collection was deleted. Request has been unlinked.' },
        });
        return;
      }

      const updated = this.updateRequestInItems(collection.items, data.requestId, data.request);
      if (!updated) {
        ui?.showError('Request not found in collection. It may have been deleted.');
        this.unlinkPanel(panelInfo, data.request);
        webview.postMessage({
          type: 'requestUnlinked',
          data: { message: 'Request was deleted from its collection. Request has been unlinked.' },
        });
        return;
      }

      collection.updatedAt = new Date().toISOString();
      await this.ctx.sidebarProvider.suppressedSaveCollections(collections);
      this.ctx.sidebarProvider.notifyCollectionsUpdated();

      // Clear dirty state
      panelInfo.isDirty = false;
      const collName = panelInfo.collectionName || this.getCollectionName(data.collectionId);
      const reqName = panelInfo.requestName || 'Request';
      panelInfo.panel.title = collName ? `${collName} / ${reqName}` : reqName;

      // Remove draft since it's now saved
      this.draftService.remove(panelId);

      // Confirm save to webview
      webview.postMessage({
        type: 'collectionRequestSaved',
        data: { requestId: data.requestId, collectionId: data.collectionId },
      });
    } catch (error) {
      this.getUIService(panelId)?.showError(`Failed to save: ${(error as Error).message}`);
    }
  }

  async handleRevertRequest(webview: import('vscode').Webview, panelId: string, data: {
    panelId: string;
    requestId: string;
    collectionId: string;
  }): Promise<void> {
    try {
      const collections = this.ctx.sidebarProvider.getCollections();
      const ui = this.getUIService(panelId);
      const collection = collections.find((c: any) => c.id === data.collectionId);
      if (!collection) {
        ui?.showError('Collection not found.');
        return;
      }

      const original = this.findRequestInItems(collection.items, data.requestId);
      if (!original) {
        ui?.showError('Request not found in collection.');
        return;
      }

      webview.postMessage({
        type: 'originalRequestLoaded',
        data: original,
      });

      // Clear dirty state
      const panelInfo = this.ctx.panels.get(panelId);
      if (panelInfo) {
        panelInfo.isDirty = false;
        const collName = panelInfo.collectionName || this.getCollectionName(data.collectionId);
        const reqName = original.name || 'Request';
        panelInfo.panel.title = collName ? `${collName} / ${reqName}` : reqName;
      }

      this.draftService.remove(panelId);
    } catch (error) {
      this.getUIService(panelId)?.showError(`Failed to revert: ${(error as Error).message}`);
    }
  }

  async handleAddResponseExample(panelId: string, data: {
    panelId: string;
    requestId: string;
    collectionId: string;
    example: ResponseExample;
  }): Promise<void> {
    const panelInfo = this.ctx.panels.get(panelId);
    if (!panelInfo) return;
    try {
      const collections = this.ctx.sidebarProvider.getCollections();
      const collection = collections.find((c: any) => c.id === data.collectionId);
      if (!collection) return;
      const req = this.findRequestInItems(collection.items, data.requestId);
      if (!req) return;
      if (!req.examples) req.examples = [];
      req.examples.push(data.example);
      collection.updatedAt = new Date().toISOString();
      await this.ctx.sidebarProvider.suppressedSaveCollections(collections);
      this.ctx.sidebarProvider.notifyCollectionsUpdated();
    } catch (error) {
      this.getUIService(panelId)?.showError(`Failed to save example: ${(error as Error).message}`);
    }
  }

  async handleDeleteResponseExample(panelId: string, data: {
    panelId: string;
    requestId: string;
    collectionId: string;
    exampleId: string;
  }): Promise<void> {
    const panelInfo = this.ctx.panels.get(panelId);
    if (!panelInfo) return;
    try {
      const collections = this.ctx.sidebarProvider.getCollections();
      const collection = collections.find((c: any) => c.id === data.collectionId);
      if (!collection) return;
      const req = this.findRequestInItems(collection.items, data.requestId);
      if (!req || !req.examples) return;
      req.examples = req.examples.filter((e) => e.id !== data.exampleId);
      collection.updatedAt = new Date().toISOString();
      await this.ctx.sidebarProvider.suppressedSaveCollections(collections);
      this.ctx.sidebarProvider.notifyCollectionsUpdated();
    } catch (error) {
      this.getUIService(panelId)?.showError(`Failed to delete example: ${(error as Error).message}`);
    }
  }

  async saveDirectToCollection(requestId: string, collectionId: string, requestData: SavedRequest): Promise<boolean> {
    try {
      const collections = this.ctx.sidebarProvider.getCollections();
      const collection = collections.find((c: any) => c.id === collectionId);
      if (!collection) return false;

      const updated = this.updateRequestInItems(collection.items, requestId, requestData);
      if (!updated) return false;

      collection.updatedAt = new Date().toISOString();
      await this.ctx.sidebarProvider.suppressedSaveCollections(collections);
      this.ctx.sidebarProvider.notifyCollectionsUpdated();
      return true;
    } catch {
      return false;
    }
  }

  private findRequestInItems(items: any[], requestId: string): SavedRequest | null {
    for (const item of items) {
      if (isRequest(item) && item.id === requestId) {
        return item as SavedRequest;
      }
      if (isFolder(item)) {
        const found = this.findRequestInItems(item.children, requestId);
        if (found) return found;
      }
    }
    return null;
  }

  private unlinkPanel(panelInfo: PanelInfo, requestData: SavedRequest): void {
    panelInfo.requestId = null;
    panelInfo.collectionId = null;
    panelInfo.collectionName = undefined;
    panelInfo.isDirty = false;
    panelInfo.panel.title = `* ${requestData.method} ${this.extractPathname(requestData.url)}`;
  }

  updateRequestInItems(items: any[], requestId: string, requestData: SavedRequest): boolean {
    for (const item of items) {
      if (isRequest(item) && item.id === requestId) {
        if (requestData.url) {
          item.name = this.deriveRequestName(requestData.method, requestData.url, requestData.connectionMode);
        }
        item.method = requestData.method;
        item.url = requestData.url;
        item.params = requestData.params;
        item.pathParams = requestData.pathParams;
        item.headers = requestData.headers;
        item.auth = requestData.auth;
        item.body = requestData.body;
        item.scripts = requestData.scripts;
        item.assertions = requestData.assertions;
        item.authInheritance = requestData.authInheritance;
        item.scriptInheritance = requestData.scriptInheritance;
        item.description = requestData.description;
        item.ssl = requestData.ssl;
        item.proxy = requestData.proxy;
        item.timeout = requestData.timeout;
        item.followRedirects = requestData.followRedirects;
        item.maxRedirects = requestData.maxRedirects;
        if (requestData.connectionMode) {
          item.connectionMode = requestData.connectionMode;
        }
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

  deriveRequestName(method: string, url: string, connectionMode?: string): string {
    if (!url) return 'New Request';
    const pathname = this.extractPathname(url);
    const connectionLabels: Record<string, string> = {
      websocket: 'WS',
      sse: 'SSE',
      'graphql-ws': 'GQL-SUB',
    };
    const prefix = (connectionMode && connectionLabels[connectionMode]) || method;
    return `${prefix} ${pathname}`;
  }

  extractPathname(url: string): string {
    return extractPathname(url);
  }
}
