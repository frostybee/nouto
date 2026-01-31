import * as vscode from 'vscode';

export class CollectionsProvider implements vscode.TreeDataProvider<CollectionItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<CollectionItem | undefined | null | void> = new vscode.EventEmitter<CollectionItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<CollectionItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private context: vscode.ExtensionContext) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: CollectionItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: CollectionItem): Thenable<CollectionItem[]> {
        if (!element) {
            // Return root items
            return Promise.resolve([
                new CollectionItem('Sample Collection', vscode.TreeItemCollapsibleState.Collapsed, 'collection'),
                new CollectionItem('My Requests', vscode.TreeItemCollapsibleState.Collapsed, 'collection')
            ]);
        } else {
            // Return child items
            return Promise.resolve([
                new CollectionItem('GET Users', vscode.TreeItemCollapsibleState.None, 'request'),
                new CollectionItem('POST User', vscode.TreeItemCollapsibleState.None, 'request')
            ]);
        }
    }
}

class CollectionItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: 'collection' | 'request'
    ) {
        super(label, collapsibleState);
        this.tooltip = `${this.label}`;
        this.contextValue = type;
        
        if (type === 'request') {
            this.iconPath = new vscode.ThemeIcon('globe');
            this.command = {
                command: 'restease.loadRequest',
                title: 'Load Request',
                arguments: [this]
            };
        } else {
            this.iconPath = new vscode.ThemeIcon('folder');
        }
    }
} 