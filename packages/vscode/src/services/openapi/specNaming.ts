import type * as vscode from 'vscode';
import { uniqueMemberKey as uniqueMemberKeyInSpec, uniqueName } from '@nouto/core/services';
import { getOpenApiAnalysis } from './analysisCache';

/**
 * Collision-free naming for spec inserts and quick fixes.
 *
 * The logic moved to `@nouto/core` (services/openapi/specNaming.ts) so the
 * desktop app can share it. `uniqueName` re-exports unchanged;
 * `uniqueMemberKey` stays document-scoped here — it resolves the parsed spec
 * through the VS Code analysis cache before delegating to core.
 */
export { uniqueName };

/**
 * First `base` (then `base-2`, `base-3`, …) that is not already a member of
 * the object at `parentPointer`. Key-named inserts use this instead of a name
 * dialog: the placeholder lands in the document with its key selected for an
 * inline rename, and can never collide into a duplicate key. Collisions are
 * checked against the parsed spec, so YAML and JSON behave identically.
 */
export function uniqueMemberKey(
  document: vscode.TextDocument,
  parentPointer: string,
  base: string
): string {
  const analysis = getOpenApiAnalysis(document);
  return uniqueMemberKeyInSpec(analysis.parsedSpec, parentPointer, base);
}
