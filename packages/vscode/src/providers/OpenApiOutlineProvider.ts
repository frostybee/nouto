import * as vscode from 'vscode';
import {
  debounce,
  detectOpenApiDocument,
  getOpenApiAnalysis,
  hasEverBeenOpenApi,
  offsetToPointer,
} from '../services/openapi';
import type { Debounced } from '../services/openapi';
import { buildOutlineTree } from './openapi-outline/buildOutline';
import type { OutlineNode } from './openapi-outline/nodes';

const SUPPORTED_LANGUAGES = new Set(['json', 'yaml', 'jsonc']);
const REBUILD_DEBOUNCE_MS = 400;
const SELECTION_SYNC_DEBOUNCE_MS = 150;

/**
 * Tree data provider behind the "OpenAPI Outline" activity-bar view. Follows
 * OpenApiDiagnosticsManager's lifecycle shape: start() wires listeners, the
 * instance disposes them. The view is always visible in the Nouto sidebar;
 * without an OpenAPI document in focus it shows the viewsWelcome content, so
 * this provider only concerns itself with content, not visibility.
 */
export class OpenApiOutlineProvider implements vscode.TreeDataProvider<OutlineNode>, vscode.Disposable {
  static readonly viewId = 'nouto.openApiOutline';

  private readonly emitter = new vscode.EventEmitter<OutlineNode | undefined | void>();
  readonly onDidChangeTreeData = this.emitter.event;

  private treeView?: vscode.TreeView<OutlineNode>;
  private currentDocument?: vscode.TextDocument;
  private roots: OutlineNode[] = [];
  private pointerIndex = new Map<string, OutlineNode>();
  private suppressSelectionSync = false;
  private started = false;
  private readonly listeners: vscode.Disposable[] = [];
  private readonly rebuildDebouncers = new Map<string, Debounced<[vscode.TextDocument]>>();
  private readonly selectionDebouncer: Debounced<[vscode.TextEditorSelectionChangeEvent]> =
    debounce((event) => this.onSelectionChanged(event), SELECTION_SYNC_DEBOUNCE_MS);

