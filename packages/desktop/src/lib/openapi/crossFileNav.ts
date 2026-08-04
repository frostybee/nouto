import { openPathForNavigation } from './documentAdapter';
import { findSessionByPath, getSession, setActiveSessionId } from './session.svelte';
import { fileUriToPath } from './pathUtils';

/**
 * Cross-file navigation (Phase 5): activates the session for the target file
 * (find-or-open, no dialog) and arms its `pendingReveal` slot with the target
 * pointer. The editor view consumes the slot once the session's analysis /
 * pointer map is ready — a freshly opened tab has neither at click time
 * (mirrors VS Code's reveal-once pattern). Shared by the outline's
 * "Referenced files" nodes, go-to-definition, and external quick fixes.
 *
 * `targetPointer === ''` means the whole document (reveal the top).
 */
export async function openReferencedFileAndReveal(
  targetFileUri: string,
  targetPointer: string
): Promise<boolean> {
  let path: string;
  try {
    path = fileUriToPath(targetFileUri);
  } catch {
    return false;
  }
  const existing = findSessionByPath(path);
  let id: string | undefined;
  if (existing) {
    setActiveSessionId(existing.id);
    id = existing.id;
  } else {
    id = await openPathForNavigation(path);
  }
  if (!id) return false;
  const session = getSession(id);
  if (!session) return false;
  session.pendingReveal = targetPointer;
  return true;
}
