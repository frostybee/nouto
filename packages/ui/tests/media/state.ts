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
  headers?: { key: string; value: string; enabled?: boolean }[];
  /** Assertions without an `id`; `enabled` defaults to true. */
  assertions?: Record<string, unknown>[];
  /** Any other SavedRequest field: body, auth, authInheritance, scripts, connectionMode, grpc. */
  [field: string]: unknown;
}

export function request({ name, method, url, headers = [], assertions, ...fields }: SeedRequest) {
  return {
    type: 'request',
    id: id('req'),
    name,
    method,
    url,
    params: [],
    headers: headers.map((h) => ({ id: id('hdr'), enabled: true, ...h })),
    auth: { type: 'none' },
    body: { type: 'none', content: '' },
    ...(assertions && { assertions: assertions.map((a) => ({ id: id('asr'), enabled: true, ...a })) }),
    ...fields,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

/** Extra Folder or Collection fields, such as `auth`. */
type ContainerFields = Record<string, unknown>;

export function folder(name: string, children: unknown[], fields: ContainerFields = {}) {
  return { type: 'folder', id: id('fld'), name, children, expanded: true, ...fields };
}

export function collection(name: string, items: unknown[], fields: ContainerFields = {}) {
  return { id: id('col'), name, items, expanded: true, ...fields, createdAt: NOW, updatedAt: NOW };
}

export function environment(name: string, variables: Record<string, string>, color?: string) {
  return {
    id: id('env'),
    name,
    color,
    variables: Object.entries(variables).map(([key, value]) => ({ key, value, enabled: true })),
  };
}

export interface SeedHistory {
  method: string;
  url: string;
  status?: number;
  durationMs?: number;
  sizeBytes?: number;
  /** How long before the run the request was sent, so date groups stay correct. */
  minutesAgo: number;
}

/** A History tab entry (HistoryEntry in packages/core/src/services/HistoryTypes.ts). */
export function historyEntry({ method, url, status, durationMs, sizeBytes, minutesAgo }: SeedHistory) {
  return {
    id: id('hist'),
    timestamp: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    method,
    url,
    headers: [{ id: id('hdr'), key: 'User-Agent', value: 'Nouto', enabled: true }],
    params: [],
    pathParams: [],
    body: { type: 'none', content: '' },
    auth: { type: 'none' },
    responseStatus: status,
    responseDuration: durationMs,
    responseSize: sizeBytes,
    workspaceName: 'workspace',
  };
}

export interface SeedMockRoute {
  method: string;
  path: string;
  statusCode?: number;
  responseBody?: string;
  headers?: Record<string, string>;
  latencyMin?: number;
  latencyMax?: number;
  description?: string;
}

/** A mock server route (MockRoute in packages/core/src/types.ts). */
export function mockRoute({ headers = {}, ...route }: SeedMockRoute) {
  return {
    id: id('mock'),
    enabled: true,
    statusCode: 200,
    responseBody: '',
    latencyMin: 0,
    latencyMax: 0,
    ...route,
    responseHeaders: Object.entries(headers).map(([key, value]) => ({ id: id('hdr'), key, value, enabled: true })),
  };
}

export interface SeedCookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

/** A cookie jar (CookieJar in packages/core/src/services/CookieJarService.ts) with session cookies. */
export function cookieJar(name: string, cookies: SeedCookie[]) {
  return {
    id: id('jar'),
    name,
    cookies: cookies.map((c) => ({ path: '/', httpOnly: false, secure: false, ...c, createdAt: Date.parse(NOW) })),
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
  /** History tab entries, built with historyEntry(). Without it, history starts empty. */
  history?: unknown[];
  /** The mock server's port and routes (mockRoute()). Without it, there are no routes. */
  mocks?: { port: number; routes: unknown[] };
  /** Cookie jars (cookieJar()) and the active one. Without it, Nouto starts with no cookies. */
  cookies?: { jars: { id: string }[]; activeJarId: string | null };
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
  // Nouto rebuilds the history index from the entries when the index is missing
  if (options.history?.length) {
    const lines = options.history.map((entry) => JSON.stringify(entry)).join('\n');
    writeFileSync(join(NOUTO_STORAGE_DIR, 'nouto-history.jsonl'), `${lines}\n`);
  }
  // Nouto saves both files as you use them, so reset them every run
  const resetFile = (file: string, data: unknown) => {
    if (data) writeFileSync(join(NOUTO_STORAGE_DIR, file), JSON.stringify(data, null, 2));
    else rmSync(join(NOUTO_STORAGE_DIR, file), { force: true });
  };
  resetFile('mocks.json', options.mocks);
  resetFile('cookies.json', options.cookies);
  for (const file of options.workspaceFiles ?? []) {
    copyFileSync(join(WORKSPACE_FIXTURES, file), join(WORKSPACE_DIR, file));
  }
}
