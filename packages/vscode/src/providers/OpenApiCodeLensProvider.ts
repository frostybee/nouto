import * as vscode from 'vscode';
import {
  buildPointerMap,
  detectOpenApiDocument,
  getOpenApiAnalysis,
  hasEverBeenOpenApi,
  pointerToKeyRange,
} from '../services/openapi';

/**
 * Contributes one "Nouto: Try It" lens per operation.
 *
 * The operation inventory comes from the shared analysis, which covers the
 * fixed methods, 3.2's `query`, and `additionalOperations`, and excludes
 * webhooks — webhooks describe inbound callbacks, so single-operation
 * conversion (which needs a path) does not apply to them.
 */
export class OpenApiCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.CodeLens[] {
    if (!hasEverBeenOpenApi(document.uri) && !detectOpenApiDocument(document).isOpenApi) return [];

    const analysis = getOpenApiAnalysis(document);
    if (analysis.operations.length === 0) return [];

    const pointerMap = buildPointerMap(document);
    const lenses: vscode.CodeLens[] = [];

    for (const operation of analysis.operations) {
      if (token.isCancellationRequested) return lenses;

      // Anchored on the method key so the lens renders above `get:` rather
      // than inside the operation body.
      const range = pointerToKeyRange(pointerMap, operation.pointer);
      if (!range) continue;

      lenses.push(
        new vscode.CodeLens(range, {
          title: 'Nouto: Try It',
          tooltip: `Open ${operation.method.toUpperCase()} ${operation.path} as a new request`,
          command: 'nouto.tryOpenApiOperation',
          arguments: [
            {
              uri: document.uri.toString(),
              path: operation.path,
              // Passed exactly as declared: additionalOperations keys are
              // matched case-sensitively before an uppercase retry.
              method: operation.method,
            },
          ],
        })
      );
    }

    return lenses;
  }
}
