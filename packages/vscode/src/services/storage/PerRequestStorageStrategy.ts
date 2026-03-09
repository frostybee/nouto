import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import type { IStorageStrategy } from './IStorageStrategy';
import type { Collection, CollectionItem, SavedRequest, Folder, EnvironmentsData } from '../types';
import { isFolder } from '../types';
import { sanitizeFilename, resolveCollision } from './filename-utils';

const COLLECTION_META = '_collection.json';
const FOLDER_META = '_folder.json';
const ORDER_FILE = '_order.json';
const RECENT_FILE = '_recent.json';

/**
 * Per-request storage strategy: each request is a separate .json file,
 * folders are directories, and collection/folder metadata lives in
 * _collection.json / _folder.json files.
 *
 * Layout:
 *   .hivefetch/
 *     .gitignore
 *     environments.json
 *     collections/
 *       My API/                   <- collection dir (sanitized collection name)
 *         _collection.json        <- collection metadata (no items)
 *         _order.json             <- ["Login", "folder:auth"]
 *         Login.json              <- request file
 *         auth/                   <- folder dir
 *           _folder.json          <- folder metadata
 *           _order.json
 *           Register.json
 *       _recent.json              <- builtin Recent collection (single file, gitignored)
 */
export class PerRequestStorageStrategy implements IStorageStrategy {
  private readonly collectionsDir: string;
  private readonly environmentsPath: string;
  private readonly gitignorePath: string;

  constructor(private readonly storageDir: string) {
    this.collectionsDir = path.join(storageDir, 'collections');
    this.environmentsPath = path.join(storageDir, 'environments.json');
    this.gitignorePath = path.join(storageDir, '.gitignore');
  }

  // ── Public API ────────────────────────────────────────────────────

  async loadCollections(): Promise<Collection[]> {
    try {
      if (!existsSync(this.collectionsDir)) {
        return [];
      }

      const entries = await fs.readdir(this.collectionsDir, { withFileTypes: true });
      const collections: Collection[] = [];

      // Load _recent.json if it exists (single-file builtin collection)
      const recentPath = path.join(this.collectionsDir, RECENT_FILE);
      if (existsSync(recentPath)) {
        try {
          const raw = await fs.readFile(recentPath, 'utf8');
          const recent = JSON.parse(raw) as Collection;
          collections.push(recent);
        } catch (error) {
          console.error('[HiveFetch] Failed to load _recent.json:', error);
        }
      }

      // Load each subdirectory as a collection
      const dirs = entries.filter(e => e.isDirectory());
      for (const dir of dirs) {
        try {
          const collection = await this.loadCollectionFromDir(
            path.join(this.collectionsDir, dir.name)
          );
          if (collection) {
            collections.push(collection);
          }
        } catch (error) {
          console.error(`[HiveFetch] Failed to load collection "${dir.name}":`, error);
        }
      }

      // Sort non-recent collections by name
      const recent = collections.filter(c => c.builtin === 'recent');
      const regular = collections.filter(c => c.builtin !== 'recent');
      regular.sort((a, b) => a.name.localeCompare(b.name));
      return [...recent, ...regular];
    } catch (error) {
      console.error('[HiveFetch] Failed to load collections:', error);
      return [];
    }
  }

  async saveCollections(collections: Collection[]): Promise<boolean> {
    try {
      await this.ensureDir();

      // Separate Recent collection (stored as single file)
      const recentCol = collections.find(c => c.builtin === 'recent');
      const regularCols = collections.filter(c => c.builtin !== 'recent');

      // Save Recent as _recent.json
      if (recentCol) {
        const recentPath = path.join(this.collectionsDir, RECENT_FILE);
        await fs.writeFile(recentPath, JSON.stringify(recentCol, null, 2), 'utf8');
      }

      // Save each regular collection to its own directory
      const savedDirNames = new Set<string>();
      for (const collection of regularCols) {
        const safeName = sanitizeFilename(collection.name);
        const dirName = resolveCollision(safeName, savedDirNames);
        savedDirNames.add(dirName);

        const dirPath = path.join(this.collectionsDir, dirName);
        await this.saveCollectionToDir(collection, dirPath);
      }

      // Delete orphaned collection directories
      const existing = await fs.readdir(this.collectionsDir, { withFileTypes: true });
      for (const entry of existing) {
        if (entry.isDirectory() && !savedDirNames.has(entry.name)) {
          await fs.rm(path.join(this.collectionsDir, entry.name), { recursive: true, force: true });
        }
      }

      // Delete orphaned _recent.json if no Recent collection
      if (!recentCol) {
        const recentPath = path.join(this.collectionsDir, RECENT_FILE);
        if (existsSync(recentPath)) {
          await fs.unlink(recentPath);
        }
      }

      return true;
    } catch (error) {
      console.error('[HiveFetch] Failed to save collections:', error);
      return false;
    }
  }

