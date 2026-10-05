import * as vscode from 'vscode';
import type { EnvironmentsData } from './types';

/**
 * Status bar item that shows the active environment and opens the
 * environment picker. Shown only while the Nouto sidebar or a Nouto editor
 * tab is visible, since the extension also activates for plain JSON/YAML files.
 */
export class EnvironmentStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly listeners: vscode.Disposable[];
  private sidebarVisible = false;

  constructor() {
    this.item = vscode.window.createStatusBarItem('nouto.environment', vscode.StatusBarAlignment.Right, 100);
    this.item.name = 'Nouto Environment';
    this.item.command = 'nouto.selectEnvironment';
    this.item.tooltip = 'Nouto: Select Environment';
    this.update({ environments: [], activeId: null });
    this.listeners = [
      vscode.window.tabGroups.onDidChangeTabs(() => this.refreshVisibility()),
      vscode.window.tabGroups.onDidChangeTabGroups(() => this.refreshVisibility()),
    ];
    this.refreshVisibility();
  }

  update(data: EnvironmentsData): void {
    const active = data.activeId ? data.environments.find(e => e.id === data.activeId) : undefined;
    this.item.text = `$(symbol-variable) ${active?.name ?? 'No Environment'}`;
  }

  setSidebarVisible(visible: boolean): void {
    this.sidebarVisible = visible;
    this.refreshVisibility();
  }

  private refreshVisibility(): void {
    if (this.sidebarVisible || isNoutoTabVisible()) {
      this.item.show();
    } else {
      this.item.hide();
    }
  }

  dispose(): void {
    for (const listener of this.listeners) listener.dispose();
    this.item.dispose();
  }
}

/** Whether any editor group currently shows a Nouto webview (request, runner, environments, ...). */
function isNoutoTabVisible(): boolean {
  return vscode.window.tabGroups.all.some((group) => {
    const input = group.activeTab?.input;
    // viewType may carry a host prefix, e.g. "mainThreadWebview-nouto.requestPanel"
    return input instanceof vscode.TabInputWebview && input.viewType.includes('nouto.');
  });
}
