/**
 * Output half of the contract generator: merging colliding (method, path)
 * operations, rendering NormalizedOperations into OpenAPI objects, and
 * operation-id generation.
 */
import { inferJsonSchemaFromSamples } from '../schemaInference';
import type {
  NormalizedBody,
  NormalizedOperation,
  NormalizedParam,
  NormalizedResponseGroup,
} from '../types';
import { addResponseSample, MAX_SAMPLES_PER_GROUP, uniqueName } from './normalize';

// --------------------------------------------------------------------------
// Operation merging
// --------------------------------------------------------------------------

export function mergeCollidingOperations(operations: NormalizedOperation[]): NormalizedOperation[] {
  const groups = new Map<string, NormalizedOperation[]>();
  for (const operation of operations) {
    const key = `${operation.method} ${operation.path}`;
    const group = groups.get(key);
    if (group) group.push(operation);
    else groups.set(key, [operation]);
  }
  return [...groups.values()].map((group) => (group.length === 1 ? group[0] : mergeGroup(group)));
}

function mergeGroup(group: NormalizedOperation[]): NormalizedOperation {
  const [first] = group;

  const security: NormalizedOperation['security'] = [];
  for (const operation of group) {
    for (const scheme of operation.security) {
      if (!security.some((s) => s.key === scheme.key)) security.push(scheme);
    }
  }

  const responses: NormalizedResponseGroup[] = [];
  for (const operation of group) {
    for (const response of operation.responses) {
      for (const sample of response.samples.length ? response.samples : [undefined]) {
        addResponseSample(responses, response.status, response.contentType, sample, response.description);
      }
    }
  }

  return {
    method: first.method,
    rawPath: first.rawPath,
    path: first.path,
    pathParams: mergeParams(group.map((o) => o.pathParams), true),
    queryParams: mergeParams(group.map((o) => o.queryParams)),
    headerParams: mergeParams(group.map((o) => o.headerParams)),
    tags: [...new Set(group.flatMap((o) => o.tags))],
    summary: first.summary,
    server: group.find((o) => o.server)?.server,
    requestBody: mergeBodies(group),
    responses,
    security,
    warnings: [
      ...new Set(group.flatMap((o) => o.warnings)),
      `merged ${group.length} source requests into one operation`,
    ],
  };
}

/** Union by name; required only when present (and required) in every contributor. */
function mergeParams(lists: NormalizedParam[][], forceRequired = false): NormalizedParam[] {
  const merged = new Map<string, NormalizedParam>();
  for (const list of lists) {
    for (const param of list) {
      const existing = merged.get(param.name);
      if (existing) {
        existing.example ??= param.example;
        existing.description ??= param.description;
      } else {
        merged.set(param.name, { ...param });
      }
    }
  }
  if (!forceRequired) {
    for (const param of merged.values()) {
      param.required =
        param.required && lists.every((list) => list.some((p) => p.name === param.name && p.required));
    }
  }
  return [...merged.values()];
}

function mergeBodies(group: NormalizedOperation[]): NormalizedBody | undefined {
  const bodies = group.map((o) => o.requestBody).filter((b): b is NormalizedBody => !!b);
  if (!bodies.length) return undefined;
  const [first] = bodies;
  const matching = bodies.filter((b) => b.contentType === first.contentType);
  const fileFields = [...new Set(matching.flatMap((b) => b.fileFields ?? []))];
  return {
    contentType: first.contentType,
    samples: matching.flatMap((b) => b.samples).slice(0, MAX_SAMPLES_PER_GROUP),
    rawExampleText: matching.find((b) => b.rawExampleText !== undefined)?.rawExampleText,
    fileFields: fileFields.length ? fileFields : undefined,
  };
}

// --------------------------------------------------------------------------
// Rendering
// --------------------------------------------------------------------------

const EXPORT_DIALECT = { dialect: '3.1' } as const;

