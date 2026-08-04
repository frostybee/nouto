/**
 * Curated hover documentation for OpenAPI property keys — the desktop
 * (offset-based) port of the VS Code hover provider. Only fires when the
 * offset sits on a property *key*: it classifies the key's parent object and
 * returns that property's curated markdown. Value hovers yield nothing.
 * Format-agnostic; serves both YAML and JSON (monaco-yaml's own hover is
 * disabled in favor of this).
 */
import { classifyPointer, getPropertyDocs } from '@nouto/core/services/openapi/completion/registry';
import { parsePointer } from '@nouto/core/services/openapi/pointer';
import { offsetToPointer } from '@nouto/core/services/openapi/pointerMap';
import type { OffsetRange, OpenApiPointerMap } from '@nouto/core/services/openapi/pointerMap';
import type { OpenApiVersion } from '@nouto/core/services/openapi/types';

export interface HoverDocsResult {
  /** Curated markdown for the hovered property. */
  docs: string;
  /** The key's own range — the hover highlight anchor. */
  range: OffsetRange;
}

export function resolveHoverDocs(
  map: OpenApiPointerMap,
  offset: number,
  version: OpenApiVersion
): HoverDocsResult | undefined {
  const pointer = offsetToPointer(map, offset);
  const entry = map.entries.get(pointer);
  // Hover only over the key itself, not the value or surrounding whitespace.
  if (entry?.keyFrom === undefined || entry.keyTo === undefined) return undefined;
  if (offset < entry.keyFrom || offset > entry.keyTo) return undefined;

  const segments = parsePointer(pointer);
  if (!segments || segments.length === 0) return undefined;
  const propertyName = segments[segments.length - 1];
  const parentKind = classifyPointer(segments.slice(0, -1)).kind;

  const docs = getPropertyDocs(parentKind, propertyName, version);
  if (!docs) return undefined;

  return { docs, range: { from: entry.keyFrom, to: entry.keyTo } };
}
