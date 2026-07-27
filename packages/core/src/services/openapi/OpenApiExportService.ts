import type {
  Collection,
  CollectionItem,
  SavedRequest,
  AuthState,
  BodyState,
  KeyValue,
  PathParam,
  EnvironmentVariable,
} from '../../types';
import { isFolder, isRequest } from '../../types';
import {
  getItemPath,
  resolveAuthForRequest,
  resolveHeadersForRequest,
  resolveVariablesForRequest,
} from '../InheritanceService';
import { parseHarEntries, decodeHarContent } from '../harParsing';
import type { HarEntry } from '../harParsing';
import { classifyPathSegment, inferJsonSchemaFromSamples } from './schemaInference';
import type {
  NormalizedBody,
  NormalizedOperation,
  NormalizedParam,
  NormalizedResponseGroup,
  NormalizedSecurity,
  OpenApiExportOptions,
  OpenApiExportResult,
} from './types';

/**
 * Contract generator — the reverse of OpenApiImportService: emits an OpenAPI
 * 3.1 document from a Nouto collection or a HAR file. Both sources funnel
 * into a shared NormalizedOperation pipeline, so templating, merging, and
 * document assembly behave identically regardless of origin.
 *
 * Heuristics are deliberately conservative (v1): concrete numeric/UUID path
 * segments template to named parameters, colliding (method, path) sources
 * merge into one operation, body/response schemas come from multi-sample
 * inference, and auth maps only to standard security schemes (AWS SigV4 and
 * NTLM have none — those requests export without security, with a warning).
 */
export class OpenApiExportService {
  fromCollection(collection: Collection, options?: OpenApiExportOptions): OpenApiExportResult {
    const documentWarnings: string[] = [];
    const operations = this.collectFromCollection(collection, documentWarnings);
    if (!operations.length) documentWarnings.push('Collection contains no exportable requests');
    return this.buildDocument(
      operations,
      options?.title ?? collection.name,
      options?.version ?? '1.0.0',
      documentWarnings
    );
  }

  fromHar(harContent: string, options?: OpenApiExportOptions): OpenApiExportResult {
    const { entries } = parseHarEntries(harContent);
    const documentWarnings: string[] = [];
    const operations = this.collectFromHar(entries, documentWarnings);
    if (!operations.length) documentWarnings.push('HAR file contains no exportable requests');
    return this.buildDocument(
      operations,
      options?.title ?? 'HAR-derived API',
      options?.version ?? '1.0.0',
      documentWarnings
    );
  }

  // ------------------------------------------------------------------------
  // Collection source
  // ------------------------------------------------------------------------

  private collectFromCollection(collection: Collection, documentWarnings: string[]): NormalizedOperation[] {
    const operations: NormalizedOperation[] = [];
    const walk = (items: CollectionItem[], folderName: string | undefined) => {
      for (const item of items) {
        if (isFolder(item)) {
          walk(item.children, item.name);
        } else if (isRequest(item)) {
          const operation = this.normalizeRequest(collection, item, folderName, documentWarnings);
          if (operation) operations.push(operation);
        }
      }
    };
    walk(collection.items, undefined);
    return operations;
  }

