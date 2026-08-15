import * as vscode from 'vscode';
import { runLintRules, validateOpenApiMetaSchema } from '@nouto/core/services';
import type { FileResolver, LintOptions, OpenApiDiagnostic } from '@nouto/core/services';
import {
  buildPointerMap,
  buildYamlSyntaxDiagnostics,
  clearOpenApiDocumentState,
  debounce,
  isKnownOpenApiDocument,
  getOpenApiAnalysis,
  getOpenApiAnalysisWithExternalRefs,
  getReferrersOf,
  pointerToAnchorRange,
  pointerToRange,
  readOpenApiSettings,
  SUPPORTED_LANGUAGES,
} from '../services/openapi';
import type { Debounced, OpenApiPointerMap } from '../services/openapi';
import { onNoutoSettingsChanged } from '../services/settingsEvents';


export class OpenApiDiagnosticsManager implements vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection('nouto-openapi');
  private readonly listeners: vscode.Disposable[] = [];
  private readonly debouncers = new Map<string, Debounced<[vscode.TextDocument]>>();
  /**
   * Per-document run counter guarding the async external-ref pass: it is
   * bumped synchronously at the top of every `runValidation`, so an in-flight
   * pass that awakes to a different generation knows it was superseded and
   * must not publish stale diagnostics over newer ones.
   */
  private readonly generations = new Map<string, number>();
  private started = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly resolver: FileResolver
  ) {}

  start(): void {
    if (this.started) return;
    this.started = true;

    this.listeners.push(
      vscode.workspace.onDidOpenTextDocument((document) => this.runValidation(document)),
      vscode.workspace.onDidChangeTextDocument(({ document }) => {
        this.scheduleValidation(document);
        // Editing a file re-validates every open document whose external-ref
        // analysis read it, so cross-file diagnostics track the dependency.
        for (const referrerKey of getReferrersOf(document.uri)) {
          if (referrerKey === document.uri.toString()) continue;
          const referrer = vscode.workspace.textDocuments.find(
            (candidate) => candidate.uri.toString() === referrerKey
          );
          if (referrer) this.scheduleValidation(referrer);
        }
      }),
      vscode.workspace.onDidCloseTextDocument((document) => {
        const key = document.uri.toString();
        this.collection.delete(document.uri);
        this.debouncers.get(key)?.cancel();
        this.debouncers.delete(key);
        this.generations.delete(key);
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

  private scheduleValidation(document: vscode.TextDocument): void {
    const key = document.uri.toString();
    let validate = this.debouncers.get(key);
    if (!validate) {
      validate = debounce((changedDocument) => this.runValidation(changedDocument), 400);
      this.debouncers.set(key, validate);
    }
    validate(document);
  }

  runValidation(document: vscode.TextDocument): void {
    const key = document.uri.toString();
    const generation = (this.generations.get(key) ?? 0) + 1;
    this.generations.set(key, generation);

    if (!SUPPORTED_LANGUAGES.has(document.languageId)) {
      this.collection.delete(document.uri);
      return;
    }

    if (!isKnownOpenApiDocument(document)) {
      this.collection.delete(document.uri);
      return;
    }

    this.collection.set(document.uri, this.buildDiagnostics(document));

    if (
      document.uri.scheme === 'file' &&
      readOpenApiSettings(this.context).externalRefsEnabled &&
      getOpenApiAnalysis(document).parsedSpec
    ) {
      void this.runExternalValidation(document, generation);
    }
  }

  /**
   * The async second pass: resolves external `$ref`s across files, then
   * republishes the document's diagnostics with the sync pass's placeholder
   * "external reference not supported" warnings replaced by definitive
   * results (resolved silently, or `external-file-not-found` /
   * `external-pointer-not-found` and friends).
   */
  private async runExternalValidation(
    document: vscode.TextDocument,
    generation: number
  ): Promise<void> {
    let external;
    try {
      external = await getOpenApiAnalysisWithExternalRefs(document, this.resolver);
    } catch {
      return;
    }
    if (this.generations.get(document.uri.toString()) !== generation) return;
    if (external.externalRefs.size === 0 && external.diagnostics.length === 0) return;

    const handled = new Set(external.externalRefs.keys());
    const diagnostics = this.buildDiagnostics(document, handled);
    const pointerMap = buildPointerMap(document);
    diagnostics.push(
      ...external.diagnostics.map((diagnostic) =>
        this.toVSCodeDiagnostic(diagnostic, pointerMap, document)
      )
    );
    this.collection.set(document.uri, diagnostics);
  }

  /**
   * Builds the document's synchronous diagnostics. When the async pass has
   * definitive results for external refs (`externalHandledPointers`), the sync
   * pass's placeholder warnings at those locations are dropped in favor of the
   * async diagnostics appended by the caller.
   */
  private buildDiagnostics(
    document: vscode.TextDocument,
    externalHandledPointers?: ReadonlySet<string>
  ): vscode.Diagnostic[] {
    const content = document.getText();
    const analysis = getOpenApiAnalysis(document);
    const diagnostics = document.languageId === 'yaml'
      ? buildYamlSyntaxDiagnostics(content, document)
      : [];

    if (analysis.parsedSpec && analysis.version) {
      const pointerMap = buildPointerMap(document);
      diagnostics.push(
        ...analysis.diagnostics
          .filter(
            (diagnostic) =>
              !(
                diagnostic.code === 'external-ref-unsupported' &&
                diagnostic.pointer !== undefined &&
                externalHandledPointers?.has(diagnostic.pointer)
              )
          )
          .map((diagnostic) => this.toVSCodeDiagnostic(diagnostic, pointerMap, document))
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

    return diagnostics;
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
    this.generations.clear();
    for (const listener of this.listeners) listener.dispose();
    this.listeners.length = 0;
    this.collection.dispose();
    this.started = false;
  }
}
