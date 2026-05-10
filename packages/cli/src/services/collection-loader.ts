import * as fs from 'fs/promises';
import * as path from 'path';
import type { Collection, EnvironmentsData, SavedRequest, Folder, DataRow, EnvironmentVariable } from '@nouto/core';
import { isFolder } from '@nouto/core';
import {
  findFolderRecursive,
  findFolderByName,
  getAllRequestsFromItems,
} from '@nouto/core/services';
import type { NoutoExportFile } from '@nouto/core/services';
import { parseDataFile } from '@nouto/core/services';
import { EXIT } from '../lib/exit-codes';

export class CliError extends Error {
  constructor(message: string, public exitCode: number) {
    super(message);
    this.name = 'CliError';
  }
}

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
        throw new CliError(`Collection file not found: ${absolutePath}`, EXIT.FILE_NOT_FOUND);
      }
      throw new CliError(`Failed to read collection file: ${err.message}`, EXIT.OTHER_ERROR);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new CliError(`Invalid JSON in collection file: ${absolutePath}`, EXIT.INVALID_COLLECTION);
    }

    // NoutoExportFile format: { _format: 'nouto', collection: {...} }
    if (parsed._format === 'nouto' && parsed.collection) {
      return parsed.collection as Collection;
    }

    // Bulk export format: { _format: 'nouto', collections: [...] }
    if (parsed._format === 'nouto' && Array.isArray(parsed.collections)) {
      if (parsed.collections.length === 0) {
        throw new CliError('Bulk export file contains no collections', EXIT.INVALID_COLLECTION);
      }
      return parsed.collections[0] as Collection;
    }

    // Raw Collection format: { id, name, items }
    if (parsed.id && parsed.name && Array.isArray(parsed.items)) {
      return parsed as Collection;
    }

    throw new CliError(
      'Unrecognized collection file format. Expected Nouto export format or raw Collection JSON.',
      EXIT.INVALID_COLLECTION,
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
        throw new CliError(`Environment file not found: ${absolutePath}`, EXIT.ENV_NOT_FOUND);
      }
      throw new CliError(`Failed to read environment file: ${err.message}`, EXIT.OTHER_ERROR);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new CliError(`Invalid JSON in environment file: ${absolutePath}`, EXIT.ENV_NOT_FOUND);
    }

    // Standard EnvironmentsData format
    if (Array.isArray(parsed.environments)) {
      return parsed as EnvironmentsData;
    }

    throw new CliError(
      'Unrecognized environment file format. Expected { environments: [...], activeId?, globalVariables? }.',
      EXIT.ENV_NOT_FOUND,
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
   * Optionally filter by tags.
   */
  static getRequests(
    collection: Collection,
    folderId?: string,
    tags?: string[],
    excludeTags?: string[],
  ): SavedRequest[] {
    let requests: SavedRequest[];
    if (folderId) {
      const folder = CollectionLoader.findFolder(collection, folderId);
      if (!folder) {
        throw new CliError(`Folder not found: "${folderId}"`, EXIT.OTHER_ERROR);
      }
      requests = getAllRequestsFromItems(folder.children);
    } else {
      requests = getAllRequestsFromItems(collection.items);
    }

    if (tags && tags.length > 0) {
      requests = requests.filter(r =>
        tags.every(t => (r as any).tags?.includes(t)),
      );
    }
    if (excludeTags && excludeTags.length > 0) {
      requests = requests.filter(r =>
        !excludeTags.some(t => (r as any).tags?.includes(t)),
      );
    }

    return requests;
  }

  /**
   * Load a .env file and return as EnvironmentVariable[].
   */
  static async loadDotEnvFile(filePath: string): Promise<EnvironmentVariable[]> {
    const absolutePath = path.resolve(filePath);
    let content: string;
    try {
      content = await fs.readFile(absolutePath, 'utf-8');
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        throw new CliError(`.env file not found: ${absolutePath}`, EXIT.FILE_NOT_FOUND);
      }
      throw new CliError(`Failed to read .env file: ${err.message}`, EXIT.OTHER_ERROR);
    }

    const vars: EnvironmentVariable[] = [];
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      vars.push({ key, value, enabled: true });
    }
    return vars;
  }

  /**
   * Parse --env-var KEY=VALUE pairs into EnvironmentVariable[].
   */
  static parseEnvVarOverrides(pairs: string[]): EnvironmentVariable[] {
    return pairs.map(pair => {
      const eqIndex = pair.indexOf('=');
      if (eqIndex === -1) {
        throw new CliError(`Invalid --env-var format: "${pair}". Expected KEY=VALUE`, EXIT.OTHER_ERROR);
      }
      return {
        key: pair.slice(0, eqIndex),
        value: pair.slice(eqIndex + 1),
        enabled: true,
      };
    });
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
