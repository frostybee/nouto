import { buildPointer } from '../pointer';
import { OPENAPI_OPERATION_METHODS } from '../types';
import type { OpenApiNodeKind, NodeKindClassification } from './types';

/**
 * Fixed sections of the Components Object, mapped to the node kind of the
 * objects they hold. Keys mirror the OpenAPI specification's Components Object
 * fixed fields (the same vocabulary the outline's component presets use).
 */
const COMPONENT_SECTION_KIND: Record<string, OpenApiNodeKind> = {
  schemas: 'Schema',
  responses: 'Response',
  parameters: 'Parameter',
  examples: 'Example',
  requestBodies: 'RequestBody',
  headers: 'Header',
  securitySchemes: 'SecurityScheme',
  links: 'Link',
  callbacks: 'Callback',
  pathItems: 'PathItem',
};

/** Schema keywords whose value is a *map* of Schema Objects. */
const SCHEMA_MAP_KEYWORDS = new Set(['properties', 'patternProperties', 'dependentSchemas', '$defs']);
/** Schema keywords whose value is a single nested Schema Object. */
const SCHEMA_SINGLE_KEYWORDS = new Set([
  'items',
  'additionalProperties',
  'additionalItems',
  'not',
  'contains',
  'propertyNames',
  'unevaluatedItems',
  'unevaluatedProperties',
  'if',
  'then',
  'else',
  'contentSchema',
]);
/** Schema keywords whose value is an *array* of Schema Objects. */
const SCHEMA_ARRAY_KEYWORDS = new Set(['allOf', 'oneOf', 'anyOf', 'prefixItems']);

/**
 * Internal transitional states used while walking pointer segments. They stand
 * for "inside a map/array whose entries are of a given kind"; the next segment
 * (a dynamic key or index) resolves them to a real node kind. Any transitional
 * state left over at the end of the walk normalizes to `Unknown` — the cursor
 * sits on a container of user-named entries, which has no curated keys.
 */
type WalkState = OpenApiNodeKind | InternalState;
type InternalState =
  | '__ServerArray'
  | '__TagArray'
  | '__ParameterArray'
  | '__AdditionalOpMap'
  | '__MediaTypeMap'
  | '__EncodingMap'
  | '__HeaderMap'
  | '__ExampleMap'
  | '__LinkMap'
  | '__CallbackMap'
  | '__ComponentSection'
  | '__ServerVariableMap'
  | '__SchemaMap'
  | '__SchemaArray';

function normalize(state: WalkState): OpenApiNodeKind {
  return (state as string).startsWith('__') ? 'Unknown' : (state as OpenApiNodeKind);
}

/**
 * Classifies the OpenAPI node kind at a JSON Pointer, using only the pointer's
 * segments — no parsed document required. Every branch is decided structurally
 * by the parent keyword, including Schema recursion (a Schema under
 * `properties`/`items`/`allOf`/… is still a Schema, to unbounded depth).
 *
 * The empty pointer (`[]`) is the document root.
 */
