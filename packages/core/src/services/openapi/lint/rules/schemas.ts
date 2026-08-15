import type { LintFinding, LintRule } from '../types';
import { componentEntries, isRecord, operationViews, resolveMaybeRef, specOf, versionAtLeast } from '../context';
import { walkSchemas } from '../schemaWalk';
import { EXAMPLE_INVALID_MEDIA, EXAMPLE_INVALID_SCHEMA } from '../exampleSites';

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

/** Stable structural key for deep-equality of enum values. */
function stableKey(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableKey).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableKey(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? String(value);
}

const enumDuplicateValues: LintRule = {
  id: 'enum-duplicate-values',
  description: 'Schema enum lists the same value more than once.',
  defaultSeverity: 'error',
  run(analysis) {
    const findings: LintFinding[] = [];
    for (const { schema, pointer } of walkSchemas(analysis)) {
      if (!Array.isArray(schema.enum)) continue;
      const seen = new Set<string>();
      schema.enum.forEach((value, index) => {
        const key = stableKey(value);
        if (seen.has(key)) {
          findings.push({
            message: `Enum value ${JSON.stringify(value)} is listed more than once.`,
            pointer: `${pointer}/enum/${index}`,
          });
        }
        seen.add(key);
      });
    }
    return findings;
  },
};

/** JSON Schema `type` names a value satisfies. */
function jsonTypesOf(value: unknown): string[] {
  if (value === null) return ['null'];
  if (Array.isArray(value)) return ['array'];
  if (typeof value === 'object') return ['object'];
  if (typeof value === 'number') return Number.isInteger(value) ? ['number', 'integer'] : ['number'];
  return [typeof value]; // string | boolean
}

const enumTypeMismatch: LintRule = {
  id: 'enum-type-mismatch',
  description: 'Schema enum contains a value that does not match the declared type.',
  defaultSeverity: 'error',
  run(analysis) {
    const findings: LintFinding[] = [];
    for (const { schema, pointer } of walkSchemas(analysis)) {
      if (!Array.isArray(schema.enum)) continue;
      const declared = typeof schema.type === 'string'
        ? [schema.type]
        : Array.isArray(schema.type)
          ? schema.type.filter((entry): entry is string => typeof entry === 'string')
          : [];
      if (declared.length === 0) continue;
      const allowed = new Set(declared);
      if (schema.nullable === true) allowed.add('null');
      schema.enum.forEach((value, index) => {
        if (jsonTypesOf(value).some((type) => allowed.has(type))) return;
        findings.push({
          message: `Enum value ${JSON.stringify(value)} does not match type ${declared.join(' | ')}.`,
          pointer: `${pointer}/enum/${index}`,
        });
      });
    }
    return findings;
  },
};

const requiredPropertyUndefined: LintRule = {
  id: 'schema-required-property-undefined',
  description: 'Schema lists a required property that its properties map does not define.',
  defaultSeverity: 'warning',
  run(analysis) {
    const findings: LintFinding[] = [];
    for (const { schema, pointer } of walkSchemas(analysis)) {
      if (!Array.isArray(schema.required)) continue;
      // Composition or open property patterns can supply the property
      // elsewhere; only judge self-contained object schemas.
      if (schema.allOf || schema.oneOf || schema.anyOf || schema.patternProperties || schema.$ref) continue;
      if (isRecord(schema.additionalProperties)) continue;
      const properties = isRecord(schema.properties) ? schema.properties : {};
      schema.required.forEach((name, index) => {
        if (typeof name !== 'string' || name in properties) return;
        findings.push({
          message: `Required property "${name}" is not defined in properties.`,
          pointer: `${pointer}/required/${index}`,
        });
      });
    }
    return findings;
  },
};

const nullableWithoutType: LintRule = {
  id: 'schema-nullable-without-type',
  description: 'OpenAPI 3.0 schema uses nullable without a type; nullable only applies alongside type.',
  defaultSeverity: 'warning',
  run(analysis) {
    if (versionAtLeast(analysis, '3.1')) return [];
    const findings: LintFinding[] = [];
    for (const { schema, pointer } of walkSchemas(analysis)) {
      if (schema.nullable === undefined || schema.type !== undefined) continue;
      findings.push({ message: '"nullable" has no effect without a "type".', pointer: `${pointer}/nullable` });
    }
    return findings;
  },
};

const nullableIn31: LintRule = {
  id: 'schema-nullable-in-31',
  description: 'OpenAPI 3.1+ schemas use JSON Schema; nullable is ignored, use a "null" type instead.',
  defaultSeverity: 'warning',
  run(analysis) {
    if (!versionAtLeast(analysis, '3.1')) return [];
    const findings: LintFinding[] = [];
    for (const { schema, pointer } of walkSchemas(analysis)) {
      if (schema.nullable === undefined) continue;
      findings.push({
        message: '"nullable" is not a JSON Schema keyword in OpenAPI 3.1+; use type: [..., "null"].',
        pointer: `${pointer}/nullable`,
      });
    }
    return findings;
  },
};

const mixedRangeConstraints: LintRule = {
  id: 'schema-mixed-range-constraints',
  description: 'Schema mixes maximum with exclusiveMaximum (or minimum with exclusiveMinimum).',
  defaultSeverity: 'warning',
  run(analysis) {
    const findings: LintFinding[] = [];
    const modern = versionAtLeast(analysis, '3.1');
    for (const { schema, pointer } of walkSchemas(analysis)) {
      for (const [bound, exclusive] of [['maximum', 'exclusiveMaximum'], ['minimum', 'exclusiveMinimum']] as const) {
        const hasBound = schema[bound] !== undefined;
        const exclusiveValue = schema[exclusive];
        if (exclusiveValue === undefined) continue;
        if (modern) {
          if (hasBound) {
            findings.push({
              message: `"${bound}" and "${exclusive}" are both set; keep one bound.`,
              pointer: `${pointer}/${exclusive}`,
            });
          }
        } else if (exclusiveValue === true && !hasBound) {
          findings.push({
            message: `"${exclusive}: true" has no effect without "${bound}" in OpenAPI 3.0.`,
            pointer: `${pointer}/${exclusive}`,
          });
        }
      }
    }
    return findings;
  },
};

/**
 * Host-validated: the findings come from a JSON Schema validator the host
 * runs over `collectExampleSites()`; `run` is intentionally empty.
 */
const exampleInvalidSchema: LintRule = {
  id: EXAMPLE_INVALID_SCHEMA,
  description: 'A schema example or examples entry does not validate against its schema.',
  defaultSeverity: 'warning',
  hostValidated: true,
  run: () => [],
};

const exampleInvalidMedia: LintRule = {
  id: EXAMPLE_INVALID_MEDIA,
  description: 'A media type or parameter example does not validate against its schema.',
  defaultSeverity: 'warning',
  hostValidated: true,
  run: () => [],
};

export const schemaRules: LintRule[] = [
  unconstrainedAdditionalProperties,
  unboundedParameter,
  enumDuplicateValues,
  enumTypeMismatch,
  requiredPropertyUndefined,
  nullableWithoutType,
  nullableIn31,
  mixedRangeConstraints,
  exampleInvalidSchema,
  exampleInvalidMedia,
];
