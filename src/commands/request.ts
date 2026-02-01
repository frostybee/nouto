import * as vscode from 'vscode';
import type { RequestPanelManager } from '../providers/RequestPanelManager';
import type { SavedRequest } from '../services/types';

/**
 * Register the newRequest command - opens a new request panel
 */
export function registerNewRequestCommand(panelManager: RequestPanelManager): vscode.Disposable {
  return vscode.commands.registerCommand('hivefetch.newRequest', async () => {
    panelManager.openNewRequest();
  });
}

/**
 * Register the openRequest command - opens a saved request from collections
 */
export function registerOpenRequestCommand(panelManager: RequestPanelManager): vscode.Disposable {
  return vscode.commands.registerCommand(
    'hivefetch.openRequest',
    async (request: SavedRequest, collectionId: string) => {
      panelManager.openSavedRequest(request, collectionId);
    }
  );
}
