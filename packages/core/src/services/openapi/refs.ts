import type { OpenApiDiagnostic } from './types';
import { escapePointerSegment, getByPointer } from './pointer';

/** A node that is (structurally) an OpenAPI Reference Object. */
export interface RefNode {
  $ref: string;
  [key: string]: unknown;
}

export function isRefNode(node: unknown): node is RefNode {
  return (
    node !== null &&
    typeof node === 'object' &&
    !Array.isArray(node) &&
    typeof (node as Record<string, unknown>).$ref === 'string'
  );
}

export interface RefResolution {
  /**
   * The fully resolved value. On any failure this is the original node
   * (still containing `$ref`) so callers degrade gracefully instead of
   * crashing on a missing target.
   */
  value: unknown;
  diagnostics: OpenApiDiagnostic[];
}

/**
 * Resolves `node` if it is a Reference Object, following chains of internal
 * references (`$ref` → Reference Object → …) with cycle detection.
 *
 * Never throws. External references (anything not starting with '#') are not
 * fetched and produce an explicit unsupported warning. Missing targets,
 * malformed pointers, and cycles produce error diagnostics. In every failure
 * case the original node is returned unchanged.
 *
 * `atPointer` is the document location of the referencing node, used to
 * anchor diagnostics.
 */
export function resolveNode(node: unknown, spec: object, atPointer?: string): RefResolution {
  if (!isRefNode(node)) return { value: node, diagnostics: [] };

  const diagnostics: OpenApiDiagnostic[] = [];
  const visited = new Set<string>();
  let current: unknown = node;

  while (isRefNode(current)) {
    const ref = current.$ref;

    if (!ref.startsWith('#')) {
      diagnostics.push({
        source: 'reference',
        severity: 'warning',
        message: `External reference "${ref}" is not supported. Only internal references ("#/...") are resolved.`,
        pointer: atPointer,
        // The async external-ref pass recognizes this code and replaces the
        // diagnostic with a definitive result for local-file references.
        code: 'external-ref-unsupported',
      });
      return { value: node, diagnostics };
    }

    if (visited.has(ref)) {
      diagnostics.push({
        source: 'reference',
        severity: 'error',
        message: `Circular reference detected: ${[...visited, ref].join(' -> ')}`,
        pointer: atPointer,
      });
      return { value: node, diagnostics };
    }
    visited.add(ref);

    const target = getByPointer(spec, ref.slice(1));
    if (!target.found) {
      diagnostics.push({
        source: 'reference',
        severity: 'error',
        message: `Reference target not found: ${ref}`,
        pointer: atPointer,
        // Only internal ('#/...') refs reach here; ref.slice(1) is the RFC 6901
        // pointer of the missing target, which a quick fix can scaffold.
        code: 'ref-not-found',
        data: { ref, targetPointer: ref.slice(1) },
      });
      return { value: node, diagnostics };
    }
    current = target.value;
  }

  return { value: current, diagnostics };
}

export interface ReferenceScan {
  diagnostics: OpenApiDiagnostic[];
  /**
   * Every `$ref` string found in the document mapped to its final resolved
   * value (present only for successfully resolved internal references).
   * Semantic checks reuse this cache instead of re-resolving (and
   * re-diagnosing) references independently.
   */
  resolvedRefs: Map<string, unknown>;
}

/**
 * Walks the whole parsed document and validates every Reference Object once.
 * Duplicate `$ref` strings are diagnosed only at their first occurrence.
 */
export function scanReferences(spec: object): ReferenceScan {
  const diagnostics: OpenApiDiagnostic[] = [];
  const resolvedRefs = new Map<string, unknown>();
  const reported = new Set<string>();

  const walk = (node: unknown, pointer: string): void => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${pointer}/${index}`));
      return;
    }
    if (node === null || typeof node !== 'object') return;

    if (isRefNode(node)) {
      const ref = node.$ref;
      if (!reported.has(ref)) {
        reported.add(ref);
        const { value, diagnostics: refDiagnostics } = resolveNode(node, spec, `${pointer}/$ref`);
        diagnostics.push(...refDiagnostics);
        if (refDiagnostics.length === 0) {
          resolvedRefs.set(ref, value);
        }
      }
      // Do not descend into a Reference Object: its target is validated via
      // the resolution above, and its siblings are not schema locations.
      return;
    }

    for (const [key, value] of Object.entries(node)) {
      walk(value, `${pointer}/${escapePointerSegment(key)}`);
    }
  };

  walk(spec, '');
  return { diagnostics, resolvedRefs };
}
