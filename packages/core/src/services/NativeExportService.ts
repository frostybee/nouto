import type { Collection, CollectionItem } from '../types';
import { isFolder } from '../types';
import { randomUUID } from 'crypto';

export interface HiveFetchExportFile {
  _format: 'hivefetch';
  _version: '1.0';
  _exportedAt: string;
  collection: Collection;
}

export interface HiveFetchBulkExportFile {
  _format: 'hivefetch';
  _version: '1.0';
  _exportedAt: string;
  collections: Collection[];
}

export class NativeExportService {
  exportCollection(collection: Collection): HiveFetchExportFile {
    return {
      _format: 'hivefetch',
      _version: '1.0',
      _exportedAt: new Date().toISOString(),
      collection: JSON.parse(JSON.stringify(collection)),
    };
  }

  importCollections(raw: string): Collection[] {
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('Invalid JSON');
    }

    if (!parsed || parsed._format !== 'hivefetch') {
      throw new Error('Not a HiveFetch export file (missing _format sentinel)');
    }

    // Bulk export format: { collections: [...] }
    if (Array.isArray(parsed.collections)) {
      const collections = parsed.collections as Collection[];
      if (collections.length === 0) {
        throw new Error('HiveFetch export contains no collections');
      }
      for (const col of collections) {
        if (!col.id || !col.name) {
          throw new Error('Invalid HiveFetch export: a collection is missing id or name');
        }
      }
      return collections.map((col) => this.regenerateIds(col));
    }

    // Single export format: { collection: {...} }
    if (parsed.collection && parsed.collection.id && parsed.collection.name) {
      return [this.regenerateIds(parsed.collection as Collection)];
    }

    throw new Error('Invalid HiveFetch export: missing collection data');
  }

  private regenerateIds(collection: Collection): Collection {
    const now = new Date().toISOString();
    return {
      ...collection,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      items: this.regenerateItemIds(collection.items),
    };
  }

  private regenerateItemIds(items: CollectionItem[]): CollectionItem[] {
    return items.map((item) => {
      if (isFolder(item)) {
        return {
          ...item,
          id: randomUUID(),
          children: this.regenerateItemIds(item.children),
        };
      }
      return { ...item, id: randomUUID() };
    });
  }
}
