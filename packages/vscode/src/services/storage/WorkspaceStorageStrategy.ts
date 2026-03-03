import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import type { IStorageStrategy } from './IStorageStrategy';
import type { Collection, CollectionItem, SavedRequest, Folder, EnvironmentsData } from '../types';
import { isFolder, isRequest } from '../types';

export type CollectionFormat = 'json' | 'yaml';

/**
 * Meta file stored in each collection/folder directory.
 * Contains metadata + sort order for deterministic item ordering.
 */
interface MetaFile {
  id: string;
  name: string;
  expanded: boolean;
  auth?: any;
  headers?: any[];
  variables?: any[];
  authInheritance?: string;
  scripts?: any;
  description?: string;
  sortOrder: string[];  // filenames (without extension) in display order
  createdAt: string;
  updatedAt: string;
}

const META_FILENAME = '_meta.json';

/**
 * Workspace-scoped storage strategy that stores collections in `.hivefetch/collections/`.
 *
 * Layout:
 *   .hivefetch/
 *     .gitignore
 *     environments.json
 *     collections/
 *       my-api/           <- collection directory
 *         _meta.json      <- collection metadata + sort order
 *         login.json      <- request file (SavedRequest)
 *         auth/            <- folder directory
 *           _meta.json    <- folder metadata
 *           signup.json   <- request file
 */
export class WorkspaceStorageStrategy implements IStorageStrategy {
  private readonly hivefetchDir: string;
  private readonly collectionsDir: string;
  private readonly environmentsPath: string;
  private readonly gitignorePath: string;
  private readonly format: CollectionFormat;

  constructor(private readonly workspaceRoot: string, format: CollectionFormat = 'json') {
    this.hivefetchDir = path.join(workspaceRoot, '.hivefetch');
    this.collectionsDir = path.join(this.hivefetchDir, 'collections');
    this.environmentsPath = path.join(this.hivefetchDir, 'environments.json');
    this.gitignorePath = path.join(this.hivefetchDir, '.gitignore');
    this.format = format;
  }

  /** File extension for request files based on configured format. */
  private get requestExt(): string {
    return this.format === 'yaml' ? '.yaml' : '.json';
  }

  // ── Public API (IStorageStrategy) ──────────────────────────────────

  async loadCollections(): Promise<Collection[]> {
    try {
      if (!existsSync(this.collectionsDir)) {
        return [];
      }

      const entries = await fs.readdir(this.collectionsDir, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory());
      const collections: Collection[] = [];

      for (const dir of dirs) {
        try {
          const collection = await this.loadCollectionFromDir(
            path.join(this.collectionsDir, dir.name)
          );
          if (collection) {
            collections.push(collection);
          }
        } catch (error) {
          console.error(`[HiveFetch] Failed to load workspace collection "${dir.name}":`, error);
        }
      }

      // Sort by name for deterministic order
      collections.sort((a, b) => a.name.localeCompare(b.name));
      return collections;
    } catch (error) {
      console.error('[HiveFetch] Failed to load workspace collections:', error);
      return [];
    }
  }

  async saveCollections(collections: Collection[]): Promise<boolean> {
    try {
      await this.ensureDir();

      // Track which directories we write to (for orphan cleanup)
      const savedDirNames = new Set<string>();

      for (const collection of collections) {
        // Skip builtin collections (Recent is always global)
        if (collection.builtin) continue;

        const dirName = this.slugify(collection.name, savedDirNames);
        savedDirNames.add(dirName);
        const dirPath = path.join(this.collectionsDir, dirName);
        await this.saveCollectionToDir(collection, dirPath);
      }

      // Delete orphaned collection directories
      if (existsSync(this.collectionsDir)) {
        const existing = await fs.readdir(this.collectionsDir, { withFileTypes: true });
        for (const entry of existing) {
          if (entry.isDirectory() && !savedDirNames.has(entry.name)) {
            await fs.rm(path.join(this.collectionsDir, entry.name), { recursive: true, force: true });
          }
        }
      }

      return true;
    } catch (error) {
      console.error('[HiveFetch] Failed to save workspace collections:', error);
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
      console.error('[HiveFetch] Failed to load workspace environments:', error);
    }
    return { environments: [], activeId: null };
  }

