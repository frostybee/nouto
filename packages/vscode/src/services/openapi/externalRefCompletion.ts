import * as vscode from 'vscode';
import { enumerateRefTargets, parseExternalFileContent, splitExternalRef } from '@nouto/core/services';
import type { FileResolver, OpenApiNodeKind } from '@nouto/core/services';

// Promoted to core (Phase 4 of the desktop parity roadmap) so the desktop
// completion provider shares the same enumeration. Re-exported to keep this
// module's public surface unchanged.
export {
  COMPONENT_SECTION_FOR_KIND,
  ALL_REF_SECTIONS,
  enumerateRefTargets,
} from '@nouto/core/services';

/** An in-progress `$ref` value split into its file and pointer halves. */
export interface PartialRefValue {
  filePart: string;
  /** Pointer text typed after the `#`, possibly incomplete. */
  pointerPart: string;
  hasHash: boolean;
}

/**
 * Splits the `$ref` value being typed into `{filePart, pointerPart}` when the
 * file part is a local relative path. Locality is classified by core's
 * `splitExternalRef` — the same rule the analyzer uses — so internal (`#...`),
 * scheme'd, and absolute refs return undefined.
 */
export function parsePartialRefValue(rawValueText: string): PartialRefValue | undefined {
  const text = rawValueText.trim();
  if (text === '' || text.startsWith('#')) return undefined;
  const hashIndex = text.indexOf('#');
  const filePart = hashIndex === -1 ? text : text.slice(0, hashIndex);
  const pointerPart = hashIndex === -1 ? '' : text.slice(hashIndex + 1);
  if (!splitExternalRef(`${filePart}#${pointerPart}`)) return undefined;
  return { filePart, pointerPart, hasHash: hashIndex !== -1 };
}

/**
 * The typed value text on a `$ref` line before the cursor, with its start
 * column. Returns the text INSIDE the value string when the cursor sits in an
 * open quote (the replace range must not swallow the opening quote), else the
 * unquoted text after the colon.
 */
export function typedRefValue(
  before: string
): { text: string; startCharacter: number } | undefined {
  let colonIndex = -1;
  let quote: string | undefined;
  let quoteStart = -1;
  for (let i = 0; i < before.length; i++) {
    const char = before[i];
    if (quote) {
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      quoteStart = i;
    } else if (colonIndex === -1 && char === ':') {
      colonIndex = i;
    }
  }
  if (colonIndex === -1) return undefined;
  if (quote !== undefined && quoteStart > colonIndex) {
    return { text: before.slice(quoteStart + 1), startCharacter: quoteStart + 1 };
  }
  const after = before.slice(colonIndex + 1);
  const leading = /^\s*/.exec(after)![0].length;
  return { text: after.slice(leading), startCharacter: colonIndex + 1 + leading };
}

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
