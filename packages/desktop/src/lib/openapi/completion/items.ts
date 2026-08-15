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
import {
  detailFor,
  keySnippet,
  siblingKeys,
  visibleInVersion,
} from '@nouto/core/services/openapi/completion/suggest';
import type { EnumValueEntry } from '@nouto/core/services/openapi/completion/types';
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
/* Builders (shared with the VS Code provider via core's completion/suggest)  */
/* -------------------------------------------------------------------------- */

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

