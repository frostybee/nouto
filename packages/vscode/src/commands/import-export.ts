import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';
import * as https from 'https';
import { ImportExportService } from '../services/ImportExportService';
import { OpenApiImportService } from '../services/OpenApiImportService';
import { StorageService } from '../services/StorageService';
import {
  InsomniaImportService, HoppscotchImportService,
  CurlParserService, ThunderClientImportService,
  NativeExportService,
  HarImportService, HarExportService,
  BrunoImportService,
} from '@hivefetch/core/services';
import type { Collection } from '../services/types';

function fetchUrl(url: string, redirectCount = 0): Promise<string> {
  if (redirectCount > 10) {
    return Promise.reject(new Error('Too many redirects'));
  }
  return new Promise((resolve, reject) => {
    const requestFn = url.startsWith('https:') ? https.get : http.get;
    const req = requestFn(url, { timeout: 30000 }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrl(res.headers.location, redirectCount + 1).then(resolve, reject);
        return;
      }
      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const maxSize = 10 * 1024 * 1024;
      let size = 0;
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxSize) { req.destroy(new Error('Response too large')); return; }
        chunks.push(chunk);
      });
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('Request timed out')); });
  });
}

const importExportService = new ImportExportService();
const openApiImportService = new OpenApiImportService();
const insomniaImportService = new InsomniaImportService();
const hoppscotchImportService = new HoppscotchImportService();
const curlParserService = new CurlParserService();
const thunderClientImportService = new ThunderClientImportService();
const nativeExportService = new NativeExportService();
const harImportService = new HarImportService();
const harExportService = new HarExportService();
const brunoImportService = new BrunoImportService();

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
    const defaultDir = path.join(os.homedir(), 'Desktop');
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(path.join(defaultDir, `${sanitizeFilename(collection.name)}.postman_collection.json`)),
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
 * Register the importOpenApi command - imports an OpenAPI v3 spec
 */
export function registerImportOpenApiCommand(
  storageService: StorageService,
  onCollectionsUpdated: () => void
): vscode.Disposable {
  return vscode.commands.registerCommand('hivefetch.importOpenApi', async () => {
    // Ask user: from file or URL?
    const source = await vscode.window.showQuickPick(
      [
        { label: 'From File', description: 'Select a local JSON or YAML file' },
        { label: 'From URL', description: 'Fetch spec from a URL' },
      ],
      { placeHolder: 'Import OpenAPI v3 specification', title: 'Import OpenAPI' }
    );

    if (!source) return;

    try {
      let result: { collection: any; variables?: any };

      if (source.label === 'From File') {
        const uris = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          filters: {
            'OpenAPI Spec': ['json', 'yaml', 'yml'],
            'JSON Files': ['json'],
            'YAML Files': ['yaml', 'yml'],
          },
          title: 'Import OpenAPI Specification',
        });

        if (!uris || uris.length === 0) return;
        result = await openApiImportService.importFromFile(uris[0]);
      } else {
        const url = await vscode.window.showInputBox({
          prompt: 'Enter the URL of the OpenAPI spec',
          placeHolder: 'https://petstore3.swagger.io/api/v3/openapi.json',
          title: 'Import OpenAPI from URL',
        });

        if (!url) return;
        result = await openApiImportService.importFromUrl(url);
      }

      // Save collection
      const collections = await storageService.loadCollections();
      collections.push(result.collection);
      await storageService.saveCollections(collections);
      onCollectionsUpdated();

      // Offer to save variables as environment
      if (result.variables) {
        const saveVars = await vscode.window.showInformationMessage(
          `Collection "${result.collection.name}" imported successfully! Found ${result.variables.variables.length} variables. Save as environment?`,
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
      vscode.window.showErrorMessage(`Failed to import OpenAPI spec: ${message}`);
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
 * Register the importInsomnia command
 */
export function registerImportInsomniaCommand(
  storageService: StorageService,
  onCollectionsUpdated: () => void
): vscode.Disposable {
  return vscode.commands.registerCommand('hivefetch.importInsomnia', async () => {
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: {
        'Insomnia Export': ['json', 'yaml', 'yml'],
        'JSON Files': ['json'],
        'YAML Files': ['yaml', 'yml'],
      },
      title: 'Import Insomnia Collection',
    });

    if (!uris || uris.length === 0) return;

    try {
      const result = await insomniaImportService.importFromFile(uris[0].fsPath);
      const collections = await storageService.loadCollections();
      collections.push(...result.collections);
      await storageService.saveCollections(collections);
      onCollectionsUpdated();

      const names = result.collections.map(c => c.name).join(', ');
      vscode.window.showInformationMessage(`Imported ${result.collections.length} collection(s): ${names}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Failed to import Insomnia collection: ${message}`);
    }
  });
}

/**
 * Register the importHoppscotch command
 */
export function registerImportHoppscotchCommand(
  storageService: StorageService,
  onCollectionsUpdated: () => void
): vscode.Disposable {
  return vscode.commands.registerCommand('hivefetch.importHoppscotch', async () => {
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: {
        'Hoppscotch Collection': ['json'],
        'JSON Files': ['json'],
      },
      title: 'Import Hoppscotch Collection',
    });

    if (!uris || uris.length === 0) return;

    try {
      const result = await hoppscotchImportService.importFromFile(uris[0].fsPath);
      const collections = await storageService.loadCollections();
      collections.push(...result.collections);
      await storageService.saveCollections(collections);
      onCollectionsUpdated();

      const names = result.collections.map(c => c.name).join(', ');
      vscode.window.showInformationMessage(`Imported ${result.collections.length} collection(s): ${names}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Failed to import Hoppscotch collection: ${message}`);
    }
  });
}