  private normalizeRequest(
    collection: Collection,
    request: SavedRequest,
    folderName: string | undefined,
    documentWarnings: string[]
  ): NormalizedOperation | undefined {
    const method = (request.method || 'GET').toUpperCase();
    if (!EXPORTABLE_METHODS.has(method.toLowerCase())) {
      documentWarnings.push(`${method} ${request.url}: method has no OpenAPI 3.1 operation key; skipped`);
      return undefined;
    }

    const warnings: string[] = [];
    const ancestors = getItemPath(collection, request.id);
    const { auth } = resolveAuthForRequest(collection, ancestors, request);
    const headers = resolveHeadersForRequest(collection, ancestors, request);
    const variables = toVariableMap(resolveVariablesForRequest(collection, ancestors));

    const url = substituteVariables(request.url ?? '', variables);
    const { server, pathname, embeddedQuery } = splitUrl(url, warnings);
    const { path, params: pathParams } = templatePath(pathname, request.pathParams);

    const queryParams = [
      ...(request.params ?? []).map((p) => keyValueToParam(p, variables)),
      ...embeddedQuery,
    ];
    const headerParams = headers
      .filter((h) => h.enabled && h.key && !IGNORED_HEADER_PARAMS.has(h.key.toLowerCase()))
      .map((h) => keyValueToParam(h, variables));

    const security: NormalizedSecurity[] = [];
    const scheme = buildSecurityScheme(auth, warnings);
    if (scheme) security.push(scheme);

    return {
      method,
      rawPath: pathname,
      path,
      pathParams,
      queryParams: dedupeParams(queryParams),
      headerParams: dedupeParams(headerParams),
      tags: folderName ? [folderName] : [],
      summary: request.name || undefined,
      server,
      requestBody: this.mapBody(request.body, variables, warnings),
      responses: responsesFromExamples(request),
      security,
      warnings,
    };
  }

  private mapBody(
    body: BodyState | undefined,
    variables: Map<string, string>,
    warnings: string[]
  ): NormalizedBody | undefined {
    if (!body || body.type === 'none') return undefined;
    const content = substituteVariables(body.content ?? '', variables);

    switch (body.type) {
      case 'json': {
        if (!content.trim()) return undefined;
        try {
          return { contentType: 'application/json', samples: [JSON.parse(content)] };
        } catch {
          warnings.push('request body is not valid JSON; exported without a schema');
          return { contentType: 'application/json', samples: [], rawExampleText: content };
        }
      }
      case 'graphql': {
        warnings.push('GraphQL operation exported as a generic JSON request body');
        let graphqlVariables: unknown = {};
        if (body.graphqlVariables) {
          try {
            graphqlVariables = JSON.parse(body.graphqlVariables);
          } catch {
            // Unparseable variables — keep the empty object.
          }
        }
        return {
          contentType: 'application/json',
          samples: [{ query: content, variables: graphqlVariables }],
        };
      }
      case 'form-data':
      case 'x-www-form-urlencoded': {
        const contentType =
          body.type === 'form-data' ? 'multipart/form-data' : 'application/x-www-form-urlencoded';
        const { fields, fileFields } = parseFormFields(content);
        if (!Object.keys(fields).length) return { contentType, samples: [] };
        return {
          contentType,
          samples: [fields],
          fileFields: fileFields.length ? fileFields : undefined,
        };
      }
      case 'binary':
        return { contentType: 'application/octet-stream', samples: [] };
      case 'xml':
        return { contentType: 'application/xml', samples: [], rawExampleText: content || undefined };
      default:
        return { contentType: 'text/plain', samples: [], rawExampleText: content || undefined };
    }
  }

  // ------------------------------------------------------------------------
  // HAR source
  // ------------------------------------------------------------------------

  private collectFromHar(entries: HarEntry[], documentWarnings: string[]): NormalizedOperation[] {
    const domains = new Set<string>();
    for (const entry of entries) {
      try {
        domains.add(new URL(entry.request.url).hostname);
      } catch {
        domains.add('Unknown');
      }
    }
    const tagByDomain = domains.size > 1;

    const operations: NormalizedOperation[] = [];
    for (const entry of entries) {
      const operation = this.normalizeHarEntry(entry, tagByDomain, documentWarnings);
      if (operation) operations.push(operation);
    }
    return operations;
  }

