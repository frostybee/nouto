import { describe, it, expect, beforeEach, vi } from 'vitest';

const dialogMocks = vi.hoisted(() => ({ open: vi.fn(), save: vi.fn() }));
const fsMocks = vi.hoisted(() => ({ readTextFile: vi.fn(), writeTextFile: vi.fn() }));
const modalMocks = vi.hoisted(() => ({ showLocalSaveDiscardCancel: vi.fn() }));
const notificationMocks = vi.hoisted(() => ({ showNotification: vi.fn() }));

vi.mock('@tauri-apps/plugin-dialog', () => dialogMocks);
vi.mock('@tauri-apps/plugin-fs', () => fsMocks);
vi.mock('../modal-store.svelte', () => modalMocks);
vi.mock('@nouto/ui/stores/notifications.svelte', () => notificationMocks);

import { openFile, newDocument, saveDocument, saveDocumentAs, confirmDiscardIfDirty } from './documentAdapter';
import { openApiSession, setContent, resetSession } from './session.svelte';

const VALID_YAML = `openapi: 3.1.0\ninfo:\n  title: T\n  version: 1.0.0\npaths: {}\n`;

beforeEach(() => {
  vi.clearAllMocks();
  resetSession();
});

describe('openFile', () => {
  it('loads the picked file into the session', async () => {
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

  it('warns but still opens content that does not look like OpenAPI', async () => {
    dialogMocks.open.mockResolvedValue('/notes/todo.yaml');
    fsMocks.readTextFile.mockResolvedValue('hello: world\n');
    expect(await openFile()).toBe(true);
    expect(notificationMocks.showNotification).toHaveBeenCalledWith('warning', expect.stringContaining('OpenAPI'));
    expect(openApiSession.content).toBe('hello: world\n');
  });

  it('notifies and returns false on read failure', async () => {
    dialogMocks.open.mockResolvedValue('/specs/api.yaml');
    fsMocks.readTextFile.mockRejectedValue(new Error('denied'));
    expect(await openFile()).toBe(false);
    expect(notificationMocks.showNotification).toHaveBeenCalledWith('error', expect.stringContaining('denied'));
  });
});

describe('newDocument', () => {
  it('loads the YAML skeleton as an untitled document', () => {
    newDocument();
    expect(openApiSession.documentUri).toBeNull();
    expect(openApiSession.format).toBe('yaml');
    expect(openApiSession.content).toContain('openapi: 3.1.0');
    expect(openApiSession.dirty).toBe(false);
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

  it('untitled save delegates to Save As and adopts the chosen path', async () => {
    newDocument();
    dialogMocks.save.mockResolvedValue('/specs/new.yaml');
    fsMocks.writeTextFile.mockResolvedValue(undefined);

    expect(await saveDocument()).toBe(true);
    expect(dialogMocks.save).toHaveBeenCalled();
    expect(openApiSession.documentUri).toBe('/specs/new.yaml');
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
    expect(notificationMocks.showNotification).toHaveBeenCalledWith('error', expect.stringContaining('readonly'));
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
});
