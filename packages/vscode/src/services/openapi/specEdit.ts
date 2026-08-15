import * as vscode from 'vscode';
import {
  planDeleteAtPointer as planDeleteAtPointerCore,
  planInsertArrayItem as planInsertArrayItemCore,
  planInsertObjectMember as planInsertObjectMemberCore,
  planSetScalarAtPointer as planSetScalarAtPointerCore,
  planLintQuickFix as planLintQuickFixCore,
} from '@nouto/core/services';
import type {
  OpenApiAnalysis,
  OpenApiDiagnostic,
  SpecDocument,
  SpecTextEdit,
} from '@nouto/core/services';

/**
 * VS Code adapter over the shared spec-edit planners in `@nouto/core`
 * (services/openapi/specEdit.ts). The planning logic — jsonc-parser `modify()`
 * for JSON, yaml-AST splicing for YAML — lives in core and returns plain
 * `{offset, length, text}` edits; this module only converts a `TextDocument`
 * into the core's text+format input and the resulting offsets into a
 * `WorkspaceEdit` so a single Ctrl+Z undoes the whole action.
 */

export interface SpecEditResult {
  edit: vscode.WorkspaceEdit;
  /** Pointer of the inserted node, computed up front for post-edit reveal. */
  insertedPointer: string;
}

function toSpecDocument(document: vscode.TextDocument): SpecDocument {
  return {
    text: document.getText(),
    format: document.languageId === 'yaml' ? 'yaml' : 'json',
    eol: document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n',
  };
}

function toWorkspaceEdit(
  document: vscode.TextDocument,
  edits: SpecTextEdit[]
): vscode.WorkspaceEdit {
  const edit = new vscode.WorkspaceEdit();
  edit.set(
    document.uri,
    edits.map((change) => vscode.TextEdit.replace(
      new vscode.Range(
        document.positionAt(change.offset),
        document.positionAt(change.offset + change.length)
      ),
      change.text
    ))
  );
  return edit;
}

/** Plans the removal of the value at `pointer`, including its key/entry. */
export function planDeleteAtPointer(
  document: vscode.TextDocument,
  pointer: string
): vscode.WorkspaceEdit | undefined {
  const edits = planDeleteAtPointerCore(toSpecDocument(document), pointer);
  return edits ? toWorkspaceEdit(document, edits) : undefined;
}

/**
 * Plans inserting `key: value` into the object at `parentPointer`, creating
 * missing intermediate objects (e.g. absent `components.schemas`) on the way.
 */
export function planInsertObjectMember(
  document: vscode.TextDocument,
  parentPointer: string,
  key: string,
  value: unknown
): SpecEditResult | undefined {
  const plan = planInsertObjectMemberCore(toSpecDocument(document), parentPointer, key, value);
  if (!plan) return undefined;
  return { edit: toWorkspaceEdit(document, plan.edits), insertedPointer: plan.insertedPointer };
}

/**
 * Plans appending `value` to the array at `parentPointer`, creating the array
 * (and missing ancestors) when absent.
 */
export function planInsertArrayItem(
  document: vscode.TextDocument,
  parentPointer: string,
  value: unknown
): SpecEditResult | undefined {
  const plan = planInsertArrayItemCore(toSpecDocument(document), parentPointer, value);
  if (!plan) return undefined;
  return { edit: toWorkspaceEdit(document, plan.edits), insertedPointer: plan.insertedPointer };
}

/**
 * Plans replacing the existing scalar value at `pointer` with `value`. Used by
 * quick fixes that rewrite a leaf in place (e.g. uniquifying a duplicate
 * operationId). Returns undefined when the pointer is empty/missing or does
 * not resolve to a scalar (objects and arrays are never overwritten).
 */
export function planSetScalarAtPointer(
  document: vscode.TextDocument,
  pointer: string,
  value: string | number | boolean
): vscode.WorkspaceEdit | undefined {
  const edits = planSetScalarAtPointerCore(toSpecDocument(document), pointer, value);
  return edits ? toWorkspaceEdit(document, edits) : undefined;
}

/** A planned lint quick fix, host-shaped: `key` dedupes, `edit` is one undo. */
export interface LintFixResult {
  key: string;
  title: string;
  edit: vscode.WorkspaceEdit;
}

/**
 * Plans the quick fix for a lint diagnostic via core's shared lint fixers, so
 * VS Code and the desktop app offer identical fixes for identical findings.
 */
export function planLintQuickFix(
  document: vscode.TextDocument,
  diagnostic: OpenApiDiagnostic,
  analysis: OpenApiAnalysis
): LintFixResult | undefined {
  const fix = planLintQuickFixCore(toSpecDocument(document), diagnostic, analysis);
  if (!fix) return undefined;
  return { key: fix.key, title: fix.title, edit: toWorkspaceEdit(document, fix.edits) };
}
