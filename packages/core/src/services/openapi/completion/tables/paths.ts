import type { NodeKindTable } from '../types';

/**
 * Curated completion tables for path-level objects: Path Item, Operation,
 * Parameter, Request Body, Media Type, Encoding, Response, Header, Example and
 * Link. Authored from the OpenAPI Specification per version.
 */

const pathItemTable: NodeKindTable = {
  kind: 'PathItem',
  properties: [
    { name: '$ref', docs: 'Reference to an external definition of this Path Item.', insertKind: 'scalar' },
    { name: 'summary', docs: 'An optional summary intended to apply to all operations in this path.', insertKind: 'scalar' },
    { name: 'description', docs: 'An optional description intended to apply to all operations in this path.', insertKind: 'scalar' },
    { name: 'get', docs: 'A definition of a GET operation on this path.', insertKind: 'object' },
    { name: 'put', docs: 'A definition of a PUT operation on this path.', insertKind: 'object' },
    { name: 'post', docs: 'A definition of a POST operation on this path.', insertKind: 'object' },
    { name: 'delete', docs: 'A definition of a DELETE operation on this path.', insertKind: 'object' },
    { name: 'options', docs: 'A definition of an OPTIONS operation on this path.', insertKind: 'object' },
    { name: 'head', docs: 'A definition of a HEAD operation on this path.', insertKind: 'object' },
    { name: 'patch', docs: 'A definition of a PATCH operation on this path.', insertKind: 'object' },
    { name: 'trace', docs: 'A definition of a TRACE operation on this path.', insertKind: 'object' },
    { name: 'query', docs: 'A definition of a QUERY operation on this path.', insertKind: 'object', sinceVersion: '3.2' },
    { name: 'additionalOperations', docs: 'A map of additional HTTP methods to Operation Objects, for methods beyond the fixed set.', insertKind: 'object', sinceVersion: '3.2' },
    { name: 'servers', docs: 'An alternative `servers` array to service all operations in this path.', insertKind: 'array', snippetBody: '\n  - url: $1' },
    { name: 'parameters', docs: 'A list of parameters applicable to all operations under this path.', insertKind: 'array', snippetBody: '\n  - name: $1\n    in: ${2|query,header,path,cookie|}\n    required: ${3|true,false|}\n    schema:\n      type: $4' },
  ],
};

const operationTable: NodeKindTable = {
  kind: 'Operation',
  properties: [
    { name: 'tags', docs: 'A list of tags for API documentation control, used to group operations.', insertKind: 'array', snippetBody: '\n  - $0' },
    { name: 'summary', docs: 'A short summary of what the operation does.', insertKind: 'scalar' },
    { name: 'description', docs: 'A verbose explanation of the operation behavior. CommonMark syntax MAY be used.', insertKind: 'scalar' },
    { name: 'externalDocs', docs: 'Additional external documentation for this operation.', insertKind: 'object', snippetBody: '\n  url: $1' },
    { name: 'operationId', docs: 'A unique string used to identify the operation.', insertKind: 'scalar' },
    { name: 'parameters', docs: 'A list of parameters applicable for this operation.', insertKind: 'array', snippetBody: '\n  - name: $1\n    in: ${2|query,header,path,cookie|}\n    required: ${3|true,false|}\n    schema:\n      type: $4' },
    { name: 'requestBody', docs: 'The request body applicable for this operation.', insertKind: 'object', snippetBody: '\n  content:\n    application/json:\n      schema:\n        type: $1' },
    { name: 'responses', docs: 'The list of possible responses returned from executing this operation.', insertKind: 'object', snippetBody: "\n  '${1:200}':\n    description: ${2:OK}" },
    { name: 'callbacks', docs: 'A map of possible out-of-band callbacks related to the parent operation.', insertKind: 'object' },
    { name: 'deprecated', docs: 'Declares this operation to be deprecated.', insertKind: 'enum-value', enumValues: [{ value: 'true' }, { value: 'false' }] },
    { name: 'security', docs: 'A declaration of which security mechanisms can be used for this operation.', insertKind: 'array' },
    { name: 'servers', docs: 'An alternative `servers` array to service this operation.', insertKind: 'array', snippetBody: '\n  - url: $1' },
  ],
};

