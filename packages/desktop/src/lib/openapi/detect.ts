import * as yaml from 'js-yaml';
import { detectOpenApiVersion } from '@nouto/core';
import type { OpenApiFormat } from '@nouto/core/services/openapi/types';

export function formatFromPath(path: string): OpenApiFormat | null {
  const lower = path.toLowerCase();
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'yaml';
  if (lower.endsWith('.json')) return 'json';
  return null;
}

/**
 * Cheap pre-check used to gate a non-blocking "doesn't look like OpenAPI"
 * warning on open — never to refuse opening a file.
 */
export function isOpenApiDocument(content: string, format: OpenApiFormat): boolean {
  const quickMatch =
    format === 'yaml' ? /^["']?openapi["']?\s*:\s*["']?3\./m.test(content) : /"openapi"\s*:\s*"3\./.test(content);
  if (!quickMatch) return false;
  try {
    const parsed = format === 'yaml' ? yaml.load(content) : JSON.parse(content);
    return detectOpenApiVersion((parsed as { openapi?: unknown } | null)?.openapi) !== undefined;
  } catch {
    return false;
  }
}
