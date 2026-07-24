import type { OpenApiAnalysis, OpenApiVersion } from '../types';
import type {
  EnumValueEntry,
  NodeKindTable,
  OpenApiNodeKind,
  PropertyCompletionEntry,
} from './types';
import { documentTables } from './tables/document';
import { serverTables } from './tables/servers';
import { pathTables } from './tables/paths';
import { schemaTables } from './tables/schema';
import { securityTables } from './tables/security';
import { componentsTables } from './tables/components';

export { classifyPointer } from './classifier';

/**
 * Every curated node-kind table. Built once as a module constant (mirrors the
 * lint engine's `ALL_LINT_RULES`); lookups filter these small arrays.
 */
export const ALL_NODE_KIND_TABLES: NodeKindTable[] = [
  ...documentTables,
  ...serverTables,
  ...pathTables,
  ...schemaTables,
  ...securityTables,
  ...componentsTables,
];

const TABLE_BY_KIND: Map<OpenApiNodeKind, NodeKindTable> = new Map(
  ALL_NODE_KIND_TABLES.map((table) => [table.kind, table])
);

const VERSION_ORDER: Record<OpenApiVersion, number> = { '3.0': 0, '3.1': 1, '3.2': 2 };

/** Whether a version-tagged entry is valid in the given document version. */
function isVisible(entry: { sinceVersion?: OpenApiVersion; until?: OpenApiVersion }, version: OpenApiVersion): boolean {
  const order = VERSION_ORDER[version];
  if (entry.sinceVersion && order < VERSION_ORDER[entry.sinceVersion]) return false;
  if (entry.until && order > VERSION_ORDER[entry.until]) return false;
  return true;
}

/** Narrows to a plain (non-array) object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Returns the properties available for a node kind in a given version, with
 * version-scoped entries filtered and any already-present keys excluded. A
 * property name that appears more than once in the table (e.g. the boolean vs
 * numeric forms of `exclusiveMinimum`) collapses to the single entry visible in
 * this version.
 */
export function getCompletions(
  kind: OpenApiNodeKind,
  version: OpenApiVersion,
  opts?: { existingKeys?: ReadonlySet<string> }
): PropertyCompletionEntry[] {
  const table = TABLE_BY_KIND.get(kind);
  if (!table) return [];
  const existing = opts?.existingKeys;
  const seen = new Set<string>();
  const result: PropertyCompletionEntry[] = [];
  for (const property of table.properties) {
    if (!isVisible(property, version)) continue;
    if (seen.has(property.name)) continue;
    if (existing?.has(property.name)) continue;
    seen.add(property.name);
    result.push(property);
  }
  return result;
}

/** Finds the version-visible property entry for a kind, if any. */
function findProperty(
  kind: OpenApiNodeKind,
  propertyName: string,
  version: OpenApiVersion
): PropertyCompletionEntry | undefined {
  const table = TABLE_BY_KIND.get(kind);
  if (!table) return undefined;
  return table.properties.find((property) => property.name === propertyName && isVisible(property, version));
}

/** Markdown documentation for a property of a node kind, for hover/detail. */
export function getPropertyDocs(
  kind: OpenApiNodeKind,
  propertyName: string,
  version: OpenApiVersion
): string | undefined {
  return findProperty(kind, propertyName, version)?.docs;
}

/**
 * The allowed literal values for an enum-valued property, filtered to the
 * document version. Returns undefined for non-enum or unknown properties.
 */
export function getEnumValues(
  kind: OpenApiNodeKind,
  propertyName: string,
  version: OpenApiVersion
): EnumValueEntry[] | undefined {
  const values = findProperty(kind, propertyName, version)?.enumValues;
  if (!values) return undefined;
  return values.filter((value) => isVisible(value, version));
}

/**
 * Document-derived key candidates for node kinds whose keys are not a fixed
 * property set. Currently only Security Requirement, whose keys are the names
 * of the document's defined security schemes.
 */
export function getDynamicKeyCandidates(kind: OpenApiNodeKind, analysis: OpenApiAnalysis): string[] {
  if (kind !== 'SecurityRequirement') return [];
  const spec = isRecord(analysis.parsedSpec) ? analysis.parsedSpec : undefined;
  const components = spec && isRecord(spec.components) ? spec.components : undefined;
  const schemes = components && isRecord(components.securitySchemes) ? components.securitySchemes : undefined;
  return schemes ? Object.keys(schemes) : [];
}
