import { describe, it, expect, beforeEach, vi } from 'vitest';

const tauriMocks = vi.hoisted(() => ({ invoke: vi.fn() }));
const dialogMocks = vi.hoisted(() => ({ open: vi.fn(), save: vi.fn() }));
const fsMocks = vi.hoisted(() => ({ readTextFile: vi.fn(), writeTextFile: vi.fn() }));
const modalMocks = vi.hoisted(() => ({ showLocalSaveDiscardCancel: vi.fn() }));
const notificationMocks = vi.hoisted(() => ({ showNotification: vi.fn() }));

vi.mock('@tauri-apps/api/core', () => tauriMocks);
vi.mock('@tauri-apps/plugin-dialog', () => dialogMocks);
vi.mock('@tauri-apps/plugin-fs', () => fsMocks);
vi.mock('../modal-store.svelte', () => modalMocks);
vi.mock('@nouto/ui/stores/notifications.svelte', () => notificationMocks);

import { openReferencedFileAndReveal } from './crossFileNav';
import {
  openSession,
  getSession,
  activeSessionId,
  resetAllSessions,
  sessionList,
} from './session.svelte';
import { pathToFileUri } from './pathUtils';

const VALID_YAML = `openapi: 3.1.0\ninfo:\n  title: T\n  version: 1.0.0\npaths: {}\n`;

beforeEach(() => {
  vi.clearAllMocks();
  tauriMocks.invoke.mockResolvedValue([]);
  localStorage.clear();
  resetAllSessions();
});

describe('openReferencedFileAndReveal', () => {
  it('activates an already-open session and arms pendingReveal', async () => {
    const target = openSession('C:\\specs\\common.yaml', VALID_YAML, 'yaml');
    openSession('C:\\specs\\api.yaml', VALID_YAML, 'yaml'); // active now

    const ok = await openReferencedFileAndReveal(
      pathToFileUri('C:\\specs\\common.yaml'),
      '/components/schemas/Pet'
    );
    expect(ok).toBe(true);
    expect(activeSessionId()).toBe(target);
    expect(getSession(target)?.pendingReveal).toBe('/components/schemas/Pet');
    expect(fsMocks.readTextFile).not.toHaveBeenCalled();
  });

  it('opens the target file as a new session when not open', async () => {
    openSession('C:\\specs\\api.yaml', VALID_YAML, 'yaml');
    fsMocks.readTextFile.mockResolvedValue('type: object\n');

    const ok = await openReferencedFileAndReveal(pathToFileUri('C:\\specs\\common.yaml'), '');
    expect(ok).toBe(true);
    expect(sessionList()).toHaveLength(2);
    const active = getSession(activeSessionId()!)!;
    expect(active.documentUri).toBe('C:\\specs\\common.yaml');
    expect(active.pendingReveal).toBe(''); // whole-document reveal
    // Bare schema fragments must not trigger the not-OpenAPI warning.
    expect(notificationMocks.showNotification).not.toHaveBeenCalled();
  });

  it('returns false when the target file cannot be read', async () => {
    openSession('C:\\specs\\api.yaml', VALID_YAML, 'yaml');
    fsMocks.readTextFile.mockRejectedValue(new Error('missing'));
    const ok = await openReferencedFileAndReveal(pathToFileUri('C:\\specs\\gone.yaml'), '/x');
    expect(ok).toBe(false);
    expect(sessionList()).toHaveLength(1);
  });

  it('returns false for non-file URIs', async () => {
    expect(await openReferencedFileAndReveal('https://example.com/x.yaml', '/x')).toBe(false);
  });
});