const parameterTable: NodeKindTable = {
  kind: 'Parameter',
  properties: [
    { name: 'name', docs: 'The name of the parameter. Case-sensitive; for `path` it must match a template segment.', insertKind: 'scalar', required: true },
    { name: 'in', docs: 'The location of the parameter. `querystring` (3.2) describes the whole query string as one parameter and cannot be combined with `query` parameters.', insertKind: 'enum-value', required: true, enumValues: [{ value: 'query' }, { value: 'header' }, { value: 'path' }, { value: 'cookie' }, { value: 'querystring', docs: 'The entire query string as a single parameter, serialized via `content`. Only one per operation and no `in: query` alongside.', sinceVersion: '3.2' }] },
    { name: 'description', docs: 'A brief description of the parameter. CommonMark syntax MAY be used.', insertKind: 'scalar' },
    { name: 'required', docs: 'Whether this parameter is mandatory. For `path` parameters this must be `true`.', insertKind: 'enum-value', enumValues: [{ value: 'true' }, { value: 'false' }] },
    { name: 'deprecated', docs: 'Specifies that a parameter is deprecated and SHOULD be phased out.', insertKind: 'enum-value', enumValues: [{ value: 'true' }, { value: 'false' }] },
    { name: 'allowEmptyValue', docs: 'Allows sending an empty-valued parameter. Only valid for `query` parameters.', insertKind: 'enum-value', enumValues: [{ value: 'true' }, { value: 'false' }] },
    { name: 'style', docs: 'Describes how the parameter value is serialized depending on its type.', insertKind: 'enum-value', enumValues: [{ value: 'matrix' }, { value: 'label' }, { value: 'form' }, { value: 'simple' }, { value: 'spaceDelimited' }, { value: 'pipeDelimited' }, { value: 'deepObject' }] },
    { name: 'explode', docs: 'When true, array/object values generate separate parameters per value.', insertKind: 'enum-value', enumValues: [{ value: 'true' }, { value: 'false' }] },
    { name: 'allowReserved', docs: 'Allows reserved characters `:/?#[]@!$&\'()*+,;=` in `query` parameter values.', insertKind: 'enum-value', enumValues: [{ value: 'true' }, { value: 'false' }] },
    { name: 'schema', docs: 'The schema defining the type used for the parameter.', insertKind: 'object' },
    { name: 'content', docs: 'A map containing the representations for the parameter. Mutually exclusive with `schema`.', insertKind: 'object' },
    { name: 'example', docs: 'An example of the parameter value. Mutually exclusive with `examples`.', insertKind: 'scalar' },
    { name: 'examples', docs: 'Examples of the parameter value. Mutually exclusive with `example`.', insertKind: 'object' },
  ],
};

const requestBodyTable: NodeKindTable = {
  kind: 'RequestBody',
  properties: [
    { name: 'description', docs: 'A brief description of the request body. CommonMark syntax MAY be used.', insertKind: 'scalar' },
    { name: 'content', docs: 'The content of the request body, as a map of media type to Media Type Object.', insertKind: 'object', required: true, snippetBody: '\n  application/json:\n    schema:\n      type: $1' },
    { name: 'required', docs: 'Determines if the request body is required in the request. Defaults to false.', insertKind: 'enum-value', enumValues: [{ value: 'true' }, { value: 'false' }] },
  ],
};

const mediaTypeTable: NodeKindTable = {
  kind: 'MediaType',
  properties: [
    { name: 'description', docs: 'A description of this media type usage. CommonMark syntax MAY be used.', insertKind: 'scalar', sinceVersion: '3.2' },
    { name: 'schema', docs: 'The schema defining the content of the request, response, parameter or header.', insertKind: 'object' },
    { name: 'example', docs: 'An example of the media type. Mutually exclusive with `examples`.', insertKind: 'scalar' },
    { name: 'examples', docs: 'Examples of the media type. Mutually exclusive with `example`.', insertKind: 'object' },
    { name: 'encoding', docs: 'A map between a property name and its encoding information.', insertKind: 'object' },
    { name: 'itemSchema', docs: 'Schema for the items of a sequential media type (e.g. JSON Lines).', insertKind: 'object', sinceVersion: '3.2' },
    { name: 'prefixEncoding', docs: 'Positional Encoding Objects for array items. Mutually exclusive with `encoding`.', insertKind: 'array', sinceVersion: '3.2' },
    { name: 'itemEncoding', docs: 'An Encoding Object applied to each item of a sequential media type. Mutually exclusive with `encoding`.', insertKind: 'object', sinceVersion: '3.2' },
  ],
};

const encodingTable: NodeKindTable = {
  kind: 'Encoding',
  properties: [
    { name: 'contentType', docs: 'The Content-Type for encoding a specific property.', insertKind: 'scalar' },
    { name: 'headers', docs: 'A map of additional headers, e.g. `Content-Disposition`.', insertKind: 'object' },
    { name: 'style', docs: 'Describes how a specific property value is serialized depending on its type.', insertKind: 'enum-value', enumValues: [{ value: 'form' }, { value: 'spaceDelimited' }, { value: 'pipeDelimited' }, { value: 'deepObject' }] },
    { name: 'explode', docs: 'When true, array/object values generate separate parameters per value.', insertKind: 'enum-value', enumValues: [{ value: 'true' }, { value: 'false' }] },
    { name: 'allowReserved', docs: 'Allows reserved characters in the parameter value.', insertKind: 'enum-value', enumValues: [{ value: 'true' }, { value: 'false' }] },
    { name: 'encoding', docs: 'A map of nested encoding information for the parts of a structured value.', insertKind: 'object', sinceVersion: '3.2' },
    { name: 'prefixEncoding', docs: 'Positional nested Encoding Objects for array items. Mutually exclusive with `encoding`.', insertKind: 'array', sinceVersion: '3.2' },
    { name: 'itemEncoding', docs: 'A nested Encoding Object applied to each item. Mutually exclusive with `encoding`.', insertKind: 'object', sinceVersion: '3.2' },
  ],
};

