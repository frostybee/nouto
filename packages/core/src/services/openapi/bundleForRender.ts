/**
 * Shared tail of both hosts' `bundleSpecForRender`: given a spec whose
 * external analysis is already computed, inline the cross-file `$ref`s so
 * renderers that cannot load other files (the sandboxed preview frame, the
 * docs snapshot) receive one self-contained document. The host wrappers keep
 * the host-specific parts — settings/scheme gates, cache retrieval, and the
 * fall-back-to-raw-spec catch.
 */
import { bundleExternalRefs } from './externalRefs';
import type { ExternalAnalysisResult } from './externalRefs';

export function bundleAnalyzedSpecForRender(
  spec: object,
  rootUri: string,
  external: ExternalAnalysisResult
): { spec: object; externalRefsIncomplete?: boolean } {
  if (external.externalRefs.size === 0) return { spec };
  const bundled = bundleExternalRefs(spec, rootUri, external.resolvedFiles);
  const incomplete = bundled.diagnostics.length > 0 || external.diagnostics.length > 0;
  return { spec: bundled.document, externalRefsIncomplete: incomplete || undefined };
}
