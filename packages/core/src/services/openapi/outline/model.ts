/**
 * Node model, icon/color tables, and small pure helpers for the OpenAPI
 * Outline tree.
 */

/**
 * A single interface covers grouping headers and spec-backed entries alike:
 * nodes carrying a `pointer` correspond to a location in the document and are
 * revealable; nodes without one (synthetic groups like "Tags" fallbacks) only
 * organize their children. Parent back-references are mandatory plumbing for
 * hosts that resolve ancestors (e.g. VS Code's `TreeView.reveal()` via
 * `getParent()`).
 */
export interface OutlineNode {
  /** Stable identity across rebuilds so hosts preserve expansion state. */
  id: string;
  label: string;
  description?: string;
  tooltip?: string;
  /** Codicon name rendered by the host (e.g. via `vscode.ThemeIcon`). */
  iconId: string;
  /** Optional theme color id for the icon (e.g. 'charts.green'). */
  iconColor?: string;
  /**
   * Enables host context-menu targeting. Space-separated token string
   * matched with `viewItem =~ /\btoken\b/` clauses; the builder appends a
   * literal `pointer` token to every node that carries a JSON Pointer so a
   * single menu entry can serve "Copy JSON Pointer" everywhere.
   */
  contextValue?: string;
  /** RFC 6901 JSON Pointer into the spec; present on revealable nodes. */
  pointer?: string;
  /** URI string of the document this outline was built from. */
  documentUri: string;
  /** Present on path operation nodes; feeds the Try It item action. */
  operation?: { path: string; method: string };
  /** Present on path and webhook nodes: the raw `paths`/`webhooks` map key. */
  path?: string;
  /** Present on components section/item nodes: which `components.*` bucket. */
  component?: { section: string; name?: string };
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

/** Options controlling how the outline orders each group's children. */
export interface BuildOutlineOptions {
  /**
   * Sort Paths, Tags, Components items, Servers, and Webhooks alphabetically
   * instead of in document order. Operations within a path/tag stay in
   * document order regardless; the Operation ID group is always alphabetical.
   */
  sortAlphabetically?: boolean;
}

export interface NodeProps {
  label: string;
  description?: string;
  tooltip?: string;
  iconId: string;
  iconColor?: string;
  contextValue?: string;
  pointer?: string;
  /** Overrides the root document URI for nodes that point into another file. */
  documentUri?: string;
  /**
   * Marks a node whose `pointer` belongs to a DIFFERENT document. External
   * nodes stay out of `pointerIndex`, which maps pointers of the current
   * document for cursor-position sync and programmatic reveal.
   */
  external?: boolean;
}

/** The tree builder's node factory, shared with the operation-detail helpers. */
export type NodeFactory = (
  parent: OutlineNode | undefined,
  key: string,
  props: NodeProps
) => OutlineNode;

/**
 * Codicon per components.* section item. Mirrors the SymbolKind mapping in
 * OpenApiSymbolProvider so both outlines agree on the section list and its
 * visual language.
 */
export const COMPONENT_ICONS: Record<string, string> = {
  schemas: 'symbol-class',
  responses: 'symbol-object',
  parameters: 'symbol-variable',
  examples: 'symbol-object',
  requestBodies: 'symbol-object',
  headers: 'symbol-field',
  securitySchemes: 'symbol-interface',
  links: 'symbol-object',
  callbacks: 'symbol-event',
  pathItems: 'folder',
};

export const COMPONENT_SECTIONS = Object.keys(COMPONENT_ICONS);

/**
 * Method dot colors, matching Nouto's method badge scheme (TabBar.svelte's
 * methodColor): GET green, POST yellow, PUT blue, PATCH orange, DELETE red,
 * HEAD purple. Unknown methods fall back to an uncolored dot.
 */
export const METHOD_COLORS: Record<string, string> = {
  get: 'charts.green',
  post: 'charts.yellow',
  put: 'charts.blue',
  patch: 'charts.orange',
  delete: 'charts.red',
  head: 'charts.purple',
};

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

/** Returns `values` sorted case-insensitively, or as-is when sorting is off. */
export function ordered(values: string[], sortAlphabetically: boolean): string[] {
  return sortAlphabetically
    ? [...values].sort((a, b) => a.localeCompare(b))
    : values;
}

export function operationDetail(value: unknown): string | undefined {
  const operation = asRecord(value);
  if (!operation) return undefined;
  return typeof operation.summary === 'string'
    ? operation.summary
    : typeof operation.operationId === 'string'
      ? operation.operationId
      : undefined;
}

/**
 * Path of `targetUri` relative to the directory of `fromDocumentUri`, for
 * display. Falls back to the target's basename when the URIs share no common
 * root (different scheme/host).
 */
export function relativeLabel(fromDocumentUri: string, targetUri: string): string {
  const fromParts = fromDocumentUri.split('/');
  fromParts.pop();
  const targetParts = targetUri.split('/');
  let common = 0;
  while (
    common < fromParts.length &&
    common < targetParts.length - 1 &&
    fromParts[common] === targetParts[common]
  ) {
    common += 1;
  }
  if (common === 0) return targetParts[targetParts.length - 1] || targetUri;
  const ups = fromParts.length - common;
  return '../'.repeat(ups) + targetParts.slice(common).join('/');
}
