import { save as saveDialog, open as openDialog } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import { showNotification } from '@nouto/ui/stores/notifications.svelte';
import { OPENAPI_DOCUMENT_SKELETON } from '@nouto/core/services/openapi/specSkeletons';
import { openApiSession, loadDocument, markSaved } from './session.svelte';
import { formatFromPath, isOpenApiDocument } from './detect';
import { showLocalSaveDiscardCancel } from '../modal-store.svelte';

const FILTERS = [{ name: 'OpenAPI', extensions: ['yaml', 'yml', 'json'] }];

export async function openFile(): Promise<boolean> {
  const selected = await openDialog({ multiple: false, filters: FILTERS, title: 'Open OpenAPI Document' });
  if (!selected) return false;
  const path = selected as string;
  const format = formatFromPath(path) ?? 'yaml';
  try {
    const content = await readTextFile(path);
    if (!isOpenApiDocument(content, format)) {
      showNotification('warning', 'This file does not look like an OpenAPI 3.x document.');
    }
    loadDocument(path, content, format);
    return true;
  } catch (error) {
    showNotification('error', `Failed to open file: ${error}`);
    return false;
  }
}

export function newDocument(): void {
  loadDocument(null, OPENAPI_DOCUMENT_SKELETON, 'yaml');
}

export async function saveDocument(): Promise<boolean> {
  if (!openApiSession.documentUri) return saveDocumentAs();
  try {
    await writeTextFile(openApiSession.documentUri, openApiSession.content);
    markSaved(openApiSession.documentUri);
    return true;
  } catch (error) {
    showNotification('error', `Failed to save file: ${error}`);
    return false;
  }
}

export async function saveDocumentAs(): Promise<boolean> {
  const path = await saveDialog({
    defaultPath: openApiSession.documentUri ?? `untitled.${openApiSession.format === 'json' ? 'json' : 'yaml'}`,
    filters: FILTERS,
  });
  if (!path) return false;
  try {
    await writeTextFile(path, openApiSession.content);
    markSaved(path);
    return true;
  } catch (error) {
    showNotification('error', `Failed to save file: ${error}`);
    return false;
  }
}

/**
 * Single choke point for both the view-switch guard and the window-close hook.
 * Returns true when it is safe to proceed (not dirty, saved, or discarded);
 * false when the user cancelled or a save failed.
 */
export async function confirmDiscardIfDirty(promptContext: string): Promise<boolean> {
  if (!openApiSession.dirty) return true;
  const choice = await showLocalSaveDiscardCancel(`${promptContext} has unsaved changes. Save before continuing?`);
  if (choice === 'cancel') return false;
  if (choice === 'save') return saveDocument();
  return true;
}