  async saveEnvironments(data: EnvironmentsData): Promise<boolean> {
    try {
      await this.ensureDir();
      await fs.writeFile(this.environmentsPath, JSON.stringify(data, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error('[HiveFetch] Failed to save workspace environments:', error);
      return false;
    }
  }

  getStorageDir(): string {
    return this.hivefetchDir;
  }

  async ensureGitignore(): Promise<void> {
    await this.ensureDir();
    if (!existsSync(this.gitignorePath)) {
      const content = '# Auto-generated by HiveFetch\nenvironments/secrets.json\n';
      await fs.writeFile(this.gitignorePath, content, 'utf8');
    }
  }

  // ── Private: Directory operations ──────────────────────────────────

  private async ensureDir(): Promise<void> {
    if (!existsSync(this.hivefetchDir)) {
      await fs.mkdir(this.hivefetchDir, { recursive: true });
    }
    if (!existsSync(this.collectionsDir)) {
      await fs.mkdir(this.collectionsDir, { recursive: true });
    }
  }

  // ── Private: Load ──────────────────────────────────────────────────

  private async loadCollectionFromDir(dirPath: string): Promise<Collection | null> {
    const metaPath = path.join(dirPath, META_FILENAME);
    if (!existsSync(metaPath)) {
      console.warn(`[HiveFetch] No ${META_FILENAME} in ${dirPath}, skipping`);
      return null;
    }

    const metaRaw = await fs.readFile(metaPath, 'utf8');
    const meta: MetaFile = JSON.parse(metaRaw);

    const items = await this.loadItemsFromDir(dirPath, meta.sortOrder);

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

  private async loadItemsFromDir(dirPath: string, sortOrder: string[]): Promise<CollectionItem[]> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const itemMap = new Map<string, CollectionItem>();

    // Load request files (.json / .yaml / .yml, not _meta.json)
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const name = entry.name;

      let slug: string | null = null;
      let isYaml = false;
      if (name.endsWith('.json') && name !== META_FILENAME) {
        slug = name.replace(/\.json$/, '');
      } else if (name.endsWith('.yaml')) {
        slug = name.replace(/\.yaml$/, '');
        isYaml = true;
      } else if (name.endsWith('.yml')) {
        slug = name.replace(/\.yml$/, '');
        isYaml = true;
      }
      if (!slug) continue;

      // If we already loaded this slug (e.g., both .json and .yaml exist), skip
      if (itemMap.has(slug)) continue;

      try {
        const filePath = path.join(dirPath, name);
        const raw = await fs.readFile(filePath, 'utf8');
        const request = (isYaml ? yaml.load(raw) : JSON.parse(raw)) as SavedRequest;
        request.type = 'request';
        itemMap.set(slug, request);
      } catch (error) {
        console.error(`[HiveFetch] Failed to load request "${name}":`, error);
      }
    }

    // Load folder subdirectories
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const folderPath = path.join(dirPath, entry.name);
      const folderMetaPath = path.join(folderPath, META_FILENAME);
      if (!existsSync(folderMetaPath)) continue;

      try {
        const folderMetaRaw = await fs.readFile(folderMetaPath, 'utf8');
        const folderMeta: MetaFile = JSON.parse(folderMetaRaw);

        const children = await this.loadItemsFromDir(folderPath, folderMeta.sortOrder);

        const folder: Folder = {
          type: 'folder',
          id: folderMeta.id,
          name: folderMeta.name,
          children,
          expanded: folderMeta.expanded ?? true,
          auth: folderMeta.auth,
          headers: folderMeta.headers,
          variables: folderMeta.variables,
          authInheritance: folderMeta.authInheritance as any,
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

    // Order by sortOrder, then append any items not in sortOrder
    const ordered: CollectionItem[] = [];
    for (const slug of sortOrder) {
      const item = itemMap.get(slug);
      if (item) {
        ordered.push(item);
        itemMap.delete(slug);
      }
    }
    // Append remaining items not in sortOrder (newly added or unknown)
    for (const item of itemMap.values()) {
      ordered.push(item);
    }

    return ordered;
  }

  // ── Private: Save ──────────────────────────────────────────────────

  private async saveCollectionToDir(collection: Collection, dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });

    // Build sort order and save items
    const usedSlugs = new Set<string>();
    const sortOrder: string[] = [];

    // Track which files/dirs we write (for orphan cleanup)
    const writtenFiles = new Set<string>([META_FILENAME]);

    for (const item of collection.items) {
      const slug = this.slugifyItem(item, usedSlugs);
      usedSlugs.add(slug);
      sortOrder.push(slug);

      if (isFolder(item)) {
        await this.saveFolderToDir(item, path.join(dirPath, slug), usedSlugs);
        writtenFiles.add(slug); // directory name
      } else {
        const filename = `${slug}${this.requestExt}`;
        await this.saveRequestFile(item, path.join(dirPath, filename));
        writtenFiles.add(filename);
      }
    }

    // Write _meta.json (always JSON - internal metadata)
    const meta: MetaFile = {
      id: collection.id,
      name: collection.name,
      expanded: collection.expanded,
      auth: collection.auth,
      headers: collection.headers,
      variables: collection.variables,
      scripts: collection.scripts,
      description: collection.description,
      sortOrder,
      createdAt: collection.createdAt,
      updatedAt: collection.updatedAt,
    };
    await fs.writeFile(path.join(dirPath, META_FILENAME), JSON.stringify(meta, null, 2), 'utf8');

    // Cleanup orphaned files/dirs
    await this.cleanOrphans(dirPath, writtenFiles);
  }

  private async saveFolderToDir(folder: Folder, dirPath: string, _parentUsedSlugs?: Set<string>): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });

    const usedSlugs = new Set<string>();
    const sortOrder: string[] = [];
    const writtenFiles = new Set<string>([META_FILENAME]);

    for (const item of folder.children) {
      const slug = this.slugifyItem(item, usedSlugs);
      usedSlugs.add(slug);
      sortOrder.push(slug);

      if (isFolder(item)) {
        await this.saveFolderToDir(item, path.join(dirPath, slug), usedSlugs);
        writtenFiles.add(slug);
      } else {
        const filename = `${slug}${this.requestExt}`;
        await this.saveRequestFile(item, path.join(dirPath, filename));
        writtenFiles.add(filename);
      }
    }

    // Write folder _meta.json
    const meta: MetaFile = {
      id: folder.id,
      name: folder.name,
      expanded: folder.expanded,
      auth: folder.auth,
      headers: folder.headers,
      variables: folder.variables,
      authInheritance: folder.authInheritance,
      scripts: folder.scripts,
      description: folder.description,
      sortOrder,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
    };
    await fs.writeFile(path.join(dirPath, META_FILENAME), JSON.stringify(meta, null, 2), 'utf8');

    await this.cleanOrphans(dirPath, writtenFiles);
  }

  private async saveRequestFile(request: SavedRequest, filePath: string): Promise<void> {
    // Strip transient `type` field - it's implicit from being a file (not a directory)
    const { type, ...data } = request;
    const content = this.format === 'yaml'
      ? yaml.dump(data, { lineWidth: 120, noRefs: true })
      : JSON.stringify(data, null, 2);
    await fs.writeFile(filePath, content, 'utf8');
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

  // ── Private: Slug helpers ──────────────────────────────────────────

  private slugifyItem(item: CollectionItem, usedSlugs: Set<string>): string {
    const name = isFolder(item) ? item.name : (item as SavedRequest).name;
    return this.slugify(name, usedSlugs);
  }

  /**
   * Convert a name to a filesystem-safe slug.
   * Resolves collisions by appending -2, -3, etc.
   */
  slugify(name: string, usedSlugs?: Set<string>): string {
    let slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')  // replace non-alphanumeric with dash
      .replace(/^-+|-+$/g, '')      // trim leading/trailing dashes
      .replace(/-{2,}/g, '-');       // collapse consecutive dashes

    if (!slug) slug = 'unnamed';

    if (!usedSlugs) return slug;

    // Resolve collisions
    let candidate = slug;
    let counter = 2;
    while (usedSlugs.has(candidate)) {
      candidate = `${slug}-${counter}`;
      counter++;
    }
    return candidate;
  }
}
