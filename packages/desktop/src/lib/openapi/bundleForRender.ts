import { bundleAnalyzedSpecForRender } from '@nouto/core/services/openapi/bundleForRender';
import { settings } from '@nouto/ui/stores/settings.svelte';
import { getExternalAnalysis } from './externalAnalysisCache';
import { tauriFileResolver } from './tauriFileResolver';
import { pathToFileUri } from './pathUtils';
import type { OpenApiSessionState } from './session.svelte';

/**
 * Preview input for a session (Phase 5) — desktop twin of vscode's
 * bundleSpecForRender. Multi-file specs are bundled (external targets hoisted
 * into components.schemas by core's bundleExternalRefs) so the sandboxed
 * renderers, which cannot do file I/O, see a self-contained document.
 * Falls back to the raw spec for untitled docs, a disabled setting, no
 * external refs, or any bundling failure. `externalRefsIncomplete` reports
 * partial bundles (missing files/pointers) for the preview banner. The
 * bundle/merge step itself is core's `bundleAnalyzedSpecForRender`.
 */
export async function bundleSpecForRender(
  session: OpenApiSessionState,
): Promise<{ spec: object | undefined; externalRefsIncomplete?: boolean }> {
  const spec = session.lastValidSpec;
  if (!spec) return { spec: undefined };
  if (!session.documentUri || !settings.openApiExternalRefsEnabled) return { spec };
  try {
    // Reuse the diagnostics pass's result when present; a fresh computation
    // only happens when the preview asks before diagnostics finished.
    const external =
      session.externalAnalysis ?? (await getExternalAnalysis(session, tauriFileResolver));
    return bundleAnalyzedSpecForRender(spec, pathToFileUri(session.documentUri), external);
  } catch {
    return { spec };
  }
}
