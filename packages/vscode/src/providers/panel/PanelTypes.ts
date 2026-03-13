import * as vscode from 'vscode';
import type { WebSocketService, SSEService, GraphQLSubscriptionService } from '@hivefetch/core/services';
import type { UIService } from '../../services/UIService';

export interface PanelInfo {
  panel: vscode.WebviewPanel;
  requestId: string | null;
  collectionId: string | null;
  abortController: AbortController | null;
  messageDisposable?: vscode.Disposable;
  url?: string;
  method?: string;
  isDirty?: boolean;
  collectionName?: string;
  requestName?: string;
  wsService?: WebSocketService;
  sseService?: SSEService;
  gqlSubService?: GraphQLSubscriptionService;
  connectionMode?: string;
  saveTimer?: ReturnType<typeof setTimeout>;
  uiService?: UIService;
}

export interface OpenPanelOptions {
  newTab?: boolean;
  autoRun?: boolean;
  viewColumn?: vscode.ViewColumn;
}

/**
 * Typed context interface that extracted modules use to access
 * the RequestPanelManager's state and services without a circular dependency.
 */
export interface IPanelContext {
  readonly panels: Map<string, PanelInfo>;
  readonly extensionContext: vscode.ExtensionContext;
  readonly sidebarProvider: {
    getCollections(): any[];
    addRequest(collectionId: string, request: any, parentFolderId?: string): Promise<any>;
    addToDraftsCollection(requestData: any, responseData: any): Promise<void>;
    removeFromDraftsCollection(url: string, method: string): Promise<void>;
    updateRequestResponse(requestId: string, collectionId: string, status: number, duration: number, sentUrl?: string, sentMethod?: string): Promise<void>;
    createCollectionAndAddRequest(name: string): Promise<{ collectionId: string; request: any }>;
    whenReady(): Promise<void>;
    notifyCollectionsUpdated(): Promise<void>;
    suppressedSaveCollections(collections: any[]): Promise<void>;
    logHistory(entry: any): Promise<void>;
    searchHistory(params?: any): Promise<any>;
    getHistoryEntry(id: string): Promise<any>;
    deleteHistoryEntryById(id: string): Promise<void>;
    clearAllHistory(): Promise<void>;
  };
  generateId(): string;
  getCollectionName(collectionId: string): string;
  isWebviewAlive(panelId: string): boolean;
}
