import { invoke } from '@tauri-apps/api/core';
import { buildSyntaxDiagnostics } from '@nouto/core/services/openapi/syntax';
import {
  ALL_LINT_RULES,
  effectiveSeverity,
  lintOptionsFromSettings,
  runLintRules,
} from '@nouto/core/services/openapi/lint/registry';
import { collectExampleSites } from '@nouto/core/services/openapi/lint/exampleSites';
import type { ExampleSite } from '@nouto/core/services/openapi/lint/exampleSites';
import type {
  OpenApiAnalysis,
  OpenApiDiagnostic,
  OpenApiFormat,
  OpenApiVersion,
} from '@nouto/core/services/openapi/types';
import { settings } from '@nouto/ui/stores/settings.svelte';

/** Wire shape of the Rust validate_openapi_schema command's diagnostics. */
interface RustSchemaDiagnostic {
  pointer: string;
  message: string;
  missingProperty?: string;
  anchor?: boolean;
}

/**
 * The synchronous diagnostic sources: syntax + semantic/reference (already on
 * the analysis) + lint. The async 'schema' source (Rust) merges in later via
 * fetchSchemaDiagnostics.
 */
export function computeSyncDiagnostics(
  content: string,
  format: OpenApiFormat,
  analysis: OpenApiAnalysis | null
): OpenApiDiagnostic[] {
  const diagnostics = buildSyntaxDiagnostics(content, format);
  if (!analysis) return diagnostics;
  diagnostics.push(...analysis.diagnostics);
  if (settings.openApiLintEnabled) {
    diagnostics.push(...runLintRules(analysis, lintOptionsFromSettings(settings.openApiLintRules)));
  }
  return diagnostics;
}

/**
 * The async meta-schema source. Callers skip this when
 * `analysis.versionIsApproximate` (validating a future-minor document against
 * the clamped version's schema would flag genuinely-new fields as errors —
 * same rule as VS Code). Never throws: resolves [] on any invoke failure so a
 * Rust-side problem degrades diagnostics instead of breaking the editor.
 */
export async function fetchSchemaDiagnostics(
  parsedSpec: object,
  version: OpenApiVersion
): Promise<OpenApiDiagnostic[]> {
  try {
    const result = await invoke<RustSchemaDiagnostic[]>('validate_openapi_schema', {
      spec: parsedSpec,
      version,
    });
    return result.map((diagnostic) => ({
      source: 'schema' as const,
      severity: 'error' as const,
      message: diagnostic.message,
      // '' is the RFC 6901 root pointer — meaningful, kept as-is.
      pointer: diagnostic.pointer,
      data: diagnostic.missingProperty
        ? { missingProperty: diagnostic.missingProperty }
        : diagnostic.anchor
          ? { anchor: true }
          : undefined,
    }));
  } catch (error) {
    console.error('[openapi] validate_openapi_schema failed:', error);
    return [];
  }
}

/** Wire shape of the Rust validate_openapi_examples command's diagnostics. */
interface RustExampleDiagnostic {
  rule: string;
  pointer: string;
  message: string;
}

/**
 * The async host-validated lint source: every example the document pairs
 * with a schema (core's `collectExampleSites`) is checked by the Rust
 * `jsonschema` validator, since Ajv cannot run under the webview CSP.
 * Findings come back as `'lint'` diagnostics coded with the site's rule id
 * so the per-rule severity settings apply; rules set to Off are not even
 * sent. Never throws: resolves [] on any failure, like fetchSchemaDiagnostics.
 */
export async function fetchExampleDiagnostics(analysis: OpenApiAnalysis): Promise<OpenApiDiagnostic[]> {
  if (!settings.openApiLintEnabled || !analysis.parsedSpec || !analysis.version) return [];
  const options = lintOptionsFromSettings(settings.openApiLintRules);
  const severityFor = new Map<string, 'error' | 'warning' | 'off'>();
  for (const rule of ALL_LINT_RULES) {
    if (rule.hostValidated) severityFor.set(rule.id, effectiveSeverity(rule, options));
  }
  const sites: ExampleSite[] = collectExampleSites(analysis).filter(
    (site) => severityFor.get(site.rule) !== undefined && severityFor.get(site.rule) !== 'off'
  );
  if (sites.length === 0) return [];
  try {
    const result = await invoke<RustExampleDiagnostic[]>('validate_openapi_examples', {
      spec: analysis.parsedSpec,
      version: analysis.version,
      sites,
    });
    return result.map((diagnostic) => ({
      source: 'lint' as const,
      severity: (severityFor.get(diagnostic.rule) ?? 'warning') as 'error' | 'warning',
      code: diagnostic.rule,
      pointer: diagnostic.pointer,
      message: diagnostic.message,
    }));
  } catch (error) {
    console.error('[openapi] validate_openapi_examples failed:', error);
    return [];
  }
}
