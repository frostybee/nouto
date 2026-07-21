import * as vscode from 'vscode';
import { getByJsonPointer, parseJsonPointer } from '@nouto/core/services';
import {
  buildPointerMap,
  detectOpenApiDocument,
  getOpenApiAnalysis,
  hasEverBeenOpenApi,
  offsetToPointer,
  pointerToRange,
} from '../services/openapi';

/**
 * Go-to-Definition for internal `$ref` values in OpenAPI documents.
 *
 * Navigation targets the immediate referenced node; reference chains are not
 * followed, which also makes reference cycles a non-issue. External, malformed
 * and missing references yield no definition — the diagnostics pipeline is
 * responsible for explaining why those fail.
 */
export class OpenApiDefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.Definition | undefined {
    if (!hasEverBeenOpenApi(document.uri) && !detectOpenApiDocument(document).isOpenApi) {
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

    const targetPointer = internalRefToPointer(lookup.value);
    if (targetPointer === undefined) return undefined;

    // Confirm the target exists in the parsed specification before offering a
    // jump, so missing references fall through to "no definition".
    if (!getByJsonPointer(analysis.parsedSpec, targetPointer).found) return undefined;
    if (token.isCancellationRequested) return undefined;

    const range = pointerToRange(map, targetPointer);
    if (!range) return undefined;

    return new vscode.Location(document.uri, range);
  }
}

/**
 * Converts an internal reference (`#`, `#/components/schemas/Pet`) to its JSON
 * Pointer. Returns undefined for external references and syntactically invalid
 * pointers.
 */
function internalRefToPointer(ref: string): string | undefined {
  if (!ref.startsWith('#')) return undefined;
  let pointer: string;
  try {
    pointer = decodeURIComponent(ref.slice(1));
  } catch {
    // Malformed percent-encoding is a malformed reference.
    return undefined;
  }
  return parseJsonPointer(pointer) === undefined ? undefined : pointer;
}
