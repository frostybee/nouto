import * as vscode from 'vscode';
import { runLintRules, validateOpenApiMetaSchema } from '@nouto/core/services';
import type { LintOptions, OpenApiDiagnostic } from '@nouto/core/services';
import {
  buildPointerMap,
  buildYamlSyntaxDiagnostics,
  clearOpenApiDocumentState,
  debounce,
  detectOpenApiDocument,
  getOpenApiAnalysis,
  hasEverBeenOpenApi,
  pointerToAnchorRange,
  pointerToRange,
  readOpenApiSettings,
} from '../services/openapi';
import type { Debounced, OpenApiPointerMap } from '../services/openapi';
import { onNoutoSettingsChanged } from '../services/settingsEvents';

const SUPPORTED_LANGUAGES = new Set(['json', 'yaml', 'jsonc']);

export class OpenApiDiagnosticsManager implements vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection('nouto-openapi');
  private readonly listeners: vscode.Disposable[] = [];
  private readonly debouncers = new Map<string, Debounced<[vscode.TextDocument]>>();
  private started = false;

  constructor(private readonly context: vscode.ExtensionContext) {}

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
      }),
      // Re-validate open documents when a lint setting changes so squiggles
      // appear/disappear immediately instead of only on the next edit.
      onNoutoSettingsChanged(() => {
        for (const document of vscode.workspace.textDocuments) this.runValidation(document);
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
        )
      );
      // Meta-schema validation is skipped for approximate versions: validating
      // a future-minor document (e.g. 3.3) against the clamped version's
      // schema would flag genuinely-new fields as errors — exactly the noise
      // the best-effort fallback exists to avoid.
      if (!analysis.versionIsApproximate) {
        diagnostics.push(
          ...validateOpenApiMetaSchema(analysis.parsedSpec, analysis.version).map((diagnostic) =>
            this.toVSCodeDiagnostic(diagnostic, pointerMap, document)
          )
        );
      }
      const lint = this.lintConfig();
      if (lint) {
        diagnostics.push(
          ...runLintRules(analysis, lint).map((diagnostic) =>
            this.toVSCodeDiagnostic(diagnostic, pointerMap, document)
          )
        );
      }
    }

    this.collection.set(document.uri, diagnostics);
  }

  /**
   * Lint options from the shared settings store, or undefined when lint is
   * disabled. Read fresh each run so setting changes take effect immediately.
   * The unified per-rule map feeds `severityOverrides` (its `'off'` entries
   * disable rules); `disabledRules: []` opts every remaining rule in.
   */
  private lintConfig(): LintOptions | undefined {
    const { lintEnabled, lintRules } = readOpenApiSettings(this.context);
    if (!lintEnabled) return undefined;
    return { disabledRules: [], severityOverrides: lintRules };
  }

  private toVSCodeDiagnostic(
    diagnostic: OpenApiDiagnostic,
    pointerMap: OpenApiPointerMap,
    document: vscode.TextDocument
  ): vscode.Diagnostic {
    const pointer = diagnostic.pointer ?? '';
    // "Missing property" defects have no text of their own; anchor them to the
    // owning key so the squiggle marks one construct instead of every line of a
    // value whose contents are all individually valid.
    const range = (typeof diagnostic.data?.missingProperty === 'string'
      ? pointerToAnchorRange(pointerMap, pointer)
      : pointerToRange(pointerMap, pointer)) ?? new vscode.Range(0, 0, 0, 0);
    const converted = new vscode.Diagnostic(
      range,
      diagnostic.message,
      diagnostic.severity === 'error'
        ? vscode.DiagnosticSeverity.Error
        : diagnostic.severity === 'warning'
          ? vscode.DiagnosticSeverity.Warning
          : vscode.DiagnosticSeverity.Information
    );
    converted.source = 'nouto-openapi';
    // Prefer a rule-specific code (e.g. 'duplicate-operation-id' or a lint rule
    // id) so it shows in the Problems panel and code actions can match on it;
    // fall back to the source category for diagnostics without a specific code.
    converted.code = diagnostic.code ?? diagnostic.source;
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
