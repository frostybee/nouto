import { invoke } from '@tauri-apps/api/core';
import { resolveExternalRefUri } from '@nouto/core/services/openapi/externalRefs';
import type { FileResolver } from '@nouto/core/services/openapi/externalRefs';
import { findSessionByPath } from './session.svelte';
import { fileUriToPath } from './pathUtils';
import { formatFromPath } from './detect';

/**
 * Desktop `FileResolver` for core's external-$ref machinery (Phase 5).
 * Mirrors VscodeFileResolver's priority: an open session's live buffer wins
 * (unsaved edits included), then the disk fallback via the narrow Rust
 * `read_openapi_ref_file` command (sibling files are outside the fs plugin's
 * scope). Stateless — freshness/caching is the analysis cache's concern.
 */
export function createTauriFileResolver(): FileResolver {
  return {
    resolve(fromUri, refPath) {
      return resolveExternalRefUri(fromUri, refPath);
    },
    async load(uri) {
      let path: string;
      try {
        path = fileUriToPath(uri);
      } catch {
        return undefined;
      }
      const open = findSessionByPath(path);
      if (open) {
        return { content: open.content, format: open.format ?? 'yaml' };
      }
      try {
        const content = await invoke<string>('read_openapi_ref_file', { path });
        return { content, format: formatFromPath(path) ?? 'yaml' };
      } catch {
        // Missing/unreadable/disallowed file — the analysis pass reports it
        // as external-file-not-found; nothing to throw here.
        return undefined;
      }
    },
  };
}

/** Shared instance for diagnostics, completion, definition, and preview bundling. */
export const tauriFileResolver: FileResolver = createTauriFileResolver();
