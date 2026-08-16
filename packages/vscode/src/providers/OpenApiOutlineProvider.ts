import * as vscode from 'vscode';
import type { FileResolver } from '@nouto/core/services';
import { describeOutlineParseFailure } from '@nouto/core/services';
import {
  debounce,
  getOpenApiAnalysis,
  getOpenApiAnalysisWithExternalRefs,
  isKnownOpenApiDocument,
  looksLikeOpenApiDocument,
  offsetToPointer,
  readOpenApiSettings,
  SUPPORTED_LANGUAGES,
} from '../services/openapi';
import type { Debounced } from '../services/openapi';
import { onNoutoSettingsChanged } from '../services/settingsEvents';
import { buildOutlineTree } from './openapi-outline/buildOutline';
import type { OutlineNode } from './openapi-outline/nodes';

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
  /**
   * URI of the document `roots` were built from. Lets a rebuild that fails to
   * parse keep the previous tree of the *same* document on screen (marked out
   * of date via the view message) instead of blanking the view on every
   * mid-edit pause, while never carrying a tree over to another document.
   */
  private rootsKey?: string;
  private suppressSelectionSync = false;
  private started = false;
  private readonly listeners: vscode.Disposable[] = [];
  private readonly rebuildDebouncers = new Map<string, Debounced<[vscode.TextDocument]>>();
  /**
   * Per-document rebuild counter guarding the async external-ref pass — an
   * in-flight pass that awakes to a different generation (or a different
   * current document) was superseded and must not publish a stale tree.
   */
  private readonly generations = new Map<string, number>();
  private readonly selectionDebouncer: Debounced<[vscode.TextEditorSelectionChangeEvent]> =
    debounce((event) => this.onSelectionChanged(event), SELECTION_SYNC_DEBOUNCE_MS);

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly resolver: FileResolver
  ) {}

  start(): void {
    if (this.started) return;
    this.started = true;

    this.treeView = vscode.window.createTreeView<OutlineNode>(OpenApiOutlineProvider.viewId, {
      treeDataProvider: this,
      showCollapseAll: true,
    });

    // Seed the toolbar toggle's `when` context key from the persisted setting.
    this.syncSortContextKey();

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
        this.generations.delete(key);
        if (document === this.currentDocument) this.clear();
      }),
      // onDidCloseTextDocument lags tab closing (documents stay alive while
      // referenced); the tabs API is the authoritative "file was closed"
      // signal, so the outline clears as soon as its file's last tab goes.
      vscode.window.tabGroups.onDidChangeTabs(() => this.onTabsChanged()),
      vscode.window.onDidChangeTextEditorSelection((event) => this.selectionDebouncer(event)),
      // Re-render in the new order when the sort setting is toggled (via the
      // toolbar buttons or Settings UI). refresh() re-derives from the cached
      // analysis, so this is cheap; the context key keeps the toolbar toggle in
      // sync even when no document is currently outlined.
      onNoutoSettingsChanged(() => {
        this.syncSortContextKey();
        this.refresh();
      })
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
    // Detection needs one successful parse, which a document that is broken
    // from its first open never gets; adopt it anyway when it declares
    // `openapi: 3.x`, so the view can explain the parse failure instead of
    // showing the "open a spec" welcome. Once it parses, normal detection
    // takes over (and drops it if it turns out not to be OpenAPI).
    const relevant = document
      && SUPPORTED_LANGUAGES.has(document.languageId)
      && (isKnownOpenApiDocument(document)
        || (looksLikeOpenApiDocument(document) && !getOpenApiAnalysis(document).parsedSpec));
    if (!relevant) {
      // Only clear when a different, non-OpenAPI document takes focus; the
      // always-visible view then falls back to its viewsWelcome content.
      if (document !== this.currentDocument) this.clear();
      return;
    }
    this.currentDocument = document;
    this.rebuild(document);
  }

  /**
   * Publishes the sort setting as a `when`-clause context key so the two
   * toolbar toggle buttons show the correct one. Kept in sync on start, on
   * rebuild, and on settings changes.
   */
  private syncSortContextKey(): void {
    void vscode.commands.executeCommand(
      'setContext',
      'nouto.openApiOutlineSortAlphabetically',
      readOpenApiSettings(this.context).outlineSortAlphabetically
    );
  }

  private rebuild(document: vscode.TextDocument): void {
    const key = document.uri.toString();
    const generation = (this.generations.get(key) ?? 0) + 1;
    this.generations.set(key, generation);

    const analysis = getOpenApiAnalysis(document);
    const settings = readOpenApiSettings(this.context);
    const sortAlphabetically = settings.outlineSortAlphabetically;
    this.syncSortContextKey();

    if (analysis.parsedSpec) {
      const { roots, pointerIndex } = buildOutlineTree(key, analysis, { sortAlphabetically });
      this.roots = roots;
      this.pointerIndex = pointerIndex;
      this.rootsKey = key;
      this.setMessage(undefined);
      if (document.uri.scheme === 'file' && settings.externalRefsEnabled) {
        void this.rebuildExternal(document, generation, sortAlphabetically);
      }
    } else {
      // The document no longer parses. Keep the last good tree of this same
      // document (a typo mid-edit shouldn't blank the view) and say why it is
      // stale; with nothing to keep, say why there is no outline. Either way
      // the message replaces the misleading "open a spec" welcome content.
      const stale = this.rootsKey === key && this.roots.length > 0;
      if (!stale) {
        this.roots = [];
        this.pointerIndex = new Map();
        this.rootsKey = key;
      }
      const format = document.languageId === 'yaml' ? 'yaml' : 'json';
      this.setMessage(describeOutlineParseFailure(document.getText(), format, analysis, { stale }));
    }
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

  /**
   * The async second pass: resolves the document's external `$ref`s (cached —
   * the diagnostics manager normally computed this already) and re-renders the
   * tree with the "Referenced files" group merged in. Superseded passes (a
   * newer rebuild, or the outline moved to another document) publish nothing.
   */
  private async rebuildExternal(
    document: vscode.TextDocument,
    generation: number,
    sortAlphabetically: boolean
  ): Promise<void> {
    const key = document.uri.toString();
    let external;
    try {
      external = await getOpenApiAnalysisWithExternalRefs(document, this.resolver);
    } catch {
      return;
    }
    if (this.generations.get(key) !== generation) return;
    if (this.currentDocument?.uri.toString() !== key) return;
    if (external.externalRefs.size === 0) return;

    const { roots, pointerIndex } = buildOutlineTree(
      key,
      getOpenApiAnalysis(document),
      { sortAlphabetically },
      external
    );
    this.roots = roots;
    this.pointerIndex = pointerIndex;
    this.emitter.fire();
  }

  /** Status line above the tree (vscode.TreeView.message); undefined hides it. */
  private setMessage(message: string | undefined): void {
    if (this.treeView) this.treeView.message = message;
  }

  private clear(): void {
    this.currentDocument = undefined;
    this.roots = [];
    this.pointerIndex = new Map();
    this.rootsKey = undefined;
    this.setMessage(undefined);
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
    this.generations.clear();
    for (const listener of this.listeners) listener.dispose();
    this.listeners.length = 0;
    this.emitter.dispose();
    this.treeView = undefined;
    this.currentDocument = undefined;
    this.rootsKey = undefined;
    this.roots = [];
    this.pointerIndex.clear();
    this.started = false;
  }
}
