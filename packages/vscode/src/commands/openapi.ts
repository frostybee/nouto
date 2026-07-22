import * as vscode from 'vscode';
import type { OpenApiPreviewPanelManager } from '../providers/OpenApiPreviewPanelManager';
import type { OpenApiActionOutcome, OpenApiActionService } from '../services/OpenApiActionService';
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

/** Payload of the internal Try It command contributed by the CodeLens provider. */
interface TryOperationArgs {
  uri: string;
  path: string;
  method: string;
}

function isTryOperationArgs(value: unknown): value is TryOperationArgs {
  const args = value as Partial<TryOperationArgs> | null;
  return (
    !!args &&
    typeof args === 'object' &&
    typeof args.uri === 'string' &&
    typeof args.path === 'string' &&
    typeof args.method === 'string'
  );
}

/**
 * Structural rather than `instanceof`: menu arguments can cross an extension
 * host boundary, and the palette invokes the command with no argument at all.
 */
function isUriLike(value: unknown): value is vscode.Uri {
  const candidate = value as Partial<vscode.Uri> | null;
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    typeof candidate.scheme === 'string' &&
    typeof candidate.path === 'string'
  );
}

/**
 * Internal command behind the Try It lens. Not contributed to the palette:
 * it is meaningless without an operation payload.
 */
export function registerTryOpenApiOperationCommand(
  actionService: OpenApiActionService
): vscode.Disposable {
  return vscode.commands.registerCommand('nouto.tryOpenApiOperation', async (args: unknown) => {
    if (!isTryOperationArgs(args)) {
      await vscode.window.showErrorMessage('Nouto: invalid Try It request.');
      return;
    }

    const outcome = await actionService.tryOperation({
      uri: vscode.Uri.parse(args.uri),
      path: args.path,
      method: args.method,
    });

    await reportOutcome(outcome, 'Failed to open the operation');
  });
}

export function registerGenerateCollectionFromOpenApiCommand(
  actionService: OpenApiActionService
): vscode.Disposable {
  return vscode.commands.registerCommand(
    'nouto.generateCollectionFromOpenApi',
    async (resource?: vscode.Uri) => {
      const uri = isUriLike(resource) ? resource : undefined;
      const outcome = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Generating collection from OpenAPI…',
          cancellable: false,
        },
        () => actionService.generateCollection(uri)
      );

      await reportOutcome(outcome, 'Failed to generate the collection');

      // Deliberately after the success notification: the prompt blocks on user
      // input, and the action itself is already complete.
      if (outcome.ok) await outcome.promptEnvironment?.();
    }
  );
}

/** Reports an outcome natively, consolidating conversion caveats into one notice. */
async function reportOutcome(outcome: OpenApiActionOutcome, failurePrefix: string): Promise<void> {
  if (!outcome.ok) {
    await vscode.window.showErrorMessage(`${failurePrefix}: ${outcome.message}`);
    return;
  }

  await vscode.window.showInformationMessage(outcome.message);

  if (outcome.warnings.length > 0) {
    await vscode.window.showWarningMessage(
      `${outcome.warnings.length} conversion caveat${outcome.warnings.length === 1 ? '' : 's'}: ` +
        outcome.warnings.join(' ')
    );
  }
}
