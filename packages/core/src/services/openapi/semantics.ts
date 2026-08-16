import type { OpenApiDiagnostic } from './types';
import {
  getAdditionalOperations,
  OPENAPI_FIXED_METHOD_NAMES,
  OPENAPI_OPERATION_METHODS,
} from './types';
import { buildPointer, escapePointerSegment } from './pointer';
import { resolveParameters } from './parameters';

/** Extracts template expression names from a path string, e.g. '/users/{id}' → ['id']. */
function templateParams(path: string): string[] {
  const names: string[] = [];
  const regex = /\{([^}]+)\}/g;
  let match;
  while ((match = regex.exec(path)) !== null) {
    names.push(match[1]);
  }
  return names;
}

/**
 * Targeted semantic checks over a parsed OpenAPI document:
 *
 * 1. Invalid root: the document declares none of `paths`, `components`,
 *    `webhooks`.
 * 2. Duplicate `operationId` values.
 * 3. Missing path parameters: a `{template}` expression with no declared
 *    `in: path` parameter (path-level and operation-level merged).
 * 4. Unused path parameters: an `in: path` parameter whose name appears in no
 *    template expression of its path.
 */
export function checkSemantics(
  spec: Record<string, unknown>,
  resolvedRefs: Map<string, unknown>
): OpenApiDiagnostic[] {
  const diagnostics: OpenApiDiagnostic[] = [];

  const hasAny = ['paths', 'components', 'webhooks'].some(
    (key) => spec[key] !== null && typeof spec[key] === 'object'
  );
  if (!hasAny) {
    diagnostics.push({
      source: 'semantic',
      severity: 'error',
      message: 'Document must contain at least one of "paths", "components", or "webhooks".',
      pointer: '',
      code: 'missing-root-sections',
    });
  }

  const paths = spec.paths;
  if (paths === null || typeof paths !== 'object' || Array.isArray(paths)) {
    return diagnostics;
  }

  const seenOperationIds = new Map<string, string>();

  for (const [path, pathItemValue] of Object.entries(paths as Record<string, unknown>)) {
    if (pathItemValue === null || typeof pathItemValue !== 'object') continue;
    const pathItem = pathItemValue as Record<string, unknown>;
    const pathPointer = buildPointer(['paths', path]);
    const templates = templateParams(path);

    const pathLevelParams = resolveParameters(
      pathItem.parameters,
      `${pathPointer}/parameters`,
      resolvedRefs
    );

    for (const param of pathLevelParams) {
      if (param.in === 'path' && !templates.includes(param.name)) {
        diagnostics.push({
          source: 'semantic',
          severity: 'warning',
          message: `Path parameter "${param.name}" is declared but "${path}" has no "{${param.name}}" template expression.`,
          pointer: param.pointer,
          code: 'unused-path-param',
        });
      }
    }

    // Fixed operation keys plus OpenAPI 3.2 additionalOperations entries,
    // each as (display method, operation, pointer).
    const operationEntries: Array<{ method: string; operation: Record<string, unknown>; pointer: string }> = [];
    for (const method of OPENAPI_OPERATION_METHODS) {
      const operationValue = pathItem[method];
      if (operationValue === null || typeof operationValue !== 'object') continue;
      operationEntries.push({
        method,
        operation: operationValue as Record<string, unknown>,
        pointer: `${pathPointer}/${method}`,
      });
    }
    const additional = getAdditionalOperations(pathItem);
    if (additional) {
      for (const [method, operationValue] of Object.entries(additional)) {
        const entryPointer = `${pathPointer}/additionalOperations/${escapePointerSegment(method)}`;
        if (OPENAPI_FIXED_METHOD_NAMES.has(method.toUpperCase())) {
          diagnostics.push({
            source: 'semantic',
            severity: 'error',
            message: `additionalOperations must not duplicate the fixed "${method.toLowerCase()}" operation key; use the fixed key instead.`,
            pointer: entryPointer,
            code: 'additional-op-duplicate',
          });
        }
        if (operationValue === null || typeof operationValue !== 'object') continue;
        operationEntries.push({
          method,
          operation: operationValue as Record<string, unknown>,
          pointer: entryPointer,
        });
      }
    }

    for (const { method, operation, pointer: operationPointer } of operationEntries) {

      if (typeof operation.operationId === 'string' && operation.operationId.length > 0) {
        const existing = seenOperationIds.get(operation.operationId);
        if (existing) {
          diagnostics.push({
            source: 'semantic',
            severity: 'error',
            message: `Duplicate operationId "${operation.operationId}" (first used at ${existing}).`,
            pointer: `${operationPointer}/operationId`,
            code: 'duplicate-operation-id',
            data: { operationId: operation.operationId, operationPointer },
          });
        } else {
          seenOperationIds.set(operation.operationId, `${method.toUpperCase()} ${path}`);
        }
      }

      const operationParams = resolveParameters(
        operation.parameters,
        `${operationPointer}/parameters`,
        resolvedRefs
      );

      for (const param of operationParams) {
        if (param.in === 'path' && !templates.includes(param.name)) {
          diagnostics.push({
            source: 'semantic',
            severity: 'warning',
            message: `Path parameter "${param.name}" is declared but "${path}" has no "{${param.name}}" template expression.`,
            pointer: param.pointer,
            code: 'unused-path-param',
          });
        }
      }

      const declaredPathParams = new Set(
        [...pathLevelParams, ...operationParams]
          .filter((param) => param.in === 'path')
          .map((param) => param.name)
      );
      for (const template of templates) {
        if (!declaredPathParams.has(template)) {
          diagnostics.push({
            source: 'semantic',
            severity: 'error',
            message: `Path template "{${template}}" in "${path}" has no corresponding "in: path" parameter declaration for the ${method.toUpperCase()} operation.`,
            pointer: operationPointer,
            code: 'missing-path-param',
            // Absence-type defect: underline the operation key, not its whole body.
            data: { name: template, operationPointer, anchor: true },
          });
        }
      }
    }
  }

  return diagnostics;
}
