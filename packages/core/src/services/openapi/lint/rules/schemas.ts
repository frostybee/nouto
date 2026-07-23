import { buildPointer } from '../../pointer';
import type { LintFinding, LintRule } from '../types';
import { isRecord, operationViews, resolveMaybeRef, specOf } from '../context';

/** Named schemas under `components.schemas`. */
function componentSchemas(spec: Record<string, unknown>): Array<[string, Record<string, unknown>]> {
  const components = isRecord(spec.components) ? spec.components : undefined;
  const schemas = components && isRecord(components.schemas) ? components.schemas : undefined;
  if (!schemas) return [];
  return Object.entries(schemas).filter(
    (entry): entry is [string, Record<string, unknown>] => isRecord(entry[1])
  );
}

const unconstrainedAdditionalProperties: LintRule = {
  id: 'schema-unconstrained-additional-properties',
  description: 'Object schema does not constrain additionalProperties, allowing arbitrary fields.',
  defaultSeverity: 'warning',
  run(analysis) {
    const spec = specOf(analysis);
    if (!spec) return [];
    const findings: LintFinding[] = [];
    for (const [name, schema] of componentSchemas(spec)) {
      const isObject = schema.type === 'object' || isRecord(schema.properties);
      if (isObject && (schema.additionalProperties === undefined || schema.additionalProperties === true)) {
        findings.push({
          message: `Schema "${name}" does not constrain additionalProperties; set it to false or a schema.`,
          pointer: buildPointer(['components', 'schemas', name]),
        });
      }
    }
    return findings;
  },
};

const unboundedParameter: LintRule = {
  id: 'parameter-unbounded',
  description: 'String/array parameter has no maxLength/maxItems, allowing unbounded input.',
  defaultSeverity: 'warning',
  run(analysis) {
    const findings: LintFinding[] = [];
    for (const { summary, object } of operationViews(analysis)) {
      if (!Array.isArray(object.parameters)) continue;
      object.parameters.forEach((raw, index) => {
        const param = resolveMaybeRef(raw, analysis);
        if (!isRecord(param) || !isRecord(param.schema)) return;
        const schema = param.schema;
        const pointer = `${summary.pointer}/parameters/${index}`;
        if (schema.type === 'string' && schema.maxLength === undefined && schema.enum === undefined) {
          findings.push({
            message: `Parameter "${String(param.name ?? '')}" has no maxLength constraint.`,
            pointer,
          });
        } else if (schema.type === 'array' && schema.maxItems === undefined) {
          findings.push({
            message: `Parameter "${String(param.name ?? '')}" has no maxItems constraint.`,
            pointer,
          });
        }
      });
    }
    return findings;
  },
};

export const schemaRules: LintRule[] = [unconstrainedAdditionalProperties, unboundedParameter];
