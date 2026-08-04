/**
 * Widget-agnostic suggestion builders over core's curated completion registry.
 * The hybrid IntelliSense split lives here: JSON documents get the full
 * curated set (`full: true` — they have no schema-driven provider), while
 * YAML gets gap-fillers only (`full: false` — monaco-yaml already provides
 * schema-driven property/enum completion, so duplicating it is forbidden).
 * The remaining YAML gaps are `$ref` targets and dynamic security-scheme keys.
 */
import { enumerateRefTargets } from '@nouto/core/services/openapi/completion/refTargets';
import {
  getCompletions,
  getDynamicKeyCandidates,
  getEnumValues,
} from '@nouto/core/services/openapi/completion/registry';
import type {
  EnumValueEntry,
  PropertyCompletionEntry,
} from '@nouto/core/services/openapi/completion/types';
import { getByPointer } from '@nouto/core/services/openapi/pointer';
import type { OpenApiAnalysis, OpenApiVersion } from '@nouto/core/services/openapi/types';
import type { DetectedContext } from './context';

export interface KeySuggestion {
  name: string;
  /** Markdown documentation (curated from the spec text). */
  docs?: string;
  /** e.g. "required · since 3.1" */
  detail?: string;
  /** Insert text; LSP snippet syntax when `isSnippet`. */
  snippet: string;
  isSnippet: boolean;
  kind: 'object' | 'array' | 'enum' | 'scalar' | 'dynamic-key';
}

export interface ValueSuggestion {
  label: string;
  insertText: string;
  docs?: string;
  kind: 'enum' | 'ref';
}

export interface SuggestionOptions {
  /** True for JSON (full curated set); false for YAML (gap-fillers only). */
  full: boolean;
}

export function buildKeySuggestions(
  ctx: Extract<DetectedContext, { mode: 'key' }>,
  version: OpenApiVersion,
  analysis: OpenApiAnalysis,
  opts: SuggestionOptions
): KeySuggestion[] {
  const isYaml = !opts.full;
  const existingKeys = siblingKeys(analysis, ctx.containerPointer);
  const suggestions: KeySuggestion[] = [];

  if (opts.full) {
    for (const entry of getCompletions(ctx.kind, version, { existingKeys })) {
      suggestions.push({
        name: entry.name,
        docs: entry.docs,
        detail: detailFor(entry),
        snippet: keySnippet(entry, version, isYaml),
        isSnippet: true,
        kind:
          entry.insertKind === 'object'
            ? 'object'
            : entry.insertKind === 'array'
              ? 'array'
              : entry.insertKind === 'enum-value'
                ? 'enum'
                : 'scalar',
      });
    }
  }

  // Security Requirement keys are the document's security-scheme names —
  // dynamic, so monaco-yaml can't offer them; both formats get them here.
  if (ctx.kind === 'SecurityRequirement') {
    for (const name of getDynamicKeyCandidates(ctx.kind, analysis)) {
      if (existingKeys.has(name)) continue;
      suggestions.push({
        name,
        snippet: isYaml ? `${name}:\n  - $0` : `"${name}": [$0]`,
        isSnippet: true,
        kind: 'dynamic-key',
      });
    }
  }
  return suggestions;
}

export function buildValueSuggestions(
  ctx: Extract<DetectedContext, { mode: 'value' }>,
  version: OpenApiVersion,
  analysis: OpenApiAnalysis,
  opts: SuggestionOptions
): ValueSuggestion[] {
  const isYaml = !opts.full;

  if (ctx.propertyName === '$ref') {
    if (!analysis.parsedSpec) return [];
    // enumerateRefTargets falls back to top-level keys for component-less
    // documents (an external bare-schema-file affordance); in-document refs
    // only ever target /components/*, matching the VS Code provider.
    return enumerateRefTargets(analysis.parsedSpec, ctx.parentKind)
      .filter((target) => target.startsWith('#/components/'))
      .map((target) => refSuggestion(target, ctx.inQuotes, isYaml));
  }

  // Enum values: monaco-yaml already offers these for YAML via the schema.
  if (!opts.full) return [];
  const values = getEnumValues(ctx.parentKind, ctx.propertyName, version);
  if (!values) return [];
  return values
    .filter((value) => visibleInVersion(value, version))
    .map((value) => enumSuggestion(value, ctx.inQuotes, isYaml));
}

/* -------------------------------------------------------------------------- */
/* Builders (ported verbatim from the VS Code provider)                       */
/* -------------------------------------------------------------------------- */

function keySnippet(
  entry: PropertyCompletionEntry,
  version: OpenApiVersion,
  isYaml: boolean
): string {
  if (!isYaml) {
    // JSON: insert the quoted key and a placeholder value; punctuation around
    // it is left to the editor.
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

function enumSuggestion(value: EnumValueEntry, inQuotes: boolean, isYaml: boolean): ValueSuggestion {
  const needsQuotes = !isYaml && !inQuotes;
  return {
    label: value.value,
    insertText: needsQuotes ? `"${value.value}"` : value.value,
    docs: value.docs,
    kind: 'enum',
  };
}

function refSuggestion(target: string, inQuotes: boolean, isYaml: boolean): ValueSuggestion {
  // A leading '#' starts a comment in unquoted YAML, so YAML refs must be
  // quoted. JSON values are quoted unless the cursor already sits in a string.
  const insertText = inQuotes ? target : isYaml ? `'${target}'` : `"${target}"`;
  return { label: target, insertText, kind: 'ref' };
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function detailFor(entry: PropertyCompletionEntry): string | undefined {
  const parts: string[] = [];
  if (entry.required) parts.push('required');
  if (entry.deprecatedSince) parts.push(`deprecated ${entry.deprecatedSince}`);
  else if (entry.sinceVersion) parts.push(`since ${entry.sinceVersion}`);
  return parts.length ? parts.join(' · ') : undefined;
}

const VERSION_ORDER: Record<OpenApiVersion, number> = { '3.0': 0, '3.1': 1, '3.2': 2 };

function visibleInVersion(
  entry: { sinceVersion?: OpenApiVersion; until?: OpenApiVersion },
  version: OpenApiVersion
): boolean {
  const order = VERSION_ORDER[version];
  if (entry.sinceVersion && order < VERSION_ORDER[entry.sinceVersion]) return false;
  if (entry.until && order > VERSION_ORDER[entry.until]) return false;
  return true;
}

function siblingKeys(analysis: OpenApiAnalysis, containerPointer: string): Set<string> {
  if (!analysis.parsedSpec) return new Set();
  const lookup = getByPointer(analysis.parsedSpec, containerPointer);
  if (lookup.found && isRecord(lookup.value)) return new Set(Object.keys(lookup.value));
  return new Set();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
