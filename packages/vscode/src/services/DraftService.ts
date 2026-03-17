import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import type { DraftEntry, SavedRequest } from './types';

const MAX_DRAFTS = 20;
const DEBOUNCE_MS = 2000;

export class DraftService {
  private drafts: Map<string, DraftEntry> = new Map();
  private readonly filePath: string;
  private writeTimer: ReturnType<typeof setTimeout> | null = null;
  private loaded = false;

  constructor(storageDir: string) {
    this.filePath = path.join(storageDir, 'drafts.json');
  }

  async load(): Promise<void> {
    try {
      if (existsSync(this.filePath)) {
        const data = await fs.readFile(this.filePath, 'utf8');
        if (data.trim()) {
          const entries = JSON.parse(data) as DraftEntry[];
          this.drafts.clear();
          for (const entry of entries) {
            this.drafts.set(entry.id, entry);
          }
        }
      }
    } catch (error) {
      console.error('[Nouto] Failed to load drafts:', error);
    }
    this.loaded = true;
  }

  upsert(panelId: string, requestId: string | null, collectionId: string | null, request: SavedRequest): void {
    // Skip if URL is empty (nothing meaningful to persist)
    if (!request.url) {
      return;
    }

    this.drafts.set(panelId, {
      id: panelId,
      requestId,
      collectionId,
      request,
      updatedAt: new Date().toISOString(),
    });

    // Enforce cap
    if (this.drafts.size > MAX_DRAFTS) {
      const sorted = [...this.drafts.entries()].sort(
        (a, b) => new Date(a[1].updatedAt).getTime() - new Date(b[1].updatedAt).getTime()
      );
      while (this.drafts.size > MAX_DRAFTS) {
        const oldest = sorted.shift();
        if (oldest) this.drafts.delete(oldest[0]);
      }
    }

    this.scheduleSave();
  }

  remove(panelId: string): void {
    if (this.drafts.delete(panelId)) {
      this.scheduleSave();
    }
  }

  getAll(): DraftEntry[] {
    return [...this.drafts.values()];
  }

  has(panelId: string): boolean {
    return this.drafts.has(panelId);
  }

  async flush(): Promise<void> {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    await this.writeToDisk();
  }

  private scheduleSave(): void {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => {
      this.writeToDisk();
    }, DEBOUNCE_MS);
  }

  private async writeToDisk(): Promise<void> {
    try {
      const dir = path.dirname(this.filePath);
      if (!existsSync(dir)) {
        await fs.mkdir(dir, { recursive: true });
      }
      const entries = [...this.drafts.values()];
      await fs.writeFile(this.filePath, JSON.stringify(entries, null, 2), 'utf8');
    } catch (error) {
      console.error('[Nouto] Failed to save drafts:', error);
    }
  }
}
