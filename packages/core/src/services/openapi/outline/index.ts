/**
 * OpenAPI Outline tree, shared by the VS Code tree view and the desktop
 * outline. Implementation lives in sibling modules: `model.ts` (node model,
 * icon tables, helpers), `operations.ts` (operation nodes + drill-in detail),
 * `buildTree.ts` (tree assembly).
 */
export { buildOutlineTree } from './buildTree';
export { relativeLabel } from './model';
export {
  describeOutlineParseFailure,
  outlineParseFailure,
  parseFailureNode,
  PARSE_FAILURE_NODE_ID,
} from './parseFailure';
export type { OutlineParseFailure } from './parseFailure';
export type { BuildOutlineOptions, OutlineBuildResult, OutlineNode } from './model';
