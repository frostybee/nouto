import * as vscode from 'vscode';
import { parseDocument } from 'yaml';

export function buildYamlSyntaxDiagnostics(
  content: string,
  document: vscode.TextDocument
): vscode.Diagnostic[] {
  if (!content.trim()) return [];

  const length = content.length;
  const parsed = parseDocument(content, { strict: false });
  return parsed.errors.map((error) => {
    const [rawFrom, rawTo] = error.pos;
    const from = Math.min(Math.max(rawFrom, 0), length);
    const to = Math.min(Math.max(rawTo, from + 1), length);
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(document.positionAt(from), document.positionAt(to)),
      error.message,
      vscode.DiagnosticSeverity.Error
    );
    diagnostic.source = 'nouto-openapi';
    diagnostic.code = 'syntax';
    return diagnostic;
  });
}
