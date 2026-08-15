import * as vscode from 'vscode';
import { enumerateRefTargets, parseExternalFileContent } from '@nouto/core/services';
import type { FileResolver, OpenApiNodeKind, PartialRefValue } from '@nouto/core/services';

// Promoted to core (desktop parity) so the desktop completion provider shares
// the same enumeration and `$ref`-value parsing. Re-exported to keep this
// module's public surface unchanged.
export {
  COMPONENT_SECTION_FOR_KIND,
  ALL_REF_SECTIONS,
  enumerateRefTargets,
  parsePartialRefValue,
  typedRefValue,
} from '@nouto/core/services';
export type { PartialRefValue } from '@nouto/core/services';

/** Last parse per target file, keyed by the open document's version (if any). */
const targetCache = new Map<string, { version: number | undefined; parsed: unknown }>();

export function clearExternalRefCompletionCache(): void {
  targetCache.clear();
}

async function loadParsed(targetUri: string, resolver: FileResolver): Promise<unknown> {
  const open = vscode.workspace.textDocuments.find(
    (document) => document.uri.toString() === targetUri
  );
  const cached = targetCache.get(targetUri);
  if (cached && cached.version === open?.version) return cached.parsed;
  const file = await resolver.load(targetUri);
  const parsed = file ? parseExternalFileContent(file.content, file.format) : undefined;
  targetCache.set(targetUri, { version: open?.version, parsed });
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
  resolver: FileResolver
): Promise<string[]> {
  const targetUri = resolver.resolve(fromUri, partial.filePart);
  const parsed = await loadParsed(targetUri, resolver);
  if (parsed === undefined) return [];
  return enumerateRefTargets(parsed, parentKind);
}
