import { save as saveDialog, open as openDialog } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import { showNotification } from '@nouto/ui/stores/notifications.svelte';
import { OPENAPI_DOCUMENT_SKELETON } from '@nouto/core/services/openapi/specSkeletons';
import {
  activeSessionId,
  findSessionByPath,
  getSession,
  markSaved,
  newSession,
  openSession,
  sessionList,
  setActiveSessionId,
  type OpenApiSessionState,
} from './session.svelte';
import { formatFromPath, isOpenApiDocument } from './detect';
import { showLocalSaveDiscardCancel } from '../modal-store.svelte';
import { addRecentOpenApiFile, removeRecentOpenApiFile } from './recentFiles.svelte';

const FILTERS = [{ name: 'OpenAPI', extensions: ['yaml', 'yml', 'json'] }];

/** Display label shared by the tab strip and dirty prompts. */
export function sessionLabel(session: Pick<OpenApiSessionState, 'documentUri'>): string {
  if (!session.documentUri) return 'Untitled';
  return session.documentUri.split(/[\\/]/).pop() || session.documentUri;
}

/**
 * Shared open path: focuses an existing session for the same file (no
 * duplicate tabs), otherwise reads the file and opens a new session.
 */
async function openPath(path: string, options: { warnIfNotOpenApi?: boolean } = {}): Promise<boolean> {
  const existing = findSessionByPath(path);
  if (existing) {
    setActiveSessionId(existing.id);
    return true;
  }
  const format = formatFromPath(path) ?? 'yaml';
  try {
    const content = await readTextFile(path);
    if (options.warnIfNotOpenApi !== false && !isOpenApiDocument(content, format)) {
      showNotification('warning', 'This file does not look like an OpenAPI 3.x document.');
    }
    openSession(path, content, format);
    addRecentOpenApiFile(path);
    return true;
  } catch (error) {
    showNotification('error', `Failed to open file: ${error}`);
    // Covers the file-was-moved/deleted case uniformly for dialog and recents opens.
    removeRecentOpenApiFile(path);
    return false;
  }
}

export async function openFile(): Promise<boolean> {
  const selected = await openDialog({ multiple: false, filters: FILTERS, title: 'Open OpenAPI Document' });
  if (!selected) return false;
  return openPath(selected as string);
}

/** Open from the empty-state recents list. */
export async function openRecentFile(path: string): Promise<boolean> {
  return openPath(path);
}

/**
 * Dialog-less find-or-open for cross-file navigation (outline "Referenced
 * files", go-to-definition, quick fixes). Referenced files are often bare
 * schema fragments, so the "doesn't look like OpenAPI" warning is suppressed.
 * Returns the session id, or undefined when the file could not be read.
 */
export async function openPathForNavigation(path: string): Promise<string | undefined> {
  const existing = findSessionByPath(path);
  if (existing) {
    setActiveSessionId(existing.id);
    return existing.id;
  }
  const opened = await openPath(path, { warnIfNotOpenApi: false });
  return opened ? (activeSessionId() ?? undefined) : undefined;
}

export function newDocument(): void {
  newSession(OPENAPI_DOCUMENT_SKELETON, 'yaml');
}

export async function saveDocument(id?: string): Promise<boolean> {
  const targetId = id ?? activeSessionId();
  const session = targetId ? getSession(targetId) : undefined;
  if (!session) return false;
  if (!session.documentUri) return saveDocumentAs(session.id);
  try {
    await writeTextFile(session.documentUri, session.content);
    markSaved(session.id, session.documentUri);
    addRecentOpenApiFile(session.documentUri);
    return true;
  } catch (error) {
    showNotification('error', `Failed to save file: ${error}`);
    return false;
  }
}

export async function saveDocumentAs(id?: string): Promise<boolean> {
  const targetId = id ?? activeSessionId();
  const session = targetId ? getSession(targetId) : undefined;
  if (!session) return false;
  const path = await saveDialog({
    defaultPath: session.documentUri ?? `untitled.${session.format === 'json' ? 'json' : 'yaml'}`,
    filters: FILTERS,
  });
  if (!path) return false;
  try {
    await writeTextFile(path, session.content);
    markSaved(session.id, path);
    addRecentOpenApiFile(path);
    return true;
  } catch (error) {
    showNotification('error', `Failed to save file: ${error}`);
    return false;
  }
}

/**
 * Per-session dirty guard (tab close). Returns true when it is safe to
 * proceed (not dirty, saved, or discarded); false when the user cancelled or
 * a save failed.
 */
export async function confirmDiscardIfDirty(promptContext: string, id?: string): Promise<boolean> {
  const targetId = id ?? activeSessionId();
  const session = targetId ? getSession(targetId) : undefined;
  if (!session?.dirty) return true;
  const choice = await showLocalSaveDiscardCancel(`${promptContext} has unsaved changes. Save before continuing?`);
  if (choice === 'cancel') return false;
  if (choice === 'save') return saveDocument(session.id);
  return true;
}

/**
 * All-sessions dirty guard (view switch, app close). One summary 3-way prompt
 * for multiple dirty documents rather than a per-document sequence — the
 * showLocalSaveDiscardCancel resolve channel is a singleton, and a queue of
 * prompts is disproportionate for this surface. Save-all aborts on the first
 * failure so the user never silently loses a document that failed to write.
 */
export async function confirmDiscardAllDirty(promptContext: string): Promise<boolean> {
  const dirty = sessionList().filter((session) => session.dirty);
  if (dirty.length === 0) return true;
  if (dirty.length === 1) return confirmDiscardIfDirty(promptContext, dirty[0].id);
  const choice = await showLocalSaveDiscardCancel(
    `${dirty.length} OpenAPI documents have unsaved changes. Save all before continuing?`
  );
  if (choice === 'cancel') return false;
  if (choice === 'discard') return true;
  for (const session of dirty) {
    if (!(await saveDocument(session.id))) return false;
  }
  return true;
}
