/**
 * Small shared helpers for the quick-fix builders in both hosts (VS Code's
 * OpenApiCodeActionProvider and desktop's quickFixes/externalQuickFixes).
 */

/** Narrow a diagnostic `data` field to a string, or undefined. */
export function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Last path segment of a URI, for user-facing fix titles. */
export function fileLabel(uri: string): string {
  return uri.split('/').pop() ?? uri;
}
