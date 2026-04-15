/**
 * Helpers for pre-scanning request fields for template functions
 * that require user interaction or async resolution before substitution.
 */

const PROMPT_RE = /\{\{\s*\$prompt\.([^},\s]+)\s*\}\}/g;
const FILE_RE = /\{\{\s*\$file\.read\s*,\s*([^}]+?)\s*\}\}/g;

/**
 * Scan string fields for {{$prompt.xxx}} patterns.
 * Returns unique prompt keys in order of first appearance.
 */
export function scanPromptKeys(fields: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const field of fields) {
    if (!field) continue;
    PROMPT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PROMPT_RE.exec(field)) !== null) {
      const key = m[1];
      if (!seen.has(key)) { seen.add(key); result.push(key); }
    }
  }
  return result;
}

/**
 * Scan string fields for {{$file.read, /path/to/file}} patterns.
 * Returns unique file paths in order of first appearance.
 */
export function scanFilePaths(fields: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const field of fields) {
    if (!field) continue;
    FILE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = FILE_RE.exec(field)) !== null) {
      const path = m[1].trim();
      if (!seen.has(path)) { seen.add(path); result.push(path); }
    }
  }
  return result;
}
