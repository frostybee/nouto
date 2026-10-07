/**
 * Resets Nouto's data in the serve-web server before a recording, so every
 * GIF starts from the same collections, environments, and an empty history.
 * Each recording opens a new VS Code window, whose extension host reads these
 * files when Nouto activates.
 */
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

export const NOUTO_STORAGE_DIR =
  process.env.NOUTO_MEDIA_STORAGE_DIR ??
  'D:\\tmp\\nouto-media\\server\\data\\User\\globalStorage\\frostybee-dev.nouto';

const BASELINE_DIR = fileURLToPath(new URL('./fixtures/nouto-state/', import.meta.url));
const NOW = '2026-10-01T09:00:00.000Z';

let counter = 0;
const id = (prefix: string) => `${prefix}-media-${++counter}`;

export interface SeedRequest {
  name: string;
  method: string;
  url: string;
}

export function request({ name, method, url }: SeedRequest) {
  return {
    type: 'request',
    id: id('req'),
    name,
    method,
    url,
    params: [],
    headers: [],
    auth: { type: 'none' },
    body: { type: 'none', content: '' },
    createdAt: NOW,
    updatedAt: NOW,
  };
}

export function folder(name: string, children: unknown[]) {
  return { type: 'folder', id: id('fld'), name, children, expanded: true };
}

export function collection(name: string, items: unknown[]) {
  return { id: id('col'), name, items, expanded: true, createdAt: NOW, updatedAt: NOW };
}

export function environment(name: string, variables: Record<string, string>, color?: string) {
  return {
    id: id('env'),
    name,
    color,
    variables: Object.entries(variables).map(([key, value]) => ({ key, value, enabled: true })),
  };
}

export interface SeedOptions {
  /** Collections added after the baseline Drafts and Sample Collection. */
  collections?: unknown[];
  /** Replaces the baseline environments (Sample Environment, active). */
  environments?: { environments: unknown[]; activeId: string | null };
  /** Collapses the Sample Collection so seeded collections sit near the top. */
  collapseSample?: boolean;
  /** Files from fixtures/workspace/ to copy into the demo workspace folder. */
  workspaceFiles?: string[];
}

export const WORKSPACE_DIR = process.env.NOUTO_MEDIA_WORKSPACE_DIR ?? 'D:\\tmp\\nouto-media\\workspace';
const WORKSPACE_FIXTURES = fileURLToPath(new URL('./fixtures/workspace/', import.meta.url));

export function seedNoutoState(options: SeedOptions = {}): void {
  mkdirSync(NOUTO_STORAGE_DIR, { recursive: true });
  const baseline = JSON.parse(readFileSync(join(BASELINE_DIR, 'collections.json'), 'utf8')).map(
    (c: { builtin?: string; expanded: boolean }) =>
      options.collapseSample && !c.builtin ? { ...c, expanded: false } : c
  );
  const collections = [...baseline, ...(options.collections ?? [])];
  const environments =
    options.environments ?? JSON.parse(readFileSync(join(BASELINE_DIR, 'environments.json'), 'utf8'));

  writeFileSync(join(NOUTO_STORAGE_DIR, 'collections.json'), JSON.stringify(collections, null, 2));
  writeFileSync(join(NOUTO_STORAGE_DIR, 'environments.json'), JSON.stringify(environments, null, 2));
  writeFileSync(join(NOUTO_STORAGE_DIR, 'drafts.json'), '[]');
  for (const file of ['nouto-history.jsonl', 'nouto-history-index.json']) {
    rmSync(join(NOUTO_STORAGE_DIR, file), { force: true });
  }
  for (const file of options.workspaceFiles ?? []) {
    copyFileSync(join(WORKSPACE_FIXTURES, file), join(WORKSPACE_DIR, file));
  }
}
