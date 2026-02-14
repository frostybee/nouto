/**
 * Variable validation utilities for {{variable}} patterns.
 *
 * Classifies each variable reference as:
 * - 'resolved'   (green)  — matches an active environment/global variable
 * - 'unresolved' (orange) — no matching variable found
 * - 'dynamic'    (blue)   — built-in dynamic variable ($guid, $timestamp, $response, etc.)
 */

export type VariableStatus = 'resolved' | 'unresolved' | 'dynamic';

export interface VariableInfo {
  name: string;
  status: VariableStatus;
}

const VARIABLE_PATTERN = /\{\{([^}]+)\}\}/g;

/** Built-in dynamic variable prefixes/names */
const DYNAMIC_PREFIXES = [
  '$guid', '$uuid', '$timestamp', '$isoTimestamp', '$randomInt',
  '$name', '$email', '$string', '$number', '$bool', '$enum',
  '$date', '$dateISO', '$response',
];

function isDynamic(name: string): boolean {
  const trimmed = name.trim();
  return DYNAMIC_PREFIXES.some(p => trimmed === p || trimmed.startsWith(p + '.') || trimmed.startsWith(p + ','));
}

/**
 * Extract all {{variable}} references from a string and classify them.
 */
export function classifyVariables(text: string, activeVars: Map<string, string>): VariableInfo[] {
  if (!text) return [];
  const results: VariableInfo[] = [];
  const seen = new Set<string>();

  let match;
  const pattern = new RegExp(VARIABLE_PATTERN.source, 'g');
  while ((match = pattern.exec(text)) !== null) {
    const raw = match[1].trim();
    if (seen.has(raw)) continue;
    seen.add(raw);

    if (isDynamic(raw)) {
      results.push({ name: raw, status: 'dynamic' });
    } else if (/^\w+$/.test(raw) && activeVars.has(raw)) {
      results.push({ name: raw, status: 'resolved' });
    } else if (/^\w+$/.test(raw)) {
      results.push({ name: raw, status: 'unresolved' });
    } else {
      // Named request references like "Login.$response.body.token"
      results.push({ name: raw, status: 'dynamic' });
    }
  }

  return results;
}

/**
 * Quick check: does the text contain any {{variable}} patterns?
 */
export function hasVariables(text: string): boolean {
  return VARIABLE_PATTERN.test(text);
}

/**
 * Get the aggregate status for a set of variables.
 * Priority: unresolved > dynamic > resolved (worst wins).
 */
export function aggregateStatus(infos: VariableInfo[]): VariableStatus | null {
  if (infos.length === 0) return null;
  if (infos.some(v => v.status === 'unresolved')) return 'unresolved';
  if (infos.some(v => v.status === 'dynamic')) return 'dynamic';
  return 'resolved';
}
