import * as vscode from 'vscode';
import type { RequestPanelManager } from '../providers/RequestPanelManager';
import type { HistoryEntry } from '../services/types';

/**
 * Register the openHistoryEntry command - opens a history entry in a panel
 */
export function registerOpenHistoryEntryCommand(panelManager: RequestPanelManager): vscode.Disposable {
  return vscode.commands.registerCommand(
    'hivefetch.openHistoryEntry',
    async (entry: HistoryEntry, newTab?: boolean) => {
      panelManager.openHistoryEntry(entry, {
        newTab,
        viewColumn: newTab ? vscode.ViewColumn.Beside : undefined,
      });
    }
  );
}

/**
 * Register the runHistoryEntry command - opens and immediately runs a history entry
 */
export function registerRunHistoryEntryCommand(panelManager: RequestPanelManager): vscode.Disposable {
  return vscode.commands.registerCommand(
    'hivefetch.runHistoryEntry',
    async (entry: HistoryEntry) => {
      panelManager.openHistoryEntry(entry, { autoRun: true });
    }
  );
}