  async loadEnvironments(): Promise<EnvironmentsData> {
    try {
      if (existsSync(this.environmentsPath)) {
        const data = await fs.readFile(this.environmentsPath, 'utf8');
        return JSON.parse(data) as EnvironmentsData;
      }
    } catch (error) {
      console.error('[HiveFetch] Failed to load environments:', error);
    }
    return { environments: [], activeId: null };
  }

  async saveEnvironments(data: EnvironmentsData): Promise<boolean> {
    try {
      await this.ensureDir();
      await fs.writeFile(this.environmentsPath, JSON.stringify(data, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error('[HiveFetch] Failed to save environments:', error);
      return false;
    }
  }

  getStorageDir(): string {
    return this.storageDir;
  }

  async ensureGitignore(): Promise<void> {
    await this.ensureDir();
    if (!existsSync(this.gitignorePath)) {
      const content = '# Auto-generated by HiveFetch\n_recent.json\n';
      await fs.writeFile(this.gitignorePath, content, 'utf8');
    }
  }

  // ── Private: Directory operations ─────────────────────────────────

  private async ensureDir(): Promise<void> {
    if (!existsSync(this.storageDir)) {
      await fs.mkdir(this.storageDir, { recursive: true });
    }
    if (!existsSync(this.collectionsDir)) {
      await fs.mkdir(this.collectionsDir, { recursive: true });
    }
  }

  // ── Private: Load ─────────────────────────────────────────────────

  private async loadCollectionFromDir(dirPath: string): Promise<Collection | null> {
    const metaPath = path.join(dirPath, COLLECTION_META);
    if (!existsSync(metaPath)) {
      console.warn(`[HiveFetch] No ${COLLECTION_META} in ${dirPath}, skipping`);
      return null;
    }

    const metaRaw = await fs.readFile(metaPath, 'utf8');
    const meta = JSON.parse(metaRaw);

    // Load ordering
    const order = await this.loadOrder(dirPath);

    // Load items recursively
    const items = await this.loadItemsFromDir(dirPath, order);

    return {
      id: meta.id,
      name: meta.name,
      items,
      expanded: meta.expanded ?? true,
      auth: meta.auth,
      headers: meta.headers,
      variables: meta.variables,
      scripts: meta.scripts,
      description: meta.description,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
    };
  }

  private async loadOrder(dirPath: string): Promise<string[]> {
    const orderPath = path.join(dirPath, ORDER_FILE);
    if (!existsSync(orderPath)) return [];
    try {
      const raw = await fs.readFile(orderPath, 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async loadItemsFromDir(dirPath: string, order: string[]): Promise<CollectionItem[]> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const itemMap = new Map<string, CollectionItem>();

    // Load request files (.json, excluding metadata files)
    const metaFiles = new Set([COLLECTION_META, FOLDER_META, ORDER_FILE]);
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith('.json')) continue;
      if (metaFiles.has(entry.name)) continue;

      const slug = entry.name.replace(/\.json$/, '');
      try {
        const filePath = path.join(dirPath, entry.name);
        const raw = await fs.readFile(filePath, 'utf8');
        const request = JSON.parse(raw) as SavedRequest;
        request.type = 'request';
        itemMap.set(slug, request);
      } catch (error) {
        console.error(`[HiveFetch] Failed to load request "${entry.name}":`, error);
      }
    }

    // Load folder subdirectories
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const folderPath = path.join(dirPath, entry.name);
      const folderMetaPath = path.join(folderPath, FOLDER_META);
      if (!existsSync(folderMetaPath)) continue;

      try {
        const folderMetaRaw = await fs.readFile(folderMetaPath, 'utf8');
        const folderMeta = JSON.parse(folderMetaRaw);
        const folderOrder = await this.loadOrder(folderPath);
        const children = await this.loadItemsFromDir(folderPath, folderOrder);

        const folder: Folder = {
          type: 'folder',
          id: folderMeta.id,
          name: folderMeta.name,
          children,
          expanded: folderMeta.expanded ?? true,
          auth: folderMeta.auth,
          headers: folderMeta.headers,
          variables: folderMeta.variables,
          authInheritance: folderMeta.authInheritance,
          scripts: folderMeta.scripts,
          description: folderMeta.description,
          createdAt: folderMeta.createdAt,
          updatedAt: folderMeta.updatedAt,
        };
        itemMap.set(entry.name, folder);
      } catch (error) {
        console.error(`[HiveFetch] Failed to load folder "${entry.name}":`, error);
      }
    }

    // Apply ordering: items in _order.json first, then remaining
    const ordered: CollectionItem[] = [];
    for (const ref of order) {
      const item = itemMap.get(ref);
      if (item) {
        ordered.push(item);
        itemMap.delete(ref);
      }
    }
    for (const item of itemMap.values()) {
      ordered.push(item);
    }
    return ordered;
  }

  // ── Private: Save ─────────────────────────────────────────────────

  private async saveCollectionToDir(collection: Collection, dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });

