/**
 * Quick-fix builders for the 5 fixable in-document diagnostic codes — the
 * desktop port of the VS Code OpenApiCodeActionProvider's FIX_BUILDERS
 * (external-* fixes are Phase 5). Pure and Monaco-free: fixes are planned as
 * `SpecTextEdit[]` via core's spec-edit planners so every fix is a single
 * undo step. Unlike VS Code (whose context diagnostics lose `data`), the
 * desktop session diagnostics carry `code`/`data` directly, so matching is a
 * simple range-overlap filter against the requested range.
 */
import { buildPointer, parsePointer } from '@nouto/core/services/openapi/pointer';
import { asString } from '@nouto/core/services/openapi/quickFixUtils';
import {
  pointerToAnchorOffsetRange,
  pointerToOffsetRange,
} from '@nouto/core/services/openapi/pointerMap';
import type { OffsetRange, OpenApiPointerMap } from '@nouto/core/services/openapi/pointerMap';
import {
  planDeleteAtPointer,
  planInsertArrayItem,
  planInsertObjectMember,
  planSetScalarAtPointer,
} from '@nouto/core/services/openapi/specEdit';
import type { SpecDocument, SpecTextEdit } from '@nouto/core/services/openapi/specEdit';
import { uniqueName } from '@nouto/core/services/openapi/specNaming';
import {
  COMPONENT_PRESETS,
  PATH_PARAMETER_SKELETON,
} from '@nouto/core/services/openapi/specSkeletons';
import type { OpenApiAnalysis, OpenApiDiagnostic } from '@nouto/core/services/openapi/types';

export interface QuickFix {
  title: string;
  edits: SpecTextEdit[];
}

export interface QuickFixCandidate extends QuickFix {
  code: string;
  /** The diagnostic's on-screen marker range (mirrors diagnosticToMarker). */
  range: OffsetRange;
}

type FixBuilder = (
  doc: SpecDocument,
  diagnostic: OpenApiDiagnostic,
  analysis: OpenApiAnalysis
) => QuickFix | undefined;

/**
 * One builder per fixable diagnostic `code`. Each recovers what it needs from
 * the core diagnostic's `pointer`/`data` and plans the edit; a builder returns
 * undefined when the edit cannot be applied safely (the planners refuse
 * missing/primitive/flow-style targets), and no action is offered.
 */
export const QUICK_FIX_BUILDERS: Record<string, FixBuilder> = {
  'missing-root-sections': (doc) => {
    const result = planInsertObjectMember(doc, '', 'paths', {});
    return result ? { title: 'Add empty "paths" object', edits: result.edits } : undefined;
  },

  'duplicate-operation-id': (doc, diagnostic, analysis) => {
    const pointer = diagnostic.pointer;
    const currentId = asString(diagnostic.data?.operationId);
    if (!pointer || currentId === undefined) return undefined;
    const existing = analysis.operations
      .map((operation) => operation.operationId)
      .filter((id): id is string => typeof id === 'string');
    const uniqueId = uniqueName(existing, currentId);
    const edits = planSetScalarAtPointer(doc, pointer, uniqueId);
    return edits ? { title: `Rename operationId to "${uniqueId}"`, edits } : undefined;
  },

  'unused-path-param': (doc, diagnostic) => {
    if (!diagnostic.pointer) return undefined;
    const edits = planDeleteAtPointer(doc, diagnostic.pointer);
    return edits ? { title: 'Remove unused path parameter', edits } : undefined;
  },

  'missing-path-param': (doc, diagnostic) => {
    const name = asString(diagnostic.data?.name);
    const operationPointer = asString(diagnostic.data?.operationPointer);
    if (name === undefined || operationPointer === undefined) return undefined;
    // planInsertArrayItem creates the `parameters` array (and appends to an
    // existing one) — no need to branch on whether it is already present.
    const result = planInsertArrayItem(doc, `${operationPointer}/parameters`, {
      ...PATH_PARAMETER_SKELETON,
      name,
    });
    return result ? { title: `Add path parameter "${name}"`, edits: result.edits } : undefined;
  },

  'ref-not-found': (doc, diagnostic) => {
    const targetPointer = asString(diagnostic.data?.targetPointer);
    if (targetPointer === undefined) return undefined;
    // Only scaffold a /components/<section>/<name> target; arbitrary internal
    // pointers have no obvious skeleton to create.
    const segments = parsePointer(targetPointer);
    if (!segments || segments.length !== 3 || segments[0] !== 'components') return undefined;
    const [, section, name] = segments;
    const preset = COMPONENT_PRESETS[section] ?? {};
    const result = planInsertObjectMember(
      doc,
      buildPointer(['components', section]),
      name,
      preset
    );
    return result ? { title: `Create missing component "${name}"`, edits: result.edits } : undefined;
  },
};

/**
 * The diagnostic's marker range, replicating the editor's diagnosticToMarker
 * range resolution (anchor range for missing-property diagnostics, value
 * range otherwise, min length 1) so candidates line up with what is on screen.
 */
export function diagnosticMarkerRange(
  diagnostic: OpenApiDiagnostic,
  map: OpenApiPointerMap
): OffsetRange | undefined {
  const range =
    typeof diagnostic.data?.missingProperty === 'string'
      ? pointerToAnchorOffsetRange(map, diagnostic.pointer ?? '')
      : pointerToOffsetRange(map, diagnostic.pointer ?? '');
  if (!range) return undefined;
  return { from: range.from, to: Math.max(range.to, range.from + 1) };
}

function overlaps(a: OffsetRange, b: OffsetRange): boolean {
  return a.from <= b.to && a.to >= b.from;
}

/**
 * All applicable quick fixes for diagnostics whose marker range overlaps the
 * requested range (Monaco passes the cursor/selection range).
 */
export function buildQuickFixes(
  doc: SpecDocument,
  diagnostics: OpenApiDiagnostic[],
  analysis: OpenApiAnalysis,
  map: OpenApiPointerMap,
  requestedRange: OffsetRange
): QuickFixCandidate[] {
  if (!analysis.parsedSpec) return [];
  const candidates: QuickFixCandidate[] = [];
  for (const diagnostic of diagnostics) {
    const code = diagnostic.code;
    if (code === undefined || !QUICK_FIX_BUILDERS[code]) continue;
    const range = diagnosticMarkerRange(diagnostic, map);
    if (!range || !overlaps(range, requestedRange)) continue;
    const fix = QUICK_FIX_BUILDERS[code](doc, diagnostic, analysis);
    if (!fix) continue;
    candidates.push({ ...fix, code, range });
  }
  return candidates;
}
