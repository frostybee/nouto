import * as vscode from 'vscode';

export class HistoryProvider implements vscode.TreeDataProvider<HistoryItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<HistoryItem | undefined | null | void> = new vscode.EventEmitter<HistoryItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<HistoryItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private context: vscode.ExtensionContext) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: HistoryItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: HistoryItem): Promise<HistoryItem[]> {
        if (!element) {
            // Return recent requests
            return Promise.resolve([
                new HistoryItem('GET https://api.example.com/users', '200 OK', new Date()),
                new HistoryItem('POST https://api.example.com/users', '201 Created', new Date()),
                new HistoryItem('GET https://jsonplaceholder.typicode.com/posts/1', '200 OK', new Date())
            ]);
        }
        return Promise.resolve([]);
    }
}

class HistoryItem extends vscode.TreeItem {
    constructor(
        public readonly request: string,
        public readonly status: string,
        public readonly timestamp: Date
    ) {
        super(`${request} - ${status}`, vscode.TreeItemCollapsibleState.None);
        this.description = timestamp.toLocaleTimeString();
        this.contextValue = 'historyItem';
    }
} 