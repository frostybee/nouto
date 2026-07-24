import type { OpenApiVersion } from '../types';

/**
 * The kind of OpenAPI object a node represents. Completion and hover both key
 * their curated data off these kinds. `Unknown` is the safe fall-through for
 * pointers that don't resolve to a recognized object (e.g. inside a scalar
 * value, or a vendor extension subtree) — callers treat it as "no suggestions".
 */
export type OpenApiNodeKind =
  | 'Root'
  | 'Info'
  | 'Contact'
  | 'License'
  | 'Server'
  | 'ServerVariable'
  | 'Paths'
  | 'PathItem'
  | 'Operation'
  | 'ExternalDocs'
  | 'Parameter'
  | 'RequestBody'
  | 'MediaType'
  | 'Encoding'
  | 'Responses'
  | 'Response'
  | 'Header'
  | 'Example'
  | 'Link'
  | 'Callback'
  | 'Components'
  | 'SecurityScheme'
  | 'OAuthFlows'
  | 'OAuthFlow'
  | 'SecurityRequirement'
  | 'Tag'
  | 'Schema'
  | 'Discriminator'
  | 'XML'
  | 'Unknown';

/**
 * How a completion's value should be scaffolded when inserted.
 * - `scalar`: a single inline value (`summary: $0`)
 * - `object`: a nested mapping (`schema:\n  $0`)
 * - `array`: a sequence (`tags:\n  - $0`)
 * - `enum-value`: a scalar whose value is one of a closed set (rendered as a
 *   snippet choice, plus offered as literal value items)
 * - `ref`: reserved for `$ref` (targets are document-derived, not curated)
 */
export type CompletionInsertKind = 'scalar' | 'object' | 'array' | 'enum-value' | 'ref';

/** A single allowed value for an enum-valued property (e.g. `in: query`). */
export interface EnumValueEntry {
  value: string;
  docs?: string;
  /** Introduced in this minor version (undefined = present since 3.0). */
  sinceVersion?: OpenApiVersion;
  /** Last version that still allows it, inclusive (undefined = still valid). */
  until?: OpenApiVersion;
}

/**
 * One curated property of an OpenAPI object, authored from the specification
 * text (never derived from the vendored meta-schemas — see the note atop
 * tables/schema.ts). `docs` is markdown and is shared verbatim by completion
 * detail and hover.
 */
export interface PropertyCompletionEntry {
  name: string;
  docs: string;
  insertKind: CompletionInsertKind;
  /**
   * Raw snippet body appended after `name:`; the provider rewrites newlines to
   * be indentation-aware for the cursor's column. `$0`/`$1`/choice syntax is
   * preserved. Omitted for properties with no useful scaffold.
   */
  snippetBody?: string;
  /** Closed set of allowed scalar values, for enum-valued properties. */
  enumValues?: EnumValueEntry[];
  /** Marks the property as required by the spec (surfaced in completion detail). */
  required?: boolean;
  /** Introduced in this minor version (undefined = present since 3.0). */
  sinceVersion?: OpenApiVersion;
  /** Last version that still allows it, inclusive (undefined = still valid). */
  until?: OpenApiVersion;
  /** Deprecated as of this minor version (surfaced in completion detail). */
  deprecatedSince?: OpenApiVersion;
}

/** The curated property set for one node kind. */
export interface NodeKindTable {
  kind: OpenApiNodeKind;
  properties: PropertyCompletionEntry[];
}

/** Result of classifying the node kind at a JSON Pointer. */
export interface NodeKindClassification {
  kind: OpenApiNodeKind;
  /** The pointer that was classified (rebuilt from the input segments). */
  pointer: string;
  /**
   * For `Components`, the fixed section the pointer landed in
   * (`schemas`/`responses`/…), when the pointer stops at the section level.
   */
  section?: string;
}
