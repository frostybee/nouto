import * as vscode from 'vscode';
import { buildJsonPointer, parseJsonPointer } from '@nouto/core/services';
import type { OpenApiAnalysis, OpenApiDiagnostic } from '@nouto/core/services';
import {
  buildPointerMap,
  COMPONENT_PRESETS,
  detectOpenApiDocument,
  getOpenApiAnalysis,
  hasEverBeenOpenApi,
  PATH_PARAMETER_SKELETON,
  planDeleteAtPointer,
  planInsertArrayItem,
  planInsertObjectMember,
  planSetScalarAtPointer,
  pointerToRange,
  uniqueName,
} from '../services/openapi';

const SUPPORTED_LANGUAGES = new Set(['json', 'yaml', 'jsonc']);

/** A ready-to-offer fix: user-facing title plus a single-undo document edit. */
interface Fix {
  title: string;
  edit: vscode.WorkspaceEdit;
}

type FixBuilder = (
  document: vscode.TextDocument,
  diagnostic: OpenApiDiagnostic,
  analysis: OpenApiAnalysis
) => Fix | undefined;

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * One builder per fixable diagnostic `code`. Each recovers what it needs from
 * the core diagnostic's `pointer`/`data` (stamped in core's semantics/refs
 * analysis) and produces an edit via the existing spec-edit planners, so every
 * fix is a single Ctrl+Z. A builder returns undefined when the edit cannot be
 * applied safely (the planners refuse missing/primitive targets), and no
 * action is offered.
 */
const FIX_BUILDERS: Record<string, FixBuilder> = {
  'missing-root-sections': (document) => {
    const result = planInsertObjectMember(document, '', 'paths', {});
    return result ? { title: 'Add empty "paths" object', edit: result.edit } : undefined;
  },

  'duplicate-operation-id': (document, diagnostic, analysis) => {
    const pointer = diagnostic.pointer;
    const currentId = asString(diagnostic.data?.operationId);
    if (!pointer || currentId === undefined) return undefined;
    const existing = analysis.operations
      .map((operation) => operation.operationId)
      .filter((id): id is string => typeof id === 'string');
    const uniqueId = uniqueName(existing, currentId);
    const edit = planSetScalarAtPointer(document, pointer, uniqueId);
    return edit ? { title: `Rename operationId to "${uniqueId}"`, edit } : undefined;
  },

  'unused-path-param': (document, diagnostic) => {
    if (!diagnostic.pointer) return undefined;
    const edit = planDeleteAtPointer(document, diagnostic.pointer);
    return edit ? { title: 'Remove unused path parameter', edit } : undefined;
  },

  'missing-path-param': (document, diagnostic) => {
    const name = asString(diagnostic.data?.name);
    const operationPointer = asString(diagnostic.data?.operationPointer);
    if (name === undefined || operationPointer === undefined) return undefined;
    // planInsertArrayItem creates the `parameters` array (and appends to an
    // existing one) — no need to branch on whether it is already present.
    const result = planInsertArrayItem(document, `${operationPointer}/parameters`, {
      ...PATH_PARAMETER_SKELETON,
      name,
    });
    return result ? { title: `Add path parameter "${name}"`, edit: result.edit } : undefined;
  },

  'ref-not-found': (document, diagnostic) => {
    const targetPointer = asString(diagnostic.data?.targetPointer);
    if (targetPointer === undefined) return undefined;
    // Only scaffold a /components/<section>/<name> target; arbitrary internal
    // pointers have no obvious skeleton to create.
    const segments = parseJsonPointer(targetPointer);
    if (!segments || segments.length !== 3 || segments[0] !== 'components') return undefined;
    const [, section, name] = segments;
    const preset = COMPONENT_PRESETS[section] ?? {};
    const result = planInsertObjectMember(
      document,
      buildJsonPointer(['components', section]),
      name,
      preset
    );
    return result ? { title: `Create missing component "${name}"`, edit: result.edit } : undefined;
  },
};

/**
 * Offers quick fixes for Nouto's OpenAPI semantic/reference diagnostics. Holds
 * no state: on each request it re-derives the version-cached analysis, whose
 * diagnostics carry the `code`/`data` a fix needs, and matches them to the
 * diagnostics VS Code passes in for the requested range.
 */
export class OpenApiCodeActionProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    if (!SUPPORTED_LANGUAGES.has(document.languageId)) return [];
    if (!hasEverBeenOpenApi(document.uri) && !detectOpenApiDocument(document).isOpenApi) return [];
    if (context.diagnostics.length === 0) return [];

    const analysis = getOpenApiAnalysis(document);
    if (!analysis.parsedSpec) return [];
    const pointerMap = buildPointerMap(document);

    // Fixable core diagnostics with their document ranges, recomputed fresh so
    // each carries its `data` payload (VS Code's own diagnostics do not).
    const fixable = analysis.diagnostics
      .filter((diagnostic) => diagnostic.code !== undefined && FIX_BUILDERS[diagnostic.code])
      .map((diagnostic) => ({
        diagnostic,
        range: pointerToRange(pointerMap, diagnostic.pointer ?? ''),
      }))
      .filter((entry): entry is { diagnostic: OpenApiDiagnostic; range: vscode.Range } =>
        entry.range !== undefined
      );

    const actions: vscode.CodeAction[] = [];
    for (const reported of context.diagnostics) {
      if (reported.source !== 'nouto-openapi' || typeof reported.code !== 'string') continue;
      const entry = fixable.find(
        (candidate) =>
          candidate.diagnostic.code === reported.code && candidate.range.isEqual(reported.range)
      );
      if (!entry) continue;
      const fix = FIX_BUILDERS[reported.code](document, entry.diagnostic, analysis);
      if (!fix) continue;
      const action = new vscode.CodeAction(fix.title, vscode.CodeActionKind.QuickFix);
      action.edit = fix.edit;
      action.diagnostics = [reported];
      actions.push(action);
    }
    return actions;
  }
}
