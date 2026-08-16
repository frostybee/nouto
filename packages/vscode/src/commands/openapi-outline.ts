import * as vscode from 'vscode';
import type { OpenApiOutlineProvider } from '../providers/OpenApiOutlineProvider';
import type { OutlineNode } from '../providers/openapi-outline/nodes';
import { revealOffsetInEditor, revealPointerInEditor } from '../services/openapi';
import { applyNoutoSettingsPatch } from '../services/settingsEvents';

// Moved to services/openapi/applyInsert.ts (webview-originated inserts need it
// and providers/ cannot import from commands/); re-exported for existing users.
export { revealPointerInEditor };

/** Toolbar Refresh button of the OpenAPI Outline view. */
export function registerOpenApiOutlineRefreshCommand(
  provider: OpenApiOutlineProvider
): vscode.Disposable {
  return vscode.commands.registerCommand('nouto.openApiOutline.refresh', () => provider.refresh());
}

/**
 * Toolbar toggle (shown when the outline is in document order): switch the
 * outline to alphabetical ordering by flipping the backing setting. The
 * provider's config listener re-renders; the complementary `when` clauses swap
 * which of the two buttons is visible.
 */
export function registerOpenApiOutlineSortAlphabeticalCommand(
  context: vscode.ExtensionContext
): vscode.Disposable {
  return vscode.commands.registerCommand('nouto.openApiOutline.sortAlphabetical', () =>
    applyNoutoSettingsPatch(context, { openApiOutlineSortAlphabetically: true })
  );
}

/** Toolbar toggle (shown when the outline is alphabetical): return to document order. */
export function registerOpenApiOutlineSortDocumentOrderCommand(
  context: vscode.ExtensionContext
): vscode.Disposable {
  return vscode.commands.registerCommand('nouto.openApiOutline.sortDocumentOrder', () =>
    applyNoutoSettingsPatch(context, { openApiOutlineSortAlphabetically: false })
  );
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
    (typeof node.pointer === 'string' || typeof node.offset === 'number') &&
    typeof node.documentUri === 'string'
  );
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
    if (node.pointer !== undefined) {
      await revealPointerInEditor(provider, node.documentUri, node.pointer);
    } else if (node.offset !== undefined) {
      await revealOffsetInEditor(provider, node.documentUri, node.offset);
    }
  });
}
