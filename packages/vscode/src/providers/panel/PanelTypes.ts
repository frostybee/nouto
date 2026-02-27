import * as vscode from 'vscode';
import type { WebSocketService, SSEService } from '@hivefetch/core/services';

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
  connectionMode?: string;
  saveTimer?: ReturnType<typeof setTimeout>;
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
  readonly sidebarProvider: {
    getCollections(): any[];
    addRequest(collectionId: string, request: any, parentFolderId?: string): Promise<any>;
    addToRecentCollection(requestData: any, responseData: any): Promise<void>;
    removeFromRecentCollection(url: string, method: string): Promise<void>;
    updateRequestResponse(requestId: string, collectionId: string, status: number, duration: number): Promise<void>;
    createCollectionAndAddRequest(name: string): Promise<{ collectionId: string; request: any }>;
    whenReady(): Promise<void>;
    notifyCollectionsUpdated(): Promise<void>;
  };
  generateId(): string;
  getCollectionName(collectionId: string): string;
  isWebviewAlive(panelId: string): boolean;
}
