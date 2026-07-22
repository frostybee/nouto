/**
 * Node model for the OpenAPI Outline tree.
 *
 * A single interface covers grouping headers and spec-backed entries alike:
 * nodes carrying a `pointer` correspond to a location in the document and are
 * revealable; nodes without one (synthetic groups like "Tags" fallbacks) only
 * organize their children. Parent back-references are mandatory plumbing for
 * `TreeView.reveal()`, which resolves ancestors through `getParent()`.
 */
export interface OutlineNode {
  /** Stable identity across rebuilds so VS Code preserves expansion state. */
  id: string;
  label: string;
  description?: string;
  tooltip?: string;
  /** Codicon name rendered via `vscode.ThemeIcon`. */
  iconId: string;
  /** Optional theme color id for the icon (e.g. 'charts.green'). */
  iconColor?: string;
  /** Enables `view/item/context` menu targeting (e.g. 'outlineOperation'). */
  contextValue?: string;
  /** RFC 6901 JSON Pointer into the spec; present on revealable nodes. */
  pointer?: string;
  /** `vscode.Uri.toString()` of the document this outline was built from. */
  documentUri: string;
  /** Present on path operation nodes; feeds the Try It item action. */
  operation?: { path: string; method: string };
  parent?: OutlineNode;
  children: OutlineNode[];
}

export interface OutlineBuildResult {
  roots: OutlineNode[];
  /**
   * Pointer → node lookup for cursor-position sync. When several nodes share a
   * pointer (operations repeat under Tags, Operation ID, and Paths), the Paths
   * copy wins — it is the most literal mirror of the document.
   */
  pointerIndex: Map<string, OutlineNode>;
}
