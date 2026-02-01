import * as vscode from 'vscode';
import { ImportExportService } from '../services/ImportExportService';
import { StorageService } from '../services/StorageService';
import type { Collection } from '../services/types';

const importExportService = new ImportExportService();

/**
 * Register the importPostman command - imports a Postman collection file
 */
export function registerImportPostmanCommand(
  storageService: StorageService,
  onCollectionsUpdated: () => void
): vscode.Disposable {
  return vscode.commands.registerCommand('hivefetch.importPostman', async () => {
    // Open file dialog
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: {
        'Postman Collection': ['json', 'postman_collection.json'],
        'JSON Files': ['json'],
      },
      title: 'Import Postman Collection',
    });

    if (!uris || uris.length === 0) {
      return;
    }

    const uri = uris[0];

    try {
      // Import the collection
      const result = await importExportService.importPostmanCollection(uri);

      // Load existing collections
      const collections = await storageService.loadCollections();

      // Add the imported collection
      collections.push(result.collection);

      // Save collections
      await storageService.saveCollections(collections);

      // Notify about the update
      onCollectionsUpdated();

      // If variables were imported, offer to save them as an environment
      if (result.variables) {
        const saveVars = await vscode.window.showInformationMessage(
          `Collection "${result.collection.name}" imported successfully! Found ${result.variables.variables.length} collection variables. Save as environment?`,
          'Yes',
          'No'
        );

        if (saveVars === 'Yes') {
          const environments = await storageService.loadEnvironments();
          environments.environments.push(result.variables);
          await storageService.saveEnvironments(environments);
          vscode.window.showInformationMessage(
            `Environment "${result.variables.name}" created with ${result.variables.variables.length} variables.`
          );
        }
      } else {
        vscode.window.showInformationMessage(
          `Collection "${result.collection.name}" imported successfully!`
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Failed to import Postman collection: ${message}`);
    }
  });
}

/**
 * Register the exportPostman command - exports a collection to Postman format
 */
export function registerExportPostmanCommand(
  getCollections: () => Collection[]
): vscode.Disposable {
  return vscode.commands.registerCommand('hivefetch.exportPostman', async (collectionId?: string) => {
    const collections = getCollections();

    if (collections.length === 0) {
      vscode.window.showWarningMessage('No collections to export.');
      return;
    }

    let collection: Collection | undefined;

    if (collectionId) {
      collection = collections.find(c => c.id === collectionId);
    } else {
      // Show quick pick to select collection
      const items = collections.map(c => ({
        label: c.name,
        description: `${countItems(c)} items`,
        id: c.id,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a collection to export',
        title: 'Export to Postman',
      });

      if (!selected) {
        return;
      }

      collection = collections.find(c => c.id === selected.id);
    }

    if (!collection) {
      vscode.window.showErrorMessage('Collection not found.');
      return;
    }

    // Show save dialog
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(`${sanitizeFilename(collection.name)}.postman_collection.json`),
      filters: {
        'Postman Collection': ['json'],
      },
      title: 'Export Postman Collection',
    });

    if (!uri) {
      return;
    }

    try {
      await importExportService.exportToFile(collection, uri);
      vscode.window.showInformationMessage(
        `Collection "${collection.name}" exported successfully!`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Failed to export collection: ${message}`);
    }
  });
}

/**
 * Count total items (requests + folders) in a collection recursively
 */
function countItems(collection: Collection): number {
  function countRecursive(items: any[]): number {
    let count = 0;
    for (const item of items) {
      count++;
      if (item.type === 'folder' && item.children) {
        count += countRecursive(item.children);
      }
    }
    return count;
  }
  return countRecursive(collection.items);
}

/**
 * Sanitize filename by removing invalid characters
 */
function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim() || 'collection';
}
