import type { Collection, Environment, SavedRequest } from '../../types';

/** Document format of an OpenAPI specification source. */
export type OpenApiFormat = 'yaml' | 'json';

/** Supported OpenAPI specification minor versions. */
export type OpenApiVersion = '3.0' | '3.1' | '3.2';

/**
 * A diagnostic produced while analyzing an OpenAPI document.
 *
 * Sources follow the feature plan's validation model: each source has exactly
 * one producer. Core's analyze() emits only 'semantic' and 'reference'
 * diagnostics; 'syntax' and 'schema' diagnostics are produced in-editor by the
 * CodeMirror pipeline and only share this shape.
 */
export interface OpenApiDiagnostic {
  source: 'syntax' | 'schema' | 'semantic' | 'reference' | 'lint';
  severity: 'error' | 'warning' | 'info';
  message: string;
  /** RFC 6901 JSON Pointer to the offending location, when known. */
  pointer?: string;
  /**
   * Stable rule/diagnostic id, e.g. 'duplicate-operation-id' or a lint rule
   * id. Distinct from `source` (the category). Used by quick-fix code actions
   * to recognize which diagnostics they can repair, and surfaced as the VS
   * Code diagnostic `code` so it appears in the Problems panel.
   */
  code?: string;
  /**
   * Structured payload a quick fix needs to build its edit, when the pointer
   * alone is insufficient. Kept minimal and diagnostic-specific.
   */
  data?: Record<string, unknown>;
}

/** Summary of a single operation ((path, method) pair) in an OpenAPI document. */
export interface OpenApiOperationSummary {
  path: string;
  method: string;
  summary?: string;
  operationId?: string;
  /** All declared tags; empty when the operation is untagged. */
  tags: string[];
  /** RFC 6901 JSON Pointer to the operation object. */
  pointer: string;
}

/** Result of analyzing an OpenAPI document. */
export interface OpenApiAnalysis {
  /** The parsed document, present only when the content parsed successfully. */
  parsedSpec?: object;
  /**
   * The recognized OpenAPI version. When the current content's version is
   * malformed or unsupported, this retains the caller-supplied previous
   * version so consumers can keep the last known schema.
   */
  version?: OpenApiVersion;
  /**
   * True when `version` is a best-effort clamp of an unknown future 3.x minor
   * (e.g. a 3.3 document treated as 3.2). Consumers that would produce false
   * errors against the clamped version's schema (meta-schema validation)
   * should skip their check when set.
   */
  versionIsApproximate?: boolean;
  diagnostics: OpenApiDiagnostic[];
  operations: OpenApiOperationSummary[];
  /**
   * Every `$ref` string that resolved successfully, mapped to its final
   * value. Empty when the content did not parse. Lint rules read its keys to
   * find unreferenced components without re-walking the document.
   */
  resolvedRefs: Map<string, unknown>;
}

/** Result of converting a single OpenAPI operation into a Nouto request. */
export interface OpenApiOperationConversion {
  request: SavedRequest;
  /**
   * Non-fatal conversion caveats, e.g. unsupported cookie parameters,
   * unresolved external references, ambiguous security alternatives, or
   * missing server information.
   */
  warnings: string[];
}

/** Result of converting a whole OpenAPI document into a collection. */
export interface OpenApiImportResult {
  collection: Collection;
  /** Server/path variables offered for persistence as an environment. */
  variables?: Environment;
  /**
   * Non-fatal caveats about the document as a whole, e.g. webhook operations
   * that have no request equivalent. Per-operation caveats are not collected
   * here: a large document would produce an unreadable list.
   */
  warnings: string[];
}

// --------------------------------------------------------------------------
// Contract generation (Collections / HAR → OpenAPI)
// --------------------------------------------------------------------------

/** A query/header/path parameter normalized for OpenAPI emission. */
export interface NormalizedParam {
  name: string;
  required: boolean;
  example?: string;
  description?: string;
}

/** A request body normalized to one media type plus its sampled payloads. */
export interface NormalizedBody {
  /** Emitted media type, e.g. 'application/json'. */
  contentType: string;
  /** Parsed bodies (or form-field maps) unified via schema inference. */
  samples: unknown[];
  /** Literal example text when structural inference does not apply (graphql/text/xml). */
  rawExampleText?: string;
  /** Form field names carrying files — rendered as `format: binary` strings. */
  fileFields?: string[];
}

/** Response samples for one status code, unified into a single schema. */
export interface NormalizedResponseGroup {
  status: number | 'default';
  description?: string;
  contentType?: string;
  samples: unknown[];
}

/** An OpenAPI security scheme plus the canonical key used to dedup it. */
export interface NormalizedSecurity {
  /** Canonical identity, e.g. 'http:bearer' or 'apiKey:header:X-Api-Key'. */
  key: string;
  /** The Security Scheme Object to register under components.securitySchemes. */
  scheme: Record<string, unknown>;
}

/**
 * The shared intermediate between `fromCollection`/`fromHar` and
 * `buildDocument`: one prospective OpenAPI operation, before same-(method,
 * path) sources are merged.
 */
export interface NormalizedOperation {
  /** Uppercase HTTP method. */
  method: string;
  /** Pre-templating pathname, for diagnostics only. */
  rawPath: string;
  /** Templated OpenAPI path, e.g. '/users/{userId}'. */
  path: string;
  pathParams: NormalizedParam[];
  queryParams: NormalizedParam[];
  headerParams: NormalizedParam[];
  /** 0 or 1 entries in v1 (nearest folder / HAR domain). */
  tags: string[];
  summary?: string;
  /** Origin server, absent when the host could not be determined. */
  server?: { url: string };
  requestBody?: NormalizedBody;
  responses: NormalizedResponseGroup[];
  /** Distinct schemes; >1 entries emit as OR alternatives. */
  security: NormalizedSecurity[];
  warnings: string[];
}

export interface OpenApiExportOptions {
  /** info.title; defaults to the collection name / a HAR-derived title. */
  title?: string;
  /** info.version; defaults to '1.0.0'. */
  version?: string;
}

/** Result of generating an OpenAPI document — shape mirrors OpenApiImportResult. */
export interface OpenApiExportResult {
  document: Record<string, unknown>;
  warnings: string[];
}

/** Thrown when a single-operation conversion cannot proceed at all. */
export class OpenApiConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenApiConversionError';
  }
}

/**
 * All HTTP methods that OpenAPI 3.x recognizes as fixed operation keys on a
 * Path Item Object. `query` was added in OpenAPI 3.2. Methods beyond these
 * appear under a 3.2 Path Item's `additionalOperations` map.
 */
export const OPENAPI_OPERATION_METHODS = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
  'query',
] as const;

/**
 * Uppercase HTTP names of the fixed operation keys. A 3.2
 * `additionalOperations` entry MUST NOT duplicate any of these.
 */
export const OPENAPI_FIXED_METHOD_NAMES = new Set(
  OPENAPI_OPERATION_METHODS.map((method) => method.toUpperCase())
);

/**
 * Returns the `additionalOperations` map of a Path Item (OpenAPI 3.2), or
 * undefined when absent/malformed.
 */
export function getAdditionalOperations(
  pathItem: Record<string, unknown>
): Record<string, unknown> | undefined {
  const additional = pathItem.additionalOperations;
  if (additional === null || typeof additional !== 'object' || Array.isArray(additional)) {
    return undefined;
  }
  return additional as Record<string, unknown>;
}
