import { describe, it, expect, beforeEach, vi } from 'vitest';

const dialogMocks = vi.hoisted(() => ({ open: vi.fn(), save: vi.fn() }));
const fsMocks = vi.hoisted(() => ({ readTextFile: vi.fn(), writeTextFile: vi.fn() }));
const modalMocks = vi.hoisted(() => ({ showLocalSaveDiscardCancel: vi.fn() }));
const notificationMocks = vi.hoisted(() => ({ showNotification: vi.fn() }));

vi.mock('@tauri-apps/plugin-dialog', () => dialogMocks);
vi.mock('@tauri-apps/plugin-fs', () => fsMocks);
vi.mock('../modal-store.svelte', () => modalMocks);
vi.mock('@nouto/ui/stores/notifications.svelte', () => notificationMocks);

import {
  openFile,
  openRecentFile,
  openPathForNavigation,
  newDocument,
  saveDocument,
  saveDocumentAs,
  confirmDiscardIfDirty,
  confirmDiscardAllDirty,
  sessionLabel,
} from './documentAdapter';
import {
  openApiSession,
  setContent,
  setContentFor,
  resetAllSessions,
  sessionList,
  activeSessionId,
  getSession,
} from './session.svelte';
import { recentOpenApiFiles, reloadRecentOpenApiFiles } from './recentFiles.svelte';

const VALID_YAML = `openapi: 3.1.0\ninfo:\n  title: T\n  version: 1.0.0\npaths: {}\n`;

beforeEach(() => {
  vi.clearAllMocks();
  resetAllSessions();
  localStorage.clear();
  reloadRecentOpenApiFiles();
});

describe('openFile', () => {
  it('loads the picked file into a new active session', async () => {
    dialogMocks.open.mockResolvedValue('/specs/api.yaml');
    fsMocks.readTextFile.mockResolvedValue(VALID_YAML);
    expect(await openFile()).toBe(true);
    expect(openApiSession.documentUri).toBe('/specs/api.yaml');
    expect(openApiSession.content).toBe(VALID_YAML);
    expect(openApiSession.format).toBe('yaml');
    expect(notificationMocks.showNotification).not.toHaveBeenCalled();
  });

  it('returns false when the dialog is cancelled', async () => {
    dialogMocks.open.mockResolvedValue(null);
    expect(await openFile()).toBe(false);
    expect(fsMocks.readTextFile).not.toHaveBeenCalled();
  });

  it('focuses the existing session instead of opening a duplicate tab', async () => {
    dialogMocks.open.mockResolvedValue('/specs/api.yaml');
    fsMocks.readTextFile.mockResolvedValue(VALID_YAML);
    await openFile();
    const firstId = activeSessionId();

    dialogMocks.open.mockResolvedValue('/specs/other.yaml');
    await openFile();
    expect(sessionList()).toHaveLength(2);

    // Re-picking the first file switches back without re-reading it.
    dialogMocks.open.mockResolvedValue('/specs/api.yaml');
    fsMocks.readTextFile.mockClear();
    expect(await openFile()).toBe(true);
    expect(sessionList()).toHaveLength(2);
    expect(activeSessionId()).toBe(firstId);
    expect(fsMocks.readTextFile).not.toHaveBeenCalled();
  });

  it('warns but still opens content that does not look like OpenAPI', async () => {
    dialogMocks.open.mockResolvedValue('/notes/todo.yaml');
    fsMocks.readTextFile.mockResolvedValue('hello: world\n');
    expect(await openFile()).toBe(true);
    expect(notificationMocks.showNotification).toHaveBeenCalledWith(
      'warning',
      expect.stringContaining('OpenAPI'),
    );
    expect(openApiSession.content).toBe('hello: world\n');
  });

  it('notifies and returns false on read failure', async () => {
    dialogMocks.open.mockResolvedValue('/specs/api.yaml');
    fsMocks.readTextFile.mockRejectedValue(new Error('denied'));
    expect(await openFile()).toBe(false);
    expect(notificationMocks.showNotification).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('denied'),
    );
    expect(sessionList()).toHaveLength(0);
  });

  it('records successful opens in the recents list', async () => {
    dialogMocks.open.mockResolvedValue('/specs/api.yaml');
    fsMocks.readTextFile.mockResolvedValue(VALID_YAML);
    await openFile();
    expect(recentOpenApiFiles().map((r) => r.path)).toEqual(['/specs/api.yaml']);
  });
});

