import * as vscode from 'vscode';

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
