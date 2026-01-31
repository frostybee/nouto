import * as vscode from 'vscode';
import { RestEasePanel } from './RestEasePanel';
import { CollectionsProvider } from './CollectionsProvider';
import { HistoryProvider } from './HistoryProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('VSC-RestEase extension is now active!');

    // Register the collections tree data provider
    const collectionsProvider = new CollectionsProvider(context);
    vscode.window.registerTreeDataProvider('restease.collections', collectionsProvider);

    // Register the history tree data provider
    const historyProvider = new HistoryProvider(context);
    vscode.window.registerTreeDataProvider('restease.history', historyProvider);

    // Register the new request command
    const newRequestCommand = vscode.commands.registerCommand('restease.newRequest', () => {
        RestEasePanel.createOrShow(context.extensionUri);
    });

    // Register refresh commands for tree views
    const refreshCollectionsCommand = vscode.commands.registerCommand('restease.refreshCollections', () => {
        collectionsProvider.refresh();
    });

    const refreshHistoryCommand = vscode.commands.registerCommand('restease.refreshHistory', () => {
        historyProvider.refresh();
    });

    context.subscriptions.push(
        newRequestCommand,
        refreshCollectionsCommand,
        refreshHistoryCommand
    );
}

export function deactivate() {
    console.log('VSC-RestEase extension is now deactivated!');
} 