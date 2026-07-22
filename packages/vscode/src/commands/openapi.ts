import * as vscode from 'vscode';
import type { OpenApiPreviewPanelManager } from '../providers/OpenApiPreviewPanelManager';
import type { OpenApiActionOutcome, OpenApiActionService } from '../services/OpenApiActionService';
import {
  detectOpenApiDocument,
  hasEverBeenOpenApi,
  getOpenApiAnalysis,
  buildSpecJs,
  buildStandaloneDocsHtml,
  type OpenApiDocsSnapshotManager,
  type StandaloneDocsRenderer,
} from '../services/openapi';

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

const DOCS_RENDERERS: Array<vscode.QuickPickItem & { id: StandaloneDocsRenderer }> = [
  { id: 'swagger-ui', label: 'Swagger UI', description: 'Interactive reference' },
  { id: 'redoc', label: 'ReDoc', description: 'Three-panel reference' },
  { id: 'rapidoc', label: 'RapiDoc', description: 'Compact reference' },
];

/** Stable folder name per document: readable stem plus a URI hash so equal
 * file names in different folders never collide. */
function docsSlug(uri: vscode.Uri): string {
  const stem = (uri.path.split('/').pop() ?? 'untitled')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'untitled';
  let hash = 5381;
  const key = uri.toString();
  for (let i = 0; i < key.length; i++) hash = ((hash << 5) + hash + key.charCodeAt(i)) >>> 0;
  return `${stem}-${hash.toString(16)}`;
}

/**
 * Exports a self-contained documentation snapshot (index.html + spec.js) and
 * opens it in the default browser. The snapshot manager then keeps spec.js in
 * sync with document edits, so reloading the browser tab — or its built-in
 * poll loop — shows the current schema without re-running the command.
 */
export function registerOpenApiDocsInBrowserCommand(
  context: vscode.ExtensionContext,
  snapshots: OpenApiDocsSnapshotManager
): vscode.Disposable {
  return vscode.commands.registerCommand(
    'nouto.openApiDocsInBrowser',
    async (resource?: vscode.Uri) => {
      try {
        const target = isUriLike(resource) ? resource : vscode.window.activeTextEditor?.document.uri;
        if (!target) {
          await vscode.window.showErrorMessage('Open an OpenAPI document to view its documentation.');
          return;
        }
        const document = await vscode.workspace.openTextDocument(target);
        if (!hasEverBeenOpenApi(document.uri) && !detectOpenApiDocument(document).isOpenApi) {
          await vscode.window.showErrorMessage(
            'This document is not a recognized OpenAPI 3.0, 3.1, or 3.2 specification.'
          );
          return;
        }
        const analysis = getOpenApiAnalysis(document);
        if (!analysis.parsedSpec) {
          await vscode.window.showErrorMessage(
            'The document does not currently parse as OpenAPI; fix the errors and try again.'
          );
          return;
        }

        const pick = await vscode.window.showQuickPick(DOCS_RENDERERS, {
          placeHolder: 'Renderer for the browser documentation',
          title: 'Open OpenAPI Documentation in Browser',
        });
        if (!pick) return;

        const assetsDir = vscode.Uri.joinPath(context.extensionUri, 'webview-dist', 'renderer-assets');
        const readAsset = async (name: string): Promise<string> =>
          new TextDecoder().decode(
            await vscode.workspace.fs.readFile(vscode.Uri.joinPath(assetsDir, name))
          );
        let js: string;
        let css = '';
        if (pick.id === 'swagger-ui') {
          js = await readAsset('swagger-ui-bundle.js');
          css = await readAsset('swagger-ui.css');
        } else if (pick.id === 'redoc') {
          js = await readAsset('redoc.standalone.js');
        } else {
          js = await readAsset('rapidoc-min.js');
        }

        const info = (analysis.parsedSpec as { info?: { title?: string } }).info;
        const title = info?.title ?? document.uri.path.split('/').pop() ?? 'OpenAPI documentation';

        // globalStorageUri uses the `vscode-userdata` scheme, which the OS
        // cannot hand to a browser via openExternal. Re-anchor the snapshot on
        // the real filesystem path as a `file:` URI so both the fs writes and
        // the browser open target a normal file:// URL. On desktop `.fsPath`
        // carries the full absolute path regardless of the source scheme.
        const folder = vscode.Uri.file(
          vscode.Uri.joinPath(context.globalStorageUri, 'openapi-docs', docsSlug(document.uri)).fsPath
        );
        const encoder = new TextEncoder();
        await vscode.workspace.fs.createDirectory(folder);
        await vscode.workspace.fs.writeFile(
          vscode.Uri.joinPath(folder, 'spec.js'),
          encoder.encode(buildSpecJs(analysis.parsedSpec))
        );
        await vscode.workspace.fs.writeFile(
          vscode.Uri.joinPath(folder, 'index.html'),
          encoder.encode(buildStandaloneDocsHtml({ title, renderer: pick.id, js, css }))
        );

        snapshots.register(document, folder);
        await vscode.env.openExternal(vscode.Uri.joinPath(folder, 'index.html'));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await vscode.window.showErrorMessage(`Failed to open documentation in browser: ${message}`);
      }
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
