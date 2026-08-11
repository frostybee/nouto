/**
 * Parse JSON, falling back to JSONL / NDJSON (one JSON document per line).
 * JSONL input produces an array with one element per non-blank line.
 */

export interface ParseJsonResult {
  /** The parsed value. Undefined when `error` is set. */
  data?: any;
  /** Parse failure description. For JSONL input it names the failing line. */
  error?: string;
}

/**
 * Try to parse text as a single JSON document, then as JSONL / NDJSON.
 *
 * JSONL is only attempted when the text spans multiple non-blank lines that
 * each look like a JSON value; blank lines are skipped.
 */
export function parseJsonOrJsonl(text: string): ParseJsonResult {
  let jsonError: string;
  try {
    return { data: JSON.parse(text) };
  } catch (err) {
    jsonError = err instanceof Error ? err.message : String(err);
  }

  const lines = text.split(/\r?\n/);
  const nonBlank = lines
    .map((line, i) => ({ line: line.trim(), lineNumber: i + 1 }))
    .filter(({ line }) => line.length > 0);

  // Not JSONL-shaped: a single line, or lines that cannot each be a JSON document.
  if (nonBlank.length < 2) return { error: jsonError };

  const items: any[] = [];
  for (const { line, lineNumber } of nonBlank) {
    try {
      items.push(JSON.parse(line));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { error: `Line ${lineNumber}: ${msg}` };
    }
  }
  return { data: items };
}
