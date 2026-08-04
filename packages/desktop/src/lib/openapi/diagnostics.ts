import { invoke } from '@tauri-apps/api/core';
import { buildSyntaxDiagnostics } from '@nouto/core/services/openapi/syntax';
import { runLintRules } from '@nouto/core/services/openapi/lint/registry';
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
    diagnostics.push(
      ...runLintRules(analysis, {
        disabledRules: [],
        severityOverrides: settings.openApiLintRules,
      })
    );
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
        : undefined,
    }));
  } catch (error) {
    console.error('[openapi] validate_openapi_schema failed:', error);
    return [];
  }
}