  private normalizeHarEntry(
    entry: HarEntry,
    tagByDomain: boolean,
    documentWarnings: string[]
  ): NormalizedOperation | undefined {
    const request = entry.request;
    const method = (request.method || 'GET').toUpperCase();
    if (!EXPORTABLE_METHODS.has(method.toLowerCase())) {
      documentWarnings.push(`${method} ${request.url}: method has no OpenAPI 3.1 operation key; skipped`);
      return undefined;
    }

    const warnings: string[] = [];
    const { server, pathname, embeddedQuery } = splitUrl(request.url ?? '', warnings);
    const { path, params: pathParams } = templatePath(pathname);

    let domain: string | undefined;
    try {
      domain = new URL(request.url).hostname;
    } catch {
      domain = 'Unknown';
    }

    const queryParams = [
      ...(request.queryString ?? []).map((q) => ({ name: q.name, required: true, example: q.value || undefined })),
      ...embeddedQuery,
    ].filter((p) => p.name);

    const headerParams: NormalizedParam[] = [];
    const security: NormalizedSecurity[] = [];
    for (const header of request.headers ?? []) {
      const name = header.name?.toLowerCase();
      if (name === 'authorization') {
        const scheme = securityFromAuthorizationHeader(header.value);
        if (scheme) security.push(scheme);
        continue;
      }
      if (!name || name.startsWith(':') || name.startsWith('sec-') || IGNORED_HAR_HEADERS.has(name)) continue;
      headerParams.push({ name: header.name, required: true, example: header.value || undefined });
    }

    return {
      method,
      rawPath: pathname,
      path,
      pathParams,
      queryParams: dedupeParams(queryParams),
      headerParams: dedupeParams(headerParams),
      tags: tagByDomain && domain ? [domain] : [],
      server,
      requestBody: harBody(request.postData, warnings),
      responses: harResponses(entry),
      security,
      warnings,
    };
  }

  // ------------------------------------------------------------------------
  // Document assembly
  // ------------------------------------------------------------------------

  private buildDocument(
    operations: NormalizedOperation[],
    title: string,
    version: string,
    documentWarnings: string[]
  ): OpenApiExportResult {
    const merged = mergeCollidingOperations(operations);

    // Deduped security schemes, named for components.securitySchemes.
    const schemeNames = new Map<string, string>();
    const securitySchemes: Record<string, unknown> = {};
    for (const operation of merged) {
      for (const { key, scheme } of operation.security) {
        if (schemeNames.has(key)) continue;
        const name = uniqueSchemeName(key, new Set(schemeNames.values()));
        schemeNames.set(key, name);
        securitySchemes[name] = scheme;
      }
    }

    // Hoist to global security only when every operation carries exactly the
    // same single scheme.
    const firstKey = merged[0]?.security[0]?.key;
    const hoist =
      merged.length > 0 &&
      firstKey !== undefined &&
      merged.every((op) => op.security.length === 1 && op.security[0].key === firstKey);

    const servers: { url: string }[] = [];
    for (const operation of merged) {
      if (operation.server && !servers.some((s) => s.url === operation.server!.url)) {
        servers.push(operation.server);
      }
    }
    if (merged.length && !servers.length) {
      documentWarnings.push('No server URL could be determined; the document has no servers entry');
    }

    const usedOperationIds = new Set<string>();
    const paths: Record<string, Record<string, unknown>> = {};
    const warnings: string[] = [...documentWarnings];
    for (const operation of merged) {
      const pathItem = (paths[operation.path] ??= {});
      pathItem[operation.method.toLowerCase()] = renderOperation(
        operation,
        buildOperationId(operation.method, operation.path, usedOperationIds),
        !hoist,
        schemeNames
      );
      warnings.push(...operation.warnings.map((w) => `${operation.method} ${operation.path}: ${w}`));
    }

    const document: Record<string, unknown> = {
      openapi: '3.1.0',
      info: { title, version },
    };
    if (servers.length) document.servers = servers;
    if (hoist) document.security = [{ [schemeNames.get(firstKey!)!]: [] }];
    document.paths = paths;
    if (Object.keys(securitySchemes).length) {
      document.components = { securitySchemes };
    }

    return { document, warnings: [...new Set(warnings)] };
  }
}

// --------------------------------------------------------------------------
// URL handling
// --------------------------------------------------------------------------

