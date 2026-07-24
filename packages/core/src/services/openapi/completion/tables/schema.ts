import type { NodeKindTable } from '../types';

/**
 * Curated completion table for the Schema Object (plus its small siblings
 * Discriminator and XML).
 *
 * IMPORTANT: this data is hand-authored from the OpenAPI / JSON Schema
 * specification text, per version. Do NOT attempt to generate it from the
 * vendored meta-schemas under `packages/core/vendor/openapi-schemas/`: the 3.1
 * and 3.2 Schema Object definitions carry an empty `properties` map (their keys
 * are reached through `$dynamicRef`) and the Parameter definition splits its
 * keys into `allOf` mixins, so any generator would silently emit a wrong or
 * empty table. The 3.0 vs 3.1+ differences below (numeric vs boolean
 * `exclusive*`, `nullable`, the 2020-12-only keywords) come straight from the
 * spec, not from a schema walk.
 */

const schemaTable: NodeKindTable = {
  kind: 'Schema',
  properties: [
    // Reference & identity
    { name: '$ref', docs: 'Reference to another schema definition, e.g. `#/components/schemas/Pet`.', insertKind: 'scalar' },
    { name: '$id', docs: 'A URI for the schema, establishing a base for relative references.', insertKind: 'scalar', sinceVersion: '3.1' },
    { name: '$schema', docs: 'The JSON Schema dialect this schema uses.', insertKind: 'scalar', sinceVersion: '3.1' },
    { name: '$anchor', docs: 'A plain-name fragment identifier for this schema.', insertKind: 'scalar', sinceVersion: '3.1' },
    { name: '$dynamicRef', docs: 'A dynamic reference resolved against the dynamic scope.', insertKind: 'scalar', sinceVersion: '3.1' },
    { name: '$dynamicAnchor', docs: 'Declares a dynamic anchor that `$dynamicRef` can resolve to.', insertKind: 'scalar', sinceVersion: '3.1' },
    { name: '$comment', docs: 'A comment for schema maintainers; carries no validation effect.', insertKind: 'scalar', sinceVersion: '3.1' },
    { name: '$defs', docs: 'A map of reusable schema definitions for reference within this document.', insertKind: 'object', sinceVersion: '3.1' },

    // Annotations
    { name: 'title', docs: 'A short title for the schema.', insertKind: 'scalar' },
    { name: 'description', docs: 'A description of the schema. CommonMark syntax MAY be used.', insertKind: 'scalar' },
    { name: 'default', docs: 'The default value for this schema.', insertKind: 'scalar' },
    { name: 'example', docs: 'An example instance for this schema (OpenAPI 3.0). Prefer `examples` in 3.1+.', insertKind: 'scalar', until: '3.0' },
    { name: 'examples', docs: 'An array of example instances for this schema.', insertKind: 'array', sinceVersion: '3.1' },
    { name: 'deprecated', docs: 'Indicates the schema is deprecated and SHOULD be phased out.', insertKind: 'enum-value', enumValues: [{ value: 'true' }, { value: 'false' }] },
    { name: 'readOnly', docs: 'Declares the property as read-only (present in responses, not requests).', insertKind: 'enum-value', enumValues: [{ value: 'true' }, { value: 'false' }] },
    { name: 'writeOnly', docs: 'Declares the property as write-only (present in requests, not responses).', insertKind: 'enum-value', enumValues: [{ value: 'true' }, { value: 'false' }] },

    // Typing
    { name: 'type', docs: 'The data type. In 3.1+ may also be an array of types (e.g. `[string, null]`).', insertKind: 'enum-value', enumValues: [
      { value: 'string' }, { value: 'number' }, { value: 'integer' }, { value: 'boolean' }, { value: 'object' }, { value: 'array' }, { value: 'null', sinceVersion: '3.1' },
    ] },
    { name: 'format', docs: 'A format hint for the type, e.g. `date-time`, `uuid`, `email`, `int64`.', insertKind: 'scalar' },
    { name: 'enum', docs: 'An enumeration of the allowed values for this schema.', insertKind: 'array', snippetBody: '\n  - $0' },
    { name: 'const', docs: 'Restricts the instance to a single constant value.', insertKind: 'scalar', sinceVersion: '3.1' },
    { name: 'nullable', docs: 'Allows the value to be `null` (OpenAPI 3.0). In 3.1+ add `null` to `type` instead.', insertKind: 'enum-value', until: '3.0', enumValues: [{ value: 'true' }, { value: 'false' }] },

    // Object validation
    { name: 'properties', docs: 'A map of property name to schema for object properties.', insertKind: 'object' },
    { name: 'required', docs: 'A list of property names that are required on the object.', insertKind: 'array', snippetBody: '\n  - $0' },
    { name: 'additionalProperties', docs: 'Controls extra properties: a boolean, or a schema they must match.', insertKind: 'object' },
    { name: 'patternProperties', docs: 'A map of regular expressions to schemas that matching properties must satisfy.', insertKind: 'object', sinceVersion: '3.1' },
    { name: 'propertyNames', docs: 'A schema every property name of the object must match.', insertKind: 'object', sinceVersion: '3.1' },
    { name: 'minProperties', docs: 'The minimum number of properties an object may have.', insertKind: 'scalar' },
    { name: 'maxProperties', docs: 'The maximum number of properties an object may have.', insertKind: 'scalar' },
    { name: 'dependentSchemas', docs: 'Schemas conditionally applied when a given property is present.', insertKind: 'object', sinceVersion: '3.1' },
    { name: 'dependentRequired', docs: 'Additional required properties conditioned on the presence of a property.', insertKind: 'object', sinceVersion: '3.1' },
    { name: 'unevaluatedProperties', docs: 'Applies to properties not evaluated by other keywords.', insertKind: 'object', sinceVersion: '3.1' },

    // Array validation
    { name: 'items', docs: 'The schema for items in an array.', insertKind: 'object' },
    { name: 'prefixItems', docs: 'Schemas for the first items of a tuple, positionally.', insertKind: 'array', sinceVersion: '3.1' },
    { name: 'contains', docs: 'A schema that at least one array item must match.', insertKind: 'object', sinceVersion: '3.1' },
    { name: 'minContains', docs: 'The minimum number of items that must match `contains`.', insertKind: 'scalar', sinceVersion: '3.1' },
    { name: 'maxContains', docs: 'The maximum number of items that may match `contains`.', insertKind: 'scalar', sinceVersion: '3.1' },
    { name: 'minItems', docs: 'The minimum number of items in an array.', insertKind: 'scalar' },
    { name: 'maxItems', docs: 'The maximum number of items in an array.', insertKind: 'scalar' },
    { name: 'uniqueItems', docs: 'Requires all array items to be unique.', insertKind: 'enum-value', enumValues: [{ value: 'true' }, { value: 'false' }] },
    { name: 'unevaluatedItems', docs: 'Applies to array items not evaluated by other keywords.', insertKind: 'object', sinceVersion: '3.1' },

    // Numeric validation
    { name: 'multipleOf', docs: 'The value must be a multiple of this number.', insertKind: 'scalar' },
    { name: 'minimum', docs: 'The inclusive lower bound for a numeric value.', insertKind: 'scalar' },
    { name: 'maximum', docs: 'The inclusive upper bound for a numeric value.', insertKind: 'scalar' },
    { name: 'exclusiveMinimum', docs: 'When `true`, `minimum` is treated as an exclusive bound (OpenAPI 3.0 boolean form).', insertKind: 'enum-value', until: '3.0', enumValues: [{ value: 'true' }, { value: 'false' }] },
    { name: 'exclusiveMinimum', docs: 'The exclusive lower bound for a numeric value (JSON Schema 2020-12 numeric form).', insertKind: 'scalar', sinceVersion: '3.1' },
    { name: 'exclusiveMaximum', docs: 'When `true`, `maximum` is treated as an exclusive bound (OpenAPI 3.0 boolean form).', insertKind: 'enum-value', until: '3.0', enumValues: [{ value: 'true' }, { value: 'false' }] },
    { name: 'exclusiveMaximum', docs: 'The exclusive upper bound for a numeric value (JSON Schema 2020-12 numeric form).', insertKind: 'scalar', sinceVersion: '3.1' },

    // String validation
    { name: 'minLength', docs: 'The minimum length of a string value.', insertKind: 'scalar' },
    { name: 'maxLength', docs: 'The maximum length of a string value.', insertKind: 'scalar' },
    { name: 'pattern', docs: 'A regular expression a string value must match.', insertKind: 'scalar' },

    // String content (2020-12)
    { name: 'contentMediaType', docs: 'The media type of string content, e.g. `application/json`.', insertKind: 'scalar', sinceVersion: '3.1' },
    { name: 'contentEncoding', docs: 'The encoding of string content, e.g. `base64`.', insertKind: 'scalar', sinceVersion: '3.1' },
    { name: 'contentSchema', docs: 'A schema describing decoded string content.', insertKind: 'object', sinceVersion: '3.1' },

    // Composition
    { name: 'allOf', docs: 'The instance must validate against all of these subschemas.', insertKind: 'array' },
    { name: 'oneOf', docs: 'The instance must validate against exactly one of these subschemas.', insertKind: 'array' },
    { name: 'anyOf', docs: 'The instance must validate against at least one of these subschemas.', insertKind: 'array' },
    { name: 'not', docs: 'The instance must NOT validate against this subschema.', insertKind: 'object' },
    { name: 'if', docs: 'Conditional schema: when the instance matches `if`, `then` applies.', insertKind: 'object', sinceVersion: '3.1' },
    { name: 'then', docs: 'Applied when the instance matches the `if` subschema.', insertKind: 'object', sinceVersion: '3.1' },
    { name: 'else', docs: 'Applied when the instance does not match the `if` subschema.', insertKind: 'object', sinceVersion: '3.1' },

    // OpenAPI extensions to JSON Schema
    { name: 'discriminator', docs: 'Aids in serialization/deserialization of polymorphic schemas.', insertKind: 'object', snippetBody: '\n  propertyName: $1' },
    { name: 'xml', docs: 'Adds metadata to describe the XML representation of this schema.', insertKind: 'object' },
    { name: 'externalDocs', docs: 'Additional external documentation for this schema.', insertKind: 'object', snippetBody: '\n  url: $1' },
  ],
};

const discriminatorTable: NodeKindTable = {
  kind: 'Discriminator',
  properties: [
    { name: 'propertyName', docs: 'The name of the property in the payload that holds the discriminating value.', insertKind: 'scalar', required: true },
    { name: 'mapping', docs: 'A map of discriminator values to schema names or references.', insertKind: 'object' },
  ],
};

const xmlTable: NodeKindTable = {
  kind: 'XML',
  properties: [
    { name: 'name', docs: 'Replaces the name of the element/attribute used for the schema.', insertKind: 'scalar' },
    { name: 'namespace', docs: 'The URI of the XML namespace definition.', insertKind: 'scalar' },
    { name: 'prefix', docs: 'The prefix to be used for the XML name.', insertKind: 'scalar' },
    { name: 'attribute', docs: 'Declares whether the property translates to an attribute instead of an element.', insertKind: 'enum-value', enumValues: [{ value: 'true' }, { value: 'false' }] },
    { name: 'wrapped', docs: 'For arrays only: whether the array is wrapped in a container element.', insertKind: 'enum-value', enumValues: [{ value: 'true' }, { value: 'false' }] },
  ],
};

export const schemaTables: NodeKindTable[] = [schemaTable, discriminatorTable, xmlTable];
