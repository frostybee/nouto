import * as fs from 'fs/promises';
import * as path from 'path';
import type { Collection, EnvironmentsData, SavedRequest, Folder, DataRow } from '@nouto/core';
import { isFolder } from '@nouto/core';
import {
  findFolderRecursive,
  findFolderByName,
  getAllRequestsFromItems,
} from '@nouto/core/services';
import type { NoutoExportFile } from '@nouto/core/services';
import { parseDataFile } from '@nouto/core/services';

export class CollectionLoader {
  /**
   * Load a collection from a JSON file.
   * Supports both NoutoExportFile format and raw Collection objects.
   */
  static async loadCollection(filePath: string): Promise<Collection> {
    const absolutePath = path.resolve(filePath);
    let content: string;
    try {
      content = await fs.readFile(absolutePath, 'utf-8');
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        throw new Error(`Collection file not found: ${absolutePath}`);
      }
      throw new Error(`Failed to read collection file: ${err.message}`);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error(`Invalid JSON in collection file: ${absolutePath}`);
    }

    // NoutoExportFile format: { _format: 'nouto', collection: {...} }
    if (parsed._format === 'nouto' && parsed.collection) {
      return parsed.collection as Collection;
    }

    // Bulk export format: { _format: 'nouto', collections: [...] }
    if (parsed._format === 'nouto' && Array.isArray(parsed.collections)) {
      if (parsed.collections.length === 0) {
        throw new Error('Bulk export file contains no collections');
      }
      // Use first collection (user can specify --folder to target others)
      return parsed.collections[0] as Collection;
    }

    // Raw Collection format: { id, name, items }
    if (parsed.id && parsed.name && Array.isArray(parsed.items)) {
      return parsed as Collection;
    }

    throw new Error(
      'Unrecognized collection file format. Expected Nouto export format or raw Collection JSON.',
    );
  }

  /**
   * Load environments from a JSON file.
   */
  static async loadEnvironments(filePath: string): Promise<EnvironmentsData> {
    const absolutePath = path.resolve(filePath);
    let content: string;
    try {
      content = await fs.readFile(absolutePath, 'utf-8');
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        throw new Error(`Environment file not found: ${absolutePath}`);
      }
      throw new Error(`Failed to read environment file: ${err.message}`);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error(`Invalid JSON in environment file: ${absolutePath}`);
    }

    // Standard EnvironmentsData format
    if (Array.isArray(parsed.environments)) {
      return parsed as EnvironmentsData;
    }

    throw new Error(
      'Unrecognized environment file format. Expected { environments: [...], activeId?, globalVariables? }.',
    );
  }

  /**
   * Find a folder within a collection by name or ID.
   */
  static findFolder(collection: Collection, nameOrId: string): Folder | null {
    // Try by ID first
    const byId = findFolderRecursive(collection.items, nameOrId);
    if (byId) return byId;

    // Then by name
    return findFolderByName(collection.items, nameOrId);
  }

  /**
   * Get all requests from collection items, recursively.
   */
  static getRequests(collection: Collection, folderId?: string): SavedRequest[] {
    if (folderId) {
      const folder = CollectionLoader.findFolder(collection, folderId);
      if (!folder) {
        throw new Error(`Folder not found: "${folderId}"`);
      }
      return getAllRequestsFromItems(folder.children);
    }
    return getAllRequestsFromItems(collection.items);
  }

  /**
   * Parse a data file for data-driven testing.
   * Infers file type from extension.
   */
  static async loadDataFile(filePath: string): Promise<DataRow[]> {
    const ext = path.extname(filePath).toLowerCase();
    let fileType: 'csv' | 'json';
    if (ext === '.csv') {
      fileType = 'csv';
    } else if (ext === '.json') {
      fileType = 'json';
    } else {
      throw new Error(`Unsupported data file format: ${ext}. Use .csv or .json`);
    }
    return parseDataFile(filePath, fileType);
  }
}
