import type { OpenApiAnalysis } from '../types';
import { OPENAPI_OPERATION_METHODS, getAdditionalOperations } from '../types';
import { buildPointer, escapePointerSegment } from '../pointer';
import { isRefNode } from '../refs';
import { isRecord, specOf } from './context';

/**
 * Generic walkers over the places a document embeds Schema Objects, Media
 * Type Objects, and Parameter Objects. Rules that care about "every schema"
 * (enum hygiene, `nullable`, integer bounds...) use these instead of each
 * re-implementing the OpenAPI object graph.
 *
 * All walkers stop at `$ref` nodes: a referenced object is visited once, at
 * its definition site (usually under `components`), never at each usage.
 * External refs are not followed. Cycles are impossible for the inline tree
 * (JSON/YAML documents are trees) but a visited-pointer set guards against
 * aliased objects that YAML anchors can produce.
 */

export interface SchemaSite {
  schema: Record<string, unknown>;
  pointer: string;
  /** Where the schema hangs: a named component or an inline usage. */
  owner: 'component' | 'inline';
  /** Component name when `owner === 'component'`. */
  name?: string;
}

export interface MediaTypeSite {
  mediaType: Record<string, unknown>;
  pointer: string;
  /** The `content` key (e.g. `application/json`). */
  contentType: string;
}

export interface ParameterSite {
  parameter: Record<string, unknown>;
  pointer: string;
  /** True for `components.parameters` entries, false for inline usages. */
  component: boolean;
}

/** Keys of a Schema Object whose value is a single Schema Object. */
const SCHEMA_KEYS = [
  'items',
  'additionalProperties',
  'not',
  'if',
  'then',
  'else',
  'contains',
  'propertyNames',
  'unevaluatedItems',
  'unevaluatedProperties',
  'additionalItems',
  'itemSchema',
] as const;

/** Keys of a Schema Object whose value is a list of Schema Objects. */
const SCHEMA_LIST_KEYS = ['allOf', 'oneOf', 'anyOf', 'prefixItems'] as const;

/** Keys of a Schema Object whose value is a map of Schema Objects. */
const SCHEMA_MAP_KEYS = ['properties', 'patternProperties', 'dependentSchemas', '$defs', 'definitions'] as const;

/**
 * Yields `schema` and every Schema Object nested inside it (depth-first,
 * parents before children). `owner`/`name` describe the root only; nested
 * sites are reported as `inline`.
 */
export function* walkSchema(
  schema: unknown,
  pointer: string,
  owner: SchemaSite['owner'] = 'inline',
  name?: string,
  seen: Set<unknown> = new Set()
): Generator<SchemaSite> {
  if (!isRecord(schema) || isRefNode(schema) || seen.has(schema)) return;
  seen.add(schema);
  yield { schema, pointer, owner, name };
  for (const key of SCHEMA_KEYS) {
    if (key in schema) yield* walkSchema(schema[key], `${pointer}/${key}`, 'inline', undefined, seen);
  }
  for (const key of SCHEMA_LIST_KEYS) {
    const list = schema[key];
    if (Array.isArray(list)) {
      for (let index = 0; index < list.length; index++) {
        yield* walkSchema(list[index], `${pointer}/${key}/${index}`, 'inline', undefined, seen);
      }
    }
  }
  for (const key of SCHEMA_MAP_KEYS) {
    const map = schema[key];
    if (isRecord(map)) {
      for (const [child, value] of Object.entries(map)) {
        yield* walkSchema(value, `${pointer}/${key}/${escapePointerSegment(child)}`, 'inline', undefined, seen);
      }
    }
  }
}

/** Every Media Type Object under a `content` map. */
function* mediaTypesOf(container: unknown, pointer: string): Generator<MediaTypeSite> {
  if (!isRecord(container) || isRefNode(container) || !isRecord(container.content)) return;
  for (const [contentType, mediaType] of Object.entries(container.content)) {
    if (!isRecord(mediaType)) continue;
    yield { mediaType, pointer: `${pointer}/content/${escapePointerSegment(contentType)}`, contentType };
  }
}

/** Every inline Parameter Object in a `parameters` array. */
function* parametersOf(list: unknown, pointer: string, component = false): Generator<ParameterSite> {
  if (!Array.isArray(list)) return;
  for (let index = 0; index < list.length; index++) {
    const parameter = list[index];
    if (!isRecord(parameter) || isRefNode(parameter)) continue;
    yield { parameter, pointer: `${pointer}/${index}`, component };
  }
}

