import * as vscode from 'vscode';
import { validateOpenApiMetaSchema } from '@nouto/core/services';
import type { OpenApiDiagnostic } from '@nouto/core/services';
import {
  buildPointerMap,
  buildYamlSyntaxDiagnostics,
  clearOpenApiDocumentState,
  debounce,
  detectOpenApiDocument,
  getOpenApiAnalysis,
  hasEverBeenOpenApi,
  pointerToRange,
} from '../services/openapi';
import type { Debounced, OpenApiPointerMap } from '../services/openapi';

const SUPPORTED_LANGUAGES = new Set(['json', 'yaml', 'jsonc']);

export class OpenApiDiagnosticsManager implements vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection('nouto-openapi');
  private readonly listeners: vscode.Disposable[] = [];
  private readonly debouncers = new Map<string, Debounced<[vscode.TextDocument]>>();
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;

    this.listeners.push(
      vscode.workspace.onDidOpenTextDocument((document) => this.runValidation(document)),
      vscode.workspace.onDidChangeTextDocument(({ document }) => {
        const key = document.uri.toString();
        let validate = this.debouncers.get(key);
        if (!validate) {
          validate = debounce((changedDocument) => this.runValidation(changedDocument), 400);
          this.debouncers.set(key, validate);
        }
        validate(document);
      }),
      vscode.workspace.onDidCloseTextDocument((document) => {
        const key = document.uri.toString();
        this.collection.delete(document.uri);
        this.debouncers.get(key)?.cancel();
        this.debouncers.delete(key);
        clearOpenApiDocumentState(document.uri);
      })
    );

    for (const document of vscode.workspace.textDocuments) this.runValidation(document);
  }

  runValidation(document: vscode.TextDocument): void {
    if (!SUPPORTED_LANGUAGES.has(document.languageId)) {
      this.collection.delete(document.uri);
      return;
    }

    if (!hasEverBeenOpenApi(document.uri) && !detectOpenApiDocument(document).isOpenApi) {
      this.collection.delete(document.uri);
      return;
    }

    const content = document.getText();
    const analysis = getOpenApiAnalysis(document);
    const diagnostics = document.languageId === 'yaml'
      ? buildYamlSyntaxDiagnostics(content, document)
      : [];

    if (analysis.parsedSpec && analysis.version) {
      const pointerMap = buildPointerMap(document);
      diagnostics.push(
        ...analysis.diagnostics.map((diagnostic) =>
          this.toVSCodeDiagnostic(diagnostic, pointerMap, document)
        ),
        ...validateOpenApiMetaSchema(analysis.parsedSpec, analysis.version).map((diagnostic) =>
          this.toVSCodeDiagnostic(diagnostic, pointerMap, document)
        )
      );
    }

    this.collection.set(document.uri, diagnostics);
  }

  private toVSCodeDiagnostic(
    diagnostic: OpenApiDiagnostic,
    pointerMap: OpenApiPointerMap,
    document: vscode.TextDocument
  ): vscode.Diagnostic {
    const pointer = diagnostic.pointer ?? '';
    const range = pointerToRange(pointerMap, pointer) ?? new vscode.Range(0, 0, 0, 0);
    const converted = new vscode.Diagnostic(
      range,
      diagnostic.message,
      diagnostic.severity === 'error'
        ? vscode.DiagnosticSeverity.Error
        : vscode.DiagnosticSeverity.Warning
    );
    converted.source = 'nouto-openapi';
    converted.code = diagnostic.source;
    return converted;
  }

  dispose(): void {
    for (const debounced of this.debouncers.values()) debounced.cancel();
    this.debouncers.clear();
    for (const listener of this.listeners) listener.dispose();
    this.listeners.length = 0;
    this.collection.dispose();
    this.started = false;
  }
}
