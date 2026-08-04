import { describe, it, expect, beforeEach } from 'vitest';
import {
  addRecentOpenApiFile,
  recentOpenApiFiles,
  reloadRecentOpenApiFiles,
  removeRecentOpenApiFile,
} from './recentFiles.svelte';

const STORAGE_KEY = 'nouto_openapi_recents';

beforeEach(() => {
  localStorage.clear();
  reloadRecentOpenApiFiles();
});

describe('recentOpenApiFiles', () => {
  it('adds entries most-recent-first with basename labels', () => {
    addRecentOpenApiFile('C:\\specs\\a.yaml');
    addRecentOpenApiFile('/home/user/b.yaml');
    expect(recentOpenApiFiles().map((r) => r.name)).toEqual(['b.yaml', 'a.yaml']);
  });

  it('dedupes by canonical path and moves the entry to the front', () => {
    addRecentOpenApiFile('C:\\specs\\a.yaml');
    addRecentOpenApiFile('C:\\specs\\b.yaml');
    addRecentOpenApiFile('c:/specs/a.yaml'); // same file, different spelling
    const paths = recentOpenApiFiles().map((r) => r.path);
    expect(paths).toHaveLength(2);
    expect(paths[0]).toBe('c:/specs/a.yaml');
  });

  it('caps the list at 10 entries', () => {
    for (let i = 0; i < 14; i++) addRecentOpenApiFile(`/specs/file-${i}.yaml`);
    const list = recentOpenApiFiles();
    expect(list).toHaveLength(10);
    expect(list[0].path).toBe('/specs/file-13.yaml');
  });

  it('removes entries', () => {
    addRecentOpenApiFile('/specs/a.yaml');
    addRecentOpenApiFile('/specs/b.yaml');
    removeRecentOpenApiFile('/specs/a.yaml');
    expect(recentOpenApiFiles().map((r) => r.path)).toEqual(['/specs/b.yaml']);
  });

  it('persists across reloads', () => {
    addRecentOpenApiFile('/specs/a.yaml');
    reloadRecentOpenApiFiles();
    expect(recentOpenApiFiles().map((r) => r.path)).toEqual(['/specs/a.yaml']);
  });

  it('recovers from corrupt JSON by clearing the key', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    reloadRecentOpenApiFiles();
    expect(recentOpenApiFiles()).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('filters malformed entries on load', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { path: '/specs/ok.yaml', name: 'ok.yaml', lastOpened: 1 },
        { path: 42 },
        'nope',
        null,
      ])
    );
    reloadRecentOpenApiFiles();
    expect(recentOpenApiFiles().map((r) => r.path)).toEqual(['/specs/ok.yaml']);
  });
});
