import * as vscode from 'vscode';
import { buildPointerMap, pointerToKeyRange, pointerToRange } from './pointerMap';
import type { OpenApiPointerMap } from './pointerMap';
import type { SpecEditResult } from './specEdit';

/**
 * Shared apply-and-reveal for spec inserts. Promoted out of the outline edit
 * commands so webview-originated inserts (e.g. "Add as component schema" on a
 * response body) reuse the exact same recipe; `commands/` may import from
 * `providers/` but not vice versa, so this lives in the services layer with a
 * structural target type instead of the concrete OpenApiOutlineProvider.
 */

/** The slice of OpenApiOutlineProvider the reveal path needs. */
export interface OutlineRevealTarget {
  suppressSelectionSyncOnce(): void;
  revealPointerOnce(pointer: string): void | Promise<void>;
}

export const EDIT_FAILED_MESSAGE =
  'Could not edit the specification at this location. The target may be missing, malformed, or use inline (flow) YAML style — convert it to block style and try again.';

/**
 * Prefix-walks the pointer toward the root until a range resolves. Some nodes
 * (fallback tags, freshly edited documents) point at locations the current
 * parse no longer contains; the nearest ancestor is still a useful landing.
 */
function nearestRange(map: OpenApiPointerMap, pointer: string): vscode.Range | undefined {
  const segments = pointer.split('/');
  for (let length = segments.length; length > 0; length--) {
    const range = pointerToKeyRange(map, segments.slice(0, length).join('/'));
    if (range) return range;
  }
  return undefined;
}

/**
 * Opens `documentUri`, selects the (nearest resolvable ancestor of the) given
 * pointer, and suppresses the resulting selection-sync bounce. Shared by the
 * outline click command and the post-insert reveal of the edit commands.
 *
 * With `selectValue`, the pointer's value text is selected instead of its key
 * (42Crunch-style insert momentum: the user types straight over the inserted
 * placeholder). Falls back to the usual nearest-key behavior when the exact
 * pointer does not resolve.
 */
export async function revealPointerInEditor(
  target: OutlineRevealTarget,
  documentUri: string,
  pointer: string,
  options: { selectValue?: boolean } = {}
): Promise<void> {
  try {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(documentUri));
    const map = buildPointerMap(document);
    const range = (options.selectValue ? pointerToRange(map, pointer) : undefined)
      ?? nearestRange(map, pointer)
      ?? new vscode.Range(0, 0, 0, 0);
    const editor = await vscode.window.showTextDocument(document, { preserveFocus: false });
    target.suppressSelectionSyncOnce();
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  } catch {
    // The document may have been closed or deleted since the tree was built.
  }
}

/**
 * Applies an insert plan, then reveals the result. With `focusSubPointer`
 * (relative to the inserted node), the editor selects that placeholder value
 * so the user can type straight over it — the useful half of 42Crunch's
 * snippet-style insert, without giving up upfront method/duplicate checks.
 */
export async function applyInsert(
  target: OutlineRevealTarget,
  document: vscode.TextDocument,
  plan: SpecEditResult | undefined,
  focusSubPointer?: string
): Promise<void> {
  if (!plan) {
    await vscode.window.showErrorMessage(EDIT_FAILED_MESSAGE);
    return;
  }
  await vscode.workspace.applyEdit(plan.edit);
  await revealPointerInEditor(
    target,
    document.uri.toString(),
    focusSubPointer ? `${plan.insertedPointer}${focusSubPointer}` : plan.insertedPointer,
    { selectValue: focusSubPointer !== undefined }
  );
  await target.revealPointerOnce(plan.insertedPointer);
}
