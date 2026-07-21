import type { SavedRequest } from '../../types';

/** Document format of an OpenAPI specification source. */
export type OpenApiFormat = 'yaml' | 'json';

/** Supported OpenAPI specification minor versions. */
export type OpenApiVersion = '3.0' | '3.1';

/**
 * A diagnostic produced while analyzing an OpenAPI document.
 *
 * Sources follow the feature plan's validation model: each source has exactly
 * one producer. Core's analyze() emits only 'semantic' and 'reference'
 * diagnostics; 'syntax' and 'schema' diagnostics are produced in-editor by the
 * CodeMirror pipeline and only share this shape.
 */
export interface OpenApiDiagnostic {
  source: 'syntax' | 'schema' | 'semantic' | 'reference';
  severity: 'error' | 'warning';
  message: string;
  /** RFC 6901 JSON Pointer to the offending location, when known. */
  pointer?: string;
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
  diagnostics: OpenApiDiagnostic[];
  operations: OpenApiOperationSummary[];
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

/** Thrown when a single-operation conversion cannot proceed at all. */
export class OpenApiConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenApiConversionError';
  }
}

/**
 * All HTTP methods that OpenAPI 3.x recognizes as operation keys on a Path
 * Item Object.
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
] as const;
