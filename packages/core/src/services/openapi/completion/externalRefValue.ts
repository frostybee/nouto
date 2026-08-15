/**
 * Parsing for partially typed external `$ref` values, shared by the VS Code
 * and desktop completion providers. Pure string logic; the host-specific parts
 * (target-file loading and cache freshness) stay in each host's
 * externalRefCompletion module.
 */
import { splitExternalRef } from '../externalRefs';

/** An in-progress `$ref` value split into its file and pointer halves. */
export interface PartialRefValue {
  filePart: string;
  /** Pointer text typed after the `#`, possibly incomplete. */
  pointerPart: string;
  hasHash: boolean;
}

/**
 * Splits the `$ref` value being typed into `{filePart, pointerPart}` when the
 * file part is a local relative path. Locality is classified by
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
 * character (0-based — Monaco callers add 1 for columns). Returns the text
 * INSIDE the value string when the cursor sits in an open quote (the replace
 * range must not swallow the opening quote), else the unquoted text after the
 * colon.
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