/** Methods with a fixed operation key in OpenAPI 3.1 (`query` is 3.2-only). */
const EXPORTABLE_METHODS = new Set([
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
]);

/** Headers that are never parameters (the spec reserves the first three). */
const IGNORED_HEADER_PARAMS = new Set(['content-type', 'accept', 'authorization', 'cookie']);

/** Browser/transport noise recorded in HARs that would pollute a contract. */
const IGNORED_HAR_HEADERS = new Set([
  ...IGNORED_HEADER_PARAMS,
  'accept-encoding',
  'accept-language',
  'cache-control',
  'connection',
  'content-length',
  'dnt',
  'host',
  'if-modified-since',
  'if-none-match',
  'origin',
  'pragma',
  'priority',
  'referer',
  'te',
  'upgrade-insecure-requests',
  'user-agent',
]);

interface SplitUrl {
  server?: { url: string };
  pathname: string;
  embeddedQuery: NormalizedParam[];
}

/**
 * Splits a (possibly variable-templated or scheme-less) URL into an origin
 * server, a pathname, and any query params embedded in the URL string.
 */
function splitUrl(url: string, warnings: string[]): SplitUrl {
  const bare = url.split(/[?#]/)[0];
  const queryText = url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#')[0] : '';
  const embeddedQuery = parseQueryText(queryText);

  if (bare.startsWith('/')) {
    return { pathname: bare, embeddedQuery };
  }

  // Second candidate covers scheme-less URLs like `localhost:3000/users`.
  for (const candidate of [bare, `http://${bare}`]) {
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
      if (!parsed.hostname || parsed.hostname.includes('{')) break;
      return {
        server: { url: parsed.origin },
        pathname: parsed.pathname,
        embeddedQuery,
      };
    } catch {
      // Try the next candidate, then fall through to the template handling.
    }
  }
  if (bare.includes('{')) {
    // e.g. `{{baseUrl}}/users` — the host is a template we cannot resolve.
    warnings.push('server omitted: URL host contains an unresolved variable');
    const slash = bare.indexOf('/');
    return { pathname: slash >= 0 ? bare.slice(slash) : '/', embeddedQuery };
  }
  warnings.push(`server omitted: URL could not be parsed (${bare || 'empty URL'})`);
  return { pathname: bare.startsWith('/') ? bare : `/${bare}`, embeddedQuery };
}

function parseQueryText(queryText: string): NormalizedParam[] {
  if (!queryText) return [];
  try {
    return [...new URLSearchParams(queryText).entries()].map(([name, value]) => ({
      name,
      required: true,
      example: value || undefined,
    }));
  } catch {
    return [];
  }
}

// --------------------------------------------------------------------------
// Path templating
// --------------------------------------------------------------------------

/**
 * Templates a concrete pathname into an OpenAPI path. Numeric/UUID segments
 * become `{param}` placeholders named after their preceding static segment
 * (`/orgs/7/users/42` → `/orgs/{orgId}/users/{userId}`); template segments
 * already present in the source (`{id}`, `{{var}}`, `:id`) are normalized to
 * OpenAPI style. Param names are unique within the path (spec requirement).
 */
function templatePath(
  pathname: string,
  pathParamRows?: PathParam[]
): { path: string; params: NormalizedParam[] } {
  const segments = pathname.split('/').filter(Boolean);
  const params: NormalizedParam[] = [];
  const usedNames = new Set<string>();
  const out: string[] = [];
  let lastStatic: string | undefined;

  for (const rawSegment of segments) {
    // `new URL()` percent-encodes braces in pathnames (`{id}` → `%7Bid%7D`) —
    // decode so template segments classify as params, not static text.
    let segment = rawSegment;
    try {
      segment = decodeURIComponent(rawSegment);
    } catch {
      // Malformed escape — classify the raw segment.
    }
    const cls = classifyPathSegment(segment);
    if (cls === 'static' || cls === 'version') {
      out.push(segment);
      if (cls === 'static') lastStatic = segment;
      continue;
    }

    let name: string;
    let example: string | undefined;
    if (cls === 'param') {
      name = sanitizeParamName(segment.replace(/^[{:]+|[}]+$/g, ''));
    } else {
      name = lastStatic ? idParamName(lastStatic) : 'id';
      example = segment;
    }
    name = uniqueName(name, usedNames);
    usedNames.add(name);

    const row = pathParamRows?.find((r) => r.key === name || `{${r.key}}` === segment);
    params.push({
      name,
      required: true,
      example: row?.value || example,
      description: row?.description || undefined,
    });
    out.push(`{${name}}`);
  }

  return { path: `/${out.join('/')}` || '/', params };
}

function sanitizeParamName(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9_]/g, '');
  return cleaned && !/^\d/.test(cleaned) ? cleaned : 'param';
}

