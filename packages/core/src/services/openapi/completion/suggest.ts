/**
 * Host-agnostic suggestion-building helpers over the curated completion
 * registry, shared by the VS Code provider and the desktop Monaco provider.
 * Hosts wrap the results in their own completion-item types.
 */
import { getByPointer } from '../pointer';
import type { OpenApiAnalysis, OpenApiVersion } from '../types';
import type { PropertyCompletionEntry } from './types';

/**
 * The LSP snippet body inserted for a completed property key. YAML keys open a
 * block scaffold matching the entry's insert kind; JSON inserts the quoted key
 * with a placeholder value (surrounding punctuation is left to the editor).
 */
export function keySnippet(
  entry: PropertyCompletionEntry,
  version: OpenApiVersion,
  isYaml: boolean
): string {
  if (!isYaml) {
    return `"${entry.name}": $0`;
  }
  if (entry.snippetBody) return `${entry.name}:${entry.snippetBody}`;
  switch (entry.insertKind) {
    case 'object':
      return `${entry.name}:\n  $0`;
    case 'array':
      return `${entry.name}:\n  - $0`;
    case 'enum-value': {
      const choices = (entry.enumValues ?? [])
        .filter((value) => visibleInVersion(value, version))
        .map((value) => value.value);
      return choices.length ? `${entry.name}: \${1|${choices.join(',')}|}` : `${entry.name}: $0`;
    }
    default:
      return `${entry.name}: $0`;
  }
}

/** e.g. "required · since 3.1" */
export function detailFor(entry: PropertyCompletionEntry): string | undefined {
  const parts: string[] = [];
  if (entry.required) parts.push('required');
  if (entry.deprecatedSince) parts.push(`deprecated ${entry.deprecatedSince}`);
  else if (entry.sinceVersion) parts.push(`since ${entry.sinceVersion}`);
  return parts.length ? parts.join(' · ') : undefined;
}

const VERSION_ORDER: Record<OpenApiVersion, number> = { '3.0': 0, '3.1': 1, '3.2': 2 };

export function visibleInVersion(
  entry: { sinceVersion?: OpenApiVersion; until?: OpenApiVersion },
  version: OpenApiVersion
): boolean {
  const order = VERSION_ORDER[version];
  if (entry.sinceVersion && order < VERSION_ORDER[entry.sinceVersion]) return false;
  if (entry.until && order > VERSION_ORDER[entry.until]) return false;
  return true;
}

/** The keys already present in the object a completion inserts into. */
export function siblingKeys(analysis: OpenApiAnalysis, containerPointer: string): Set<string> {
  if (!analysis.parsedSpec) return new Set();
  const lookup = getByPointer(analysis.parsedSpec, containerPointer);
  if (lookup.found && isRecord(lookup.value)) return new Set(Object.keys(lookup.value));
  return new Set();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
