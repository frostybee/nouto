import * as yaml from 'js-yaml';
import type { OpenApiAnalysis, OpenApiDiagnostic, OpenApiFormat, OpenApiOperationSummary, OpenApiVersion } from './types';
import { OPENAPI_OPERATION_METHODS } from './types';
import { buildPointer } from './pointer';
import { scanReferences } from './refs';
import { checkSemantics } from './semantics';

/** Recognizes any 3.0.x or 3.1.x patch version (including pre-release suffixes). */
export function detectOpenApiVersion(openapiField: unknown): OpenApiVersion | undefined {
  if (typeof openapiField !== 'string') return undefined;
  if (/^3\.0\.\d+/.test(openapiField)) return '3.0';
  if (/^3\.1\.\d+/.test(openapiField)) return '3.1';
  return undefined;
}

/**
 * Analyzes OpenAPI document content. Never throws.
 *
 * Produces only 'semantic' and 'reference' diagnostics — syntax and
 * meta-schema diagnostics are the in-editor pipeline's responsibility. When
 * the content does not parse, or its version is unrecognized, the returned
 * `version` retains `previousVersion` so consumers keep the last known
 * schema.
 */
export function analyzeOpenApi(
  content: string,
  format: OpenApiFormat,
  previousVersion?: OpenApiVersion
): OpenApiAnalysis {
  let parsed: unknown;
  try {
    parsed = format === 'yaml' ? yaml.load(content) : JSON.parse(content);
  } catch {
    return { parsedSpec: undefined, version: previousVersion, diagnostics: [], operations: [] };
  }

  if (parsed === null || parsed === undefined || typeof parsed !== 'object' || Array.isArray(parsed)) {
    const diagnostics: OpenApiDiagnostic[] = [
      {
        source: 'semantic',
        severity: 'error',
        message: 'Document root must be an object.',
        pointer: '',
      },
    ];
    return { parsedSpec: undefined, version: previousVersion, diagnostics, operations: [] };
  }

  const spec = parsed as Record<string, unknown>;
  const diagnostics: OpenApiDiagnostic[] = [];

  const version = detectOpenApiVersion(spec.openapi);
  if (!version) {
    const described =
      spec.openapi === undefined ? 'missing' : JSON.stringify(spec.openapi);
    diagnostics.push({
      source: 'semantic',
      severity: 'error',
      message: `Unrecognized or unsupported "openapi" version: ${described}. Expected 3.0.x or 3.1.x.`,
      pointer: spec.openapi === undefined ? '' : '/openapi',
    });
  }

  const scan = scanReferences(spec);
  diagnostics.push(...scan.diagnostics);
  diagnostics.push(...checkSemantics(spec, scan.resolvedRefs));

  return {
    parsedSpec: spec,
    version: version ?? previousVersion,
    diagnostics,
    operations: listOpenApiOperations(spec),
  };
}

/**
 * Lists every operation ((path, method) pair) in a parsed document. `tags`
 * carries ALL declared tags — outline rendering may fan an operation out
 * under each tag, while collection generation uses only the first.
 */
export function listOpenApiOperations(spec: object): OpenApiOperationSummary[] {
  const paths = (spec as Record<string, unknown>).paths;
  if (paths === null || typeof paths !== 'object' || Array.isArray(paths)) return [];

  const operations: OpenApiOperationSummary[] = [];
  for (const [path, pathItemValue] of Object.entries(paths as Record<string, unknown>)) {
    if (pathItemValue === null || typeof pathItemValue !== 'object') continue;
    const pathItem = pathItemValue as Record<string, unknown>;

    for (const method of OPENAPI_OPERATION_METHODS) {
      const operation = pathItem[method];
      if (operation === null || typeof operation !== 'object') continue;
      const op = operation as Record<string, unknown>;
      operations.push({
        path,
        method,
        summary: typeof op.summary === 'string' ? op.summary : undefined,
        operationId: typeof op.operationId === 'string' ? op.operationId : undefined,
        tags: Array.isArray(op.tags) ? op.tags.filter((tag): tag is string => typeof tag === 'string') : [],
        pointer: buildPointer(['paths', path, method]),
      });
    }
  }
  return operations;
}