/** `user-profiles` → `userProfileId`, `orders` → `orderId`. */
function idParamName(staticSegment: string): string {
  const words = staticSegment.split(/[-_.\s]+/).filter(Boolean).map((w) => w.replace(/[^A-Za-z0-9]/g, ''));
  if (!words.length) return 'id';
  words[words.length - 1] = singularize(words[words.length - 1]);
  const camel = words
    .map((word, i) => (i === 0 ? word.toLowerCase() : word[0].toUpperCase() + word.slice(1).toLowerCase()))
    .join('');
  return camel && !/^\d/.test(camel) ? `${camel}Id` : 'id';
}

function singularize(word: string): string {
  if (/ies$/i.test(word) && word.length > 3) return `${word.slice(0, -3)}y`;
  if (/(ss|us|is)$/i.test(word)) return word;
  if (/s$/i.test(word) && word.length > 1) return word.slice(0, -1);
  return word;
}

function uniqueName(base: string, used: Set<string>): string {
  if (!used.has(base)) return base;
  let counter = 2;
  while (used.has(`${base}${counter}`)) counter++;
  return `${base}${counter}`;
}

// --------------------------------------------------------------------------
// Params, variables, bodies
// --------------------------------------------------------------------------

function toVariableMap(variables: EnvironmentVariable[]): Map<string, string> {
  return new Map(variables.map((v) => [v.key, v.value]));
}

/** Replaces `{{name}}` with known variable values; unknown names stay put. */
function substituteVariables(text: string, variables: Map<string, string>): string {
  if (!text.includes('{{')) return text;
  return text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, name: string) =>
    variables.has(name) ? variables.get(name)! : match
  );
}

function keyValueToParam(kv: KeyValue, variables: Map<string, string>): NormalizedParam {
  return {
    name: kv.key,
    required: kv.enabled !== false,
    example: kv.value ? substituteVariables(kv.value, variables) : undefined,
    description: kv.description || undefined,
  };
}

function dedupeParams(params: NormalizedParam[]): NormalizedParam[] {
  const seen = new Map<string, NormalizedParam>();
  for (const param of params) {
    if (param.name && !seen.has(param.name)) seen.set(param.name, param);
  }
  return [...seen.values()];
}

/** Accepts both the canonical `{key, fieldType}` and HAR-legacy `{name, type}` row shapes. */
function parseFormFields(content: string): { fields: Record<string, string>; fileFields: string[] } {
  const fields: Record<string, string> = {};
  const fileFields: string[] = [];
  if (!content) return { fields, fileFields };
  try {
    const rows = JSON.parse(content);
    if (!Array.isArray(rows)) return { fields, fileFields };
    for (const row of rows) {
      const key = row?.key ?? row?.name;
      if (!key || row?.enabled === false) continue;
      fields[key] = String(row.value ?? '');
      if ((row.fieldType ?? row.type) === 'file') fileFields.push(key);
    }
  } catch {
    // Not the expected JSON row shape — export the body without fields.
  }
  return { fields, fileFields };
}

