import { escapePointerSegment } from '../pointer';
import type { OpenApiNodeKind } from './types';

/** Component section a `$ref` may target, per the kind of object holding it. */
export const COMPONENT_SECTION_FOR_KIND: Partial<Record<OpenApiNodeKind, string>> = {
  Schema: 'schemas',
  Response: 'responses',
  Parameter: 'parameters',
  RequestBody: 'requestBodies',
  Example: 'examples',
  Header: 'headers',
  Link: 'links',
  Callback: 'callbacks',
  PathItem: 'pathItems',
};

export const ALL_REF_SECTIONS = Object.values(COMPONENT_SECTION_FOR_KIND);

/**
 * Enumerates ref-target pointers (`#/...`) within a parsed document,
 * section-restricted by the referencing object's kind. Files without a
 * matching `components` bucket fall back to their top-level keys (bare
 * schema files).
 */
export function enumerateRefTargets(parsed: unknown, parentKind: OpenApiNodeKind): string[] {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
  const doc = parsed as Record<string, unknown>;
  const targets: string[] = [];
  const components =
    doc.components !== null && typeof doc.components === 'object' && !Array.isArray(doc.components)
      ? (doc.components as Record<string, unknown>)
      : undefined;
  if (components) {
    const section = COMPONENT_SECTION_FOR_KIND[parentKind];
    const sections = section ? [section] : ALL_REF_SECTIONS;
    for (const sec of sections) {
      const bucket = components[sec];
      if (bucket === null || typeof bucket !== 'object' || Array.isArray(bucket)) continue;
      for (const name of Object.keys(bucket)) {
        targets.push(`#/components/${sec}/${escapePointerSegment(name)}`);
      }
    }
  }
  if (targets.length === 0) {
    for (const key of Object.keys(doc)) {
      targets.push(`#/${escapePointerSegment(key)}`);
    }
  }
  return targets;
}
