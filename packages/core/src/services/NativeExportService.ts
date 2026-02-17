import type { Collection } from '../types';

export interface HiveFetchExportFile {
  _format: 'hivefetch';
  _version: '1.0';
  _exportedAt: string;
  collection: Collection;
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

  importCollection(raw: string): Collection {
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('Invalid JSON');
    }

    if (!parsed || parsed._format !== 'hivefetch') {
      throw new Error('Not a HiveFetch export file (missing _format sentinel)');
    }

    if (!parsed.collection || !parsed.collection.id || !parsed.collection.name) {
      throw new Error('Invalid HiveFetch export: missing collection data');
    }

    return parsed.collection as Collection;
  }
}