function harBody(
  postData: HarEntry['request']['postData'],
  warnings: string[]
): NormalizedBody | undefined {
  if (!postData) return undefined;
  const mime = (postData.mimeType || '').split(';')[0].trim().toLowerCase();

  if (mime.includes('multipart/form-data')) {
    const fields: Record<string, string> = {};
    for (const param of postData.params ?? []) {
      if (param.name) fields[param.name] = param.value ?? '';
    }
    return { contentType: 'multipart/form-data', samples: Object.keys(fields).length ? [fields] : [] };
  }
  if (!postData.text) return undefined;
  if (mime.includes('json')) {
    try {
      return { contentType: 'application/json', samples: [JSON.parse(postData.text)] };
    } catch {
      warnings.push('request body is not valid JSON; exported without a schema');
      return { contentType: 'application/json', samples: [], rawExampleText: postData.text };
    }
  }
  if (mime.includes('x-www-form-urlencoded')) {
    const fields: Record<string, string> = {};
    try {
      for (const [key, value] of new URLSearchParams(postData.text)) fields[key] = value;
    } catch {
      // Unparseable — export without fields.
    }
    return {
      contentType: 'application/x-www-form-urlencoded',
      samples: Object.keys(fields).length ? [fields] : [],
    };
  }
  return {
    contentType: mime || 'text/plain',
    samples: [],
    rawExampleText: postData.text,
  };
}

// --------------------------------------------------------------------------
// Responses
// --------------------------------------------------------------------------

/** Cap on merged samples per status group — keeps inference bounded on large HARs. */
const MAX_SAMPLES_PER_GROUP = 10;

function responsesFromExamples(request: SavedRequest): NormalizedResponseGroup[] {
  const groups: NormalizedResponseGroup[] = [];
  for (const example of request.examples ?? []) {
    if (!example || typeof example.status !== 'number' || example.status < 100) continue;
    let sample: unknown = example.body;
    if (typeof sample === 'string') {
      try {
        sample = JSON.parse(sample);
      } catch {
        sample = undefined;
      }
    }
    const contentTypeHeader = Object.entries(example.headers ?? {}).find(
      ([key]) => key.toLowerCase() === 'content-type'
    )?.[1];
    const contentType = contentTypeHeader?.split(';')[0].trim() || (sample !== undefined ? 'application/json' : undefined);
    addResponseSample(groups, example.status, contentType, sample, example.statusText || undefined);
  }
  return groups;
}

function harResponses(entry: HarEntry): NormalizedResponseGroup[] {
  const response = entry.response;
  if (!response || typeof response.status !== 'number' || response.status < 100) return [];
  const { json } = decodeHarContent(response.content);
  const contentType = response.content?.mimeType?.split(';')[0].trim() || undefined;
  const groups: NormalizedResponseGroup[] = [];
  addResponseSample(groups, response.status, contentType, json, response.statusText || undefined);
  return groups;
}

function addResponseSample(
  groups: NormalizedResponseGroup[],
  status: number | 'default',
  contentType: string | undefined,
  sample: unknown,
  description: string | undefined
): void {
  let group = groups.find((g) => g.status === status);
  if (!group) {
    group = { status, description, contentType, samples: [] };
    groups.push(group);
  }
  group.contentType ??= contentType;
  group.description ??= description;
  if (sample !== undefined && group.samples.length < MAX_SAMPLES_PER_GROUP) {
    group.samples.push(sample);
  }
}

// --------------------------------------------------------------------------
// Security
// --------------------------------------------------------------------------

function buildSecurityScheme(auth: AuthState, warnings: string[]): NormalizedSecurity | undefined {
  switch (auth?.type) {
    case 'basic':
      return { key: 'http:basic', scheme: { type: 'http', scheme: 'basic' } };
    case 'bearer':
      return { key: 'http:bearer', scheme: { type: 'http', scheme: 'bearer' } };
    case 'digest':
      return { key: 'http:digest', scheme: { type: 'http', scheme: 'digest' } };
    case 'apikey': {
      const name = auth.apiKeyName || 'X-Api-Key';
      const location = auth.apiKeyIn === 'query' ? 'query' : 'header';
      return {
        key: `apiKey:${location}:${name}`,
        scheme: { type: 'apiKey', name, in: location },
      };
    }
    case 'oauth2':
      return oauth2Scheme(auth, warnings);
    case 'aws':
      warnings.push('AWS Signature auth has no OpenAPI security scheme; security omitted');
      return undefined;
    case 'ntlm':
      warnings.push('NTLM auth has no OpenAPI security scheme; security omitted');
      return undefined;
    default:
      return undefined;
  }
}

