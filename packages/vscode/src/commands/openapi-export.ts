import * as vscode from 'vscode';
import * as yaml from 'js-yaml';
import { OpenApiExportService } from '@nouto/core/services';
import type { OpenApiExportResult } from '@nouto/core/services';
import { StorageService } from '../services/StorageService';

const exportService = new OpenApiExportService();

/**
 * Opens a generated OpenAPI document as an untitled YAML editor and surfaces
 * generation warnings (mirrors the registerNewOpenApiSpecCommand pattern).
 */
async function openGeneratedSpec(result: OpenApiExportResult): Promise<void> {
  const content = yaml.dump(result.document, { noRefs: true, lineWidth: 120 });
  const document = await vscode.workspace.openTextDocument({ language: 'yaml', content });
  await vscode.window.showTextDocument(document);
  if (result.warnings.length) {
    const preview = result.warnings.slice(0, 3).join(' — ');
    const suffix = result.warnings.length > 3 ? ` (+${result.warnings.length - 3} more)` : '';
    vscode.window.showWarningMessage(`OpenAPI generated with caveats: ${preview}${suffix}`);
  }
}

/**
 * Register the generateOpenApiFromCollection command — generate an OpenAPI
 * 3.1 document from a collection. With a `collectionId` argument (sidebar
 * context menu) the target is resolved directly; without one (command
 * palette) a QuickPick over stored collections is shown.
 */
export function registerGenerateOpenApiFromCollectionCommand(
  storageService: StorageService
): vscode.Disposable {
  return vscode.commands.registerCommand('nouto.generateOpenApiFromCollection', async (collectionId?: string) => {
    const collections = await storageService.loadCollections();
    const exportable = collections.filter(c => !c.builtin && c.items.length > 0);

    if (exportable.length === 0) {
      vscode.window.showWarningMessage('No collections to generate an OpenAPI specification from.');
      return;
    }

    let collection: typeof exportable[number] | undefined;
    if (collectionId) {
      collection = exportable.find(c => c.id === collectionId);
    } else {
      const selected = await vscode.window.showQuickPick(
        exportable.map(c => ({ label: c.name, description: `${c.items.length} items`, id: c.id })),
        { placeHolder: 'Select a collection', title: 'Generate OpenAPI from Collection' }
      );
      if (!selected) return;
      collection = exportable.find(c => c.id === selected.id);
    }
    if (!collection) return;

    try {
      await openGeneratedSpec(exportService.fromCollection(collection));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Failed to generate OpenAPI specification: ${message}`);
    }
  });
}

/**
 * Register the generateOpenApiFromHar command — pick a HAR file, then
 * generate an OpenAPI 3.1 document from its entries (including responses).
 */
export function registerGenerateOpenApiFromHarCommand(): vscode.Disposable {
  return vscode.commands.registerCommand('nouto.generateOpenApiFromHar', async (uri?: vscode.Uri) => {
    let target = uri;
    if (!target) {
      const uris = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: { 'HAR Files': ['har', 'json'] },
        title: 'Generate OpenAPI from HAR File',
      });
      if (!uris || uris.length === 0) return;
      target = uris[0];
    }

    try {
      const content = Buffer.from(await vscode.workspace.fs.readFile(target)).toString('utf-8');
      await openGeneratedSpec(exportService.fromHar(content));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Failed to generate OpenAPI specification: ${message}`);
    }
  });
}
