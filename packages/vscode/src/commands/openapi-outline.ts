import * as vscode from 'vscode';
import type { OpenApiOutlineProvider } from '../providers/OpenApiOutlineProvider';
import type { OutlineNode } from '../providers/openapi-outline/nodes';
import { buildPointerMap, pointerToKeyRange, pointerToRange } from '../services/openapi';
import type { OpenApiPointerMap } from '../services/openapi';

/** Toolbar Refresh button of the OpenAPI Outline view. */
export function registerOpenApiOutlineRefreshCommand(
  provider: OpenApiOutlineProvider
): vscode.Disposable {
  return vscode.commands.registerCommand('nouto.openApiOutline.refresh', () => provider.refresh());
}

/** Overflow menu: detach the outlined spec so the view shows welcome content. */
export function registerOpenApiOutlineCloseSpecCommand(
  provider: OpenApiOutlineProvider
): vscode.Disposable {
  return vscode.commands.registerCommand('nouto.openApiOutline.closeSpec', () => provider.close());
}

/** Overflow menu: pick an OpenAPI file from disk and open it in the editor. */
export function registerOpenApiOutlineOpenSpecCommand(): vscode.Disposable {
  return vscode.commands.registerCommand('nouto.openApiOutline.openSpec', async () => {
    const picks = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { OpenAPI: ['yaml', 'yml', 'json', 'jsonc'] },
      openLabel: 'Open OpenAPI Specification',
    });
    const uri = picks?.[0];
    if (!uri) return;
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await vscode.window.showErrorMessage(`Failed to open OpenAPI specification: ${message}`);
    }
  });
}

/**
 * Overflow menu: save the outlined spec's current content to a new file and
 * switch the editor to it. Falls back to the active editor when the outline
 * has no document yet (e.g. invoked from the command palette).
 */
export function registerOpenApiOutlineSaveAsCommand(
  provider: OpenApiOutlineProvider
): vscode.Disposable {
  return vscode.commands.registerCommand('nouto.openApiOutline.saveAs', async () => {
    const document = provider.document ?? vscode.window.activeTextEditor?.document;
    if (!document) {
      await vscode.window.showErrorMessage('Open an OpenAPI document to save it as a new file.');
      return;
    }
    const yamlFirst = document.languageId === 'yaml';
    const uri = await vscode.window.showSaveDialog({
      filters: yamlFirst
        ? { YAML: ['yaml', 'yml'], JSON: ['json'] }
        : { JSON: ['json', 'jsonc'], YAML: ['yaml', 'yml'] },
      saveLabel: 'Save Specification As',
    });
    if (!uri) return;
    try {
      await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(document.getText()));
      const saved = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(saved);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await vscode.window.showErrorMessage(`Failed to save the specification: ${message}`);
    }
  });
}

/**
 * Item action (inline play button / right-click) on operation nodes. Adapts
 * the outline node into the payload of the existing Try It command, which
 * opens the operation as a Nouto request.
 */
export function registerOpenApiOutlineTryOperationCommand(): vscode.Disposable {
  return vscode.commands.registerCommand('nouto.openApiOutline.tryOperation', async (node: unknown) => {
    if (!isOutlineNode(node) || !node.operation) return;
    await vscode.commands.executeCommand('nouto.tryOpenApiOperation', {
      uri: node.documentUri,
      path: node.operation.path,
      method: node.operation.method,
    });
  });
}

export function isOutlineNode(value: unknown): value is OutlineNode {
  const node = value as Partial<OutlineNode> | null;
  return (
    !!node &&
    typeof node === 'object' &&
    typeof node.pointer === 'string' &&
    typeof node.documentUri === 'string'
  );
}

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
  provider: OpenApiOutlineProvider,
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
    provider.suppressSelectionSyncOnce();
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  } catch {
    // The document may have been closed or deleted since the tree was built.
  }
}

/**
 * Internal command behind outline node clicks. Not contributed to the palette
 * (mirrors nouto.tryOpenApiOperation): it is meaningless without a node.
 * Ranges are re-resolved at click time — the tree may be up to a debounce
 * older than the document.
 */
export function registerOpenApiOutlineRevealCommand(
  provider: OpenApiOutlineProvider
): vscode.Disposable {
  return vscode.commands.registerCommand('nouto.openApiOutline.reveal', async (node: unknown) => {
    if (!isOutlineNode(node)) return;
    await revealPointerInEditor(provider, node.documentUri, node.pointer!);
  });
}