describe('openRecentFile', () => {
  it('opens the path without a dialog', async () => {
    fsMocks.readTextFile.mockResolvedValue(VALID_YAML);
    expect(await openRecentFile('/specs/api.yaml')).toBe(true);
    expect(dialogMocks.open).not.toHaveBeenCalled();
    expect(openApiSession.documentUri).toBe('/specs/api.yaml');
  });

  it('drops the entry from recents when the file no longer opens', async () => {
    fsMocks.readTextFile.mockResolvedValueOnce(VALID_YAML);
    await openRecentFile('/specs/gone.yaml');
    resetAllSessions();
    expect(recentOpenApiFiles()).toHaveLength(1);

    fsMocks.readTextFile.mockRejectedValue(new Error('missing'));
    expect(await openRecentFile('/specs/gone.yaml')).toBe(false);
    expect(recentOpenApiFiles()).toHaveLength(0);
  });
});

describe('openPathForNavigation', () => {
  it('returns the existing session id without re-reading', async () => {
    fsMocks.readTextFile.mockResolvedValue(VALID_YAML);
    await openRecentFile('/specs/api.yaml');
    const id = activeSessionId();
    fsMocks.readTextFile.mockClear();
    expect(await openPathForNavigation('/specs/api.yaml')).toBe(id);
    expect(fsMocks.readTextFile).not.toHaveBeenCalled();
  });

  it('opens a new session without the not-OpenAPI warning (bare schema fragments)', async () => {
    fsMocks.readTextFile.mockResolvedValue('type: object\n');
    const id = await openPathForNavigation('/specs/common.yaml');
    expect(id).toBeDefined();
    expect(getSession(id!)?.content).toBe('type: object\n');
    expect(notificationMocks.showNotification).not.toHaveBeenCalled();
  });

  it('returns undefined when the file cannot be read', async () => {
    fsMocks.readTextFile.mockRejectedValue(new Error('missing'));
    expect(await openPathForNavigation('/specs/missing.yaml')).toBeUndefined();
  });
});

describe('newDocument', () => {
  it('opens the YAML skeleton as an untitled tab', () => {
    newDocument();
    expect(openApiSession.documentUri).toBeNull();
    expect(openApiSession.format).toBe('yaml');
    expect(openApiSession.content).toContain('openapi: 3.1.0');
    expect(openApiSession.dirty).toBe(false);
  });

  it('adds a tab instead of replacing the current document', () => {
    newDocument();
    newDocument();
    expect(sessionList()).toHaveLength(2);
  });
});

