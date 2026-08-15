import type { LintFinding, LintRule } from '../types';
import { componentEntries, isRecord, operationViews, resolveMaybeRef, specOf } from '../context';

const unconstrainedAdditionalProperties: LintRule = {
  id: 'schema-unconstrained-additional-properties',
  description: 'Object schema does not constrain additionalProperties, allowing arbitrary fields.',
  defaultSeverity: 'warning',
  run(analysis) {
    const spec = specOf(analysis);
    if (!spec) return [];
    const findings: LintFinding[] = [];
    for (const { name, object: schema, pointer } of componentEntries(spec, 'schemas')) {
      const isObject = schema.type === 'object' || isRecord(schema.properties);
      if (isObject && (schema.additionalProperties === undefined || schema.additionalProperties === true)) {
        findings.push({
          message: `Schema "${name}" does not constrain additionalProperties; set it to false or a schema.`,
          pointer,
          anchor: true,
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
            anchor: true,
          });
        } else if (schema.type === 'array' && schema.maxItems === undefined) {
          findings.push({
            message: `Parameter "${String(param.name ?? '')}" has no maxItems constraint.`,
            pointer,
            anchor: true,
          });
        }
      });
    }
    return findings;
  },
};

export const schemaRules: LintRule[] = [unconstrainedAdditionalProperties, unboundedParameter];
