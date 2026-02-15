import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import type { MockServerConfig, MockRoute } from '../types';

export class MockStorageService {
  private readonly filePath: string;

  constructor(storageDir: string) {
    this.filePath = path.join(storageDir, 'mocks.json');
  }

  async load(): Promise<MockServerConfig> {
    try {
      if (existsSync(this.filePath)) {
        const data = await fs.readFile(this.filePath, 'utf8');
        return JSON.parse(data) as MockServerConfig;
      }
    } catch (error) {
      console.error('Failed to load mock config:', error);
    }
    return { port: 3000, routes: [] };
  }

  async save(config: MockServerConfig): Promise<boolean> {
    try {
      const dir = path.dirname(this.filePath);
      if (!existsSync(dir)) {
        await fs.mkdir(dir, { recursive: true });
      }
      await fs.writeFile(this.filePath, JSON.stringify(config, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error('Failed to save mock config:', error);
      return false;
    }
  }

  static collectionToRoutes(collection: { items: any[] }): MockRoute[] {
    const routes: MockRoute[] = [];
    const processItems = (items: any[]) => {
      for (const item of items) {
        if (item.type === 'folder' && item.children) {
          processItems(item.children);
        } else if (item.url) {
          try {
            const urlObj = new URL(item.url.startsWith('http') ? item.url : `http://localhost${item.url}`);
            routes.push({
              id: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              enabled: true,
              method: item.method || 'GET',
              path: urlObj.pathname || '/',
              statusCode: 200,
              responseBody: '{}',
              responseHeaders: [{ id: `h-${Date.now()}`, key: 'Content-Type', value: 'application/json', enabled: true }],
              latencyMin: 0,
              latencyMax: 0,
              description: item.name || '',
            });
          } catch {
            // Skip invalid URLs
          }
        }
      }
    };
    processItems(collection.items);
    return routes;
  }
}
