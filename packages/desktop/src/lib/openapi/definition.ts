import {
  getByPointer,
  internalRefToPointer,
  parsePointer,
} from '@nouto/core/services/openapi/pointer';
import { splitExternalRef } from '@nouto/core/services/openapi/externalRefs';
import type { FileResolver } from '@nouto/core/services/openapi/externalRefs';
import { offsetToPointer, pointerToOffsetRange } from '@nouto/core/services/openapi/pointerMap';
import type { OffsetRange, OpenApiPointerMap } from '@nouto/core/services/openapi/pointerMap';
import type { OpenApiAnalysis } from '@nouto/core/services/openapi/types';

/**
 * Go-to-Definition resolution for `$ref` values (Phase 5) — the pure,
 * offset-based twin of vscode's OpenApiDefinitionProvider. Navigation targets
 * the immediate referenced node; chains are not followed. Scheme'd, malformed
 * and missing internal references yield no definition — diagnostics explain
 * why those fail. External targets are NOT existence-checked here (that would
 * need async I/O); opening surfaces its own error.
 */
export type RefDefinition =
  | { kind: 'internal'; range: OffsetRange }
  | { kind: 'external'; targetFileUri: string; targetPointer: string };

export function resolveRefDefinition(
  map: OpenApiPointerMap,
  analysis: OpenApiAnalysis | null,
  offset: number,
  fromFileUri: string | undefined,
  resolver: FileResolver,
): RefDefinition | undefined {
  const pointer = offsetToPointer(map, offset);
  // The cursor must sit on the value of a `$ref` key, not merely inside a
  // node that happens to contain one.
  const segments = parsePointer(pointer);
  if (!segments?.length || segments[segments.length - 1] !== '$ref') return undefined;
  const entry = map.entries.get(pointer);
  if (!entry || offset < entry.valueFrom || offset > entry.valueTo) return undefined;

  const parsedSpec = analysis?.parsedSpec;
  if (!parsedSpec) return undefined;
  const lookup = getByPointer(parsedSpec, pointer);
  if (!lookup.found || typeof lookup.value !== 'string') return undefined;
  const ref = lookup.value;

  if (!ref.startsWith('#')) {
    // Untitled documents have no base path to resolve relative refs against.
    if (!fromFileUri) return undefined;
    const split = splitExternalRef(ref);
    if (!split) return undefined;
    return {
      kind: 'external',
      targetFileUri: resolver.resolve(fromFileUri, split.filePath),
      targetPointer: split.pointer,
    };
  }

  const targetPointer = internalRefToPointer(ref);
  if (targetPointer === undefined) return undefined;
  // Confirm the target exists before offering a jump.
  if (!getByPointer(parsedSpec, targetPointer).found) return undefined;
  const range = pointerToOffsetRange(map, targetPointer);
  return range ? { kind: 'internal', range } : undefined;
}
