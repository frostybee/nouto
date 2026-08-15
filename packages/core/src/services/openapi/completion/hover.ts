/**
 * Curated hover documentation for OpenAPI property keys, shared by the VS Code
 * hover provider and the desktop Monaco provider. Only fires when the offset
 * sits on a property *key*: it classifies the key's parent object and returns
 * that property's curated markdown. Value hovers yield nothing.
 * Format-agnostic; serves both YAML and JSON.
 */
import { classifyPointer, getPropertyDocs } from './registry';
import { parsePointer } from '../pointer';
import { offsetToPointer } from '../pointerMap';
import type { OffsetRange, OpenApiPointerMap } from '../pointerMap';
import type { OpenApiVersion } from '../types';

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