function oauth2Scheme(auth: AuthState, warnings: string[]): NormalizedSecurity | undefined {
  const config = auth.oauth2;
  if (!config) {
    warnings.push('OAuth2 auth has no configuration; security omitted');
    return undefined;
  }
  const scopes: Record<string, string> = {};
  for (const scope of (config.scope ?? '').split(/[\s,]+/).filter(Boolean)) {
    scopes[scope] = '';
  }

  const flowByGrant: Record<string, { name: string; flow: Record<string, unknown>; missing?: string }> = {
    authorization_code: {
      name: 'authorizationCode',
      flow: { authorizationUrl: config.authUrl, tokenUrl: config.tokenUrl, scopes },
      missing: !config.authUrl || !config.tokenUrl ? 'authorization and token URLs' : undefined,
    },
    client_credentials: {
      name: 'clientCredentials',
      flow: { tokenUrl: config.tokenUrl, scopes },
      missing: !config.tokenUrl ? 'a token URL' : undefined,
    },
    implicit: {
      name: 'implicit',
      flow: { authorizationUrl: config.authUrl, scopes },
      missing: !config.authUrl ? 'an authorization URL' : undefined,
    },
    password: {
      name: 'password',
      flow: { tokenUrl: config.tokenUrl, scopes },
      missing: !config.tokenUrl ? 'a token URL' : undefined,
    },
  };
  const entry = flowByGrant[config.grantType];
  if (!entry) {
    warnings.push(`OAuth2 grant type '${config.grantType}' is not exportable; security omitted`);
    return undefined;
  }
  if (entry.missing) {
    warnings.push(`OAuth2 ${config.grantType} flow is missing ${entry.missing}; security omitted`);
    return undefined;
  }
  return {
    key: `oauth2:${config.grantType}:${config.authUrl ?? ''}:${config.tokenUrl ?? ''}`,
    scheme: { type: 'oauth2', flows: { [entry.name]: entry.flow } },
  };
}

/** `Bearer x`/`Basic y` Authorization headers in a HAR map to http schemes. */
function securityFromAuthorizationHeader(value: string | undefined): NormalizedSecurity | undefined {
  const kind = value?.trim().split(/\s+/)[0]?.toLowerCase();
  if (kind === 'bearer') return { key: 'http:bearer', scheme: { type: 'http', scheme: 'bearer' } };
  if (kind === 'basic') return { key: 'http:basic', scheme: { type: 'http', scheme: 'basic' } };
  if (kind === 'digest') return { key: 'http:digest', scheme: { type: 'http', scheme: 'digest' } };
  return undefined;
}

const SCHEME_BASE_NAMES: Record<string, string> = {
  'http:basic': 'basicAuth',
  'http:bearer': 'bearerAuth',
  'http:digest': 'digestAuth',
};

function uniqueSchemeName(key: string, used: Set<string>): string {
  const base = SCHEME_BASE_NAMES[key] ?? (key.startsWith('apiKey:') ? 'apiKeyAuth' : 'oauth2Auth');
  return uniqueName(base, used);
}

// --------------------------------------------------------------------------
// Operation merging
// --------------------------------------------------------------------------

function mergeCollidingOperations(operations: NormalizedOperation[]): NormalizedOperation[] {
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

  const security: NormalizedSecurity[] = [];
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

function renderOperation(
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
function buildOperationId(method: string, path: string, used: Set<string>): string {
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