    const usedNames = new Set<string>();
    const orderRefs: string[] = [];
    const writtenEntries = new Set<string>([COLLECTION_META, ORDER_FILE]);

    for (const item of collection.items) {
      if (isFolder(item)) {
        const safeName = sanitizeFilename(item.name);
        const dirName = resolveCollision(safeName, usedNames);
        usedNames.add(dirName);
        orderRefs.push(dirName);
        writtenEntries.add(dirName);

        await this.saveFolderToDir(item, path.join(dirPath, dirName));
      } else {
        const request = item as SavedRequest;
        const safeName = sanitizeFilename(request.name);
        const fileName = resolveCollision(safeName, usedNames);
        usedNames.add(fileName);
        orderRefs.push(fileName);

        const fullFilename = `${fileName}.json`;
        writtenEntries.add(fullFilename);
        await this.saveRequestFile(request, path.join(dirPath, fullFilename));
      }
    }

    // Write _collection.json (metadata only, no items)
    const meta = {
      id: collection.id,
      name: collection.name,
      expanded: collection.expanded,
      auth: collection.auth,
      headers: collection.headers,
      variables: collection.variables,
      scripts: collection.scripts,
      description: collection.description,
      createdAt: collection.createdAt,
      updatedAt: collection.updatedAt,
    };
    await fs.writeFile(path.join(dirPath, COLLECTION_META), JSON.stringify(meta, null, 2), 'utf8');

    // Write _order.json
    await fs.writeFile(path.join(dirPath, ORDER_FILE), JSON.stringify(orderRefs, null, 2), 'utf8');

    // Cleanup orphaned files/dirs
    await this.cleanOrphans(dirPath, writtenEntries);
  }

  private async saveFolderToDir(folder: Folder, dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });

    const usedNames = new Set<string>();
    const orderRefs: string[] = [];
    const writtenEntries = new Set<string>([FOLDER_META, ORDER_FILE]);

    for (const item of folder.children) {
      if (isFolder(item)) {
        const safeName = sanitizeFilename(item.name);
        const dirName = resolveCollision(safeName, usedNames);
        usedNames.add(dirName);
        orderRefs.push(dirName);
        writtenEntries.add(dirName);

        await this.saveFolderToDir(item, path.join(dirPath, dirName));
      } else {
        const request = item as SavedRequest;
        const safeName = sanitizeFilename(request.name);
        const fileName = resolveCollision(safeName, usedNames);
        usedNames.add(fileName);
        orderRefs.push(fileName);

        const fullFilename = `${fileName}.json`;
        writtenEntries.add(fullFilename);
        await this.saveRequestFile(request, path.join(dirPath, fullFilename));
      }
    }

    // Write _folder.json
    const meta = {
      id: folder.id,
      name: folder.name,
      expanded: folder.expanded,
      auth: folder.auth,
      headers: folder.headers,
      variables: folder.variables,
      authInheritance: folder.authInheritance,
      scripts: folder.scripts,
      description: folder.description,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
    };
    await fs.writeFile(path.join(dirPath, FOLDER_META), JSON.stringify(meta, null, 2), 'utf8');

    // Write _order.json
    await fs.writeFile(path.join(dirPath, ORDER_FILE), JSON.stringify(orderRefs, null, 2), 'utf8');

    // Cleanup orphans
    await this.cleanOrphans(dirPath, writtenEntries);
  }

  private async saveRequestFile(request: SavedRequest, filePath: string): Promise<void> {
    // Strip transient `type` field
    const { type, ...data } = request;
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  private async cleanOrphans(dirPath: string, kept: Set<string>): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!kept.has(entry.name)) {
          const fullPath = path.join(dirPath, entry.name);
          if (entry.isDirectory()) {
            await fs.rm(fullPath, { recursive: true, force: true });
          } else {
            await fs.unlink(fullPath);
          }
        }
      }
    } catch (error) {
      console.error(`[HiveFetch] Failed to clean orphans in ${dirPath}:`, error);
    }
  }
}