export function classifyPointer(segments: readonly string[]): NodeKindClassification {
  let state: WalkState = 'Root';
  let section: string | undefined;

  for (const seg of segments) {
    switch (state) {
      case 'Root':
        state =
          seg === 'info' ? 'Info'
          : seg === 'paths' || seg === 'webhooks' ? 'Paths'
          : seg === 'components' ? 'Components'
          : seg === 'servers' ? '__ServerArray'
          : seg === 'security' ? 'SecurityRequirement'
          : seg === 'tags' ? '__TagArray'
          : seg === 'externalDocs' ? 'ExternalDocs'
          : 'Unknown';
        break;

      case 'Info':
        state = seg === 'contact' ? 'Contact' : seg === 'license' ? 'License' : 'Unknown';
        break;

      case 'Paths':
        // seg is a path template or webhook name (dynamic).
        state = 'PathItem';
        break;

      case 'PathItem':
        state =
          OPENAPI_OPERATION_METHODS.includes(seg as (typeof OPENAPI_OPERATION_METHODS)[number]) ? 'Operation'
          : seg === 'additionalOperations' ? '__AdditionalOpMap'
          : seg === 'parameters' ? '__ParameterArray'
          : seg === 'servers' ? '__ServerArray'
          : 'Unknown';
        break;

      case '__AdditionalOpMap':
        // seg is an arbitrary HTTP method name (dynamic).
        state = 'Operation';
        break;

      case '__ParameterArray':
        state = 'Parameter';
        break;

      case '__ServerArray':
        state = 'Server';
        break;

      case '__TagArray':
        state = 'Tag';
        break;

      case 'Server':
        // `variables` is a map of ServerVariable; resolve on the next segment.
        state = seg === 'variables' ? '__ServerVariableMap' : 'Unknown';
        break;

      case '__ServerVariableMap':
        state = 'ServerVariable';
        break;

      case 'Operation':
        state =
          seg === 'parameters' ? '__ParameterArray'
          : seg === 'requestBody' ? 'RequestBody'
          : seg === 'responses' ? 'Responses'
          : seg === 'callbacks' ? '__CallbackMap'
          : seg === 'externalDocs' ? 'ExternalDocs'
          : seg === 'servers' ? '__ServerArray'
          : seg === 'security' ? 'SecurityRequirement'
          : 'Unknown';
        break;

      case 'Responses':
        // seg is a status code or 'default' (dynamic).
        state = 'Response';
        break;

      case 'RequestBody':
        state = seg === 'content' ? '__MediaTypeMap' : 'Unknown';
        break;

      case 'Response':
        state =
          seg === 'content' ? '__MediaTypeMap'
          : seg === 'headers' ? '__HeaderMap'
          : seg === 'links' ? '__LinkMap'
          : 'Unknown';
        break;

      case 'Parameter':
      case 'Header':
        state =
          seg === 'content' ? '__MediaTypeMap'
          : seg === 'schema' ? 'Schema'
          : seg === 'examples' ? '__ExampleMap'
          : 'Unknown';
        break;

      case '__MediaTypeMap':
        // seg is a media-type string (dynamic).
        state = 'MediaType';
        break;

      case 'MediaType':
        state =
          seg === 'schema' ? 'Schema'
          : seg === 'examples' ? '__ExampleMap'
          : seg === 'encoding' ? '__EncodingMap'
          : 'Unknown';
        break;

      case '__EncodingMap':
        state = 'Encoding';
        break;

      case 'Encoding':
        state = seg === 'headers' ? '__HeaderMap' : 'Unknown';
        break;

      case '__HeaderMap':
        state = 'Header';
        break;

      case '__ExampleMap':
        state = 'Example';
        break;

      case '__LinkMap':
        state = 'Link';
        break;

      case '__CallbackMap':
        state = 'Callback';
        break;

      case 'Callback':
        // seg is a runtime expression (dynamic); its value is a PathItem.
        state = 'PathItem';
        break;

      case 'Components':
        if (Object.prototype.hasOwnProperty.call(COMPONENT_SECTION_KIND, seg)) {
          state = '__ComponentSection';
          section = seg;
        } else {
          state = 'Unknown';
        }
        break;

      case '__ComponentSection':
        // seg is a component name (dynamic).
        state = COMPONENT_SECTION_KIND[section as string] ?? 'Unknown';
        section = undefined;
        break;

      case 'SecurityScheme':
        state = seg === 'flows' ? 'OAuthFlows' : 'Unknown';
        break;

      case 'OAuthFlows':
        // seg is implicit / password / clientCredentials / authorizationCode.
        state = 'OAuthFlow';
        break;

      case 'Schema':
        state =
          SCHEMA_MAP_KEYWORDS.has(seg) ? '__SchemaMap'
          : SCHEMA_SINGLE_KEYWORDS.has(seg) ? 'Schema'
          : SCHEMA_ARRAY_KEYWORDS.has(seg) ? '__SchemaArray'
          : seg === 'discriminator' ? 'Discriminator'
          : seg === 'xml' ? 'XML'
          : seg === 'externalDocs' ? 'ExternalDocs'
          : 'Unknown';
        break;

      case '__SchemaMap':
        // seg is a property name (dynamic) — the recursive step.
        state = 'Schema';
        break;

      case '__SchemaArray':
        // seg is a numeric index — the recursive step.
        state = 'Schema';
        break;

      default:
        state = 'Unknown';
    }
  }

  return { kind: normalize(state), pointer: buildPointer(segments), section };
}
