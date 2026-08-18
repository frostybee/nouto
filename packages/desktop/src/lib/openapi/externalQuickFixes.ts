import * as yaml from 'js-yaml';
import { parsePointer, buildPointer } from '@nouto/core/services/openapi/pointer';
import { asString, fileLabel } from '@nouto/core/services/openapi/quickFixUtils';
import { planInsertObjectMember } from '@nouto/core/services/openapi/specEdit';
import type { SpecTextEdit } from '@nouto/core/services/openapi/specEdit';
import { COMPONENT_PRESETS } from '@nouto/core/services/openapi/specSkeletons';
import { resolveExternalRefUri, splitExternalRef } from '@nouto/core/services/openapi/externalRefs';
import type { OpenApiDiagnostic, OpenApiFormat } from '@nouto/core/services/openapi/types';
import type { OffsetRange, OpenApiPointerMap } from '@nouto/core/services/openapi/pointerMap';
import { invoke } from '@tauri-apps/api/core';
import { showNotification } from '@nouto/ui/stores/notifications.svelte';
import { diagnosticMarkerRange } from './quickFixes';
import {
  findSessionByPath,
  getSession,
  setActiveSessionId,
  setContentFor,
  type OpenApiSessionState,
} from './session.svelte';
import { openPathForNavigation } from './documentAdapter';
import { fileUriToPath, pathToFileUri } from './pathUtils';
import { formatFromPath } from './detect';

/**
 * Cross-file quick fixes (Phase 5) — desktop port of vscode's
 * EXTERNAL_FIX_BUILDERS. Unlike the in-document fixes in quickFixes.ts these
 * cannot be expressed as `SpecTextEdit[]` on the current model: one edits a
 * DIFFERENT document (possibly a background tab), the other creates a file on
 * disk. Each fix therefore carries an async side-effecting apply() dispatched
 * through a Monaco command instead of a CodeAction.edit.
 */
export interface ExternalQuickFix {
  title: string;
  code: 'external-pointer-not-found' | 'external-file-not-found';
  /** Marker range in the CURRENT document, for cursor-overlap matching. */
  range: OffsetRange;
  apply(): Promise<void>;
}

function applyTextEdits(text: string, edits: SpecTextEdit[]): string {
  let result = text;
  // Apply back-to-front so earlier offsets stay valid.
  for (const edit of [...edits].sort((a, b) => b.offset - a.offset)) {
    result = result.slice(0, edit.offset) + edit.text + result.slice(edit.offset + edit.length);
  }
  return result;
}

/**
 * Initial content for a missing referenced file: seeded with the component
 * the broken ref expected (same preset as the in-document ref-not-found fix)
 * so the ref resolves immediately; other pointer shapes get an empty doc.
 */
export function scaffoldContent(targetPointer: string, format: OpenApiFormat): string {
  const segments = parsePointer(targetPointer);
  let value: unknown = {};
  if (segments && segments.length === 3 && segments[0] === 'components') {
    const [, section, name] = segments;
    value = { components: { [section]: { [name]: COMPONENT_PRESETS[section] ?? {} } } };
  }
  return format === 'yaml' ? yaml.dump(value) : `${JSON.stringify(value, null, 2)}\n`;
}

/** Opens-or-finds the target file's session and activates it. */
async function activateTargetSession(targetUri: string): Promise<OpenApiSessionState | undefined> {
  let path: string;
  try {
    path = fileUriToPath(targetUri);
  } catch {
    return undefined;
  }
  const existing = findSessionByPath(path);
  if (existing) {
    setActiveSessionId(existing.id);
    return existing;
  }
  const id = await openPathForNavigation(path);
  return id ? getSession(id) : undefined;
}

async function applyCreateComponent(
  targetUri: string,
  section: string,
  name: string,
): Promise<void> {
  const target = await activateTargetSession(targetUri);
  if (!target?.format) {
    showNotification('error', `Could not open ${fileLabel(targetUri)} to create the component.`);
    return;
  }
  const plan = planInsertObjectMember(
    { text: target.content, format: target.format },
    buildPointer(['components', section]),
    name,
    COMPONENT_PRESETS[section] ?? {},
  );
  if (!plan) {
    showNotification('error', `Could not create "${name}" in ${fileLabel(targetUri)}.`);
    return;
  }
  // Patch the session's content directly (works for background tabs too); the
  // editor's content-sync effect mirrors it into the Monaco model, and the
  // referencedBy invalidation re-validates the referrer automatically.
  setContentFor(target.id, applyTextEdits(target.content, plan.edits));
  target.pendingReveal = plan.insertedPointer;
}

async function applyCreateFile(targetUri: string, targetPointer: string): Promise<void> {
  let path: string;
  try {
    path = fileUriToPath(targetUri);
  } catch {
    return;
  }
  const format = formatFromPath(path) ?? 'yaml';
  try {
    await invoke('write_openapi_ref_file', {
      path,
      content: scaffoldContent(targetPointer, format),
    });
  } catch (error) {
    showNotification('error', `Could not create ${fileLabel(targetUri)}: ${error}`);
    return;
  }
  await activateTargetSession(targetUri);
}

/**
 * External fixes whose diagnostic marker overlaps the requested range. The
 * diagnostics come from the session's merged set (the external pass's entries
 * carry code + data directly).
 */
export function buildExternalQuickFixes(
  session: OpenApiSessionState,
  diagnostics: OpenApiDiagnostic[],
  map: OpenApiPointerMap,
  requestedRange: OffsetRange,
): ExternalQuickFix[] {
  if (!session.documentUri) return [];
  const fromUri = pathToFileUri(session.documentUri);
  const fixes: ExternalQuickFix[] = [];
  for (const diagnostic of diagnostics) {
    if (
      diagnostic.code !== 'external-file-not-found' &&
      diagnostic.code !== 'external-pointer-not-found'
    ) {
      continue;
    }
    const range = diagnosticMarkerRange(diagnostic, map);
    if (!range) continue;
    if (range.to < requestedRange.from || range.from > requestedRange.to) continue;

    const targetUri = asString(diagnostic.data?.targetUri);
    if (targetUri === undefined) continue;

    if (diagnostic.code === 'external-pointer-not-found') {
      const targetPointer = asString(diagnostic.data?.targetPointer);
      if (targetPointer === undefined) continue;
      // Same restriction as the internal ref-not-found fix: only a
      // /components/<section>/<name> target has an obvious skeleton.
      const segments = parsePointer(targetPointer);
      if (!segments || segments.length !== 3 || segments[0] !== 'components') continue;
      const [, section, name] = segments;
      fixes.push({
        title: `Create missing component "${name}" in ${fileLabel(targetUri)}`,
        code: diagnostic.code,
        range,
        apply: () => applyCreateComponent(targetUri, section, name),
      });
    } else {
      // Seed the new file with the component the root ref expected, but only
      // when that ref actually points at this file (nested-hop failures
      // report the root ref, whose pointer belongs to a different file).
      const ref = asString(diagnostic.data?.ref);
      const split = ref === undefined ? undefined : splitExternalRef(ref);
      const refTargetsThisFile =
        split !== undefined && resolveExternalRefUri(fromUri, split.filePath) === targetUri;
      const targetPointer = refTargetsThisFile ? split.pointer : '';
      fixes.push({
        title: `Create missing file "${fileLabel(targetUri)}"`,
        code: diagnostic.code,
        range,
        apply: () => applyCreateFile(targetUri, targetPointer),
      });
    }
  }
  return fixes;
}
