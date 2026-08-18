import { fileUriKey } from './pathUtils';

/**
 * Recent OpenAPI files (Phase 5). Plain localStorage, deliberately NOT
 * Rust-backed: recentProjects lives in Rust because project selection is
 * cross-session app identity; this is a best-effort convenience list, same
 * tier as the request tabs' own localStorage persistence.
 */
export interface RecentOpenApiFile {
  path: string;
  name: string;
  lastOpened: number;
}

const STORAGE_KEY = 'nouto_openapi_recents';
const MAX_RECENT = 10;

function basename(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

function load(): RecentOpenApiFile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('recents is not an array');
    return parsed
      .filter(
        (entry): entry is RecentOpenApiFile =>
          !!entry &&
          typeof (entry as RecentOpenApiFile).path === 'string' &&
          typeof (entry as RecentOpenApiFile).name === 'string' &&
          typeof (entry as RecentOpenApiFile).lastOpened === 'number',
      )
      .slice(0, MAX_RECENT);
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // storage unavailable — stay empty
    }
    return [];
  }
}

let recents = $state<RecentOpenApiFile[]>(load());

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recents));
  } catch {
    // quota/unavailable — the list is best-effort
  }
}

export function recentOpenApiFiles(): RecentOpenApiFile[] {
  return recents;
}

export function addRecentOpenApiFile(path: string): void {
  const key = fileUriKey(path);
  const next = recents.filter((entry) => fileUriKey(entry.path) !== key);
  next.unshift({ path, name: basename(path), lastOpened: Date.now() });
  recents = next.slice(0, MAX_RECENT);
  persist();
}

export function removeRecentOpenApiFile(path: string): void {
  const key = fileUriKey(path);
  const next = recents.filter((entry) => fileUriKey(entry.path) !== key);
  if (next.length !== recents.length) {
    recents = next;
    persist();
  }
}

/** Re-reads localStorage (tests; storage may have been reset externally). */
export function reloadRecentOpenApiFiles(): void {
  recents = load();
}