/**
 * Register the importCurl command
 */
export function registerImportCurlCommand(
  storageService: StorageService,
  onCollectionsUpdated: () => void
): vscode.Disposable {
  return vscode.commands.registerCommand('hivefetch.importCurl', async () => {
    const curlInput = await vscode.window.showInputBox({
      prompt: 'Paste your cURL command',
      placeHolder: "curl -X GET 'https://api.example.com/users'",
      title: 'Import from cURL',
    });

    if (!curlInput) return;

    try {
      const request = curlParserService.importFromString(curlInput);

      // Ask which collection to save to, or create new
      const collections = await storageService.loadCollections();
      const items = [
        { label: '+ New Collection', id: '__new__' },
        ...collections.map(c => ({ label: c.name, id: c.id })),
      ];

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Save to collection',
        title: 'Import cURL Request',
      });

      if (!selected) return;

      if (selected.id === '__new__') {
        const name = await vscode.window.showInputBox({
          prompt: 'Collection name',
          value: 'Imported cURL',
        });
        if (!name) return;

        const now = new Date().toISOString();
        const newCol: Collection = {
          id: `col-${Date.now()}`,
          name,
          items: [request],
          expanded: true,
          createdAt: now,
          updatedAt: now,
        };
        collections.push(newCol);
      } else {
        const col = collections.find(c => c.id === selected.id);
        if (col) {
          col.items.push(request);
          col.updatedAt = new Date().toISOString();
        }
      }

      await storageService.saveCollections(collections);
      onCollectionsUpdated();
      vscode.window.showInformationMessage(`Imported request "${request.name}" from cURL`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Failed to parse cURL: ${message}`);
    }
  });
}

/**
 * Auto-detect format and import collections from file content.
 * Returns the imported collections.
 */
async function detectAndImportContent(
  content: string,
  fileExtension: string,
): Promise<{ collections: Collection[]; formatName: string }> {
  const yaml = require('js-yaml');

  // Try YAML first for .yaml/.yml files, then JSON
  let parsed: any;
  if (fileExtension === '.yaml' || fileExtension === '.yml') {
    parsed = yaml.load(content);
  } else {
    try {
      parsed = JSON.parse(content);
    } catch {
      // Not JSON, try YAML as fallback
      try {
        parsed = yaml.load(content);
      } catch {
        throw new Error('File is not valid JSON or YAML.');
      }
    }
  }

  if (parsed === null || parsed === undefined || typeof parsed !== 'object') {
    throw new Error('File content could not be parsed as a valid collection format.');
  }

  if (parsed._format === 'hivefetch') {
    return { collections: nativeExportService.importCollections(content), formatName: 'HiveFetch' };
  }

  if (parsed.info?.schema?.includes('getpostman.com')) {
    const tmpFile = path.join(os.tmpdir(), `hivefetch-postman-${Date.now()}.json`);
    const fsSync = require('fs') as typeof import('fs');
    fsSync.writeFileSync(tmpFile, content, 'utf-8');
    try {
      const result = await importExportService.importPostmanCollection(vscode.Uri.file(tmpFile));
      return { collections: [result.collection], formatName: 'Postman' };
    } finally {
      try { fsSync.unlinkSync(tmpFile); } catch {}
    }
  }

  if (parsed.openapi && parsed.paths) {
    const tmpFile = path.join(os.tmpdir(), `hivefetch-openapi-${Date.now()}${fileExtension}`);
    const fsSync = require('fs') as typeof import('fs');
    fsSync.writeFileSync(tmpFile, content, 'utf-8');
    try {
      const result = await openApiImportService.importFromFile(vscode.Uri.file(tmpFile));
      return { collections: [result.collection], formatName: 'OpenAPI' };
    } finally {
      try { fsSync.unlinkSync(tmpFile); } catch {}
    }
  }

  if (parsed._type === 'export' && parsed.resources) {
    const result = insomniaImportService.importFromString(content);
    return { collections: result.collections, formatName: 'Insomnia' };
  }

  if (parsed.v !== undefined && (parsed.folders || parsed.requests)) {
    const result = hoppscotchImportService.importFromString(content);
    return { collections: result.collections, formatName: 'Hoppscotch' };
  }

  if (Array.isArray(parsed) && parsed[0]?.folders !== undefined) {
    const result = hoppscotchImportService.importFromString(content);
    return { collections: result.collections, formatName: 'Hoppscotch' };
  }

  // HAR file (has log.entries or log.version)
  if (parsed.log && (parsed.log.entries || parsed.log.version)) {
    const result = harImportService.importFromString(content);
    return { collections: [result.collection], formatName: 'HAR' };
  }

  // Postman environment file (has values array but no item array)
  if (parsed.values && Array.isArray(parsed.values) && !parsed.item) {
    throw new Error(
      'This looks like a Postman Environment file, not a collection. Use "Import Postman Environment" instead.'
    );
  }

  throw new Error('Could not detect collection format. Supported: Postman, OpenAPI, Insomnia, Hoppscotch, HAR, HiveFetch.');
}

/**
 * Register the importAuto command - auto-detects format from file content
 */
export function registerImportAutoCommand(
  storageService: StorageService,
  onCollectionsUpdated: () => void
): vscode.Disposable {
  return vscode.commands.registerCommand('hivefetch.importAuto', async () => {
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: {
        'Collections': ['json', 'yaml', 'yml'],
      },
      title: 'Import Collection',
    });

    if (!uris || uris.length === 0) return;

    try {
      const uri = uris[0];
      const content = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf-8');
      const ext = path.extname(uri.fsPath).toLowerCase();

      const { collections: importedCollections, formatName } = await detectAndImportContent(content, ext);

      const collections = await storageService.loadCollections();
      collections.push(...importedCollections);
      await storageService.saveCollections(collections);
      onCollectionsUpdated();

      const names = importedCollections.map(c => c.name).join(', ');
      vscode.window.showInformationMessage(`Imported ${importedCollections.length} ${formatName} collection(s): ${names}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Failed to import collection: ${message}`);
    }
  });
}

/**
 * Register the importFromUrl command
 */
export function registerImportFromUrlCommand(
  storageService: StorageService,
  onCollectionsUpdated: () => void
): vscode.Disposable {
  return vscode.commands.registerCommand('hivefetch.importFromUrl', async () => {
    const url = await vscode.window.showInputBox({
      prompt: 'Enter the URL of the collection/spec to import',
      placeHolder: 'https://petstore3.swagger.io/api/v3/openapi.json',
      title: 'Import from URL',
    });

    if (!url) return;

    try {
      // Validate URL scheme to prevent SSRF attacks
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        vscode.window.showErrorMessage('Invalid URL format.');
        return;
      }
      if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
        vscode.window.showErrorMessage('Only HTTP and HTTPS URLs are supported.');
        return;
      }

      const content = await fetchUrl(url);
      const ext = path.extname(parsedUrl.pathname).toLowerCase() || '.json';

      const { collections: importedCollections, formatName } = await detectAndImportContent(content, ext);

      const collections = await storageService.loadCollections();
      collections.push(...importedCollections);
      await storageService.saveCollections(collections);
      onCollectionsUpdated();

      const names = importedCollections.map(c => c.name).join(', ');
      vscode.window.showInformationMessage(`Imported ${importedCollections.length} ${formatName} collection(s): ${names}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Failed to import from URL: ${message}`);
    }
  });
}

/**
 * Register the bulkExport command - exports multiple collections at once
 */
export function registerBulkExportCommand(
  getCollections: () => Collection[]
): vscode.Disposable {
  return vscode.commands.registerCommand('hivefetch.bulkExport', async (collectionIds?: string[]) => {
    const allCollections = getCollections();

    if (allCollections.length === 0) {
      vscode.window.showWarningMessage('No collections to export.');
      return;
    }

    const toExport = collectionIds
      ? allCollections.filter(c => collectionIds.includes(c.id))
      : allCollections;

    if (toExport.length === 0) {
      vscode.window.showWarningMessage('No matching collections found.');
      return;
    }

    const defaultDir = path.join(os.homedir(), 'Desktop');
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(path.join(defaultDir, 'collections.postman_export.json')),
      filters: { 'Postman Export': ['json'] },
      title: 'Bulk Export to Postman',
    });

    if (!uri) return;

    try {
      const postmanCollections = [];
      for (const collection of toExport) {
        postmanCollections.push(await importExportService.exportToPostman(collection));
      }

      const exportData = {
        _type: 'postman-bulk-export',
        _exportedAt: new Date().toISOString(),
        collections: postmanCollections,
      };

      const content = JSON.stringify(exportData, null, 2);
      await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
      vscode.window.showInformationMessage(
        `Exported ${postmanCollections.length} collection(s) to ${path.basename(uri.fsPath)}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Failed to export collections: ${message}`);
    }
  });
}

export function registerBulkExportNativeCommand(
  getCollections: () => Collection[]
): vscode.Disposable {
  return vscode.commands.registerCommand('hivefetch.bulkExportNative', async (collectionIds?: string[]) => {
    const allCollections = getCollections();

    if (allCollections.length === 0) {
      vscode.window.showWarningMessage('No collections to export.');
      return;
    }

    const toExport = collectionIds
      ? allCollections.filter(c => collectionIds.includes(c.id))
      : allCollections;

    if (toExport.length === 0) {
      vscode.window.showWarningMessage('No matching collections found.');
      return;
    }

    const defaultDir = path.join(os.homedir(), 'Desktop');
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(path.join(defaultDir, 'collections.hivefetch.json')),
      filters: { 'HiveFetch Export': ['json'] },
      title: 'Bulk Export as HiveFetch',
    });

    if (!uri) return;

    try {
      const exportedCollections = toExport.map(c => JSON.parse(JSON.stringify(c)));

      const exportData = {
        _format: 'hivefetch',
        _version: '1.0',
        _exportedAt: new Date().toISOString(),
        collections: exportedCollections,
      };

      const content = JSON.stringify(exportData, null, 2);
      await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
      vscode.window.showInformationMessage(
        `Exported ${exportedCollections.length} collection(s) to ${path.basename(uri.fsPath)}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Failed to export collections: ${message}`);
    }
  });
}

/**
 * Register the importThunderClient command
 */
export function registerImportThunderClientCommand(
  storageService: StorageService,
  onCollectionsUpdated: () => void
): vscode.Disposable {
  return vscode.commands.registerCommand('hivefetch.importThunderClient', async () => {
    const source = await vscode.window.showQuickPick(
      [
        { label: 'From File', description: 'Select a Thunder Client export JSON file' },
        { label: 'From Folder', description: 'Select the thunder-tests/ folder' },
      ],
      { placeHolder: 'Import Thunder Client data', title: 'Import Thunder Client' }
    );

    if (!source) return;

    try {
      let result: { collections: Collection[] };

      if (source.label === 'From Folder') {
        const uris = await vscode.window.showOpenDialog({
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          title: 'Select thunder-tests folder',
        });
        if (!uris || uris.length === 0) return;
        result = await thunderClientImportService.importFromFolder(uris[0].fsPath);
      } else {
        const uris = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          filters: {
            'Thunder Client Export': ['json'],
            'JSON Files': ['json'],
          },
          title: 'Import Thunder Client Collection',
        });
        if (!uris || uris.length === 0) return;
        result = await thunderClientImportService.importFromFile(uris[0].fsPath);
      }

      const collections = await storageService.loadCollections();
      collections.push(...result.collections);
      await storageService.saveCollections(collections);
      onCollectionsUpdated();

      const names = result.collections.map(c => c.name).join(', ');
      vscode.window.showInformationMessage(`Imported ${result.collections.length} collection(s): ${names}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Failed to import Thunder Client data: ${message}`);
    }
  });
}

/**
 * Register the exportNative command - exports a collection in lossless HiveFetch format
 */
export function registerExportNativeCommand(
  getCollections: () => Collection[]
): vscode.Disposable {
  return vscode.commands.registerCommand('hivefetch.exportNative', async (collectionId?: string) => {
    const collections = getCollections();

    if (collections.length === 0) {
      vscode.window.showWarningMessage('No collections to export.');
      return;
    }

    let collection: Collection | undefined;

    if (collectionId) {
      collection = collections.find(c => c.id === collectionId);
    } else {
      const items = collections.map(c => ({
        label: c.name,
        description: `${countItems(c)} items`,
        id: c.id,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a collection to export',
        title: 'Export as HiveFetch Format',
      });

      if (!selected) return;
      collection = collections.find(c => c.id === selected.id);
    }

    if (!collection) {
      vscode.window.showErrorMessage('Collection not found.');
      return;
    }

    const defaultDir = path.join(os.homedir(), 'Desktop');
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(path.join(defaultDir, `${sanitizeFilename(collection.name)}.hivefetch.json`)),
      filters: {
        'HiveFetch Collection': ['json'],
      },
      title: 'Export as HiveFetch Format',
    });

    if (!uri) return;

    try {
      const exportData = nativeExportService.exportCollection(collection);
      const content = JSON.stringify(exportData, null, 2);
      await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
      vscode.window.showInformationMessage(`Collection "${collection.name}" exported as HiveFetch format!`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Failed to export collection: ${message}`);
    }
  });
}