describe('saveDocument / saveDocumentAs', () => {
  it('writes to the existing uri and clears dirty', async () => {
    dialogMocks.open.mockResolvedValue('/specs/api.yaml');
    fsMocks.readTextFile.mockResolvedValue(VALID_YAML);
    await openFile();
    setContent(VALID_YAML + '# edit\n');
    fsMocks.writeTextFile.mockResolvedValue(undefined);

    expect(await saveDocument()).toBe(true);
    expect(fsMocks.writeTextFile).toHaveBeenCalledWith('/specs/api.yaml', VALID_YAML + '# edit\n');
    expect(openApiSession.dirty).toBe(false);
    expect(dialogMocks.save).not.toHaveBeenCalled();
  });

  it('untitled save delegates to Save As and adopts the chosen path (same session id)', async () => {
    newDocument();
    const id = activeSessionId();
    dialogMocks.save.mockResolvedValue('/specs/new.yaml');
    fsMocks.writeTextFile.mockResolvedValue(undefined);

    expect(await saveDocument()).toBe(true);
    expect(dialogMocks.save).toHaveBeenCalled();
    expect(activeSessionId()).toBe(id);
    expect(openApiSession.documentUri).toBe('/specs/new.yaml');
  });

  it('saves a background session by id without touching the active one', async () => {
    newDocument();
    const background = activeSessionId()!;
    setContentFor(background, VALID_YAML + '# bg\n');
    newDocument();
    const active = activeSessionId();

    dialogMocks.save.mockResolvedValue('/specs/bg.yaml');
    fsMocks.writeTextFile.mockResolvedValue(undefined);
    expect(await saveDocument(background)).toBe(true);
    expect(getSession(background)?.documentUri).toBe('/specs/bg.yaml');
    expect(getSession(background)?.dirty).toBe(false);
    expect(activeSessionId()).toBe(active);
  });

  it('save-as cancel returns false and stays dirty', async () => {
    newDocument();
    setContent(openApiSession.content + '# edit\n');
    dialogMocks.save.mockResolvedValue(null);
    expect(await saveDocumentAs()).toBe(false);
    expect(openApiSession.dirty).toBe(true);
  });

  it('notifies and returns false on write failure', async () => {
    newDocument();
    dialogMocks.save.mockResolvedValue('/ro/new.yaml');
    fsMocks.writeTextFile.mockRejectedValue(new Error('readonly'));
    expect(await saveDocumentAs()).toBe(false);
    expect(notificationMocks.showNotification).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('readonly'),
    );
  });

  it('returns false with no sessions open', async () => {
    expect(await saveDocument()).toBe(false);
    expect(await saveDocumentAs()).toBe(false);
  });

  it('refuses save-as onto a path already open in another tab', async () => {
    dialogMocks.open.mockResolvedValue('/specs/api.yaml');
    fsMocks.readTextFile.mockResolvedValue(VALID_YAML);
    await openFile();
    newDocument();

    dialogMocks.save.mockResolvedValue('/specs/api.yaml');
    expect(await saveDocumentAs()).toBe(false);
    expect(fsMocks.writeTextFile).not.toHaveBeenCalled();
    expect(notificationMocks.showNotification).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('already open'),
    );
  });

  it("save-as onto the session's own current path is not a collision", async () => {
    dialogMocks.open.mockResolvedValue('/specs/api.yaml');
    fsMocks.readTextFile.mockResolvedValue(VALID_YAML);
    await openFile();

    dialogMocks.save.mockResolvedValue('/specs/api.yaml');
    fsMocks.writeTextFile.mockResolvedValue(undefined);
    expect(await saveDocumentAs()).toBe(true);
    expect(fsMocks.writeTextFile).toHaveBeenCalledWith('/specs/api.yaml', VALID_YAML);
  });
});

describe('confirmDiscardIfDirty', () => {
  it('passes through without prompting when clean', async () => {
    newDocument();
    expect(await confirmDiscardIfDirty('The OpenAPI document')).toBe(true);
    expect(modalMocks.showLocalSaveDiscardCancel).not.toHaveBeenCalled();
  });

  it('cancel blocks, discard proceeds', async () => {
    newDocument();
    setContent(openApiSession.content + '# edit\n');

    modalMocks.showLocalSaveDiscardCancel.mockResolvedValue('cancel');
    expect(await confirmDiscardIfDirty('The OpenAPI document')).toBe(false);

    modalMocks.showLocalSaveDiscardCancel.mockResolvedValue('discard');
    expect(await confirmDiscardIfDirty('The OpenAPI document')).toBe(true);
  });

  it('save proceeds only when the save succeeds', async () => {
    newDocument();
    setContent(openApiSession.content + '# edit\n');
    modalMocks.showLocalSaveDiscardCancel.mockResolvedValue('save');

    dialogMocks.save.mockResolvedValue('/specs/new.yaml');
    fsMocks.writeTextFile.mockResolvedValue(undefined);
    expect(await confirmDiscardIfDirty('The OpenAPI document')).toBe(true);
    expect(openApiSession.dirty).toBe(false);

    setContent(openApiSession.content + '# more\n');
    fsMocks.writeTextFile.mockRejectedValue(new Error('readonly'));
    expect(await confirmDiscardIfDirty('The OpenAPI document')).toBe(false);
    expect(openApiSession.dirty).toBe(true);
  });

  it('guards a dirty background session by id', async () => {
    newDocument();
    const background = activeSessionId()!;
    setContentFor(background, openApiSession.content + '# bg\n');
    newDocument();

    modalMocks.showLocalSaveDiscardCancel.mockResolvedValue('cancel');
    expect(await confirmDiscardIfDirty('api.yaml', background)).toBe(false);
    // The clean active session passes without a prompt.
    modalMocks.showLocalSaveDiscardCancel.mockClear();
    expect(await confirmDiscardIfDirty('The OpenAPI document')).toBe(true);
    expect(modalMocks.showLocalSaveDiscardCancel).not.toHaveBeenCalled();
  });
});