  start(): void {
    if (this.started) return;
    this.started = true;

    this.treeView = vscode.window.createTreeView<OutlineNode>(OpenApiOutlineProvider.viewId, {
      treeDataProvider: this,
      showCollapseAll: true,
    });

    this.listeners.push(
      this.treeView,
      // Ignore `undefined` (focus moved to a webview/panel): keeping the last
      // outline mirrors how the built-in Outline view behaves.
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) this.setDocument(editor.document);
      }),
      vscode.workspace.onDidChangeTextDocument(({ document }) => {
        if (document !== this.currentDocument) return;
        const key = document.uri.toString();
        let rebuild = this.rebuildDebouncers.get(key);
        if (!rebuild) {
          rebuild = debounce((changedDocument) => this.rebuild(changedDocument), REBUILD_DEBOUNCE_MS);
          this.rebuildDebouncers.set(key, rebuild);
        }
        rebuild(document);
      }),
      vscode.workspace.onDidCloseTextDocument((document) => {
        const key = document.uri.toString();
        this.rebuildDebouncers.get(key)?.cancel();
        this.rebuildDebouncers.delete(key);
        if (document === this.currentDocument) this.clear();
      }),
      // onDidCloseTextDocument lags tab closing (documents stay alive while
      // referenced); the tabs API is the authoritative "file was closed"
      // signal, so the outline clears as soon as its file's last tab goes.
      vscode.window.tabGroups.onDidChangeTabs(() => this.onTabsChanged()),
      vscode.window.onDidChangeTextEditorSelection((event) => this.selectionDebouncer(event))
    );

    this.setDocument(vscode.window.activeTextEditor?.document);
  }

  getTreeItem(node: OutlineNode): vscode.TreeItem {
    const item = new vscode.TreeItem(
      node.label,
      node.children.length
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );
    item.id = node.id;
    item.description = node.description;
    item.tooltip = node.tooltip;
    item.iconPath = new vscode.ThemeIcon(
      node.iconId,
      node.iconColor ? new vscode.ThemeColor(node.iconColor) : undefined
    );
    item.contextValue = node.contextValue;
    if (node.pointer !== undefined) {
      item.command = {
        command: 'nouto.openApiOutline.reveal',
        title: 'Reveal in Editor',
        arguments: [node],
      };
    }
    return item;
  }

  getChildren(node?: OutlineNode): OutlineNode[] {
    return node ? node.children : this.roots;
  }

  getParent(node: OutlineNode): OutlineNode | undefined {
    return node.parent;
  }

  /** Rebuilds the outline for the current document (Refresh toolbar button). */
  refresh(): void {
    if (this.currentDocument) this.rebuild(this.currentDocument);
    else this.clear();
  }

  /**
   * Detaches the outline from its document (Close Specification menu item):
   * the view falls back to its welcome content. Focusing an OpenAPI editor
   * again re-attaches, mirroring how the outline picks documents up.
   */
  close(): void {
    this.clear();
  }

  /** The document the outline currently reflects, for the reveal command. */
  get document(): vscode.TextDocument | undefined {
    return this.currentDocument;
  }

  /**
   * Skips the next cursor-sync pass. The reveal command sets the editor
   * selection itself; without this the resulting selection event would bounce
   * straight back into treeView.reveal().
   */
  suppressSelectionSyncOnce(): void {
    this.suppressSelectionSync = true;
  }

  /**
   * Rebuilds immediately (bypassing the change debounce) and selects the node
   * at `pointer` in the tree. Used by the edit commands right after an
   * applyEdit, when the natural cursor-sync path is suppressed and the pending
   * debounced rebuild would still be running against a stale pointer index.
   */
  async revealPointerOnce(pointer: string): Promise<void> {
    if (!this.currentDocument) return;
    this.rebuildDebouncers.get(this.currentDocument.uri.toString())?.cancel();
    this.rebuild(this.currentDocument);
    const node = this.pointerIndex.get(pointer);
    if (!node || !this.treeView) return;
    try {
      await this.treeView.reveal(node, { select: true, focus: false, expand: true });
    } catch {
      // The view may be hidden or the node dropped by a concurrent edit.
    }
  }

  private setDocument(document: vscode.TextDocument | undefined): void {
    const relevant = document
      && SUPPORTED_LANGUAGES.has(document.languageId)
      && (hasEverBeenOpenApi(document.uri) || detectOpenApiDocument(document).isOpenApi);
    if (!relevant) {
      // Only clear when a different, non-OpenAPI document takes focus; the
      // always-visible view then falls back to its viewsWelcome content.
      if (document !== this.currentDocument) this.clear();
      return;
    }
    this.currentDocument = document;
    this.rebuild(document);
  }

  private rebuild(document: vscode.TextDocument): void {
    const analysis = getOpenApiAnalysis(document);
    const { roots, pointerIndex } = buildOutlineTree(document.uri.toString(), analysis);
    this.roots = roots;
    this.pointerIndex = pointerIndex;
    // Gates the mutating context-menu entries: structural edits against a
    // document that failed analysis could corrupt it (42Crunch does the same).
    void vscode.commands.executeCommand(
      'setContext',
      'nouto.openApiOutlineHasErrors',
      !analysis.parsedSpec || analysis.diagnostics.some((d) => d.severity === 'error')
    );
    void vscode.commands.executeCommand('setContext', 'nouto.openApiOutlineHasDocument', true);
    this.emitter.fire();
  }

  private clear(): void {
    this.currentDocument = undefined;
    this.roots = [];
    this.pointerIndex = new Map();
    void vscode.commands.executeCommand('setContext', 'nouto.openApiOutlineHasErrors', false);
    void vscode.commands.executeCommand('setContext', 'nouto.openApiOutlineHasDocument', false);
    this.emitter.fire();
  }

  /** Clears the outline once no tab in any group shows its document anymore. */
  private onTabsChanged(): void {
    if (!this.currentDocument) return;
    const uri = this.currentDocument.uri.toString();
    const stillOpen = vscode.window.tabGroups.all.some((group) =>
      group.tabs.some((tab) =>
        tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === uri
      )
    );
    if (!stillOpen) this.clear();
  }

  private onSelectionChanged(event: vscode.TextEditorSelectionChangeEvent): void {
    if (this.suppressSelectionSync) {
      this.suppressSelectionSync = false;
      return;
    }
    if (!this.treeView?.visible) return;
    const { textEditor } = event;
    if (!this.currentDocument || textEditor.document !== this.currentDocument) return;

    const offset = textEditor.document.offsetAt(textEditor.selection.active);
    const node = this.resolveNode(offsetToPointer(textEditor.document, offset));
    if (!node) return;
    // focus: false keeps the keyboard in the editor; the tree just highlights.
    void Promise.resolve(
      this.treeView.reveal(node, { select: true, focus: false, expand: true })
    ).catch(() => { /* node may have been dropped by a concurrent rebuild */ });
  }

  /**
   * Nearest-ancestor lookup: the cursor pointer is often deeper than any
   * outline node (e.g. inside a schema property), so walk prefixes up to root.
   */
  private resolveNode(pointer: string): OutlineNode | undefined {
    const segments = pointer.split('/');
    for (let length = segments.length; length > 0; length--) {
      const candidate = this.pointerIndex.get(segments.slice(0, length).join('/'));
      if (candidate) return candidate;
    }
    return undefined;
  }

  dispose(): void {
    this.selectionDebouncer.cancel();
    for (const debounced of this.rebuildDebouncers.values()) debounced.cancel();
    this.rebuildDebouncers.clear();
    for (const listener of this.listeners) listener.dispose();
    this.listeners.length = 0;
    this.emitter.dispose();
    this.treeView = undefined;
    this.currentDocument = undefined;
    this.roots = [];
    this.pointerIndex.clear();
    this.started = false;
  }
}