/**
 * Register the importHar command - imports a HAR file
 */
export function registerImportHarCommand(
  storageService: StorageService,
  onCollectionsUpdated: () => void
): vscode.Disposable {
  return vscode.commands.registerCommand('hivefetch.importHar', async () => {
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: {
        'HAR Files': ['har', 'json'],
      },
      title: 'Import HAR File',
    });

    if (!uris || uris.length === 0) return;

    try {
      const content = Buffer.from(await vscode.workspace.fs.readFile(uris[0])).toString('utf-8');
      const result = harImportService.importFromString(content);

      const collections = await storageService.loadCollections();
      collections.push(result.collection);
      await storageService.saveCollections(collections);
      onCollectionsUpdated();

      vscode.window.showInformationMessage(
        `Imported ${result.collection.items.length} requests from HAR file as "${result.collection.name}".`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Failed to import HAR file: ${message}`);
    }
  });
}

/**
 * Register the exportHar command - exports a collection as HAR
 */
export function registerExportHarCommand(
  storageService: StorageService
): vscode.Disposable {
  return vscode.commands.registerCommand('hivefetch.exportHar', async () => {
    const collections = await storageService.loadCollections();
    const exportable = collections.filter(c => !c.builtin && c.items.length > 0);

    if (exportable.length === 0) {
      vscode.window.showWarningMessage('No collections to export.');
      return;
    }

    const selected = await vscode.window.showQuickPick(
      exportable.map(c => ({ label: c.name, description: `${c.items.length} items`, id: c.id })),
      { placeHolder: 'Select collection to export as HAR', title: 'Export as HAR' }
    );

    if (!selected) return;

    const collection = exportable.find(c => c.id === selected.id);
    if (!collection) return;

    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(`${sanitizeFilename(collection.name)}.har`),
      filters: { 'HAR Files': ['har'] },
      title: 'Export as HAR',
    });

    if (!uri) return;

    try {
      const harContent = harExportService.exportCollectionItems(collection.items);
      await vscode.workspace.fs.writeFile(uri, Buffer.from(harContent, 'utf-8'));
      vscode.window.showInformationMessage(`Collection exported as HAR to ${uri.fsPath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Failed to export HAR: ${message}`);
    }
  });
}

/**
 * Register the importBruno command - imports a Bruno collection folder
 */
export function registerImportBrunoCommand(
  storageService: StorageService,
  onCollectionsUpdated: () => void
): vscode.Disposable {
  return vscode.commands.registerCommand('hivefetch.importBruno', async () => {
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      title: 'Select Bruno Collection Folder',
    });

    if (!uris || uris.length === 0) return;

    try {
      const folderUri = uris[0];
      const files = new Map<string, string>();

      // Recursively read all .bru files
      const readBruFiles = async (baseUri: vscode.Uri, prefix = '') => {
        const entries = await vscode.workspace.fs.readDirectory(baseUri);
        for (const [name, type] of entries) {
          const childUri = vscode.Uri.joinPath(baseUri, name);
          const relativePath = prefix ? `${prefix}/${name}` : name;

          if (type === vscode.FileType.File && name.endsWith('.bru')) {
            const content = Buffer.from(await vscode.workspace.fs.readFile(childUri)).toString('utf-8');
            files.set(relativePath, content);
          } else if (type === vscode.FileType.Directory && !name.startsWith('.')) {
            await readBruFiles(childUri, relativePath);
          }
        }
      };

      await readBruFiles(folderUri);

      if (files.size === 0) {
        vscode.window.showWarningMessage('No .bru files found in the selected folder.');
        return;
      }

      const result = brunoImportService.importFromFiles(files);

      // Use folder name as collection name
      const folderName = path.basename(folderUri.fsPath);
      result.collection.name = folderName;

      const collections = await storageService.loadCollections();
      collections.push(result.collection);
      await storageService.saveCollections(collections);
      onCollectionsUpdated();

      vscode.window.showInformationMessage(
        `Imported Bruno collection "${folderName}" with ${files.size} request(s).`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Failed to import Bruno collection: ${message}`);
    }
  });
}