const responseTable: NodeKindTable = {
  kind: 'Response',
  properties: [
    { name: 'summary', docs: 'A short summary of the meaning of the response.', insertKind: 'scalar', sinceVersion: '3.2' },
    { name: 'description', docs: 'A description of the response. CommonMark syntax MAY be used. Required.', insertKind: 'scalar', required: true },
    { name: 'headers', docs: 'Maps a header name to its definition (the `Content-Type` header is ignored).', insertKind: 'object' },
    { name: 'content', docs: 'A map of media type to Media Type Object describing the response payloads.', insertKind: 'object' },
    { name: 'links', docs: 'A map of operations links that can be followed from the response.', insertKind: 'object' },
  ],
};

const headerTable: NodeKindTable = {
  kind: 'Header',
  properties: [
    { name: 'description', docs: 'A brief description of the header. CommonMark syntax MAY be used.', insertKind: 'scalar' },
    { name: 'required', docs: 'Determines whether this header is mandatory.', insertKind: 'enum-value', enumValues: [{ value: 'true' }, { value: 'false' }] },
    { name: 'deprecated', docs: 'Specifies that the header is deprecated and SHOULD be phased out.', insertKind: 'enum-value', enumValues: [{ value: 'true' }, { value: 'false' }] },
    { name: 'style', docs: 'Describes how the header value is serialized. For headers only `simple` is allowed.', insertKind: 'enum-value', enumValues: [{ value: 'simple' }] },
    { name: 'explode', docs: 'When true, array/object values generate separate values.', insertKind: 'enum-value', enumValues: [{ value: 'true' }, { value: 'false' }] },
    { name: 'allowReserved', docs: 'Allows reserved characters in the header value without percent-encoding.', insertKind: 'enum-value', sinceVersion: '3.2', enumValues: [{ value: 'true' }, { value: 'false' }] },
    { name: 'schema', docs: 'The schema defining the type used for the header.', insertKind: 'object' },
    { name: 'content', docs: 'A map containing the representations for the header. Mutually exclusive with `schema`.', insertKind: 'object' },
    { name: 'example', docs: 'An example of the header value. Mutually exclusive with `examples`.', insertKind: 'scalar' },
    { name: 'examples', docs: 'Examples of the header value. Mutually exclusive with `example`.', insertKind: 'object' },
  ],
};

const exampleTable: NodeKindTable = {
  kind: 'Example',
  properties: [
    { name: 'summary', docs: 'A short description for the example.', insertKind: 'scalar' },
    { name: 'description', docs: 'A long description for the example. CommonMark syntax MAY be used.', insertKind: 'scalar' },
    { name: 'dataValue', docs: 'An example of the data structure that MUST be valid according to the relevant schema. Mutually exclusive with `serializedValue`, `value` and `externalValue`.', insertKind: 'scalar', sinceVersion: '3.2' },
    { name: 'serializedValue', docs: 'An example of the serialized form of the value, including encoding and escaping. Mutually exclusive with `dataValue`, `value` and `externalValue`.', insertKind: 'scalar', sinceVersion: '3.2' },
    { name: 'value', docs: 'The embedded literal example. Mutually exclusive with `externalValue`.', insertKind: 'scalar' },
    { name: 'externalValue', docs: 'A URI that points to the literal example. Mutually exclusive with `value`.', insertKind: 'scalar' },
  ],
};

const linkTable: NodeKindTable = {
  kind: 'Link',
  properties: [
    { name: 'operationRef', docs: 'A URI reference to an operation. Mutually exclusive with `operationId`.', insertKind: 'scalar' },
    { name: 'operationId', docs: 'The name of an existing, resolvable operation. Mutually exclusive with `operationRef`.', insertKind: 'scalar' },
    { name: 'parameters', docs: 'A map of parameters to pass to the linked operation, keyed by parameter name.', insertKind: 'object' },
    { name: 'requestBody', docs: 'A literal value or expression to use as the request body of the linked operation.', insertKind: 'scalar' },
    { name: 'description', docs: 'A description of the link. CommonMark syntax MAY be used.', insertKind: 'scalar' },
    { name: 'server', docs: 'A server object to be used by the target operation.', insertKind: 'object' },
  ],
};

export const pathTables: NodeKindTable[] = [
  pathItemTable,
  operationTable,
  parameterTable,
  requestBodyTable,
  mediaTypeTable,
  encodingTable,
  responseTable,
  headerTable,
  exampleTable,
  linkTable,
];
