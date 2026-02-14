import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import type { IStorageStrategy } from './IStorageStrategy';
import type { Collection, EnvironmentsData, CollectionItem, SavedRequest } from '../types';

export class MonolithicStorageStrategy implements IStorageStrategy {
  private readonly collectionsPath: string;
  private readonly environmentsPath: string;

  constructor(private readonly storageDir: string) {
    this.collectionsPath = path.join(storageDir, 'collections.json');
    this.environmentsPath = path.join(storageDir, 'environments.json');
  }

  private async ensureDir(): Promise<void> {
    if (!existsSync(this.storageDir)) {
      await fs.mkdir(this.storageDir, { recursive: true });
    }
  }

  async loadCollections(): Promise<Collection[]> {
    try {
      if (existsSync(this.collectionsPath)) {
        const data = await fs.readFile(this.collectionsPath, 'utf8');
        const collections = JSON.parse(data) as any[];
        const migrated = this.migrateCollections(collections);
        if (this.needsMigration(collections)) {
          await this.saveCollections(migrated);
        }
        return migrated;
      }
    } catch (error) {
      console.error('Failed to load collections:', error);
    }
    return [];
  }

  async saveCollections(collections: Collection[]): Promise<boolean> {
    try {
      await this.ensureDir();
      await fs.writeFile(this.collectionsPath, JSON.stringify(collections, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error('Failed to save collections:', error);
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
      console.error('Failed to load environments:', error);
    }
    return { environments: [], activeId: null };
  }

  async saveEnvironments(data: EnvironmentsData): Promise<boolean> {
    try {
      await this.ensureDir();
      await fs.writeFile(this.environmentsPath, JSON.stringify(data, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error('Failed to save environments:', error);
      return false;
    }
  }

  getStorageDir(): string {
    return this.storageDir;
  }

  private needsMigration(collections: any[]): boolean {
    return collections.some((col: any) => col.requests && !col.items);
  }

  private migrateCollections(collections: any[]): Collection[] {
    return collections.map((col: any) => {
      if (col.items) {
        return col as Collection;
      }
      if (col.requests) {
        const migratedItems: CollectionItem[] = (col.requests || []).map((req: any): SavedRequest => ({
          type: 'request',
          id: req.id,
          name: req.name,
          method: req.method,
          url: req.url,
          params: req.params || [],
          headers: req.headers || [],
          auth: req.auth || { type: 'none' },
          body: req.body || { type: 'none', content: '' },
          createdAt: req.createdAt || new Date().toISOString(),
          updatedAt: req.updatedAt || new Date().toISOString(),
        }));
        return {
          id: col.id,
          name: col.name,
          items: migratedItems,
          expanded: col.expanded ?? true,
          createdAt: col.createdAt || new Date().toISOString(),
          updatedAt: col.updatedAt || new Date().toISOString(),
        } as Collection;
      }
      return {
        id: col.id || `migrated-${Date.now()}`,
        name: col.name || 'Untitled Collection',
        items: [],
        expanded: true,
        createdAt: col.createdAt || new Date().toISOString(),
        updatedAt: col.updatedAt || new Date().toISOString(),
      } as Collection;
    });
  }
}