/**
 * Register the importNative command - imports a HiveFetch collection file
 */
export function registerImportNativeCommand(
  storageService: StorageService,
  onCollectionsUpdated: () => void
): vscode.Disposable {
  return vscode.commands.registerCommand('hivefetch.importNative', async () => {
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: {
        'HiveFetch Collection': ['json', 'hivefetch.json'],
        'JSON Files': ['json'],
      },
      title: 'Import HiveFetch Collection',
    });

    if (!uris || uris.length === 0) return;

    try {
      const content = Buffer.from(await vscode.workspace.fs.readFile(uris[0])).toString('utf-8');
      const imported = nativeExportService.importCollections(content);

      const collections = await storageService.loadCollections();
      collections.push(...imported);
      await storageService.saveCollections(collections);
      onCollectionsUpdated();

      if (imported.length === 1) {
        vscode.window.showInformationMessage(`Collection "${imported[0].name}" imported successfully!`);
      } else {
        vscode.window.showInformationMessage(`${imported.length} collections imported successfully!`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Failed to import HiveFetch collection: ${message}`);
    }
  });
}

/**
 * Register the importPostmanEnvironment command - imports a Postman environment file
 */
export function registerImportPostmanEnvironmentCommand(
  storageService: StorageService,
  onEnvironmentsUpdated: () => void
): vscode.Disposable {
  return vscode.commands.registerCommand('hivefetch.importPostmanEnvironment', async () => {
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: true,
      filters: {
        'Postman Environment': ['json', 'postman_environment.json'],
      },
      title: 'Import Postman Environment',
    });

    if (!uris || uris.length === 0) return;

    try {
      const environments = await storageService.loadEnvironments();
      let importedCount = 0;

      for (const uri of uris) {
        const content = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf-8');
        const parsed = JSON.parse(content);

        // Validate Postman environment format
        if (!parsed.values || !Array.isArray(parsed.values)) {
          vscode.window.showWarningMessage(`Skipped "${uri.fsPath}": not a valid Postman environment file.`);
          continue;
        }

        const env = {
          id: `env-${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 6)}`,
          name: parsed.name || path.basename(uri.fsPath, '.json').replace('.postman_environment', ''),
          variables: parsed.values.map((v: any) => ({
            key: v.key || '',
            value: v.value || '',
            enabled: v.enabled !== false,
          })),
        };

        environments.environments.push(env);
        importedCount++;
      }

      if (importedCount > 0) {
        await storageService.saveEnvironments(environments);
        onEnvironmentsUpdated();
        vscode.window.showInformationMessage(
          `Imported ${importedCount} Postman environment(s) successfully!`
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      vscode.window.showErrorMessage(`Failed to import Postman environment: ${message}`);
    }
  });
}

/**
 * Sanitize filename by removing invalid characters
 */
function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim() || 'collection';
}