/** Every Header Object in a `headers` map (Response / Encoding). */
function* headersOf(container: unknown, pointer: string): Generator<{ header: Record<string, unknown>; pointer: string }> {
  if (!isRecord(container) || isRefNode(container) || !isRecord(container.headers)) return;
  for (const [name, header] of Object.entries(container.headers)) {
    if (!isRecord(header) || isRefNode(header)) continue;
    yield { header, pointer: `${pointer}/headers/${escapePointerSegment(name)}` };
  }
}

interface OperationSite {
  operation: Record<string, unknown>;
  pointer: string;
}

/** Operations of a Path Item (fixed methods + 3.2 `additionalOperations`). */
function* operationsOf(pathItem: Record<string, unknown>, pointer: string): Generator<OperationSite> {
  for (const method of OPENAPI_OPERATION_METHODS) {
    const operation = pathItem[method];
    if (isRecord(operation)) yield { operation, pointer: `${pointer}/${method}` };
  }
  const additional = getAdditionalOperations(pathItem);
  if (additional) {
    for (const [method, operation] of Object.entries(additional)) {
      if (isRecord(operation)) {
        yield { operation, pointer: `${pointer}/additionalOperations/${escapePointerSegment(method)}` };
      }
    }
  }
}

/**
 * Every Path Item reachable from the document: `paths`, `webhooks`,
 * `components.pathItems`, and callback path items (one level; callbacks
 * nested in callbacks are diagnosed, not walked).
 */
function* pathItemsOf(spec: Record<string, unknown>): Generator<{ pathItem: Record<string, unknown>; pointer: string }> {
  for (const section of ['paths', 'webhooks'] as const) {
    const map = spec[section];
    if (!isRecord(map)) continue;
    for (const [key, pathItem] of Object.entries(map)) {
      if (isRecord(pathItem) && !isRefNode(pathItem)) {
        yield { pathItem, pointer: buildPointer([section, key]) };
      }
    }
  }
  const components = isRecord(spec.components) ? spec.components : undefined;
  if (components && isRecord(components.pathItems)) {
    for (const [key, pathItem] of Object.entries(components.pathItems)) {
      if (isRecord(pathItem) && !isRefNode(pathItem)) {
        yield { pathItem, pointer: buildPointer(['components', 'pathItems', key]) };
      }
    }
  }
}

/** Callback path items of an operation, plus those under `components.callbacks`. */
function* callbackPathItemsOf(
  spec: Record<string, unknown>
): Generator<{ pathItem: Record<string, unknown>; pointer: string }> {
  const fromCallbacks = function* (callbacks: unknown, pointer: string) {
    if (!isRecord(callbacks)) return;
    for (const [name, callback] of Object.entries(callbacks)) {
      if (!isRecord(callback) || isRefNode(callback)) continue;
      for (const [expression, pathItem] of Object.entries(callback)) {
        if (isRecord(pathItem) && !isRefNode(pathItem)) {
          yield {
            pathItem,
            pointer: `${pointer}/${escapePointerSegment(name)}/${escapePointerSegment(expression)}`,
          };
        }
      }
    }
  };
  for (const { pathItem, pointer } of pathItemsOf(spec)) {
    for (const { operation, pointer: opPointer } of operationsOf(pathItem, pointer)) {
      yield* fromCallbacks(operation.callbacks, `${opPointer}/callbacks`);
    }
  }
  const components = isRecord(spec.components) ? spec.components : undefined;
  if (components) yield* fromCallbacks(components.callbacks, '/components/callbacks');
}

/** All path items including callback ones. */
function* allPathItems(spec: Record<string, unknown>) {
  yield* pathItemsOf(spec);
  yield* callbackPathItemsOf(spec);
}

/**
 * Every Parameter Object in the document: `components.parameters`, path-item
 * level `parameters`, and operation-level `parameters` (including webhooks,
 * component path items, and callbacks). `$ref` entries are skipped.
 */
export function* walkParameters(analysis: OpenApiAnalysis): Generator<ParameterSite> {
  const spec = specOf(analysis);
  if (!spec) return;
  const components = isRecord(spec.components) ? spec.components : undefined;
  if (components && isRecord(components.parameters)) {
    for (const [name, parameter] of Object.entries(components.parameters)) {
      if (isRecord(parameter) && !isRefNode(parameter)) {
        yield { parameter, pointer: buildPointer(['components', 'parameters', name]), component: true };
      }
    }
  }
  for (const { pathItem, pointer } of allPathItems(spec)) {
    yield* parametersOf(pathItem.parameters, `${pointer}/parameters`);
    for (const { operation, pointer: opPointer } of operationsOf(pathItem, pointer)) {
      yield* parametersOf(operation.parameters, `${opPointer}/parameters`);
    }
  }
}