export function renderOperation(
  operation: NormalizedOperation,
  operationId: string,
  includeSecurity: boolean,
  schemeNames: Map<string, string>
): Record<string, unknown> {
  const rendered: Record<string, unknown> = { operationId };
  if (operation.summary) rendered.summary = operation.summary;
  if (operation.tags.length) rendered.tags = operation.tags;

  const parameters = [
    ...operation.pathParams.map((p) => renderParam(p, 'path')),
    ...operation.queryParams.map((p) => renderParam(p, 'query')),
    ...operation.headerParams.map((p) => renderParam(p, 'header')),
  ];
  if (parameters.length) rendered.parameters = parameters;
  if (operation.requestBody) rendered.requestBody = renderBody(operation.requestBody);
  rendered.responses = renderResponses(operation.responses);
  if (includeSecurity && operation.security.length) {
    rendered.security = operation.security.map((s) => ({ [schemeNames.get(s.key)!]: [] }));
  }
  return rendered;
}

function renderParam(param: NormalizedParam, location: 'path' | 'query' | 'header'): Record<string, unknown> {
  const rendered: Record<string, unknown> = {
    name: param.name,
    in: location,
    // Path parameters MUST be required per the spec.
    required: location === 'path' ? true : param.required,
    schema: { type: 'string' },
  };
  if (param.description) rendered.description = param.description;
  if (param.example) rendered.example = param.example;
  return rendered;
}

function renderBody(body: NormalizedBody): Record<string, unknown> {
  return { content: { [body.contentType]: renderMedia(body) } };
}

function renderMedia(body: NormalizedBody): Record<string, unknown> {
  const media: Record<string, unknown> = { schema: mediaSchema(body) };
  if (body.samples.length) media.example = body.samples[0];
  else if (body.rawExampleText !== undefined) media.example = body.rawExampleText;
  return media;
}

function mediaSchema(body: NormalizedBody): Record<string, unknown> {
  if (body.contentType === 'application/octet-stream') {
    return { type: 'string', format: 'binary' };
  }
  if (body.samples.length) {
    const schema = inferJsonSchemaFromSamples(body.samples, EXPORT_DIALECT);
    for (const field of body.fileFields ?? []) {
      const properties = schema.properties as Record<string, unknown> | undefined;
      if (properties?.[field]) properties[field] = { type: 'string', format: 'binary' };
    }
    return schema;
  }
  if (body.contentType === 'application/json') return {};
  return { type: 'string' };
}

function renderResponses(groups: NormalizedResponseGroup[]): Record<string, unknown> {
  // A Responses Object must have at least one entry to round-trip validly.
  const effective = groups.length
    ? groups
    : [{ status: 200 as const, description: undefined, contentType: undefined, samples: [] }];

  const responses: Record<string, unknown> = {};
  for (const group of effective) {
    const key = group.status === 'default' ? 'default' : String(group.status);
    const response: Record<string, unknown> = {
      description: group.description ?? defaultStatusDescription(group.status),
    };
    if (group.contentType && group.samples.length) {
      response.content = {
        [group.contentType]: {
          schema: inferJsonSchemaFromSamples(group.samples, EXPORT_DIALECT),
          example: group.samples[0],
        },
      };
    }
    responses[key] = response;
  }
  return responses;
}

function defaultStatusDescription(status: number | 'default'): string {
  if (status === 'default') return 'Default response';
  if (status >= 200 && status < 300) return 'Successful response';
  if (status >= 400 && status < 500) return 'Client error';
  if (status >= 500) return 'Server error';
  return 'Response';
}

// --------------------------------------------------------------------------
// Operation ids
// --------------------------------------------------------------------------

/** `GET /users/{userId}` → `getUsersUserId`, deduped with numeric suffixes. */
export function buildOperationId(method: string, path: string, used: Set<string>): string {
  const pascal = path
    .split('/')
    .filter(Boolean)
    .map((segment) =>
      segment
        .replace(/[{}]/g, '')
        .split(/[-_.\s]+/)
        .filter(Boolean)
        .map((word) => (word[0] ?? '').toUpperCase() + word.slice(1))
        .join('')
        .replace(/[^A-Za-z0-9]/g, '')
    )
    .join('');
  const base = `${method.toLowerCase()}${pascal || 'Root'}`;
  const id = uniqueName(base, used);
  used.add(id);
  return id;
}
