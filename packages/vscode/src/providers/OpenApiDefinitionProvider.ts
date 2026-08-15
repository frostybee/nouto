import * as vscode from 'vscode';
import { getByJsonPointer, internalRefToPointer, parseJsonPointer, splitExternalRef } from '@nouto/core/services';
import type { FileResolver } from '@nouto/core/services';
import {
  buildPointerMap,
  isKnownOpenApiDocument,
  getOpenApiAnalysis,
  offsetToPointer,
  pointerToRange,
  readOpenApiSettings,
} from '../services/openapi';
import type { OpenApiPointerEntry } from '../services/openapi';

/**
 * Go-to-Definition for `$ref` values in OpenAPI documents: internal refs jump
 * within the document, local external refs (`./common.yaml#/Item`) open the
 * referenced workspace file.
 *
 * Navigation targets the immediate referenced node; reference chains are not
 * followed, which also makes reference cycles a non-issue. Scheme'd, malformed
 * and missing references yield no definition — the diagnostics pipeline is
 * responsible for explaining why those fail.
 *
 * Results are `LocationLink`s rather than plain `Location`s so the
 * `originSelectionRange` covers the whole `$ref` value: with a bare Location,
 * Ctrl+hover would only underline the word-pattern token under the cursor
 * (`Pet`), not the full `#/components/schemas/Pet`.
 */
export class OpenApiDefinitionProvider implements vscode.DefinitionProvider {
  constructor(
    private readonly resolver: FileResolver,
    private readonly context: vscode.ExtensionContext
  ) {}

  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.LocationLink[] | undefined> {
    if (!isKnownOpenApiDocument(document)) {
      return undefined;
    }
    if (token.isCancellationRequested) return undefined;

    const offset = document.offsetAt(position);
    const pointer = offsetToPointer(document, offset);
    // The cursor must sit on the value of a `$ref` key, not merely inside a
    // node that happens to contain one.
    const segments = parseJsonPointer(pointer);
    if (!segments?.length || segments[segments.length - 1] !== '$ref') return undefined;

    const map = buildPointerMap(document);
    const entry = map.entries.get(pointer);
    if (!entry || offset < entry.valueFrom || offset > entry.valueTo) return undefined;

    const analysis = getOpenApiAnalysis(document);
    if (!analysis.parsedSpec) return undefined;

    const lookup = getByJsonPointer(analysis.parsedSpec, pointer);
    if (!lookup.found || typeof lookup.value !== 'string') return undefined;
    const ref = lookup.value;
    const originSelectionRange = refValueRange(document, entry);

    if (!ref.startsWith('#')) {
      return this.provideExternalDefinition(document, ref, originSelectionRange, token);
    }

    const targetPointer = internalRefToPointer(ref);
    if (targetPointer === undefined) return undefined;

    // Confirm the target exists in the parsed specification before offering a
    // jump, so missing references fall through to "no definition".
    if (!getByJsonPointer(analysis.parsedSpec, targetPointer).found) return undefined;
    if (token.isCancellationRequested) return undefined;

    const range = pointerToRange(map, targetPointer);
    if (!range) return undefined;

    return [{ originSelectionRange, targetUri: document.uri, targetRange: range }];
  }

  /** Resolves a local external ref to a LocationLink into the referenced file. */
  private async provideExternalDefinition(
    document: vscode.TextDocument,
    ref: string,
    originSelectionRange: vscode.Range,
    token: vscode.CancellationToken
  ): Promise<vscode.LocationLink[] | undefined> {
    if (!readOpenApiSettings(this.context).externalRefsEnabled) return undefined;
    // Untitled documents have no base path to resolve relative refs against.
    if (document.uri.scheme !== 'file') return undefined;

    const split = splitExternalRef(ref);
    if (!split) return undefined;

    const targetUri = this.resolver.resolve(document.uri.toString(), split.filePath);
    let targetDocument: vscode.TextDocument | undefined;
    try {
      targetDocument = await vscode.workspace.openTextDocument(vscode.Uri.parse(targetUri));
    } catch {
      return undefined;
    }
    if (!targetDocument || token.isCancellationRequested) return undefined;

    if (split.pointer === '') {
      return [{
        originSelectionRange,
        targetUri: targetDocument.uri,
        targetRange: new vscode.Range(0, 0, 0, 0),
      }];
    }
    const range = pointerToRange(buildPointerMap(targetDocument), split.pointer);
    if (!range) return undefined;
    return [{ originSelectionRange, targetUri: targetDocument.uri, targetRange: range }];
  }
}

/**
 * The `$ref` value's range with surrounding quotes excluded, so the Ctrl+hover
 * underline covers exactly the reference text.
 */
function refValueRange(
  document: vscode.TextDocument,
  entry: OpenApiPointerEntry
): vscode.Range {
  let from = entry.valueFrom;
  let to = entry.valueTo;
  const text = document.getText();
  const first = text[from];
  if (to - from >= 2 && (first === "'" || first === '"') && text[to - 1] === first) {
    from += 1;
    to -= 1;
  }
  return new vscode.Range(document.positionAt(from), document.positionAt(to));
}