/**
 * Every Media Type Object in the document: request bodies, responses,
 * parameters/headers with `content`, and `components.requestBodies` /
 * `components.responses` / `components.mediaTypes` (3.2).
 */
export function* walkMediaTypes(analysis: OpenApiAnalysis): Generator<MediaTypeSite> {
  const spec = specOf(analysis);
  if (!spec) return;
  const components = isRecord(spec.components) ? spec.components : undefined;

  const fromResponses = function* (responses: unknown, pointer: string): Generator<MediaTypeSite> {
    if (!isRecord(responses)) return;
    for (const [code, response] of Object.entries(responses)) {
      const responsePointer = `${pointer}/${escapePointerSegment(code)}`;
      yield* mediaTypesOf(response, responsePointer);
      for (const { header, pointer: headerPointer } of headersOf(response, responsePointer)) {
        yield* mediaTypesOf(header, headerPointer);
      }
    }
  };

  for (const { parameter, pointer } of walkParameters(analysis)) {
    yield* mediaTypesOf(parameter, pointer);
  }
  for (const { pathItem, pointer } of allPathItems(spec)) {
    for (const { operation, pointer: opPointer } of operationsOf(pathItem, pointer)) {
      yield* mediaTypesOf(operation.requestBody, `${opPointer}/requestBody`);
      yield* fromResponses(operation.responses, `${opPointer}/responses`);
    }
  }
  if (components) {
    if (isRecord(components.requestBodies)) {
      for (const [name, body] of Object.entries(components.requestBodies)) {
        yield* mediaTypesOf(body, buildPointer(['components', 'requestBodies', name]));
      }
    }
    yield* fromResponses(components.responses, '/components/responses');
    if (isRecord(components.headers)) {
      for (const [name, header] of Object.entries(components.headers)) {
        yield* mediaTypesOf(header, buildPointer(['components', 'headers', name]));
      }
    }
    if (isRecord(components.mediaTypes)) {
      for (const [name, mediaType] of Object.entries(components.mediaTypes)) {
        if (isRecord(mediaType) && !isRefNode(mediaType)) {
          yield { mediaType, pointer: buildPointer(['components', 'mediaTypes', name]), contentType: name };
        }
      }
    }
  }
}

/**
 * Every Schema Object in the document, depth-first: `components.schemas`
 * (roots reported as `component`), then inline schemas under parameters,
 * headers, and media types (request bodies, responses), each with all nested
 * sub-schemas. `$ref` nodes are not descended into.
 */
export function* walkSchemas(analysis: OpenApiAnalysis): Generator<SchemaSite> {
  const spec = specOf(analysis);
  if (!spec) return;
  const seen = new Set<unknown>();
  const components = isRecord(spec.components) ? spec.components : undefined;
  if (components && isRecord(components.schemas)) {
    for (const [name, schema] of Object.entries(components.schemas)) {
      yield* walkSchema(schema, buildPointer(['components', 'schemas', name]), 'component', name, seen);
    }
  }
  for (const { parameter, pointer } of walkParameters(analysis)) {
    yield* walkSchema(parameter.schema, `${pointer}/schema`, 'inline', undefined, seen);
  }
  if (components && isRecord(components.headers)) {
    for (const [name, header] of Object.entries(components.headers)) {
      if (isRecord(header) && !isRefNode(header)) {
        yield* walkSchema(header.schema, buildPointer(['components', 'headers', name, 'schema']), 'inline', undefined, seen);
      }
    }
  }
  for (const { pathItem, pointer } of allPathItems(spec)) {
    for (const { operation, pointer: opPointer } of operationsOf(pathItem, pointer)) {
      const responses = operation.responses;
      if (!isRecord(responses)) continue;
      for (const [code, response] of Object.entries(responses)) {
        const responsePointer = `${opPointer}/responses/${escapePointerSegment(code)}`;
        for (const { header, pointer: headerPointer } of headersOf(response, responsePointer)) {
          yield* walkSchema(header.schema, `${headerPointer}/schema`, 'inline', undefined, seen);
        }
      }
    }
  }
  if (components && isRecord(components.responses)) {
    for (const [code, response] of Object.entries(components.responses)) {
      const responsePointer = buildPointer(['components', 'responses', code]);
      for (const { header, pointer: headerPointer } of headersOf(response, responsePointer)) {
        yield* walkSchema(header.schema, `${headerPointer}/schema`, 'inline', undefined, seen);
      }
    }
  }
  for (const { mediaType, pointer } of walkMediaTypes(analysis)) {
    yield* walkSchema(mediaType.schema, `${pointer}/schema`, 'inline', undefined, seen);
    yield* walkSchema(mediaType.itemSchema, `${pointer}/itemSchema`, 'inline', undefined, seen);
  }
}
