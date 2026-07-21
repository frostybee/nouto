import * as vscode from 'vscode';
import type { OpenApiPreviewPanelManager } from '../providers/OpenApiPreviewPanelManager';
import { detectOpenApiDocument, hasEverBeenOpenApi } from '../services/openapi';

const OPENAPI_SKELETON = `openapi: 3.1.0
info:
  title: New API
  version: 1.0.0
paths: {}
`;

export function registerNewOpenApiSpecCommand(): vscode.Disposable {
  return vscode.commands.registerCommand('nouto.newOpenApiSpec', async () => {
    const uri = await vscode.window.showSaveDialog({
      filters: { YAML: ['yaml', 'yml'] },
      saveLabel: 'Create OpenAPI Specification',
    });
    if (!uri) return;

    try {
      await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(OPENAPI_SKELETON));
      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await vscode.window.showErrorMessage(`Failed to create OpenAPI specification: ${message}`);
    }
  });
}

export function registerOpenApiPreviewCommand(
  previewManager: OpenApiPreviewPanelManager
): vscode.Disposable {
  return vscode.commands.registerCommand('nouto.openApiPreview', async () => {
    const document = vscode.window.activeTextEditor?.document;
    if (!document) {
      await vscode.window.showErrorMessage('Open an OpenAPI document to preview it.');
      return;
    }
    if (!hasEverBeenOpenApi(document.uri) && !detectOpenApiDocument(document).isOpenApi) {
      await vscode.window.showErrorMessage(
        'The active document is not a recognized OpenAPI 3.0, 3.1, or 3.2 specification.'
      );
      return;
    }
    previewManager.openPreview(document);
  });
}
