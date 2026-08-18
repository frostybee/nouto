import { enumerateRefTargets } from '@nouto/core/services/openapi/completion/refTargets';
import { parseExternalFileContent } from '@nouto/core/services/openapi/externalRefs';
import type { FileResolver } from '@nouto/core/services/openapi/externalRefs';
import type { OpenApiNodeKind } from '@nouto/core/services/openapi/completion/types';
import type { PartialRefValue } from '@nouto/core/services/openapi/completion/externalRefValue';
import { findSessionByPath } from '../session.svelte';
import { fileUriToPath } from '../pathUtils';

/**
 * Cross-file `$ref` completion glue (Phase 5). The `$ref`-value parsing lives
 * in `@nouto/core` (shared with the VS Code provider, re-exported below); this
 * module keeps only the desktop-specific target-file loading, with the open
 * document version check swapped for the session registry's contentRevision.
 * The enumeration itself is core's `enumerateRefTargets` (shared verbatim).
 */
export {
  parsePartialRefValue,
  typedRefValue,
} from '@nouto/core/services/openapi/completion/externalRefValue';
export type { PartialRefValue } from '@nouto/core/services/openapi/completion/externalRefValue';

/** Last parse per target file, keyed by the open session's contentRevision (if any). */
const targetCache = new Map<string, { revision: number | undefined; parsed: unknown }>();

export function clearExternalRefCompletionCache(): void {
  targetCache.clear();
}

function openRevision(targetUri: string): number | undefined {
  try {
    return findSessionByPath(fileUriToPath(targetUri))?.contentRevision;
  } catch {
    return undefined;
  }
}

async function loadParsed(targetUri: string, resolver: FileResolver): Promise<unknown> {
  const revision = openRevision(targetUri);
  const cached = targetCache.get(targetUri);
  // Closed files (revision undefined) cache for the process lifetime — the
  // accepted v1 no-watcher limitation, matching VS Code.
  if (cached && cached.revision === revision) return cached.parsed;
  const file = await resolver.load(targetUri);
  const parsed = file ? parseExternalFileContent(file.content, file.format) : undefined;
  targetCache.set(targetUri, { revision, parsed });
  return parsed;
}

/**
 * Ref-target pointers within the file a partially typed external `$ref` points
 * at. Empty when the file cannot be resolved, loaded, or parsed — completion
 * degrades silently.
 */
export async function crossFileRefTargets(
  fromUri: string,
  partial: PartialRefValue,
  parentKind: OpenApiNodeKind,
  resolver: FileResolver,
): Promise<string[]> {
  const targetUri = resolver.resolve(fromUri, partial.filePart);
  const parsed = await loadParsed(targetUri, resolver);
  if (parsed === undefined) return [];
  return enumerateRefTargets(parsed, parentKind);
}
