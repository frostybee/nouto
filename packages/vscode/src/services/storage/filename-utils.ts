/**
 * Filesystem-safe filename utilities for per-request storage.
 */

const INVALID_CHARS = /[/\\:*?"<>|]/g;
const CONSECUTIVE_UNDERSCORES = /_{2,}/g;
const WINDOWS_RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
const MAX_LENGTH = 200;

/**
 * Convert a name to a filesystem-safe filename.
 * - Replaces invalid characters (/ \ : * ? " < > |) with _
 * - Trims whitespace, collapses consecutive underscores
 * - Handles Windows reserved names by appending _
 * - Truncates to 200 characters
 * - Falls back to 'untitled' if empty
 */
export function sanitizeFilename(name: string): string {
  let result = name
    .trim()
    .replace(INVALID_CHARS, '_')
    .replace(CONSECUTIVE_UNDERSCORES, '_');

  // Trim leading/trailing underscores that resulted from replacement
  result = result.replace(/^_+|_+$/g, '').trim();

  if (!result) return 'untitled';

  // Handle Windows reserved names
  if (WINDOWS_RESERVED.test(result)) {
    result = `${result}_`;
  }

  // Truncate
  if (result.length > MAX_LENGTH) {
    result = result.substring(0, MAX_LENGTH);
  }

  return result;
}

/**
 * Resolve filename collisions by appending _2, _3, etc.
 */
export function resolveCollision(baseName: string, existingNames: Set<string>): string {
  if (!existingNames.has(baseName)) return baseName;

  let counter = 2;
  while (existingNames.has(`${baseName}_${counter}`)) {
    counter++;
  }
  return `${baseName}_${counter}`;
}