describe('confirmDiscardAllDirty', () => {
  it('passes through silently when nothing is dirty', async () => {
    newDocument();
    newDocument();
    expect(await confirmDiscardAllDirty('The OpenAPI document')).toBe(true);
    expect(modalMocks.showLocalSaveDiscardCancel).not.toHaveBeenCalled();
  });

  it('delegates to the single-session prompt when exactly one is dirty', async () => {
    newDocument();
    newDocument();
    setContent(openApiSession.content + '# edit\n');
    modalMocks.showLocalSaveDiscardCancel.mockResolvedValue('discard');
    expect(await confirmDiscardAllDirty('The OpenAPI document')).toBe(true);
    expect(modalMocks.showLocalSaveDiscardCancel).toHaveBeenCalledTimes(1);
    expect(modalMocks.showLocalSaveDiscardCancel.mock.calls[0][0]).not.toContain('documents');
  });

  it('shows one summary prompt for multiple dirty documents', async () => {
    newDocument();
    setContent(openApiSession.content + '# a\n');
    newDocument();
    setContent(openApiSession.content + '# b\n');

    modalMocks.showLocalSaveDiscardCancel.mockResolvedValue('cancel');
    expect(await confirmDiscardAllDirty('The OpenAPI document')).toBe(false);
    expect(modalMocks.showLocalSaveDiscardCancel).toHaveBeenCalledTimes(1);
    expect(modalMocks.showLocalSaveDiscardCancel.mock.calls[0][0]).toContain('2 OpenAPI documents');

    modalMocks.showLocalSaveDiscardCancel.mockResolvedValue('discard');
    expect(await confirmDiscardAllDirty('The OpenAPI document')).toBe(true);
  });

  it('save-all saves every dirty document and aborts on the first failure', async () => {
    newDocument();
    const a = activeSessionId()!;
    setContentFor(a, openApiSession.content + '# a\n');
    newDocument();
    const b = activeSessionId()!;
    setContentFor(b, getSession(b)!.content + '# b\n');

    modalMocks.showLocalSaveDiscardCancel.mockResolvedValue('save');
    dialogMocks.save.mockResolvedValueOnce('/specs/a.yaml').mockResolvedValueOnce('/specs/b.yaml');
    fsMocks.writeTextFile.mockResolvedValue(undefined);
    expect(await confirmDiscardAllDirty('The OpenAPI document')).toBe(true);
    expect(getSession(a)?.dirty).toBe(false);
    expect(getSession(b)?.dirty).toBe(false);

    // Failure path: both dirty again, first write fails → abort, second untouched.
    setContentFor(a, getSession(a)!.content + '# x\n');
    setContentFor(b, getSession(b)!.content + '# y\n');
    fsMocks.writeTextFile.mockRejectedValue(new Error('readonly'));
    expect(await confirmDiscardAllDirty('The OpenAPI document')).toBe(false);
    expect(getSession(b)?.dirty).toBe(true);
  });
});

describe('sessionLabel', () => {
  it('uses the basename for saved documents and Untitled otherwise', () => {
    expect(sessionLabel({ documentUri: 'C:\\specs\\api.yaml' })).toBe('api.yaml');
    expect(sessionLabel({ documentUri: '/specs/api.yaml' })).toBe('api.yaml');
    expect(sessionLabel({ documentUri: null })).toBe('Untitled');
  });
});
